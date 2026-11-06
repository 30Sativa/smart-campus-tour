# ADR-0045: Operator PAN/TILT head control over Fleet Head v1

- **Status:** Proposed 05/11/2026 at the request of team member Sơn; implemented behind `FleetHead:Enabled = false`
  (backend) and `head_enabled: false` (robot `fleet_bridge`). Needs the repository owner's acceptance before either flag
  is turned on outside a bench.
- **Revises:** `docs/requirements/campus-tour-scope.md` §3 "Manual Staff camera control is outside target", for the
  assigned Operator only. The Viewer rule in `docs/requirements/campus-tour-ui-flow.md` ("no robot/head control") is
  unchanged.
- **Related:** ADR-0042/0043 (Fleet Commands v1, movement only), ADR-0019 (Fleet Sync, telemetry only, single API
  instance), ADR-0040 (camera presets FRONT/LEFT/RIGHT), `robot/ros2_ws/src/stm32_bridge/HEAD_CONTROL.md`.

## Context

The Meta Quest 3 is mounted on the robot's PAN/TILT head and its picture is streamed to the web
(`robot/quest-stream/`). The Operator watching that stream needs to turn the head with buttons: tap to move one
step, hold to keep turning, release to stop, and a "centre" button.

The only command path from the backend to the robot is Fleet Commands v1: one durable movement command per robot,
polled every 0.5 s, built for navigation legs with an audited lifecycle. Head buttons are the opposite: many short,
disposable commands per second, where an old command must never be executed late. Putting them in `RobotCommands`
would write SQL rows several times per second and block navigation behind the one-open-command rule.

## Decision

1. **Who.** Only `Tours.OperatorUserId` of a `RUNNING` Tour may turn the head of that Tour's `AssignedRobotId`, in
   any `OperationalStatus` (looking around helps in `NEEDS_ASSISTANCE`). Other Staff may read the head state.
   Viewers, Representatives and Admin cannot.
2. **Separate transport, nothing persisted.** A new contract `docs/contracts/fleet-head/v1/`. The backend keeps, in
   memory per robot, the last few head commands with a per-process `epoch` and an increasing `seq`. The robot
   long-polls `POST /api/fleet/head/v1/poll` with its last `seq`; the backend answers at once when newer commands
   exist, otherwise after at most `FleetHead:MaxWaitMs` (default 1500). No `RobotCommands` row, no TourEvent, no
   audit row per button press (transient high-frequency state stays out of SQL, backend AGENTS §3). Fleet Sync v1
   and Fleet Commands v1 are unchanged.
3. **Commands.** `STEP` (relative full motor steps, tap), `JOG` (direction −1/0/1 per axis, hold), `STOP` (ramp to a
   halt), `ANGLE` (absolute degrees, e.g. centre 0/0). `HOME`, `OFF` and `ZERO` are not exposed: homing grinds the
   mechanical stop and is done automatically by `stm32_bridge` when the STM32 boots.
4. **Never late, never forever.**
   - A command older than `FleetHead:MaxCommandAgeMs` (default 1000) is never delivered, so a robot that reconnects
     after an outage does not replay old taps.
   - `JOG` carries `ttlMs` (`FleetHead:JogTtlMs`, default 600). The robot keeps jogging only until its own receipt
     time plus `ttlMs`; the web must repeat `JOG` while the button is held (about every 200 ms). Lost network, closed
     tab or a stuck backend therefore stop the head within `ttlMs` plus the local deadmen of `stm32_bridge` (0.25 s)
     and the firmware (0.3 s).
   - A new `epoch` (API restart) resets the sequence; the robot accepts the new epoch and drops nothing new.
5. **Robot must be listening.** The backend refuses a command with `409 HEAD_ROBOT_NOT_CONNECTED` when the robot has
   not polled within `FleetHead:RobotConnectedWithinMs` (default 3000), so the Operator gets an error instead of a
   button that silently does nothing.
6. **Feedback.** Each poll may carry the latest `head/state` (state, referenced, pan/tilt degrees). Staff read it
   with `GET /api/staff/manage/tours/{id}/head`.
7. **Kill switches.** `FleetHead:Enabled` (backend, default false) and `head_enabled` (robot, default false). The
   head interface of `stm32_bridge` still enforces its own soft limits; the backend does not know them.

## Consequences

- The Operator can turn the head with roughly one network round trip of delay (long poll), without touching the
  navigation command lifecycle.
- Head commands are not audited individually. A misuse can only be traced through access logs; this is accepted
  because the head cannot move the robot and stays inside firmware soft limits.
- State is per API instance, like Fleet Sync (ADR-0019 single-instance limit). After an API restart the robot's next
  poll gets the new epoch; the Operator's console gets `HEAD_ROBOT_NOT_CONNECTED` until the robot polls again.
- Because only a `RUNNING` Tour enables control, the head cannot be turned from the web on a physical robot until a
  Tour can start on it (`IsDispatchEnabled`, M2.3). Bench control stays on `head_teleop` / ROS CLI.
- Camera presets at POI arrival (FR-49, M2.5) and FRONT before legs remain separate work; they may reuse `ANGLE`.
