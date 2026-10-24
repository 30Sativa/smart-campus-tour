import json
import unittest
import uuid
from dataclasses import replace

from campus_assistant.api import create_app
from campus_assistant.cache import AnswerCache
from campus_assistant.config import Settings
from campus_assistant.content import ContentPack
from campus_assistant.providers import ProviderTimeout, ProviderUnavailable
from campus_assistant.providers.fake import ScriptedProvider
from campus_assistant.resilience import CircuitBreaker, ConcurrencyLimit
from campus_assistant.service import AnswerService
from helpers import REPO_AI, SERVICE_KEY, TempContent, asgi_call, doc

SECRET_QUESTION = "Câu hỏi riêng tư của học sinh XYZ?"


def settings() -> Settings:
    return Settings(service_key=SERVICE_KEY, provider="fake", content_dir=REPO_AI / "content")


def body(**overrides) -> bytes:
    payload = {"requestId": str(uuid.uuid4()), "question": SECRET_QUESTION, "recentTurns": [], "poi": None}
    payload.update(overrides)
    return json.dumps(payload, ensure_ascii=False).encode()


AUTH = {"Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"}


class ApiTest(unittest.IsolatedAsyncioTestCase):
    def app(self, steps, cfg: Settings | None = None):
        with TempContent({"campus/r.md": doc("r", "- Robot dùng LiDAR.", title="Về robot")}) as root:
            pack = ContentPack.load(root)
        self.provider = ScriptedProvider(steps)
        svc = AnswerService(pack, self.provider, AnswerCache(8, 60), CircuitBreaker(5, 30), ConcurrencyLimit(4))
        return create_app(cfg or settings(), svc)

    async def test_health(self) -> None:
        status, data = await asgi_call(self.app([]), "GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(len(data["contentVersion"]), 12)

    async def test_requires_service_key(self) -> None:
        app = self.app([])
        for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": SERVICE_KEY}):
            with self.subTest(headers=headers):
                status, data = await asgi_call(app, "POST", "/v1/answer", body(), headers)
                self.assertEqual((status, data), (401, {"error": "unauthorized"}))
        self.assertEqual(self.provider.calls, [])

    async def test_success_shape_is_camel_case(self) -> None:
        answer = json.dumps({"answer": "Robot dùng LiDAR.", "outOfScope": False, "usedSources": ["Về robot"]})
        status, data = await asgi_call(self.app([answer]), "POST", "/v1/answer", body(), AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(set(data), {"answer", "outOfScope", "usedSources", "contentVersion"})
        self.assertEqual(data["usedSources"], ["Về robot"])

    async def test_validation_errors_do_not_echo_input(self) -> None:
        app = self.app([])
        turns = [{"question": "q", "answer": "a"}] * 4
        cases = [
            body(question="   "),
            body(question="x" * 501),
            body(recentTurns=turns),
            body(extra="SECRET-EXTRA"),
            body(language="en"),
            b"{not json " + SECRET_QUESTION.encode(),
        ]
        for raw in cases:
            with self.subTest(raw=raw[:40]):
                status, data = await asgi_call(app, "POST", "/v1/answer", raw, AUTH)
                self.assertEqual(status, 400)
                self.assertEqual(data["error"], "invalid_request")
                dumped = json.dumps(data, ensure_ascii=False)
                self.assertNotIn("SECRET", dumped)
                self.assertNotIn("XYZ", dumped)

    async def test_body_size_limit(self) -> None:
        app = self.app([], replace(settings(), max_body_bytes=100))
        status, data = await asgi_call(app, "POST", "/v1/answer", body(), AUTH)
        self.assertEqual((status, data["error"]), (413, "too_large"))

    async def test_provider_failures_map_to_503_and_504(self) -> None:
        status, data = await asgi_call(
            self.app([ProviderUnavailable("x", retryable=False)]), "POST", "/v1/answer", body(), AUTH
        )
        self.assertEqual((status, data), (503, {"error": "unavailable"}))
        status, data = await asgi_call(self.app([ProviderTimeout("t")]), "POST", "/v1/answer", body(), AUTH)
        self.assertEqual((status, data), (504, {"error": "timeout"}))

    async def test_logs_contain_metadata_but_never_user_text(self) -> None:
        answer = json.dumps({"answer": "Câu trả lời bí mật ABC.", "outOfScope": False, "usedSources": []})
        with self.assertLogs("campus_assistant", level="INFO") as logs:
            await asgi_call(self.app([answer]), "POST", "/v1/answer", body(), AUTH)
        text = "\n".join(logs.output)
        self.assertIn('"status": 200', text)
        self.assertIn('"requestId"', text)
        for secret in ("XYZ", "riêng tư", "ABC", SERVICE_KEY):
            self.assertNotIn(secret, text)

    async def test_unknown_route_and_method(self) -> None:
        app = self.app([])
        self.assertEqual((await asgi_call(app, "GET", "/v1/answer"))[0], 405)
        self.assertEqual((await asgi_call(app, "GET", "/docs"))[0], 404)


if __name__ == "__main__":
    unittest.main()
