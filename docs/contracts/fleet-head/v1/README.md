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
| `kind` | `STEP`, `JOG`, `STOP`, `ANGLE`. |
| `issuedAt` | Server time the Operator's request was accepted (UTC). Informational; the robot does not compare clocks. |
| `panSteps`, `tiltSteps` | `STEP` only: full motor steps, −20..20, at least one non-zero → ROS `head/step`. |
| `panDir`, `tiltDir` | `JOG` only: −1, 0 or 1 → ROS `head/jog`. `0,0` releases. |
| `ttlMs` | `JOG` only. The robot keeps this jog only until its **own receipt time + `ttlMs`**, then releases (`head/jog 0,0`) unless a newer `JOG` arrived. |
| `panDeg`, `tiltDeg` | `ANGLE` only: absolute degrees from the homed zero, pan −180..180, tilt −90..90 → ROS `head/set` (mode angle). The firmware refuses angles outside its soft limits. |

`STOP` → ROS `head/stop`, and also ends an active jog.

Robot rules:

- Execute in `seq` order. A failed ROS call is logged and skipped; there is no result report in v1 (the next poll's
  `head` shows the outcome).
- On any poll error keep no jog alive past its own deadline; back off and poll again.
- Poll again immediately after a response that carried commands; otherwise after a short pause.

## Staff side (Operator console)

JWT of a Staff user; `Authorize(Roles = Staff)`.

### `POST /api/staff/manage/tours/{id}/head-commands`

Body, one of:

```json
{ "kind": "STEP",  "panSteps": 1, "tiltSteps": 0 }
{ "kind": "JOG",   "panDir": -1, "tiltDir": 0 }
{ "kind": "STOP" }
{ "kind": "ANGLE", "panDeg": 0, "tiltDeg": 0 }
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

### `GET /api/staff/manage/tours/{id}/head`

Any Staff. `data` = `{ enabled, robotCode, connected, lastPollAt, head }`, where `head` is the robot's last report
(`state`, `referenced`, `panDeg`, `tiltDeg`, `observedAt`, `receivedAt`) or `null`. `robotCode` is `null` before
Start.
