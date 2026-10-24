"""Answer orchestration: guards -> cache -> context -> LLM -> parse -> sanitize."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass

from pydantic import ValidationError

from .cache import AnswerCache, cache_key
from .content import ContentPack
from .guards import FALLBACK_ANSWER, NO_CONTENT_ANSWER, ROBOT_COMMAND_ANSWER, is_robot_command, sanitize_answer
from .models import AnswerRequest, AnswerResponse, LlmAnswer
from .prompting import SYSTEM_PROMPT, build_user_prompt
from .providers import LlmProvider, ProviderBadResponse, ProviderTimeout, ProviderUnavailable
from .resilience import CircuitBreaker, ConcurrencyLimit


class AssistantUnavailable(Exception):
    """Maps to HTTP 503. `reason` is a short machine code, safe to log."""

    def __init__(self, reason: str, retry_after_s: float | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.retry_after_s = retry_after_s


class AssistantTimeout(Exception):
    """Maps to HTTP 504."""


@dataclass
class Outcome:
    response: AnswerResponse
    path: str  # guard | cache | no_content | llm | fallback
    attempts: int = 0


@dataclass(frozen=True)
class Budget:
    request_s: float = 18.0
    attempt_s: float = 15.0
    retry_min_remaining_s: float = 5.0
    answer_max_chars: int = 1200


class AnswerService:
    def __init__(
        self,
        pack: ContentPack,
        provider: LlmProvider,
        cache: AnswerCache,
        breaker: CircuitBreaker,
        limit: ConcurrencyLimit,
        budget: Budget | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.pack = pack
        self.provider = provider
        self.cache = cache
        self.breaker = breaker
        self.limit = limit
        self.budget = budget or Budget()
        self._clock = clock

    def _response(self, answer: str, out_of_scope: bool, sources: list[str]) -> AnswerResponse:
        return AnswerResponse(
            answer=answer, out_of_scope=out_of_scope, used_sources=sources, content_version=self.pack.version
        )

    async def answer(self, req: AnswerRequest) -> Outcome:
        if is_robot_command(req.question):
            return Outcome(self._response(ROBOT_COMMAND_ANSWER, False, ["guard:robot-command"]), "guard")

        key = cache_key(req.question, req.poi, self.pack.version) if not req.recent_turns else None
        if key is not None and (hit := self.cache.get(key)) is not None:
            return Outcome(hit, "cache")

        context = self.pack.select(req.poi)
        if not context:
            return Outcome(self._response(NO_CONTENT_ANSWER, True, []), "no_content")

        if not self.breaker.allow():
            raise AssistantUnavailable("circuit_open")
        if not self.limit.try_acquire():
            self.breaker.release()
            raise AssistantUnavailable("overloaded")
        try:
            raw, attempts = await self._call(build_user_prompt(req.question, context, req.recent_turns))
        finally:
            self.limit.release()

        allowed_text = "\n".join(c.text for c in context)
        known_sources = {c.source for c in context}
        try:
            parsed = LlmAnswer.model_validate_json(raw)
        except ValidationError:
            return Outcome(self._response(FALLBACK_ANSWER, False, []), "fallback", attempts)
        text = sanitize_answer(parsed.answer, allowed_text, self.budget.answer_max_chars)
        if not text:
            return Outcome(self._response(FALLBACK_ANSWER, False, []), "fallback", attempts)
        sources = [s for s in dict.fromkeys(parsed.usedSources) if s in known_sources]
        response = self._response(text, parsed.outOfScope, sources)
        if key is not None:
            self.cache.put(key, response)
        return Outcome(response, "llm", attempts)

    async def _call(self, user_prompt: str) -> tuple[str, int]:
        deadline = self._clock() + self.budget.request_s
        attempts = 0
        while True:
            remaining = deadline - self._clock()
            attempts += 1
            try:
                raw = await self.provider.generate(SYSTEM_PROMPT, user_prompt, min(self.budget.attempt_s, remaining))
            except ProviderTimeout as exc:
                self.breaker.record_failure()
                raise AssistantTimeout() from exc
            except ProviderUnavailable as exc:
                remaining = deadline - self._clock()
                if exc.retryable and attempts == 1 and remaining >= self.budget.retry_min_remaining_s:
                    continue
                self.breaker.record_failure()
                raise AssistantUnavailable(str(exc), exc.retry_after_s) from exc
            except asyncio.CancelledError:
                self.breaker.release()  # caller gave up; no verdict about the provider
                raise
            except ProviderBadResponse:
                self.breaker.record_success()  # the provider is up; the content was unusable
                return "", attempts
            self.breaker.record_success()
            return raw, attempts
