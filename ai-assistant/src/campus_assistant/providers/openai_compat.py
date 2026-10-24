"""OpenAI-compatible chat-completions adapter (POST {base}/chat/completions).

For gateways that expose Gemini through the OpenAI wire format. The key travels
only in the Authorization header. Status and network errors map exactly as in
the Gemini adapter, so the service, breaker and retries behave the same.
"""

from __future__ import annotations

import asyncio
import json
import re
import socket
import urllib.error

from .base import ProviderBadResponse, ProviderTimeout, ProviderUnavailable
from .gemini import Transport, urllib_transport

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


class OpenAICompatProvider:
    name = "openai_compat"

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str,
        transport: Transport = urllib_transport,
        temperature: float = 0.2,
        max_tokens: int = 2048,
    ) -> None:
        self._api_key = api_key
        self.model = model.strip()
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._transport = transport
        self._temperature = temperature
        self._max_tokens = max_tokens

    def __repr__(self) -> str:
        return f"OpenAICompatProvider(model={self.model!r})"

    def build_body(self, system: str, user: str) -> dict:
        # No response_format: not every gateway accepts it. The system prompt already
        # demands one JSON object, and a Markdown fence around it is stripped below.
        return {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": self._temperature,
            "max_tokens": self._max_tokens,
            "stream": False,
        }

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        body = json.dumps(self.build_body(system, user), ensure_ascii=False).encode()
        # Explicit User-Agent: gateways behind Cloudflare commonly answer 403 to the
        # default "Python-urllib/x.y" agent even with a valid key.
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
            "User-Agent": "campus-assistant/0.1",
        }
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
            raise ProviderUnavailable("rate_limited", retryable=False)
        if status >= 500:
            raise ProviderUnavailable(f"http_{status}")
        if status != 200:
            raise ProviderUnavailable(f"http_{status}", retryable=False)
        try:
            data = json.loads(raw)
            first = (data.get("choices") or [None])[0]
        except (ValueError, AttributeError) as exc:
            raise ProviderBadResponse("invalid_json") from exc
        if not isinstance(first, dict):
            raise ProviderBadResponse("no_choices")
        if first.get("finish_reason") not in (None, "stop"):
            raise ProviderBadResponse(f"finish_{str(first.get('finish_reason')).lower()}")
        text = (first.get("message") or {}).get("content") or ""
        if not isinstance(text, str) or not text.strip():
            raise ProviderBadResponse("empty")
        fenced = _FENCE.match(text)
        return fenced.group(1) if fenced else text
