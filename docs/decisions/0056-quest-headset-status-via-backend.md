# ADR-0056: The Quest headset's battery reaches the web through the backend

- **Status:** Proposed 12/11/2026 at the request of team member Thanh; implemented.
- **Follows:** ADR-0052 (camera poll), ADR-0055 (nothing on the deployed site talks to the NUC directly).

## Context

quest-stream reads the headset over adb (`adb devices -l`, `dumpsys battery`) and serves it at
`http://<NUC>:8080/device`. That URL exists only on the robot's LAN and over plain HTTP, so the deployed site
(`https://www.fptcampustour.cloud`) cannot read it, and no page showed the headset battery any more.

## Decision

1. **Same poll, optional body.** quest-stream already asks `POST /api/fleet/camera/v1/poll` every few seconds with
   the robot's Fleet identity. It now sends `{headset: {connection, batteryPercent, charging, stream}}` with it. The
   body is optional (an older NUC sends none) and normalised, never rejected: an unknown word becomes `unknown` and the
   battery is clamped to 0–100, so a status field can never cost the robot its camera control.
2. **In memory.** The backend keeps the latest report per robot next to the camera demand (ADR-0052); no SQL write.
3. **Staff read it.** `GET /api/staff/manage/robots/{robotCode}/headset` (Staff) returns
   `{robotCode, reported, connection, batteryPercent, charging, stream, reportedAt, stale}`; `stale` after
   `FleetCamera:RobotListeningWithinSeconds` without a report. The Robot panel of the pre-start check and live
   operations pages shows it as "Kính Quest", refreshed every 10 s.
4. **Reporting without on-demand camera.** `QUEST_CAMERA_ON_DEMAND=off` keeps polling (and reporting) but captures
   whenever the Quest is plugged in.

## Consequences

- The battery appears only when quest-stream has `QUEST_CONTROL_URL` set (`auto`) and the Fleet identity.
- Students do not see the headset battery. An API restart forgets the report until the next poll (≤ 5 s).
