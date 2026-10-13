"""LLM provider adapters. Code depends only on the LlmProvider protocol (ADR-0016)."""

from .base import (
    LlmProvider,
    ProviderBadResponse,
    ProviderError,
    ProviderTimeout,
    ProviderUnavailable,
)

__all__ = [
    "LlmProvider",
    "ProviderBadResponse",
    "ProviderError",
    "ProviderTimeout",
    "ProviderUnavailable",
]
