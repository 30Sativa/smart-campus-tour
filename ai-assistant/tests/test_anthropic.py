import asyncio
import unittest
from types import SimpleNamespace

import anthropic
import httpx2

from campus_assistant.providers import ProviderBadResponse, ProviderTimeout, ProviderUnavailable
from campus_assistant.providers.anthropic_claude import ANSWER_JSON_SCHEMA, AnthropicProvider

KEY = "sk-ant-secret-test-key"
ANSWER = '{"answer":"x","outOfScope":false,"usedSources":[]}'
REQ = httpx2.Request("POST", "https://api.anthropic.test/v1/messages")


def message(text: str = ANSWER, stop: str = "end_turn") -> SimpleNamespace:
    blocks = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)]
    return SimpleNamespace(stop_reason=stop, content=blocks)


def status_error(cls: type, status: int, headers: dict | None = None) -> Exception:
    response = httpx2.Response(status, headers=headers or {}, request=REQ)
    return cls("err", response=response, body=None)


class FakeClient:
    """Stands in for AsyncAnthropic: records the request, returns or raises."""

    def __init__(self, result=None, exc: Exception | None = None) -> None:
        self.result, self.exc = result, exc
        self.calls: list[dict] = []
        self.timeouts: list[float] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def with_options(self, timeout: float):
        self.timeouts.append(timeout)
        return self

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        if self.exc:
            raise self.exc
        return self.result


def run(p: AnthropicProvider) -> str:
    return asyncio.run(p.generate("SYS", "USER", 5))


class AnthropicProviderTest(unittest.TestCase):
    def test_request_shape(self) -> None:
        c = FakeClient(message())
        p = AnthropicProvider(KEY, " claude-opus-5-5 ", client=c)
        self.assertEqual(run(p), ANSWER)
        req = c.calls[0]
        self.assertEqual(req["model"], "claude-opus-5-5")
        self.assertEqual(req["system"], "SYS")
        self.assertEqual(req["messages"], [{"role": "user", "content": "USER"}])
        self.assertEqual(req["output_config"]["format"], {"type": "json_schema", "schema": ANSWER_JSON_SCHEMA})
        self.assertEqual(req["output_config"]["effort"], "low")
        self.assertEqual((req["betas"], req["fallbacks"]), (["server-side-fallback-2026-07-01"], "default"))
        self.assertNotIn("thinking", req)  # effort is the control
        self.assertNotIn("temperature", req)
        self.assertEqual(req["max_tokens"], 2048)  # caps billed output when a prompt asks for a long answer
        self.assertEqual(c.timeouts, [5])
        self.assertNotIn(KEY, repr(p))

    def test_empty_effort_is_omitted_and_default_model(self) -> None:
        c = FakeClient(message())
        run(AnthropicProvider(KEY, "", effort="", client=c))
        self.assertEqual(c.calls[0]["model"], "claude-haiku-5-5")
        self.assertNotIn("effort", c.calls[0]["output_config"])
        # Haiku has no server-side fallback: sending the parameter would be a 400.
        self.assertNotIn("fallbacks", c.calls[0])
        self.assertNotIn("betas", c.calls[0])

    def test_sdk_retries_are_off(self) -> None:
        p = AnthropicProvider(KEY)
        self.assertEqual(p._client.max_retries, 0)

    def test_fence_stripped(self) -> None:
        self.assertEqual(run(AnthropicProvider(KEY, client=FakeClient(message(f"```json\n{ANSWER}\n```")))), ANSWER)

    def test_bad_responses(self) -> None:
        for result, reason in (
            (message(stop="refusal"), "finish_refusal"),
            (message(stop="max_tokens"), "finish_max_tokens"),
            (message(text="  "), "empty"),
        ):
            with self.subTest(reason=reason):
                with self.assertRaises(ProviderBadResponse) as ctx:
                    run(AnthropicProvider(KEY, client=FakeClient(result)))
                self.assertEqual(str(ctx.exception), reason)

    def test_error_mapping(self) -> None:
        cases = [
            (status_error(anthropic.AuthenticationError, 401), ProviderUnavailable, "auth_error_401", False),
            (status_error(anthropic.PermissionDeniedError, 403), ProviderUnavailable, "auth_error_403", False),
            (status_error(anthropic.InternalServerError, 529), ProviderUnavailable, "http_529", True),
            (status_error(anthropic.BadRequestError, 400), ProviderUnavailable, "http_400", False),
            (anthropic.APIConnectionError(request=REQ), ProviderUnavailable, "connection_error", True),
            (anthropic.APITimeoutError(request=REQ), ProviderTimeout, "timeout", False),
        ]
        for exc, cls, reason, retryable in cases:
            with self.subTest(reason=reason):
                with self.assertRaises(cls) as ctx:
                    run(AnthropicProvider(KEY, client=FakeClient(exc=exc)))
                self.assertEqual(str(ctx.exception), reason)
                self.assertEqual(ctx.exception.retryable, retryable)
                self.assertNotIn(KEY, str(ctx.exception))

    def test_rate_limit_keeps_retry_after(self) -> None:
        exc = status_error(anthropic.RateLimitError, 429, {"retry-after": "7"})
        with self.assertRaises(ProviderUnavailable) as ctx:
            run(AnthropicProvider(KEY, client=FakeClient(exc=exc)))
        self.assertEqual((str(ctx.exception), ctx.exception.retryable, ctx.exception.retry_after_s),
                         ("rate_limited", False, 7.0))


if __name__ == "__main__":
    unittest.main()
