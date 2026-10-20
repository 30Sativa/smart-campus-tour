import asyncio
import json
import socket
import unittest
import urllib.error

from campus_assistant.providers import ProviderBadResponse, ProviderTimeout, ProviderUnavailable
from campus_assistant.providers.openai_compat import OpenAICompatProvider

KEY = "sk-secret-test-key"
BASE = "https://gateway.example.test/v1/"
ANSWER = '{"answer":"x","outOfScope":false,"usedSources":[]}'


def ok_body(text: str, finish: str = "stop") -> bytes:
    choice = {"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": finish}
    return json.dumps({"object": "chat.completion", "choices": [choice]}).encode()


class RecordingTransport:
    def __init__(self, status: int = 200, body: bytes = b"", exc: Exception | None = None) -> None:
        self.status, self.body, self.exc = status, body, exc
        self.calls: list[tuple[str, dict, bytes, float]] = []

    def __call__(self, url, headers, body, timeout_s):
        self.calls.append((url, headers, body, timeout_s))
        if self.exc:
            raise self.exc
        return self.status, self.body


def provider(t: RecordingTransport) -> OpenAICompatProvider:
    return OpenAICompatProvider(KEY, " ag/gemini-flash-test ", BASE, transport=t)


def run(p: OpenAICompatProvider) -> str:
    return asyncio.run(p.generate("SYS", "USER", 5))


class OpenAICompatTest(unittest.TestCase):
    def test_request_shape_and_key_only_in_header(self) -> None:
        t = RecordingTransport(body=ok_body(ANSWER))
        p = provider(t)
        self.assertEqual(run(p), ANSWER)
        url, headers, body, timeout = t.calls[0]
        self.assertEqual(url, "https://gateway.example.test/v1/chat/completions")
        self.assertNotIn(KEY, url)
        self.assertEqual(headers["Authorization"], f"Bearer {KEY}")
        self.assertNotIn("urllib", headers["User-Agent"].lower())
        payload = json.loads(body)
        self.assertEqual(payload["model"], "ag/gemini-flash-test")
        self.assertIs(payload["stream"], False)
        expected = [{"role": "system", "content": "SYS"}, {"role": "user", "content": "USER"}]
        self.assertEqual(payload["messages"], expected)
        self.assertEqual(timeout, 5)
        self.assertNotIn(KEY, repr(p))

    def test_markdown_fence_is_stripped(self) -> None:
        for text in (f"```json\n{ANSWER}\n```", f"```\n{ANSWER}\n```"):
            with self.subTest(text=text[:8]):
                self.assertEqual(run(provider(RecordingTransport(body=ok_body(text)))), ANSWER)

    def test_status_mapping(self) -> None:
        cases = {500: True, 503: True, 429: False, 401: False, 403: False, 400: False}
        for status, retryable in cases.items():
            with self.subTest(status=status):
                with self.assertRaises(ProviderUnavailable) as ctx:
                    run(provider(RecordingTransport(status=status, body=b"{}")))
                self.assertEqual(ctx.exception.retryable, retryable)
                self.assertNotIn(KEY, str(ctx.exception))

    def test_unusable_responses(self) -> None:
        bodies = [
            b"not json",
            b"[]",
            json.dumps({"choices": []}).encode(),
            ok_body(ANSWER, finish="length"),
            ok_body("   "),
        ]
        for body in bodies:
            with self.subTest(body=body[:30]):
                with self.assertRaises(ProviderBadResponse):
                    run(provider(RecordingTransport(body=body)))

    def test_network_errors(self) -> None:
        for exc, expected in (
            (socket.timeout("t"), ProviderTimeout),
            (urllib.error.URLError(socket.timeout("t")), ProviderTimeout),
            (urllib.error.URLError("dns"), ProviderUnavailable),
            (ConnectionResetError(), ProviderUnavailable),
        ):
            with self.subTest(exc=type(exc).__name__):
                with self.assertRaises(expected):
                    run(provider(RecordingTransport(exc=exc)))


if __name__ == "__main__":
    unittest.main()
