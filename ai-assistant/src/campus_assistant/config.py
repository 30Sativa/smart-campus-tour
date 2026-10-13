"""Settings read from environment variables (see .env.example).

Secrets are never printed: Settings has a redacted repr.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[2]


class ConfigError(ValueError):
    """Raised at startup when the configuration is unusable."""


@dataclass(frozen=True)
class Settings:
    service_key: str = field(repr=False)
    provider: str = "gemini"
    gemini_api_key: str = field(default="", repr=False)
    gemini_model: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_thinking_level: str = "low"
    host: str = "127.0.0.1"
    port: int = 8090
    content_dir: Path = PACKAGE_ROOT / "content"
    request_budget_s: float = 18.0
    llm_attempt_timeout_s: float = 15.0
    retry_min_remaining_s: float = 5.0
    max_concurrent_llm_calls: int = 8
    cache_max_entries: int = 512
    cache_ttl_s: float = 3600.0
    circuit_failure_threshold: int = 5
    circuit_reset_s: float = 30.0
    answer_max_chars: int = 1200
    max_body_bytes: int = 64 * 1024

    def validate(self) -> Settings:
        if len(self.service_key) < 16:
            raise ConfigError("AI_SERVICE_KEY must be set (at least 16 characters)")
        if self.provider not in ("gemini", "fake"):
            raise ConfigError("AI_PROVIDER must be 'gemini' or 'fake'")
        if self.provider == "gemini" and (not self.gemini_api_key or not self.gemini_model):
            raise ConfigError("GEMINI_API_KEY and GEMINI_MODEL are required when AI_PROVIDER=gemini")
        if not self.content_dir.is_dir():
            raise ConfigError(f"AI_CONTENT_DIR does not exist: {self.content_dir}")
        if not 0 < self.llm_attempt_timeout_s <= self.request_budget_s:
            raise ConfigError("LLM attempt timeout must be positive and within the request budget")
        if self.max_concurrent_llm_calls < 1 or self.cache_max_entries < 0:
            raise ConfigError("concurrency must be >= 1 and cache size >= 0")
        return self

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        e = os.environ if env is None else env

        def num(name: str, default: float, kind: type = float):
            raw = e.get(name, "").strip()
            if not raw:
                return default
            try:
                return kind(raw)
            except ValueError as exc:
                raise ConfigError(f"{name} must be a number") from exc

        content = e.get("AI_CONTENT_DIR", "").strip()
        return cls(
            service_key=e.get("AI_SERVICE_KEY", "").strip(),
            provider=e.get("AI_PROVIDER", "gemini").strip().lower() or "gemini",
            gemini_api_key=e.get("GEMINI_API_KEY", "").strip(),
            gemini_model=e.get("GEMINI_MODEL", "").strip(),
            gemini_base_url=e.get("GEMINI_BASE_URL", "").strip() or cls.gemini_base_url,
            gemini_thinking_level=e.get("GEMINI_THINKING_LEVEL", cls.gemini_thinking_level).strip(),
            host=e.get("AI_HOST", "").strip() or cls.host,
            port=num("AI_PORT", cls.port, int),
            content_dir=Path(content) if content else PACKAGE_ROOT / "content",
            request_budget_s=num("AI_REQUEST_BUDGET_SECONDS", cls.request_budget_s),
            llm_attempt_timeout_s=num("AI_LLM_ATTEMPT_TIMEOUT_SECONDS", cls.llm_attempt_timeout_s),
            retry_min_remaining_s=num("AI_RETRY_MIN_REMAINING_SECONDS", cls.retry_min_remaining_s),
            max_concurrent_llm_calls=num("AI_MAX_CONCURRENT_LLM_CALLS", cls.max_concurrent_llm_calls, int),
            cache_max_entries=num("AI_CACHE_MAX_ENTRIES", cls.cache_max_entries, int),
            cache_ttl_s=num("AI_CACHE_TTL_SECONDS", cls.cache_ttl_s),
            circuit_failure_threshold=num("AI_CIRCUIT_FAILURE_THRESHOLD", cls.circuit_failure_threshold, int),
            circuit_reset_s=num("AI_CIRCUIT_RESET_SECONDS", cls.circuit_reset_s),
        )


def load_dotenv(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE reader for local development; real env vars win."""
    values: dict[str, str] = {}
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return {**values, **os.environ}
