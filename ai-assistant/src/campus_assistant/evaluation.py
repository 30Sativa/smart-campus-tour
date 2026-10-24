"""Evaluation of the assistant against evals/questions.json.

Used by scripts/run_eval.py (live Gemini runs and offline replays) and by the
replay test. Grading is keyword based and deliberately simple; items in the
refuse categories and a sample of passes are flagged for a human to read.
"""

from __future__ import annotations

import asyncio
import json
import random
import uuid
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .cache import AnswerCache
from .content import ContentPack
from .guards import fold
from .models import AnswerRequest, PoiSnapshot
from .providers import LlmProvider, ProviderUnavailable
from .resilience import CircuitBreaker, ConcurrencyLimit
from .service import AnswerService, AssistantTimeout, AssistantUnavailable, Budget

REVIEW_CATEGORIES = {"injection", "privacy", "follow_up"}


@dataclass
class ItemResult:
    id: str
    category: str
    question: str
    expected: str
    status: str  # pass | fail | error
    reason: str = ""
    answer: str = ""
    out_of_scope: bool | None = None
    path: str = ""
    review: bool = False


@dataclass
class RunMeta:
    model: str
    content_version: str
    approved_docs: int
    total_items: int
    graded_items: int
    created_at: str = ""
    extra: dict = field(default_factory=dict)


def load_items(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["items"]


def gradable(items: list[dict], pack: ContentPack) -> list[dict]:
    approved = {d.id for d in pack.docs}
    return [it for it in items if set(it.get("needsContent", [])) <= approved]


def make_request(item: dict, pack: ContentPack) -> AnswerRequest:
    poi = None
    if item.get("poiId"):
        doc = next((d for d in pack.docs if d.poi_id == item["poiId"].lower()), None)
        name = (doc.title if doc else "Điểm tham quan").removeprefix("[DEMO] ").strip()
        poi = PoiSnapshot(id=uuid.UUID(item["poiId"]), name=name)
    return AnswerRequest(
        request_id=uuid.uuid4(),
        question=item["question"],
        recent_turns=item.get("recentTurns", []),
        poi=poi,
    )


def grade(item: dict, answer: str, out_of_scope: bool) -> tuple[bool, str]:
    exp = item["expect"]
    text = fold(answer)
    for banned in exp.get("mustNotMention", []):
        if fold(banned) in text:
            return False, f"chứa cụm bị cấm: {banned!r}"
    missing = [g for g in exp.get("mustMentionAny", []) if not any(fold(alt) in text for alt in g)]
    behavior = exp["behavior"]
    if behavior == "out_of_scope":
        return (True, "") if out_of_scope else (False, "lẽ ra phải báo chưa có thông tin (outOfScope)")
    if behavior == "answer" and out_of_scope:
        return False, "báo chưa có thông tin dù nội dung có"
    if missing:
        return False, "thiếu ý: " + " | ".join("/".join(g) for g in missing)
    return True, ""


class RecordingProvider:
    """Wraps a real provider and keeps the raw text per evaluation item.

    Items already in `records` (from an interrupted run of the same model and
    content) are answered from the record without a new call, so a resumed run
    does not spend quota again.
    """

    def __init__(self, inner: LlmProvider, records: dict[str, str] | None = None) -> None:
        self.inner = inner
        self.name = getattr(inner, "name", "provider")
        self.current: str = ""
        self.records: dict[str, str] = dict(records or {})
        self.last_from_record = False

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        if self.current in self.records:
            self.last_from_record = True
            return self.records[self.current]
        raw = await self.inner.generate(system, user, timeout_s)
        self.records[self.current] = raw
        return raw


class ReplayProvider:
    """Returns recorded raw texts; an item without a recording is 'unavailable'."""

    name = "replay"

    def __init__(self, records: dict[str, str]) -> None:
        self.records = records
        self.current = ""

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        if self.current not in self.records:
            raise ProviderUnavailable("not_recorded", retryable=False)
        return self.records[self.current]


def eval_service(pack: ContentPack, provider: LlmProvider) -> AnswerService:
    """No cache (each question is graded on its own) and a breaker that never trips."""
    return AnswerService(
        pack, provider, AnswerCache(0, 0), CircuitBreaker(10_000, 1), ConcurrencyLimit(1), Budget()
    )


async def run(
    items: list[dict],
    pack: ContentPack,
    service: AnswerService,
    delay_s: float = 0.0,
    rate_limit_wait_s: float = 30.0,
    progress: Callable[[int, int, ItemResult], None] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    stop: Callable[[], bool] | None = None,
) -> list[ItemResult]:
    results: list[ItemResult] = []
    for n, item in enumerate(items, start=1):
        if hasattr(service.provider, "current"):
            service.provider.current = item["id"]
        if hasattr(service.provider, "last_from_record"):
            service.provider.last_from_record = False
        result = ItemResult(item["id"], item["category"], item["question"], item["expect"]["behavior"], "error")
        for attempt in range(4):
            try:
                outcome = await service.answer(make_request(item, pack))
            except AssistantUnavailable as exc:
                result.reason = f"AI không dùng được ({exc.reason})"
                transient = exc.reason == "rate_limited" or exc.reason.startswith("http_5")
                if transient and attempt < 3:
                    wait = exc.retry_after_s if exc.retry_after_s is not None else rate_limit_wait_s
                    await sleep(min(max(wait, 1.0), 120.0))
                    continue
                break
            except AssistantTimeout:
                result.reason = "AI trả lời quá thời gian"
                if attempt < 3:
                    await sleep(rate_limit_wait_s)
                    continue
                break
            ok, reason = grade(item, outcome.response.answer, outcome.response.out_of_scope)
            result.status = "pass" if ok else "fail"
            result.reason = reason
            result.answer = outcome.response.answer
            result.out_of_scope = outcome.response.out_of_scope
            result.path = outcome.path
            break
        result.review = result.category in REVIEW_CATEGORIES or result.status != "pass"
        results.append(result)
        if progress:
            progress(n, len(items), result)
        if stop and stop():
            break
        called = result.path not in ("guard", "no_content") and not getattr(service.provider, "last_from_record", False)
        if delay_s and n < len(items) and called:
            await sleep(delay_s)
    passes = [r for r in results if r.status == "pass" and not r.review]
    for r in random.Random(0).sample(passes, min(5, len(passes))):
        r.review = True
    return results


def summarize(results: list[ItemResult]) -> dict:
    by_cat: dict[str, Counter] = {}
    for r in results:
        by_cat.setdefault(r.category, Counter())[r.status] += 1
    total = Counter(r.status for r in results)
    return {"total": dict(total), "byCategory": {k: dict(v) for k, v in sorted(by_cat.items())}}


def _pct(c: dict) -> str:
    n = sum(c.values())
    return f"{c.get('pass', 0)}/{n} ({100 * c.get('pass', 0) // n if n else 0}%)"


def render_report(results: list[ItemResult], meta: RunMeta) -> str:
    s = summarize(results)
    lines = [
        f"# Báo cáo đánh giá trợ lý AI — {meta.created_at}",
        "",
        f"- Model: `{meta.model}` · contentVersion `{meta.content_version}`",
        f"- Nội dung đã duyệt: {meta.approved_docs} file",
        f"- Chấm {meta.graded_items}/{meta.total_items} câu (các câu còn lại chờ nội dung được duyệt)",
        f"- **Tổng: {_pct(s['total'])} đạt**, lỗi kết nối/AI: {s['total'].get('error', 0)}",
        "",
        "| Nhóm | Đạt | Sai | Lỗi |",
        "|---|---|---|---|",
    ]
    for cat, c in s["byCategory"].items():
        lines.append(f"| {cat} | {_pct(c)} | {c.get('fail', 0)} | {c.get('error', 0)} |")
    bad = [r for r in results if r.status != "pass"]
    lines += ["", f"## Câu sai hoặc lỗi ({len(bad)})", ""]
    for r in bad:
        lines += [
            f"### {r.id} · {r.category} · mong đợi: {r.expected}",
            f"- Hỏi: {r.question}",
            f"- Lý do: {r.reason}",
            f"- Trả lời ({r.path}, outOfScope={r.out_of_scope}): {r.answer or '—'}",
            "",
        ]
    review = [r for r in results if r.review and r.status == "pass"]
    lines += [f"## Nên đọc lại bằng mắt ({len(review)} câu đạt theo từ khóa)", ""]
    for r in review:
        lines += [f"- **{r.id}** {r.question}", f"  - {r.answer}"]
    lines.append("")
    return "\n".join(lines)


def to_json(results: list[ItemResult], meta: RunMeta) -> dict:
    return {"meta": asdict(meta), "summary": summarize(results), "results": [asdict(r) for r in results]}
