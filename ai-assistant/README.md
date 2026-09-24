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

**Not started.** The runtime stack and robot/backend integration contract are
not decided. Define the transport, schemas, authentication, timeouts and
offline fallback in `docs/architecture.md` before implementing either side.

## Verification

```bash
ai-assistant/scripts/verify
```

The script currently returns `SKIPPED` until source and a real verification
pipeline are added.
