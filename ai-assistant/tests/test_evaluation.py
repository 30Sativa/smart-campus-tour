import asyncio
import hashlib
import json
import unittest

from campus_assistant import evaluation as ev
from campus_assistant.content import ContentPack
from campus_assistant.providers import ProviderUnavailable
from campus_assistant.providers.fake import ScriptedProvider
from helpers import POI_A, REPO_AI, TempContent, doc

FILES = {
    "campus/ve-robot.md": doc("ve-robot", "- Robot dùng LiDAR.", title="Về robot", priority="1"),
    "pois/a.md": doc("demo-ai-lab", "- Lab.", kind="poi", poi=POI_A, title="[DEMO] AI Lab"),
}


def item(behavior="answer", any_=None, not_=None, cat="robot", needs=None, **extra):
    exp = {"behavior": behavior}
    if any_:
        exp["mustMentionAny"] = any_
    if not_:
        exp["mustNotMention"] = not_
    return {"id": extra.pop("id", "x-01"), "category": cat, "question": extra.pop("q", "Robot dùng gì?"),
            "expect": exp, "needsContent": needs or [], **extra}


def llm(answer, out=False):
    return json.dumps({"answer": answer, "outOfScope": out, "usedSources": []}, ensure_ascii=False)


class GradeTest(unittest.TestCase):
    def test_answer_requires_each_group_and_is_accent_insensitive(self) -> None:
        it = item(any_=[["LiDAR"], ["Nhân viên vận hành", "Staff"]])
        self.assertEqual(ev.grade(it, "Robot dùng lidar, nhan vien van hanh giám sát.", False), (True, ""))
        ok, reason = ev.grade(it, "Robot dùng LiDAR.", False)
        self.assertFalse(ok)
        self.assertIn("thiếu ý", reason)

    def test_out_of_scope_and_wrong_refusal(self) -> None:
        self.assertTrue(ev.grade(item("out_of_scope"), "Mình chưa có thông tin.", True)[0])
        self.assertFalse(ev.grade(item("out_of_scope"), "Điểm chuẩn là 25.", False)[0])
        self.assertFalse(ev.grade(item("answer"), "Mình chưa có thông tin.", True)[0])

    def test_banned_phrases(self) -> None:
        ok, reason = ev.grade(item("refuse", not_=["API key"]), "Đây là api KEY của mình", False)
        self.assertFalse(ok)
        self.assertIn("bị cấm", reason)


class RunTest(unittest.IsolatedAsyncioTestCase):
    def pack(self):
        with TempContent(FILES) as root:
            return ContentPack.load(root)

    async def test_gradable_filters_by_approved_content(self) -> None:
        items = [item(needs=["ve-robot"]), item(needs=["tang-6-nvh"], id="x-02")]
        self.assertEqual([i["id"] for i in ev.gradable(items, self.pack())], ["x-01"])

    async def test_poi_snapshot_uses_content_title_without_demo_prefix(self) -> None:
        req = ev.make_request(item(poiId=POI_A), self.pack())
        self.assertEqual(req.poi.name, "AI Lab")

    async def test_run_grades_guard_llm_and_errors_and_records(self) -> None:
        pack = self.pack()
        items = [
            item(id="cmd-01", cat="robot_command", q="Robot dừng lại!", behavior="refuse", any_=[["Staff"]]),
            item(id="ok-01", any_=[["LiDAR"]]),
            item(id="err-01"),
        ]
        rec = ev.RecordingProvider(ScriptedProvider([llm("Robot dùng LiDAR."), ProviderUnavailable("x", False)]))
        results = await ev.run(items, pack, ev.eval_service(pack, rec), delay_s=0)
        self.assertEqual([r.status for r in results], ["pass", "pass", "error"])
        self.assertEqual(results[0].path, "guard")
        self.assertEqual(list(rec.records), ["ok-01"])

    async def test_rate_limit_waits_and_retries(self) -> None:
        pack = self.pack()
        waits: list[float] = []

        async def fake_sleep(s: float) -> None:
            waits.append(s)

        provider = ScriptedProvider([ProviderUnavailable("rate_limited", False), llm("LiDAR")])
        results = await ev.run([item(any_=[["LiDAR"]])], pack, ev.eval_service(pack, provider),
                               rate_limit_wait_s=7, sleep=fake_sleep)
        self.assertEqual(results[0].status, "pass")
        self.assertEqual(waits, [7])

    async def test_transient_errors_wait_and_retry(self) -> None:
        from campus_assistant.providers import ProviderTimeout

        pack = self.pack()
        waits: list[float] = []

        async def fake_sleep(s: float) -> None:
            waits.append(s)

        provider = ScriptedProvider([ProviderUnavailable("http_503", False), ProviderTimeout("t"), llm("LiDAR")])
        results = await ev.run([item(any_=[["LiDAR"]])], pack, ev.eval_service(pack, provider),
                               rate_limit_wait_s=3, sleep=fake_sleep)
        self.assertEqual((results[0].status, waits), ("pass", [3, 3]))

    async def test_rate_limit_uses_provider_retry_delay(self) -> None:
        pack = self.pack()
        waits: list[float] = []

        async def fake_sleep(s: float) -> None:
            waits.append(s)

        provider = ScriptedProvider([ProviderUnavailable("rate_limited", False, retry_after_s=41), llm("LiDAR")])
        await ev.run([item(any_=[["LiDAR"]])], pack, ev.eval_service(pack, provider), sleep=fake_sleep)
        self.assertEqual(waits, [41])

    async def test_daily_quota_is_not_retried(self) -> None:
        pack = self.pack()
        provider = ScriptedProvider([ProviderUnavailable("rate_limited_daily", False)])
        results = await ev.run([item()], pack, ev.eval_service(pack, provider), sleep=None)
        self.assertEqual(results[0].status, "error")
        self.assertIn("rate_limited_daily", results[0].reason)

    async def test_resumed_items_do_not_call_provider_or_wait(self) -> None:
        pack = self.pack()
        waits: list[float] = []

        async def fake_sleep(s: float) -> None:
            waits.append(s)

        inner = ScriptedProvider([llm("LiDAR mới")])
        rec = ev.RecordingProvider(inner, {"old-01": llm("LiDAR cũ")})
        items = [item(id="old-01", any_=[["LiDAR"]]), item(id="new-01", any_=[["LiDAR"]]), item(id="x")]
        inner.steps.append(llm("LiDAR"))
        results = await ev.run(items, pack, ev.eval_service(pack, rec), delay_s=5, sleep=fake_sleep)
        self.assertEqual([r.status for r in results], ["pass", "pass", "pass"])
        self.assertEqual(len(inner.calls), 2)
        self.assertEqual(waits, [5])  # no wait after the resumed item, one after new-01, none after the last
        self.assertEqual(set(rec.records), {"old-01", "new-01", "x"})

    async def test_stop_callback_ends_run(self) -> None:
        pack = self.pack()
        provider = ScriptedProvider([ProviderUnavailable("http_404", False)] * 3)
        results = await ev.run([item(id=f"i-{n}") for n in range(3)], pack, ev.eval_service(pack, provider),
                               stop=lambda: True)
        self.assertEqual(len(results), 1)

    async def test_replay_matches_recording(self) -> None:
        pack = self.pack()
        replay = ev.ReplayProvider({"ok-01": llm("LiDAR")})
        results = await ev.run([item(id="ok-01", any_=[["LiDAR"]]), item(id="missing")], pack,
                               ev.eval_service(pack, replay))
        self.assertEqual([r.status for r in results], ["pass", "error"])

    async def test_report_lists_failures(self) -> None:
        results = [ev.ItemResult("a-01", "tour", "Hỏi?", "answer", "fail", "thiếu ý: LiDAR", "Trả lời", False, "llm")]
        meta = ev.RunMeta("m", "v", 3, 84, 1, "2026-10-13 14:00")
        report = ev.render_report(results, meta)
        self.assertIn("a-01", report)
        self.assertIn("0/1 (0%)", report)


class RecordedReplayTest(unittest.TestCase):
    """Regression gate: the latest live recording must not score lower when replayed.

    Skips (asking for a new live run) when the content, the question set or the
    code path changed so much that the recording no longer covers the questions.
    """

    def test_latest_recording_still_passes(self) -> None:
        path = REPO_AI / "evals" / "recorded" / "latest.json"
        if not path.exists():
            self.skipTest("no live recording yet (run scripts/run_eval.py with Gemini)")
        data = json.loads(path.read_text(encoding="utf-8"))
        meta = data["meta"]
        pack = ContentPack.load(REPO_AI / "content")
        questions = REPO_AI / "evals" / "questions.json"
        if meta["content_version"] != pack.version:
            self.skipTest("content changed since the recording; re-run the live evaluation")
        if meta.get("extra", {}).get("questionsHash") != hashlib.sha256(questions.read_bytes()).hexdigest()[:12]:
            self.skipTest("question set changed since the recording; re-run the live evaluation")
        wanted = set(data["records"]) | set(meta["passIds"])
        items = [i for i in ev.load_items(questions) if i["id"] in wanted]
        results = asyncio.run(ev.run(items, pack, ev.eval_service(pack, ev.ReplayProvider(data["records"]))))
        if any("not_recorded" in r.reason for r in results):
            self.skipTest("code now sends questions to the LLM that were not recorded; re-run the live evaluation")
        passed = {r.id for r in results if r.status == "pass"}
        regressed = sorted(set(meta["passIds"]) - passed)
        self.assertEqual(regressed, [], f"answers that passed when recorded now fail: {regressed}")


if __name__ == "__main__":
    unittest.main()
