# AI Tour-Guide Assistant

WP4 deploy unit for the student-facing private Q&A service. V1 uses one
project language; multilingual and per-tour language selection are out of
scope. The browser/cloud path owns speech and dialogue:

```text
student browser -> private STT -> campus knowledge/dialogue -> TTS -> browser
```

POI narration is separate: the browser plays approved, pre-generated assets.
This service does not send visitor audio to the robot. Final media transport
details remain undecided.

## Boundary with robot perception

This service is not `robot_perception`.

| `robot_perception` (WP3) | `ai-assistant/` (WP4) |
|---|---|
| Detects people from RGB-D | Supports private student Q&A |
| Publishes people poses and Nav2 speed limits | Produces Q&A responses |
| Runs on the robot miniPC | Runs on a server/cloud runtime |
| May influence navigation speed | Has no robot motion authority |

The robot miniPC is limited to an i3-7100T and 8 GB RAM while already running
Nav2 and perception. The heavy STT, retrieval/dialogue and TTS pipeline must
therefore not be added to the robot runtime. `robot/` owns navigation,
physical sensors, fleet connectivity and rotating camera/head hardware. It does
not own visitor audio playback, narration or AI dialogue.

## Status

**Text Q&A implemented end to end.** `POST /v1/answer` and `GET /health`
follow `docs/architecture.md` §7.1 (stack: ADR-0016, Python + Starlette, Gemini
through a provider adapter). The backend exposes
`POST /api/student/tours/{tourId}/questions` and the invited Student page shows
the chat while the Tour is RUNNING. Three campus content files are approved;
the last live evaluation passed 63 of 64 gradable questions.

Not done yet: nothing writes Tour progress, so the POI snapshot stays `null`; POI
and school content files are still drafts, STT/TTS are undecided, and there is
no load test or container image. Local end-to-end run:
`backend/docs/student-ai-local.md`.

## Verification

```bash
ai-assistant/scripts/verify
```

Runs the content checks, ruff (when installed), the unit tests and an offline
replay of `evals/recorded/latest.json`. One-time setup and the live evaluation
command are in `AGENTS.md` §4.
