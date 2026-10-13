#!/usr/bin/env python3
"""Run the evaluation set against the assistant and write a report.

Live run with Gemini (reads ai-assistant/.env), from inside ai-assistant/:
    .venv/Scripts/python scripts/run_eval.py            (Windows)
    .venv/bin/python scripts/run_eval.py                (Linux/macOS)

Options:
    --limit N           only the first N gradable questions (quick check)
    --only CAT[,CAT]    only these categories, e.g. robot,tour
    --delay S           seconds between LLM calls (default 5, for free-tier limits)
    --provider fake     no network; checks the pipeline only
    --replay FILE       re-grade recorded answers offline (no network)

Writes evals/reports/<time>-<model>.md/.json. A live Gemini run also writes
evals/recorded/latest.json, which scripts/verify replays offline.
Question texts in evals/ are synthetic; never put real student questions there.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from campus_assistant import evaluation as ev  # noqa: E402
from campus_assistant.config import ConfigError, Settings, load_dotenv  # noqa: E402
from campus_assistant.content import ContentPack  # noqa: E402
from campus_assistant.prompting import SYSTEM_PROMPT  # noqa: E402
from campus_assistant.providers.fake import ContentEchoProvider  # noqa: E402
from campus_assistant.providers.gemini import GeminiProvider  # noqa: E402

FATAL_HINTS = {
    "auth_error_400": "Key không hợp lệ.",
    "auth_error_401": "Key không hợp lệ hoặc đã bị xóa. Kiểm tra GEMINI_API_KEY trong .env.",
    "auth_error_403": "Key không có quyền dùng Gemini API (project chưa bật API?).",
    "http_404": "Không tìm thấy model. Kiểm tra GEMINI_MODEL trong .env (thử gemini-3.5-flash-lite).",
    "http_400": "Gemini từ chối request (400). Thử đặt GEMINI_THINKING_LEVEL= (để trống) hoặc đổi model.",
    "rate_limited_daily": "Hết lượt miễn phí trong ngày của model này. Các câu đã chạy được lưu lại; "
    "chạy lại cùng lệnh vào ngày mai để làm tiếp, hoặc đổi GEMINI_MODEL (mỗi model có hạn mức riêng; "
    "khi đổi model, bài thi chạy lại từ đầu cho model mới).",
}


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--provider", choices=["gemini", "fake"], default="gemini")
    ap.add_argument("--replay", type=Path)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--only")
    ap.add_argument("--delay", type=float, default=5.0)
    ap.add_argument("--questions", type=Path, default=ROOT / "evals" / "questions.json")
    ap.add_argument("--out", type=Path, default=ROOT / "evals")
    ap.add_argument("--fresh", action="store_true", help="ignore answers saved by an interrupted run")
    args = ap.parse_args(argv)

    env = load_dotenv(ROOT / ".env")
    try:
        settings = Settings.from_env({**env, "AI_SERVICE_KEY": "x" * 16})
    except ConfigError as exc:
        print(f"Lỗi cấu hình: {exc}")
        return 2
    pack = ContentPack.load(settings.content_dir)

    recorded_meta: dict = {}
    if args.replay:
        data = json.loads(args.replay.read_text(encoding="utf-8"))
        recorded_meta = data["meta"]
        provider = ev.ReplayProvider(data["records"])
        model = f"replay:{recorded_meta.get('model', '?')}"
    elif args.provider == "fake":
        provider, model = ContentEchoProvider(), "fake"
    else:
        if not settings.gemini_api_key or not settings.gemini_model:
            print("Thiếu GEMINI_API_KEY hoặc GEMINI_MODEL trong ai-assistant/.env")
            return 2
        model = settings.gemini_model
        partial_path = args.out / "recorded" / f"partial-{_safe(model)}.json"
        saved: dict[str, str] = {}
        if partial_path.exists() and not args.fresh:
            data = json.loads(partial_path.read_text(encoding="utf-8"))
            if data.get("key") == _resume_key(model, pack.version, args.questions):
                saved = data.get("records", {})
                print(f"Tiếp tục lần chạy trước: {len(saved)} câu đã có câu trả lời, không gọi lại.")
        provider = ev.RecordingProvider(
            GeminiProvider(
                settings.gemini_api_key,
                settings.gemini_model,
                settings.gemini_base_url,
                thinking_level=settings.gemini_thinking_level,
            ),
            saved,
        )

    items = ev.load_items(args.questions)
    selected = ev.gradable(items, pack)
    if args.only:
        cats = set(args.only.split(","))
        selected = [it for it in selected if it["category"] in cats]
    if args.limit:
        selected = selected[: args.limit]
    print(f"Nội dung đã duyệt: {len(pack.docs)} file (contentVersion {pack.version})")
    if not pack.docs:
        print("CHÚ Ý: chưa có file nội dung nào được duyệt; chỉ chấm được câu từ chối/ngoài phạm vi.")
    if recorded_meta and recorded_meta.get("content_version") != pack.version:
        print("CHÚ Ý: bản ghi được tạo với nội dung khác; điểm có thể không so sánh được.")
    print(f"Chấm {len(selected)}/{len(items)} câu bằng {model}\n")

    fatal: list[str] = []

    def progress(n: int, total: int, r: ev.ItemResult) -> None:
        mark = {"pass": "ĐẠT", "fail": "SAI", "error": "LỖI"}[r.status]
        print(f"[{n:>2}/{total}] {mark:<3} {r.id:<16} {r.reason}", flush=True)
        if isinstance(provider, ev.RecordingProvider):  # save after every answer, so Ctrl+C loses nothing
            partial_path.parent.mkdir(parents=True, exist_ok=True)
            partial_path.write_text(
                json.dumps({"key": _resume_key(model, pack.version, args.questions), "records": provider.records},
                           ensure_ascii=False),
                encoding="utf-8",
            )
        for code, hint in FATAL_HINTS.items():
            if code in r.reason:
                fatal.append(hint)

    service = ev.eval_service(pack, provider)
    delay = args.delay if isinstance(provider, ev.RecordingProvider) else 0.0  # no network, no waiting

    results = asyncio.run(
        ev.run(selected, pack, service, delay_s=delay, progress=progress, stop=lambda: bool(fatal))
    )
    if fatal:
        print(f"\nDỪNG: {fatal[0]}")
        return 1
    if any(r.status == "error" for r in results) and isinstance(provider, ev.RecordingProvider):
        print("\nMột số câu bị lỗi; chạy lại cùng lệnh để chỉ chạy lại các câu đó.")

    now = datetime.now(timezone.utc).astimezone()
    meta = ev.RunMeta(
        model=model,
        content_version=pack.version,
        approved_docs=len(pack.docs),
        total_items=len(items),
        graded_items=len(results),
        created_at=now.strftime("%Y-%m-%d %H:%M"),
        extra={"questionsHash": _questions_hash(args.questions)},
    )
    reports = args.out / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    stem = f"{now.strftime('%Y%m%d-%H%M')}-{_safe(model)}"
    (reports / f"{stem}.md").write_text(ev.render_report(results, meta), encoding="utf-8")
    (reports / f"{stem}.json").write_text(
        json.dumps(ev.to_json(results, meta), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if isinstance(provider, ev.RecordingProvider) and not args.only and not args.limit:
        recorded = args.out / "recorded"
        recorded.mkdir(parents=True, exist_ok=True)
        payload = {
            "meta": {**ev.to_json(results, meta)["meta"], "passIds": [r.id for r in results if r.status == "pass"]},
            "records": provider.records,
        }
        (recorded / "latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        if not any(r.status == "error" for r in results):
            partial_path.unlink(missing_ok=True)

    s = ev.summarize(results)["total"]
    print(f"\nKết quả: {s.get('pass', 0)} đạt, {s.get('fail', 0)} sai, {s.get('error', 0)} lỗi")
    print(f"Báo cáo: {reports / (stem + '.md')}")
    return 0 if results and s.get("error", 0) < len(results) else 1


def _safe(name: str) -> str:
    return name.replace(":", "_").replace("/", "_")


def _questions_hash(questions: Path) -> str:
    return hashlib.sha256(questions.read_bytes()).hexdigest()[:12]


def _resume_key(model: str, content_version: str, questions: Path) -> str:
    """Saved answers are reused only for the same model, content, questions and system prompt."""
    prompt = hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest()[:12]
    return f"{model}|{content_version}|{_questions_hash(questions)}|{prompt}"


if __name__ == "__main__":
    sys.exit(main())
