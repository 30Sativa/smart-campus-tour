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

## Addendum (12/11/2026): Staff wake the headset or put it to sleep

Requested by team member Thanh: the Quest plugged into the NUC stays awake and loses charge (a NUC USB port gives
less power than an awake, streaming Quest draws), so Staff need to put it to sleep between Tours.

1. **Screen in the report.** quest-stream adds `screen` (`awake`, `asleep`, `unknown`) from `dumpsys power`
   (`mWakefulness`). A report without `screen` comes from an older quest-stream, which cannot run presses.
2. **One press, in memory.** `POST /api/staff/manage/robots/{robotCode}/headset/commands` `{action: WAKE|SLEEP}`
   (Staff) keeps one press per robot (a later one replaces it) for `FleetCamera:RobotListeningWithinSeconds`. The
   next camera poll answer carries it once as `headsetCommand: {id, action}`. No SQL, no audit row; an API restart
   loses a press not yet delivered.
3. **Refused when nobody would run it.** 409 when the robot has not polled recently, the headset is not reported,
   adb is not `connected`, the quest-stream is too old, or SLEEP while a Tour runs on the robot (it would black out the
   viewers). WAKE is always allowed.
4. **On the headset.** WAKE: `input keyevent KEYCODE_WAKEUP`, then `com.oculus.vrpowermanager.prox_close` so the display
   stays on while nobody wears it. SLEEP: `com.oculus.vrpowermanager.automation_disable` (the proximity sensor is back),
   then `input keyevent KEYCODE_SLEEP`. The screen is read again right after, so the next report shows the result.
5. **No power-off or power-on.** A powered-off Quest has no adb, so the web could never turn it on again; only the
   button on the headset can.

The Robot panel's "Kính Quest" row gets a "Màn hình kính" line: the screen and the one button that changes it, and
what happened to the last press.
