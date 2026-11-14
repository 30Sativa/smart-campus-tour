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

## Addendum 09/11/2026: automatic sweep at POIs (requested by team member Sơn)

- Two head modes per Tour, chosen by the Operator: `MANUAL` (buttons only) and `AUTO` (default). In `AUTO`, when the
  robot's GoTo to a POI is recorded `ARRIVED` for the Tour's current leg, the backend queues one `SWEEP` on Fleet Head
  v1. Nothing is persisted; the mode lives in API memory (`FleetHead:DefaultMode` after a restart).
- The sweep runs on the robot (`stm32_bridge` service `head/sweep`): PAN left 135°, right 270°, left 135° back to the
  starting position, TILT unchanged, at the firmware's button speed (30°/s, no firmware change). Each side shrinks so
  the head never presses the soft limit, so the step counts always sum to zero and the head returns exactly.
- Buttons win: any manual head command cancels a running sweep, and the sweep sends nothing after it.
- Best effort: no sweep while `FleetHead:Enabled` is false, the robot is not polling, or the head is not IDLE with a
  reference. The arrival is recorded either way. Next is not blocked by a running sweep; the head may still be turned
  when the robot leaves. This is not the FR-49 checked camera preset, which stays M2.5 work.

## Addendum 10/11/2026: review fixes

- Next in `AUTO` queues `ANGLE 0/0` with the new leg: the robot no longer drives off with the head turned.
- A manual `STEP`/`JOG` during a sweep first sends `HEAD STOP`: the firmware adds a STEP to the running segment's
  target, so the head used to finish the segment (a "right 5 steps" ended at 132° left).
- The PAN home seek only finds the stop from 174° right to 16° left, and the sweep spends seconds beyond 16° left.
  `stm32_bridge` now remembers the real PAN angle on disk; after an STM32 reset or power loss far left, auto-home
  does ZERO → turn back → HOME, and a manual HOME far left turns to the front first. Park on shutdown waits until
  the head is at 0/0. The firmware and its 190° seek are unchanged.
- The backend refuses `ANGLE` outside the firmware soft limits (pan ±170°, tilt ±18°).

## Addendum 10/11/2026 (2): the VR head is configured on the POI (requested by team member Sơn)

- Every head behaviour at a POI lives in the POI's "Camera & tư liệu", in the existing camera preset (FR-49: one
  preset per POI revision, checked by Technical Staff). The vocabulary grows from `FRONT`/`LEFT`/`RIGHT` to also
  `NONE` (head stays, Operator buttons only), `SWEEP` / `SWEEP:<10..170>` (look left, right, back, degrees per side)
  and `ANGLE:<pan>,<tilt>` (pan ±170°, positive left; tilt ±18°, positive up). It stays one `NVARCHAR(80)` value,
  stored canonical and copied into route revision stops, so there is no schema change; a preset change alters the
  POI navigation fingerprint and needs a new check, as before.
- At arrival in an `AUTO` Tour the backend turns the stop's preset into one Fleet Head command: `FRONT` 0/0,
  `LEFT` +90°, `RIGHT` −90°, `ANGLE` as given, `SWEEP` with optional `sweepDeg`, nothing for `NONE`. Existing POIs
  hold `FRONT`, so they now turn to the front instead of sweeping; Staff picks `SWEEP` where a look-around is wanted.
- The Tour `AUTO`/`MANUAL` switch stays as the Operator's quick switch-off of all POI presets; departure still turns
  the head to the front in `AUTO`.
- Fleet Head v1 `SWEEP` gains optional `sweepDeg`; ROS `head/sweep` changes from `std_srvs/Trigger` to
  `bus_interfaces/srv/HeadSweep` (`amplitude_deg`, 0 = default), so `bus_interfaces` must be rebuilt.
- The route-level head steps (`RouteStops.HeadSteps`) are untouched; nothing on the robot reads them.

## Addendum 14/11/2026 (3): the robot turns the head at POIs itself (requested by team member Sơn)

**Context.** The backend queued a POI's preset only when the robot reported `ARRIVED` over Fleet Commands, and Fleet
Commands dispatch stays off on the physical robot until M2.3. So the head never turned at a POI on the real robot.
The head hardware also changed: both DRV8825 now run 1/4 microstep (quieter), and TILT drives the head through a 5:1
planetary gearbox to hold the head + Meta Quest 3 (~2 kg, centre of mass ~183 mm above the axis).

**Decision.**

1. New robot endpoint `GET /api/fleet/head/v1/pois` (contract `docs/contracts/fleet-head/v1/`): the running Tour's
   route stops with their frozen presets, otherwise the latest PASS revision of each POI on the robot's assigned map,
   plus `autoMotion = FleetHead:Enabled && mode == AUTO`.
2. `fleet_bridge` (`head_poi_auto`, needs `head_enabled`) watches `navigate_to_pose/_action/status` for any goal
   sender: a goal that starts executing → `ANGLE 0/0`; a goal that succeeds within `head_poi_radius_m` of a POI → that
   POI's preset. The first latched status message is ignored.
3. The backend no longer queues head commands on `ARRIVED` or Next (`HeadAutoMotion` removed). Operator buttons and
   AUTO/MANUAL are unchanged; MANUAL now reaches the robot as `autoMotion: false` within one refresh (5 s).
4. Firmware `head_core.h`: `HEAD_MICROSTEP` 4, `HEAD_TILT_GEAR_RATIO` 5. TILT stays ±18° (stop at 20° down): at ±27°
   the motor would need ~0.39 N·m of its 0.42 N·m and would skip steps. STEP keeps counting full motor steps, so one
   TILT tap is now 0.36° (the Operator console sends 15 per tap, ~5.4°).

**Consequences.** Head motion at POIs works without backend dispatch and without a round trip per arrival. A goal to
a non-POI point leaves the head at the front. The robot keeps the last good POI list if the backend is unreachable,
including the last `autoMotion`. Hardware behaviour (head turns, no skipped steps at 1/4 with the gearbox) is READY
FOR HARDWARE TEST, not verified by CI.

