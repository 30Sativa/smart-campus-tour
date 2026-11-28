"""Anthropic Claude adapter (Messages API through the official `anthropic` SDK).

The SDK's own retries are off: the service's budget, retry rule and circuit
breaker stay the only retry logic, exactly as with the other adapters. The
answer is constrained to the response JSON schema with structured outputs.
SDK errors map to the same provider errors as the Gemini adapter; messages
never carry request or response bodies, keys or user text.
"""

from __future__ import annotations

import re
from typing import Any

import anthropic

from .base import ProviderBadResponse, ProviderTimeout, ProviderUnavailable

DEFAULT_MODEL = "claude-haiku-5-5"
# Ceiling on billed output per question. The service keeps at most AI_ANSWER_MAX_CHARS (1200) characters,
# roughly 600 tokens with the JSON around it; the rest leaves room for any thinking the model does under
# `effort`. A prompt that talks the model into writing more is cut here (stop_reason max_tokens -> fallback).
DEFAULT_MAX_TOKENS = 2048
_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)

# Same shape as prompting.RESPONSE_SCHEMA, in JSON Schema form for structured outputs.
ANSWER_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "outOfScope": {"type": "boolean"},
        "usedSources": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["answer", "outOfScope", "usedSources"],
    "additionalProperties": False,
}

# On a safety decline the API re-runs the request on a fallback model it picks by category.
# Only these models accept the parameter; Haiku has no server-side fallback and would answer 400.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
FALLBACK_MODELS = frozenset(
    {"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"}
)


class AnthropicProvider:
    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_MODEL,
        effort: str = "low",
        max_tokens: int = DEFAULT_MAX_TOKENS,
        client: Any | None = None,
    ) -> None:
        self.model = model.strip() or DEFAULT_MODEL
        self._effort = effort.strip()
        self._max_tokens = max_tokens
        self._client = client or anthropic.AsyncAnthropic(api_key=api_key, max_retries=0)

    def __repr__(self) -> str:
        return f"AnthropicProvider(model={self.model!r})"

    def build_request(self, system: str, user: str) -> dict:
        output_config: dict[str, Any] = {"format": {"type": "json_schema", "schema": ANSWER_JSON_SCHEMA}}
        if self._effort:
            output_config["effort"] = self._effort
        request: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self._max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_config": output_config,
        }
        if self.model in FALLBACK_MODELS:
            request["betas"] = [FALLBACK_BETA]
            request["fallbacks"] = "default"
        return request

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        try:
            response = await self._client.with_options(timeout=timeout_s).beta.messages.create(
                **self.build_request(system, user)
            )
        except anthropic.APITimeoutError as exc:
            raise ProviderTimeout("timeout") from exc
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise ProviderUnavailable(f"auth_error_{exc.status_code}", retryable=False) from exc
        except anthropic.RateLimitError as exc:
            raise ProviderUnavailable("rate_limited", retryable=False, retry_after_s=_retry_after(exc)) from exc
        except anthropic.APIStatusError as exc:
            raise ProviderUnavailable(f"http_{exc.status_code}", retryable=exc.status_code >= 500) from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderUnavailable("connection_error") from exc
        return self._parse(response)

    @staticmethod
    def _parse(response: Any) -> str:
        stop = getattr(response, "stop_reason", None)
        if stop not in ("end_turn", "stop_sequence"):
            raise ProviderBadResponse(f"finish_{str(stop).lower()}")
        text = "".join(b.text for b in (response.content or []) if getattr(b, "type", None) == "text")
        if not text.strip():
            raise ProviderBadResponse("empty")
        fenced = _FENCE.match(text)
        return fenced.group(1) if fenced else text


def _retry_after(exc: anthropic.APIStatusError) -> float | None:
    raw = exc.response.headers.get("retry-after") if exc.response is not None else None
    try:
        return float(raw) if raw else None
    except ValueError:
        return None
