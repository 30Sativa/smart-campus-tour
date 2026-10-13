import asyncio
import json
import unittest
import uuid

from campus_assistant.cache import AnswerCache
from campus_assistant.content import ContentPack
from campus_assistant.guards import FALLBACK_ANSWER, NO_CONTENT_ANSWER, ROBOT_COMMAND_ANSWER
from campus_assistant.models import AnswerRequest
from campus_assistant.providers import ProviderBadResponse, ProviderTimeout, ProviderUnavailable
from campus_assistant.providers.fake import ScriptedProvider
from campus_assistant.resilience import CircuitBreaker, ConcurrencyLimit
from campus_assistant.service import AnswerService, AssistantTimeout, AssistantUnavailable, Budget
from helpers import POI_A, Clock, TempContent, doc

FILES = {
    "campus/robot.md": doc(
        "robot", "- Robot dùng LiDAR. Xem https://du-an.example/robot", priority="1", title="Về robot"
    ),
}


def llm(answer: str, out: bool = False, sources: list[str] | None = None) -> str:
    return json.dumps({"answer": answer, "outOfScope": out, "usedSources": sources or ["Về robot"]}, ensure_ascii=False)


def request(question: str = "Robot dùng cảm biến gì?", turns=None, poi=None) -> AnswerRequest:
    return AnswerRequest.model_validate(
        {"requestId": str(uuid.uuid4()), "question": question, "recentTurns": turns or [], "poi": poi}
    )


class ServiceTest(unittest.IsolatedAsyncioTestCase):
    def make(self, steps, files=FILES, clock=None, limit=8, threshold=3, delay=0.0):
        with TempContent(files) as root:
            pack = ContentPack.load(root)
        self.clock = clock or Clock()
        self.provider = ScriptedProvider(steps, delay_s=delay)
        self.breaker = CircuitBreaker(threshold, 30, clock=self.clock)
        return AnswerService(
            pack, self.provider, AnswerCache(16, 600, clock=self.clock), self.breaker, ConcurrencyLimit(limit),
            Budget(request_s=18, attempt_s=15, retry_min_remaining_s=5, answer_max_chars=1200), clock=self.clock,
        )

    async def test_robot_command_answered_without_llm(self) -> None:
        svc = self.make([])
        out = await svc.answer(request("Cho robot quay lại điểm trước đi"))
        self.assertEqual(out.path, "guard")
        self.assertEqual(out.response.answer, ROBOT_COMMAND_ANSWER)
        self.assertEqual(self.provider.calls, [])

    async def test_no_content_and_no_poi_skips_llm(self) -> None:
        svc = self.make([], files={"campus/d.md": doc("d", "x", status="draft")})
        out = await svc.answer(request())
        result = (out.path, out.response.out_of_scope, out.response.answer)
        self.assertEqual(result, ("no_content", True, NO_CONTENT_ANSWER))
        self.assertEqual(self.provider.calls, [])

    async def test_poi_snapshot_alone_is_enough_context(self) -> None:
        svc = self.make([llm("Đây là AI Lab.", sources=["AI Lab"])], files={})
        out = await svc.answer(request("Đây là đâu?", poi={"id": POI_A, "name": "AI Lab"}))
        self.assertEqual(out.response.used_sources, ["AI Lab"])

    async def test_llm_answer_is_cached_for_identical_question(self) -> None:
        svc = self.make([llm("Robot dùng LiDAR.")])
        first = await svc.answer(request("Robot dùng cảm biến gì?"))
        second = await svc.answer(request("robot dung cam bien gi"))
        self.assertEqual((first.path, second.path), ("llm", "cache"))
        self.assertEqual(second.response, first.response)
        self.assertEqual(len(self.provider.calls), 1)

    async def test_follow_up_questions_are_not_cached(self) -> None:
        svc = self.make([llm("Một."), llm("Hai.")])
        turns = [{"question": "Robot là gì?", "answer": "Là AMR."}]
        await svc.answer(request("Nó dùng gì?", turns=turns))
        out = await svc.answer(request("Nó dùng gì?", turns=turns))
        self.assertEqual(out.path, "llm")
        self.assertIn("<recent_turns>", self.provider.calls[0][1])

    async def test_invented_sources_and_links_are_removed(self) -> None:
        text = "Xem https://lua-dao.example và https://du-an.example/robot."
        svc = self.make([llm(text, sources=["Về robot", "Bịa"])])
        out = await svc.answer(request())
        self.assertEqual(out.response.used_sources, ["Về robot"])
        self.assertNotIn("lua-dao", out.response.answer)
        self.assertIn("https://du-an.example/robot", out.response.answer)

    async def test_malformed_model_output_falls_back_and_is_not_cached(self) -> None:
        svc = self.make(["không phải JSON", ProviderBadResponse("blocked"), llm("Đúng rồi.")])
        self.assertEqual((await svc.answer(request())).response.answer, FALLBACK_ANSWER)
        self.assertEqual((await svc.answer(request())).response.answer, FALLBACK_ANSWER)
        self.assertEqual((await svc.answer(request())).path, "llm")

    async def test_retries_once_on_retryable_error(self) -> None:
        svc = self.make([ProviderUnavailable("http_503"), llm("Robot dùng LiDAR.")])
        out = await svc.answer(request())
        self.assertEqual((out.path, out.attempts), ("llm", 2))
        self.assertEqual(self.breaker.state, "closed")

    async def test_no_retry_for_non_retryable_or_twice(self) -> None:
        svc = self.make([ProviderUnavailable("rate_limited", retryable=False)])
        with self.assertRaises(AssistantUnavailable):
            await svc.answer(request())
        svc = self.make([ProviderUnavailable("http_503"), ProviderUnavailable("http_503"), llm("x")])
        with self.assertRaises(AssistantUnavailable):
            await svc.answer(request())
        self.assertEqual(len(self.provider.calls), 2)

    async def test_no_retry_when_budget_is_nearly_spent(self) -> None:
        clock = Clock()

        class SlowFail(ScriptedProvider):
            async def generate(self, system, user, timeout_s):
                self.calls.append((system, user, timeout_s))
                clock.advance(14)
                raise ProviderUnavailable("http_503")

        svc = self.make([], clock=clock)
        svc.provider = SlowFail([])
        with self.assertRaises(AssistantUnavailable):
            await svc.answer(request())
        self.assertEqual(len(svc.provider.calls), 1)

    async def test_attempt_timeout_uses_remaining_budget(self) -> None:
        svc = self.make([ProviderTimeout("timeout")])
        with self.assertRaises(AssistantTimeout):
            await svc.answer(request())
        self.assertEqual(self.provider.calls[0][2], 15)

    async def test_circuit_opens_and_stops_calling_provider(self) -> None:
        svc = self.make([ProviderUnavailable("x", retryable=False)] * 3, threshold=3)
        for _ in range(3):
            with self.assertRaises(AssistantUnavailable):
                await svc.answer(request())
        with self.assertRaises(AssistantUnavailable) as ctx:
            await svc.answer(request())
        self.assertEqual(ctx.exception.reason, "circuit_open")
        self.assertEqual(len(self.provider.calls), 3)

    async def test_overload_is_rejected_immediately(self) -> None:
        svc = self.make([llm("Một."), llm("Hai.")], limit=1, delay=0.05)
        first = asyncio.create_task(svc.answer(request("Câu một?")))
        await asyncio.sleep(0.01)
        with self.assertRaises(AssistantUnavailable) as ctx:
            await svc.answer(request("Câu hai?"))
        self.assertEqual(ctx.exception.reason, "overloaded")
        self.assertEqual((await first).path, "llm")
        self.assertEqual(svc.limit.in_flight, 0)

    async def test_cancellation_releases_limit(self) -> None:
        svc = self.make([llm("x")], limit=1, delay=1)
        task = asyncio.create_task(svc.answer(request()))
        await asyncio.sleep(0.01)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(svc.limit.in_flight, 0)


if __name__ == "__main__":
    unittest.main()
