"""Google Gemini adapter (REST models.generateContent).

The API key travels only in the x-goog-api-key header, never in the URL, so it
cannot leak through logged URLs or error messages. Uses the standard library
HTTP client in a worker thread; the transport is injectable for tests.
"""

from __future__ import annotations

import asyncio
import json
import socket
import urllib.error
import urllib.request
from collections.abc import Callable
from urllib.parse import quote

from ..prompting import RESPONSE_SCHEMA
from .base import ProviderBadResponse, ProviderTimeout, ProviderUnavailable

# (url, headers, body, timeout_s) -> (status, body)
Transport = Callable[[str, dict[str, str], bytes, float], tuple[int, bytes]]


def urllib_transport(url: str, headers: dict[str, str], body: bytes, timeout_s: float) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
        transport: Transport = urllib_transport,
        temperature: float = 0.2,
        max_output_tokens: int = 2048,
        thinking_level: str = "low",
    ) -> None:
        self._api_key = api_key
        model = model.strip()
        self.model = model[len("models/"):] if model.startswith("models/") else model
        self._url = f"{base_url.rstrip('/')}/models/{quote(self.model, safe='.-_')}:generateContent"
        self._transport = transport
        self._temperature = temperature
        self._max_output_tokens = max_output_tokens
        self._thinking_level = thinking_level.strip().lower()

    def __repr__(self) -> str:
        return f"GeminiProvider(model={self.model!r})"

    def build_body(self, system: str, user: str) -> dict:
        config: dict = {
            "temperature": self._temperature,
            "maxOutputTokens": self._max_output_tokens,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        }
        if self._thinking_level:  # empty = model default; short answers need little reasoning
            config["thinkingConfig"] = {"thinkingLevel": self._thinking_level}
        return {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": config,
        }

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        body = json.dumps(self.build_body(system, user), ensure_ascii=False).encode()
        headers = {"Content-Type": "application/json", "x-goog-api-key": self._api_key}
        try:
            status, raw = await asyncio.wait_for(
                asyncio.to_thread(self._transport, self._url, headers, body, timeout_s),
                timeout=timeout_s + 1,
            )
        except (TimeoutError, socket.timeout) as exc:
            raise ProviderTimeout("timeout") from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, (TimeoutError, socket.timeout)):
                raise ProviderTimeout("timeout") from exc
            raise ProviderUnavailable("connection_error") from exc
        except OSError as exc:
            raise ProviderUnavailable("connection_error") from exc
        return self._parse(status, raw)

    @staticmethod
    def _parse(status: int, raw: bytes) -> str:
        if status in (401, 403):
            raise ProviderUnavailable(f"auth_error_{status}", retryable=False)
        if status == 429:
            daily, retry_after = _quota_details(raw)
            raise ProviderUnavailable(
                "rate_limited_daily" if daily else "rate_limited", retryable=False, retry_after_s=retry_after
            )
        if status >= 500:
            raise ProviderUnavailable(f"http_{status}")
        if status != 200:
            raise ProviderUnavailable(f"http_{status}", retryable=False)
        try:
            data = json.loads(raw)
        except ValueError as exc:
            raise ProviderBadResponse("invalid_json") from exc
        if data.get("promptFeedback", {}).get("blockReason"):
            raise ProviderBadResponse("blocked")
        candidates = data.get("candidates") or []
        if not candidates:
            raise ProviderBadResponse("no_candidates")
        first = candidates[0]
        if first.get("finishReason") not in (None, "STOP"):
            raise ProviderBadResponse(f"finish_{str(first.get('finishReason')).lower()}")
        parts = (first.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        if not text.strip():
            raise ProviderBadResponse("empty")
        return text


def _quota_details(raw: bytes) -> tuple[bool, float | None]:
    """From a 429 body: (is a per-day quota, suggested retry delay in seconds). Only quota IDs are read."""
    try:
        details = json.loads(raw).get("error", {}).get("details", [])
    except (ValueError, AttributeError):
        return False, None
    daily = False
    retry_after = None
    for d in details if isinstance(details, list) else []:
        for v in d.get("violations", []) if isinstance(d, dict) else []:
            if "perday" in str(v.get("quotaId", "")).lower():
                daily = True
        delay = d.get("retryDelay") if isinstance(d, dict) else None
        if isinstance(delay, str) and delay.endswith("s"):
            try:
                retry_after = float(delay[:-1])
            except ValueError:
                pass
    return daily, retry_after
