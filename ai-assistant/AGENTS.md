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

It does not own person detection, obstacle avoidance, navigation goals, speed
limits or any other movement decision. Those belong to `robot/`. In
particular, `robot/ros2_ws/src/robot_perception/` is WP3 navigation perception,
not part of this assistant.

---

## 2. Stack and layout

<!-- TODO(WP4): language, framework, runtime version, model/API providers and
     local run command. -->

<!-- TODO(WP4): document the real source, tests, prompts/content and config
     layout after the stack is selected. -->

---

## 3. Architecture rules

- The assistant must never publish `/cmd_vel`, set Nav2 goals, change
  `/speed_limit`, or expose an API that directly commands robot movement.
- Student Q&A follows the browser/cloud path. Define its transport, schemas,
  authentication, timeouts and fallback in `docs/architecture.md` before
  implementation; do not route visitor audio through the robot.
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
