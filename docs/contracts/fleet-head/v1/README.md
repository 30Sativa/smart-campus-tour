# Fleet Head v1

**Status: Proposed in [ADR-0045](../../../decisions/0045-operator-head-control.md) (05/11/2026). Implemented by the
backend and by `robot/ros2_ws/src/fleet_bridge` behind flags that are off by default.**

The Operator of a RUNNING Tour turns the robot's PAN/TILT head with buttons. The backend keeps the last few head
commands in memory; the robot long-polls them over HTTPS. Nothing here is persisted, and Fleet Sync v1 / Fleet
Commands v1 are unchanged.

```
web (Operator) --POST /api/staff/manage/tours/{id}/head-commands--> backend (memory, per robot: epoch + seq)
robot fleet_bridge --POST /api/fleet/head/v1/poll (long poll)-----> backend --commands--> ROS head/step, head/jog,
                                                                                         head/stop, head/set
robot fleet_bridge --GET /api/fleet/head/v1/pois (every 5 s)------> backend --POIs + presets--> fleet_bridge turns
                                                                   the head itself on Nav2 goal start / success
```

## Robot side

Same robot scheme as Fleet Sync v1: `Authorization: Bearer <credential>`, `X-Robot-Code: <RobotCode>`, HTTPS.
User JWTs are refused (401). Rate-limit policy `FleetHead` (`FleetHead:RateLimit:PermitLimit`, default 1200 per
`WindowSeconds` 60, per client IP), separate from the Fleet Sync budget.

### Poll — `POST /api/fleet/head/v1/poll`

Request: [`poll-request.json`](poll-request.json).

| Field | Rule |
|---|---|
| `epoch` | UUID from the previous response, or `null` on the first poll. A different epoch than the server's means "start over": the server answers with every command it still keeps that is not too old. |
| `afterSeq` | Integer ≥ 0: the highest `seq` the robot has already executed in that epoch. |
| `waitMs` | 0..10000. The server waits up to `min(waitMs, FleetHead:MaxWaitMs)` for a new command before answering with none. |
| `head` | Optional latest `head/state`: `state` (`OFF`, `IDLE`, `MOVING`, `HOMING`, `NO_REFERENCE`, `UNKNOWN`), `referenced` (bool), `panDeg`, `tiltDeg` (finite, \|x\| ≤ 360), `observedAt` (UTC, optional). `null` when the head interface is unavailable. |

Response: [`poll-response-commands.json`](poll-response-commands.json), or
[`poll-response-empty.json`](poll-response-empty.json) when the wait ended with nothing new.

| Field | Rule |
|---|---|
| `epoch` | The server's current epoch. Send it back next time. |
| `commands` | In increasing `seq`. Only commands newer than `afterSeq` (same epoch) and not older than `FleetHead:MaxCommandAgeMs` (default 1000). Never more than the server keeps (32 per robot). |
| `seq` | Integer, increasing per robot within an epoch. Execute each `seq` at most once; ignore `seq ≤` the last executed. |
| `kind` | `STEP`, `JOG`, `STOP`, `ANGLE`, `SWEEP`. |
| `sweepDeg` | `SWEEP` only, optional: degrees per side, integer 10..170. Absent = the robot's default (135°). |
| `issuedAt` | Server time the Operator's request was accepted (UTC). Informational; the robot does not compare clocks. |
| `panSteps`, `tiltSteps` | `STEP` only: full motor steps, −20..20, at least one non-zero → ROS `head/step`. |
| `panDir`, `tiltDir` | `JOG` only: −1, 0 or 1 → ROS `head/jog`. `0,0` releases. |
| `ttlMs` | `JOG` only. The robot keeps this jog only until its **own receipt time + `ttlMs`**, then releases (`head/jog 0,0`) unless a newer `JOG` arrived. |
| `panDeg`, `tiltDeg` | `ANGLE` only: absolute degrees from the homed zero → ROS `head/set` (mode angle). The robot accepts pan −180..180, tilt −90..90 on the wire; the backend only queues the firmware soft limits, pan −170..170 and tilt −18..18. Since 14/11/2026 the backend no longer queues POI motion; the robot does it (see POIs below). |

`STOP` → ROS `head/stop`, and also ends an active jog.

`SWEEP` (optional `sweepDeg`) → ROS `head/sweep` (`HeadSweep.amplitude_deg`, 0 when absent), after ending an
active jog: `stm32_bridge` turns PAN left `sweepDeg` (default 135°), then right twice that, then back to where it
started, at button speed (30°/s), shrinking a side that would cross the soft limit; TILT stays. Any later head
command (button, `STOP`, `ANGLE`) stops it where it is. The Operator may send it; the robot also runs it by itself
at a POI whose camera preset is `SWEEP` (see POIs below).

Robot rules:

- Execute in `seq` order. A failed ROS call is logged and skipped; there is no result report in v1 (the next poll's
  `head` shows the outcome).
- On any poll error keep no jog alive past its own deadline; back off and poll again.
- Poll again immediately after a response that carried commands; otherwise after a short pause.

### POIs — `GET /api/fleet/head/v1/pois` (added 14/11/2026)

Same robot scheme and `FleetHead` rate-limit policy. No body. Response: [`pois-response.json`](pois-response.json).

| Field | Rule |
|---|---|
| `source` | `TOUR`: the stops of the robot's `RUNNING` Tour (presets frozen in the route revision). `MAP`: no running Tour, the latest PASS revision of each POI on the map assigned to the robot. `NONE`: nothing (unknown robot, no map). |
| `tourId`, `mapVersionId` | Informational, nullable. |
| `mode` | `AUTO` or `MANUAL`: the running Tour's head mode, else `FleetHead:DefaultMode`. |
| `autoMotion` | `FleetHead:Enabled` and `mode == AUTO`. When false the robot never turns the head by itself. |
| `pois[]` | `id`, `name`, `x`, `y`, `yaw` (map frame of that map version, metres / radians) and `cameraPreset`, canonical: `FRONT`, `LEFT`, `RIGHT`, `NONE`, `SWEEP`, `SWEEP:<10..170>`, `ANGLE:<pan ±170>,<tilt ±18>` (an older unknown value is sent as `NONE`). |

Robot rules (`fleet_bridge`, `head_poi_auto`, with `head_enabled`):

- Refresh every `head_poi_refresh_sec` (5 s). A failed refresh keeps the last good list.
- Watch `navigate_to_pose/_action/status` (any goal sender). The first, latched message is history and is ignored.
- A goal that starts `EXECUTING` → `ANGLE 0/0` (the robot never drives with the head turned).
- A goal that `SUCCEEDED` while the TF pose is fresh and within `head_poi_radius_m` (0.6 m) of a POI → that POI's
  preset: `ANGLE` for `FRONT`/`LEFT`/`RIGHT`/`ANGLE:p,t`, `SWEEP` for `SWEEP[:deg]`, nothing for `NONE`.
- Only when `autoMotion` is true. Operator buttons still win: the robot acts only on these two goal events.

## Staff side (Operator console)

JWT of a Staff user; `Authorize(Roles = Staff)`.

### `POST /api/staff/manage/tours/{id}/head-commands`

Body, one of:

```json
{ "kind": "STEP",  "panSteps": 1, "tiltSteps": 0 }
{ "kind": "JOG",   "panDir": -1, "tiltDir": 0 }
{ "kind": "STOP" }
{ "kind": "ANGLE", "panDeg": 0, "tiltDeg": 0 }
{ "kind": "SWEEP" }
{ "kind": "SWEEP", "sweepDeg": 90 }
```

Fields that do not belong to the kind must be absent or `null`. Hold a button = send `JOG` about every 200 ms (well
under `ttlMs`); release = `JOG` with `0,0` (or `STOP`).

| Status | Code | Meaning |
|---|---|---|
| 200 | | Queued. `data` = `{ seq, robotCode, issuedAt }`. Queued is not executed. |
| 400 | | Invalid body. |
| 403 | | Not this Tour's Operator. |
| 404 | | Unknown Tour. |
| 409 | `HEAD_CONTROL_DISABLED` | `FleetHead:Enabled` is false. |
| 409 | `TOUR_STATE_INVALID` | Tour is not RUNNING or has no assigned robot. |
| 409 | `HEAD_ROBOT_NOT_CONNECTED` | The robot has not polled within `FleetHead:RobotConnectedWithinMs`. |
| 429 | `RATE_LIMITED` | `FleetHead` policy. |

### `PUT /api/staff/manage/tours/{id}/head-mode`

Body `{ "mode": "AUTO" }` or `{ "mode": "MANUAL" }`. Only this Tour's Operator (403 otherwise), until the Tour is
COMPLETED or CANCELLED (409 `TOUR_STATE_INVALID`), so it can be chosen before Start. `data` = `{ tourId, mode }`.

| Mode | At each POI arrival | Buttons |
|---|---|---|
| `AUTO` (default, `FleetHead:DefaultMode`) | `autoMotion: true` on `GET pois`: the robot does what the POI's camera preset says when Nav2 reaches it, and turns to the front when the next goal starts. Only if `FleetHead:Enabled`. | Work, and stop a running sweep |
| `MANUAL` | `autoMotion: false`: nothing, at arrival or departure | Work |

The mode is kept in API memory per Tour; after an API restart every Tour is back to the default.

### `GET /api/staff/manage/tours/{id}/head`

Any Staff. `data` = `{ enabled, mode, robotCode, connected, lastPollAt, head }`, where `head` is the robot's last report
(`state`, `referenced`, `panDeg`, `tiltDeg`, `observedAt`, `receivedAt`) or `null`. `robotCode` is `null` before
Start.
