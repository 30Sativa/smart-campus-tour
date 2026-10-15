"""Internal HTTP API: POST /v1/answer and GET /health (docs/architecture.md §7.1).

Only the backend calls this service, on a private network. Logs never contain
question text, answers, recent turns, keys or provider bodies.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import time

from pydantic import ValidationError
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .cache import AnswerCache
from .config import Settings
from .content import ContentPack
from .models import AnswerRequest
from .providers.fake import ContentEchoProvider
from .providers.gemini import GeminiProvider
from .resilience import CircuitBreaker, ConcurrencyLimit
from .service import AnswerService, AssistantTimeout, AssistantUnavailable, Budget

log = logging.getLogger("campus_assistant")


def build_service(settings: Settings) -> AnswerService:
    pack = ContentPack.load(settings.content_dir)
    if not pack.docs:
        log.warning(json.dumps({"event": "content_empty", "contentVersion": pack.version}))
    if settings.provider == "gemini":
        provider = GeminiProvider(
            settings.gemini_api_key,
            settings.gemini_model,
            settings.gemini_base_url,
            thinking_level=settings.gemini_thinking_level,
        )
    else:
        provider = ContentEchoProvider()
    return AnswerService(
        pack=pack,
        provider=provider,
        cache=AnswerCache(settings.cache_max_entries, settings.cache_ttl_s),
        breaker=CircuitBreaker(settings.circuit_failure_threshold, settings.circuit_reset_s),
        limit=ConcurrencyLimit(settings.max_concurrent_llm_calls),
        budget=Budget(
            request_s=settings.request_budget_s,
            attempt_s=settings.llm_attempt_timeout_s,
            retry_min_remaining_s=settings.retry_min_remaining_s,
            answer_max_chars=settings.answer_max_chars,
        ),
    )


def _error(status: int, code: str, **extra: object) -> JSONResponse:
    return JSONResponse({"error": code, **extra}, status_code=status)


def create_app(settings: Settings, service: AnswerService | None = None) -> Starlette:
    svc = service or build_service(settings)
    expected = f"Bearer {settings.service_key}".encode()

    def authorized(request: Request) -> bool:
        given = request.headers.get("authorization", "").encode()
        return hmac.compare_digest(given, expected)

    async def handle(request: Request, entry: dict[str, object]) -> JSONResponse:
        if not authorized(request):
            return _error(401, "unauthorized")
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > settings.max_body_bytes:
            return _error(413, "too_large")
        body = await request.body()
        if len(body) > settings.max_body_bytes:
            return _error(413, "too_large")
        try:
            req = AnswerRequest.model_validate_json(body)
        except ValidationError as exc:
            # Only locations and error types: pydantic messages may echo user input.
            fields = [{"loc": ".".join(str(p) for p in e["loc"]), "type": e["type"]} for e in exc.errors()]
            return _error(400, "invalid_request", fields=fields)
        entry.update(requestId=str(req.request_id), turns=len(req.recent_turns), hasPoi=req.poi is not None)
        try:
            outcome = await asyncio.wait_for(svc.answer(req), timeout=settings.request_budget_s + 1)
        except (AssistantTimeout, TimeoutError):
            entry["error"] = "timeout"
            return _error(504, "timeout")
        except AssistantUnavailable as exc:
            entry["error"] = exc.reason
            return _error(503, "unavailable")
        entry.update(path=outcome.path, attempts=outcome.attempts, outOfScope=outcome.response.out_of_scope)
        return JSONResponse(outcome.response.model_dump(by_alias=True))

    async def answer(request: Request) -> JSONResponse:
        started = time.monotonic()
        entry: dict[str, object] = {"event": "answer"}
        try:
            response = await handle(request, entry)
        except Exception as exc:  # never leak internals or user text
            entry["error"] = type(exc).__name__
            response = _error(500, "internal")
        entry["status"] = response.status_code
        entry["latencyMs"] = round((time.monotonic() - started) * 1000)
        log.info(json.dumps(entry))
        return response

    async def health(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "contentVersion": svc.pack.version, "approvedDocs": len(svc.pack.docs)})

    async def not_found(_: Request, __: Exception) -> JSONResponse:
        return _error(404, "not_found")

    async def method_not_allowed(_: Request, __: Exception) -> JSONResponse:
        return _error(405, "method_not_allowed")

    return Starlette(
        routes=[Route("/v1/answer", answer, methods=["POST"]), Route("/health", health, methods=["GET"])],
        exception_handlers={404: not_found, 405: method_not_allowed},
    )
