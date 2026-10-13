"""Provider interface and error classes.

Errors carry only a short class name and status code; never request or
response bodies, keys or user text.
"""

from __future__ import annotations

from typing import Protocol


class ProviderError(Exception):
    retryable = False


class ProviderUnavailable(ProviderError):
    """Connection failure, 5xx, rate limiting or bad provider configuration."""

    def __init__(self, reason: str, retryable: bool = True, retry_after_s: float | None = None) -> None:
        super().__init__(reason)
        self.retryable = retryable
        self.retry_after_s = retry_after_s


class ProviderTimeout(ProviderError):
    """The attempt exceeded its timeout. Not retried: the budget is mostly spent."""


class ProviderBadResponse(ProviderError):
    """The provider answered but the content is unusable (blocked, empty, malformed)."""


class LlmProvider(Protocol):
    name: str

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        """Return the raw model text (expected to be one JSON object)."""
        ...
