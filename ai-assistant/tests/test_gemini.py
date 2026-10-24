import asyncio
import json
import socket
import unittest
import urllib.error

from campus_assistant.providers import ProviderBadResponse, ProviderTimeout, ProviderUnavailable
from campus_assistant.providers.gemini import GeminiProvider

KEY = "AIza-secret-test-key"


def ok_body(text: str, finish: str = "STOP", thought: str | None = None) -> bytes:
    parts = ([{"text": thought, "thought": True}] if thought else []) + [{"text": text}]
    return json.dumps({"candidates": [{"content": {"parts": parts}, "finishReason": finish}]}).encode()


class RecordingTransport:
    def __init__(self, status: int = 200, body: bytes = b"", exc: Exception | None = None) -> None:
        self.status, self.body, self.exc = status, body, exc
        self.calls: list[tuple[str, dict, bytes, float]] = []

    def __call__(self, url, headers, body, timeout_s):
        self.calls.append((url, headers, body, timeout_s))
        if self.exc:
            raise self.exc
        return self.status, self.body


def run(provider: GeminiProvider) -> str:
    return asyncio.run(provider.generate("SYS", "USER", 5))


class GeminiTest(unittest.TestCase):
    def test_request_shape_and_key_only_in_header(self) -> None:
        t = RecordingTransport(body=ok_body('{"answer":"x","outOfScope":false,"usedSources":[]}'))
        p = GeminiProvider(KEY, "gemini-flash-test", transport=t)
        self.assertEqual(run(p), '{"answer":"x","outOfScope":false,"usedSources":[]}')
        url, headers, body, timeout = t.calls[0]
        base = "https://generativelanguage.googleapis.com/v1beta"
        self.assertEqual(url, f"{base}/models/gemini-flash-test:generateContent")
        self.assertNotIn(KEY, url)
        self.assertEqual(headers["x-goog-api-key"], KEY)
        payload = json.loads(body)
        self.assertEqual(payload["systemInstruction"]["parts"][0]["text"], "SYS")
        self.assertEqual(payload["contents"][0]["parts"][0]["text"], "USER")
        self.assertEqual(payload["generationConfig"]["responseMimeType"], "application/json")
        self.assertIn("responseSchema", payload["generationConfig"])
        self.assertEqual(payload["generationConfig"]["thinkingConfig"], {"thinkingLevel": "low"})
        self.assertEqual(timeout, 5)
        self.assertNotIn(KEY, repr(p))

    def test_empty_thinking_level_uses_model_default(self) -> None:
        body = GeminiProvider(KEY, "m", thinking_level="").build_body("s", "u")
        self.assertNotIn("thinkingConfig", body["generationConfig"])

    def test_models_prefix_is_accepted(self) -> None:
        t = RecordingTransport(body=ok_body("{}"))
        run(GeminiProvider(KEY, " models/gemini-flash-test ", transport=t))
        self.assertTrue(t.calls[0][0].endswith("/models/gemini-flash-test:generateContent"))

    def test_thought_parts_are_ignored(self) -> None:
        t = RecordingTransport(body=ok_body("{}", thought="suy nghĩ nội bộ"))
        self.assertEqual(run(GeminiProvider(KEY, "m", transport=t)), "{}")

    def test_status_mapping(self) -> None:
        cases = {500: True, 503: True, 429: False, 401: False, 403: False, 400: False}
        for status, retryable in cases.items():
            with self.subTest(status=status):
                p = GeminiProvider(KEY, "m", transport=RecordingTransport(status=status, body=b"{}"))
                with self.assertRaises(ProviderUnavailable) as ctx:
                    run(p)
                self.assertEqual(ctx.exception.retryable, retryable)
                self.assertNotIn(KEY, str(ctx.exception))

    def test_rate_limit_details_are_read_from_429_body(self) -> None:
        def body(quota_id: str, delay: str | None) -> bytes:
            details = [{"@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [{"quotaId": quota_id}]}]
            if delay:
                details.append({"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay})
            return json.dumps({"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "details": details}}).encode()

        cases = [
            (body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "41s"), "rate_limited", 41.0),
            (body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "3600s"), "rate_limited_daily", 3600.0),
            (b"not json", "rate_limited", None),
        ]
        for raw, reason, after in cases:
            with self.subTest(reason=reason, after=after):
                with self.assertRaises(ProviderUnavailable) as ctx:
                    run(GeminiProvider(KEY, "m", transport=RecordingTransport(status=429, body=raw)))
                self.assertEqual((str(ctx.exception), ctx.exception.retry_after_s), (reason, after))

    def test_unusable_responses(self) -> None:
        bodies = [
            b"not json",
            json.dumps({"promptFeedback": {"blockReason": "SAFETY"}}).encode(),
            json.dumps({"candidates": []}).encode(),
            ok_body("{}", finish="MAX_TOKENS"),
            ok_body("   "),
        ]
        for body in bodies:
            with self.subTest(body=body[:30]):
                with self.assertRaises(ProviderBadResponse):
                    run(GeminiProvider(KEY, "m", transport=RecordingTransport(body=body)))

    def test_network_errors(self) -> None:
        for exc, expected in (
            (socket.timeout("t"), ProviderTimeout),
            (urllib.error.URLError(socket.timeout("t")), ProviderTimeout),
            (urllib.error.URLError("dns"), ProviderUnavailable),
            (ConnectionResetError(), ProviderUnavailable),
        ):
            with self.subTest(exc=type(exc).__name__):
                with self.assertRaises(expected):
                    run(GeminiProvider(KEY, "m", transport=RecordingTransport(exc=exc)))


if __name__ == "__main__":
    unittest.main()
