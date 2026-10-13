# AGENTS.md — `ai-assistant/`

> **STATUS: SKELETON.** Nothing is implemented yet. Fill the TODO blocks as
> WP4 implementation proceeds; delete this banner when appropriate.

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
robot movement. This target is not implemented by the current skeleton.

It does not own person detection, obstacle avoidance, navigation goals, speed
limits or any other movement decision. Those belong to `robot/`. In
particular, `robot/ros2_ws/src/robot_perception/` is WP3 navigation perception,
not part of this assistant.

---

## 2. Stack and layout

Selected by [ADR-0016](../docs/decisions/0016-student-qa-assistant-stack.md);
the HTTP contract is `docs/architecture.md` §7.1. Source does not exist yet.

- Language/runtime: **Python 3.11+**.
- HTTP framework: **FastAPI** with **pydantic** models; outbound HTTP with
  **httpx**.
- LLM provider: **Google Gemini API** (Flash-tier model) behind a provider
  adapter interface. Model ID and key come from configuration only. One
  provider in V1, no secondary provider.
- Tests and checks: **pytest**, **ruff**; an offline evaluation run with
  recorded provider responses. Tests never call the real provider.
- Packaging: container image on server/cloud, private network only.

Planned layout (create only what a task needs):

```
ai-assistant/
├── pyproject.toml
├── .env.example        names of required variables, no values
├── src/campus_assistant/
│   ├── api/            FastAPI app, /v1/answer, /health, service-key check
│   ├── content/        content-pack loader, versioning, context selection
│   ├── prompting/      system prompt and prompt assembly
│   ├── providers/      provider adapter interface, Gemini adapter, fake
│   └── guards/         input/output filters, robot-command refusal, cache
├── content/            approved Markdown content pack (campus/, pois/)
├── evals/              question set, expected facts, recorded responses
├── tests/
└── scripts/verify
```

Configuration (environment variables, values never committed):
`AI_SERVICE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, plus the budget/limit
settings listed in §7.1. Local `.env` is untracked.

Local run command: TODO(WP4) — added with the first source change.

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

<!-- TODO(WP4): replace the skeleton with format/lint, typecheck, unit tests,
     integration tests and any prompt/evaluation checks required by the chosen
     stack. -->

---

## 5. Hard constraints

- Do not commit model weights, API keys, service-account credentials, raw
  visitor audio or production conversation logs.
- Generated narration must not be interpreted as a robot control command.
- Any public interface change requires the matching update in
  `docs/architecture.md` in the same PR.
