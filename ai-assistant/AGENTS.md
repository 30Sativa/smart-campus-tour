
# AGENTS.md — `ai-assistant/`

> **STATUS: text Q&A implemented.** `/v1/answer` service, backend endpoint
> (`docs/architecture.md` §7.1) and the live web panel exist. Not yet done: nothing
> writes Tour progress yet, so the POI snapshot stays `null` in practice;
> STT/TTS, load test and container image.

Student private Q&A service for CampusTour DT-AMR (Work Package 4). V1 uses one
project language; multilingual and per-tour language selection are out of scope.
Read the repo-root `AGENTS.md` first; this file covers only this deploy unit.

---

## 1. Scope

This folder owns STT, campus knowledge/retrieval, dialogue/LLM orchestration,
TTS and conversational session behaviour.

The Review 1 target in `docs/requirements/campus-tour-scope.md` and
`docs/decisions/0009-review-1-tour-business-scope.md` is private Q&A scoped to
the authorized invitation, browser session, Tour, and a snapshot of the
currently permitted POI context at question time. Recheck current invitation
and Tour access when accepting a question and before returning its answer; a
revoked invitation must not receive a late response or start a new Q&A request.
Each student's Q&A stays private. A “Điểm xem chung” uses one shared
screen/session, so any answer shown there is shared with that room; it is not a
count or identity for the students watching. The assistant must never control
robot movement. Text Q&A meets this target; the backend snapshots the POI from
the Tour's progress columns, which nothing writes yet.

It does not own person detection, obstacle avoidance, navigation goals, speed
limits or any other movement decision. Those belong to `robot/`. In
particular, `robot/ros2_ws/src/robot_perception/` is WP3 navigation perception,
not part of this assistant.

---

## 2. Stack and layout

Selected by [ADR-0016](../docs/decisions/0016-student-qa-assistant-stack.md);
the HTTP contract is `docs/architecture.md` §7.1.

- Language/runtime: **Python 3.11+**.
- HTTP framework: **Starlette** with **pydantic** models, served by
  **uvicorn** (ADR-0016 addendum). Outbound HTTP uses the standard library.
- LLM provider: **Google Gemini API** (Flash-tier model) behind a provider
  adapter interface. Model ID and key come from configuration only. One
  provider in V1, no secondary provider.
- Tests and checks: standard-library **unittest**, **ruff**; an offline
  replay of the last live evaluation run (`evals/recorded/latest.json`). Tests
  never call the real provider.
- Packaging: container image on server/cloud, private network only.

Layout:

```
ai-assistant/
├── pyproject.toml
├── .env.example        names of required variables, no values
├── src/campus_assistant/
│   ├── api.py          Starlette app: /v1/answer, /health, service-key check, safe logs
│   ├── service.py      orchestration: guard -> cache -> context -> LLM -> parse -> sanitize
│   ├── content.py      content-pack loader, contentVersion, context selection
│   ├── prompting.py    system prompt and prompt assembly
│   ├── guards.py       normalization, robot-command refusal, answer sanitizing
│   ├── cache.py        bounded TTL answer cache
│   ├── resilience.py   circuit breaker, non-queuing concurrency limit
│   ├── config.py       settings from environment
│   ├── models.py       request/response schemas
│   └── providers/      provider protocol, Gemini adapter, fake providers
├── content/            approved Markdown content pack (campus/, pois/); rules in content/README.md
├── evals/              questions.json; recorded/latest.json (last live run); reports/ (untracked)
├── tests/
└── scripts/verify
```

Configuration (environment variables, values never committed):
`AI_SERVICE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, plus the budget/limit
settings listed in §7.1. Local `.env` is untracked.

Local run (inside `ai-assistant/`, after the one-time setup in
`scripts/verify`): copy `.env.example` to `.env`, set `AI_SERVICE_KEY` and
either `AI_PROVIDER=fake` or the Gemini variables, then

```bash
PYTHONPATH=src .venv/bin/python -m campus_assistant   # listens on 127.0.0.1:8090
```

---

## 3. Architecture rules

- The assistant must never publish `/cmd_vel`, set Nav2 goals, change
  `/speed_limit`, or expose an API that directly commands robot movement.
- Student Q&A follows the browser/cloud path: browser → backend →
  `ai-assistant` → LLM provider, as defined in `docs/architecture.md` §7.1.
  The assistant is never called directly by browsers and never receives
  roster data, email, access codes, session tokens or account identities. Do
  not route visitor audio through the robot.
- Answers are grounded in the POI snapshot and the approved content pack;
  content without reviewer metadata is not used.
- STT, retrieval/dialogue and TTS orchestration stay in this folder and do not
  run on the robot miniPC. Approved, pre-generated narration is played in the
  browser, not by robot-side cached speech playback.
- Do not log raw visitor audio, transcripts or personal data by default.
- Assistant failure affects private Q&A; approved narration assets remain a
  browser playback path. Assistant failure must not block navigation or safe
  robot shutdown.

---

## 4. Verification

```bash
ai-assistant/scripts/verify
```

One-time setup (needs PyPI access): `python -m venv .venv` and
`.venv/bin/pip install -e ".[dev]"` inside `ai-assistant/`. CI runs the same
script with `REQUIRE_LINT=1` (`.github/workflows/ai-assistant-verify.yml`).

Checks, in order:

- `scripts/test_check_content.py` — unit tests for the content checker.
- `scripts/check_content.py` — validates `content/` frontmatter, review
  rules, personal-data and placeholder checks, size budget, and
  `evals/questions.json`; prints `contentVersion` and how many evaluation
  questions are gradable with the currently approved content.

- `ruff check .` — lint (warning only when ruff is missing locally; required
  in CI).
- `tests/` — service unit tests with fake providers and a fake clock; no
  network.

Content rules and the context-selection order are in `content/README.md`.

Quality evaluation (step 3 of the plan): `scripts/run_eval.py` runs every
gradable question in `evals/questions.json` through the real pipeline with
Gemini (needs `.env`), grades it by keywords and writes
`evals/reports/<time>-<model>.md` (untracked). A full live run also writes
`evals/recorded/latest.json`; `tests/test_evaluation.py` replays it offline in
`scripts/verify`, and fails if an answer that passed when recorded now fails
(it guards the code path; prompt changes need a new live run).

---

## 5. Hard constraints

- Do not commit model weights, API keys, service-account credentials, raw
  visitor audio or production conversation logs.
- Generated narration must not be interpreted as a robot control command.
- Any public interface change requires the matching update in
  `docs/architecture.md` in the same PR.
