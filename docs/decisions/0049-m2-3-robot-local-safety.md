# ADR-0049: M2.3 robot-local safety before a physical robot accepts fleet commands

- **Status:** Accepted 08/11/2026 by the repository owner, with the changes recorded here. Amended 08/11/2026 by the
  owner during step 3.2: the `faultCode` order (Decision 3) and the monitored actions (Decision 5).
  **Implemented in code, not proven on hardware** (status refreshed 11/11/2026):
  - step 3.1, the motion permit and latched gate in `mode_manager` (#228);
  - step 3.2, real `localized`/`motionReady`, the map content check and one goal sender (#230), with the permit kept
    when map evidence is only missing rather than wrong (#232);
  - step 3.3, the audited `IsDispatchEnabled` writer `POST /api/technical/physical-robots/{id}/dispatch` (#231);
  - STM32 link loss held as a state, not a one-shot stop (#270).

  **Still open:** no GATE A record exists, so every number below is still a target, not a measurement, and no robot
  may have `IsDispatchEnabled` set. Step 3.4 (Decision 10), the hardware E-stop input wired to the STM32 and read by
  `stm32_bridge` as `hardware_estop_state`, is not implemented and waits for a person to confirm the input pin; until
  then the Decision 10 operating rule applies. Acceptance and the code above do not authorize physical motion.
- **Supplements:** ADR-0042 (M2 command transport, D-items on `IsDispatchEnabled`), ADR-0043 D11/D13.
- **Related:** `docs/architecture.md` §3.5, §3.6, §6; ADR-0008, ADR-0019, ADR-0021, ADR-0040;
  `docs/requirements/campus-tour-scope.md` §7; `robot/docs/robot-baseline-2026-11-02.md`.
- **Does not rely on:** ADR-0045 (Proposed, flags off). Head motion is outside this ADR.

## Context

`fleet_bridge` can already send a Nav2 goal when `commands_enabled` is true. Nothing on the robot stops that goal if the
backend goes away:

- Network or backend loss touches nothing. The goal keeps running and the pollers only back off.
- `localized`, `motionReady` and `faultCode` are always null (`fleet_bridge/protocol.py:127-130`), so the backend
  correctly refuses every Start, but only because the sources do not exist.
- The map check compares two strings. The bridge does not know which files `map_server` loaded.
- At startup, an orphan goal is reported as `IDLE` and the next GoTo goes straight to Nav2.
- `nav_timeout` (0.5 s) and `CMD_TIMEOUT_MS` (300 ms) only see a silent local sender. `architecture.md` §6 already rules
  them out as evidence of WAN-loss coverage.

SRS §7 requires a local stop within 3 s of heartbeat loss, no automatic resume, an E-stop that cuts motor power with the
server off, a stop at least 0.3 m before a person-sized obstacle at 0.2 m/s, and an attendant who reaches the E-stop
within 2 s. These need physical evidence.

### Facts that constrain the design

| Fact | Source | Consequence |
|---|---|---|
| The 02/11 baseline says the hardware E-stop does not work. The owner stated on 08/11 that the hardware E-stop now works and that PA10, through connector `J_3V3_AUX` (pin 1 PA10, pin 2 GND), belongs to it. No measurement is recorded yet. `/emergency_stop_state` is software-only and no E-stop input reaches the STM32. | `robot-baseline-2026-11-02.md:85`, owner statement, PCB layout, `mode_manager_node.py`, `PIN_MAP.md`, `PROTOCOL_FB.md` | **A10 must record the measurement**, and nothing may run on the floor until it passes (Decisions 9 and 10). |
| `contactor/state` is the commanded state of PA10, not the real contact, so it stays 1 while the E-stop is pressed. PA10 turns ON at every STM32 boot. The circuit after `J_3V3_AUX` is not documented. | `HEAD_CONTROL.md:65-66`, `PIN_MAP.md:66-73`, `contactor.c` | Not in `motionReady`. Software never uses `contactor/set` as a stop. A10 measures the real effect on motor power. |
| `PackageSha256` is over the whole uploaded ZIP. The robot holds only extracted files and the backend gives it no map data. | `MapPackageValidator.cs:72`, `backend/docs/map-poi-versioning.md:102` | The hash cannot be recomputed from yaml + pgm (Decision 4). |
| `mode_manager`'s latch is in memory, and its release clears stored commands only. Its Nav2 cancel is one-shot, untargeted and skipped if the service is not ready. | `mode_manager_node.py:57,130-139,206-215` | Starts latched in fleet mode. A reset must prove no goal is alive. |
| Any graph participant can call a ROS service. | `HEAD_CONTROL.md:140-141` | "Only a human resets" is a procedure plus static tests, not an enforced property. |
| Wheel odometry counts generated STEP pulses, not encoders. | `robot_control/README.md:332-336` | Odometry does not show that a wheel moved. Standstill at GATE A is measured externally. |
| LiDAR scans at 26.7 cm, feet are invisible, camera depth is off, no `collision_monitor`, and the robot ran over a foot on 02/11. | `robot-baseline-2026-11-02.md:9-10,126-155` | Obstacle trials use a dummy. **Never a person.** |
| Wi-Fi outages of up to 15 s are recorded on long routes. | `robot-status-2026-10-22.md:21` | A latch will trip in routine roaming (Consequences). |

## Decision

Tags: **[SRS]**, **[ADR-n]** inherited; **[Design]** decided here.

### 1. Motion permit and gate [Design]

**Permit (publisher: `fleet_bridge`, only when `commands_enabled`).** Topic `motion_permit` (relative name),
`std_msgs/Bool`, RELIABLE, VOLATILE, depth 1, published every 0.2 s from an executor timer, not an HTTPS thread.
`transient_local` is forbidden because it would replay a stale `true`.

The value is `true` only when all hold:

1. The last **successful command poll** is younger than `T_link`. Success means HTTP 200 with a parsed body, stamped on
   a monotonic clock. This is narrower than "poll or sync": a poll 200 proves both directions and, by contract, that the
   server holds telemetry from this stream at most 2 s old, and Cancel can only arrive by poll. `409 STREAM_NOT_CURRENT`,
   401, 5xx and timeouts do not stamp, although 409 stays "healthy" for backoff.
2. No own goal is held over from a link loss. If the age passes `T_link` while `_active` is set, the permit stays false
   until Nav2 reports that goal terminal. Otherwise a goal whose controller was silent for the whole outage could resume.
3. From step 3.2: wheel odometry is fresh, no unowned goal is active, and the map check has not found a mismatch.
   Missing or stale map evidence only refuses new GoTo commands (Decision 4): a slow `map_server` reply must not latch a
   robot that is already moving.

On link loss with an own active goal, the bridge sends a **targeted** cancel on its own handle and never cancel-all. The
result is `FAILED` with reason `LOCAL_LINK_LOSS`, sent only after Nav2 reports terminal [ADR-0042]. Inhibition does not
depend on that cancel succeeding [`architecture.md` §6].

**Gate (`mode_manager_node`, parameter `require_motion_permit`, default `false`).** With `false`, behaviour is unchanged
byte for byte. With `true`, each 20 Hz tick, after the E-stop check:

- `permit_ok` means last value `true` and `0 <= age <= T_permit`, on receipt time.
- The node starts **LATCHED(BOOT)**, so a restart cannot produce a clean state.
- If `permit_ok` is false and a Twist (zero included) arrived on `cmd_vel_nav` within `nav_timeout`: **LATCHED(PERMIT_LOST)**,
  stored nav command cleared.
- E-stop engaged: **LATCHED(ESTOP)**.
- `permit_ok` false with Nav2 silent: **BLOCKED**, no latch. A link blip while parked at a POI needs no on-site reset.
- The nav branch forwards only in **OPEN**. Otherwise `cmd_vel` is zero, with a distinct log reason.
- The gate sits in the timer callback because a silent Nav2 stops callbacks while the stored Twist is still forwarded.

**Status topic.** `motion_gate_state`, `std_msgs/String` (`DISABLED`, `OPEN`, `BLOCKED`, `LATCHED:<reason>`), published
at 2 Hz, VOLATILE. `motionReady` requires `OPEN`, so `commands_enabled=true` with `require_motion_permit=false` is
fail-closed rather than fail-open.

**Reset.** `motion_inhibit_reset`, `std_srvs/Trigger`, on `mode_manager`. It refuses unless the E-stop is off,
`permit_ok` is true, and Nav2 action status has a live publisher and shows no active goal. It clears the latch only and
never resumes anything; motion needs a new leg from the backend. Reconnect never clears it [ADR-0008, §6]. No backend
path clears it, including release-inspection. `fleet_bridge` must contain no client for it (static test).

**Teleop.** `cmd_vel_manual` and `manual_override` keep today's behaviour under BLOCKED and LATCHED: a person holding the
controller is the authority, and the E-stop still blocks them. `motionReady` is false while the mode is not `explore`.

### 2. Coverage and time budget [SRS for the 3 s, Design for the split]

| Symbol | Target | Meaning |
|---|---|---|
| `T_link` | 1.5 s | Age of the last successful poll at which the permit goes false |
| `T_permit` | 0.6 s | Age at which `mode_manager` treats the permit as expired (3 publish periods) |
| Control chain | 0.1 s | `mode_manager` 20 Hz + `stm32_bridge` 20 Hz |
| `T_stop` | 0.5 s allowance | Mechanical stop. **Unmeasured**; the firmware stop has no ramp |
| **Total** | **2.7 s** | Must be ≤ 3 s. **Measure at GATE A** |

The sum is conservative: `T_link` and `T_permit` do not stack in a real path, because a bridge that detects loss publishes
`false` at once. `report_period_sec` must be `0.5` when `commands_enabled` (Decision 7).

While the poll age is under `T_link`, backoff must not delay the next poll beyond the poll period; today one failure
waits about 1 s and a slow round up to 10 s. This is a robustness change only.

### 3. `localized` and `motionReady` [Design]

Each is `true`, `false`, or `null` when a source has no data. The backend treats null as failure.

**`localized`** is `true` when all hold; `null` until `amcl_pose` has been received at least once:

- `amcl_pose` received (AMCL has an initial pose; `set_initial_pose` is deliberately false on the real robot).
- TF `map -> base_footprint` age ≤ 1.0 s. A separate limit from telemetry's `pose_stale_after_sec`. `amcl_pose` itself is
  not age-checked because AMCL only publishes after moving `update_min_d`/`update_min_a`.
- Covariance `xx`, `yy` ≤ 0.09 m² and yaw ≤ 0.05 rad². AMCL does not update while stationary, so these limits must be
  compatible with the covariance the initial-pose procedure sends, or the procedure must include a small supervised
  rotation. **Measure at GATE A.**

**`motionReady`** is `true` when all hold; `null` if any source has never reported or has gone stale:

| Condition | Source |
|---|---|
| Software E-stop off | `emergency_stop_state` |
| Mode allows Nav2 (`explore`) | `robot_mode_state` |
| Gate `OPEN` | `motion_gate_state`, age ≤ 1.5 s |
| STM32 link alive | `wheel/odom` age ≤ 0.5 s. No dedicated topic exists and `stm32_bridge` is not changed |
| Nav2 available | `navigate_to_pose` action server ready |
| Exactly one sender | Decision 5 |
| Map verified | Decision 4 |
| Hardware E-stop released (only from step 3.4) | `hardware_estop_state` |

Contactor PA10 is not in `motionReady`: `contactor/state` is only the commanded state and cannot show a pressed E-stop.
Software does not use `contactor/set` as a stop mechanism (Decision 10).

`faultCode` carries the first active of, in this order: `ESTOP_ENGAGED`, `FOREIGN_NAV_GOAL`, `UNOWNED_GOAL_AT_STARTUP`,
`MAP_CONTENT_MISMATCH`, `MAP_EVIDENCE_MISSING`, `MOTION_GATE_DISABLED`, `STM32_LINK_STALE`, `NAV2_UNAVAILABLE`,
`TF_STALE`, `MOTION_GATE_LATCHED`. Root causes come first: a latched gate is a consequence, and reporting it first would
hide the code that A7 and A8 must observe. Absence of a code is not readiness evidence [§3.5].

The bridge also refuses a GoTo locally with the same checks, because the backend can hand one out up to `AcceptBy` after
readiness went false. Step 3.3 adds the backend recheck.

### 4. Map content check [Design]

The robot cannot recompute `PackageSha256` from extracted files: the ZIP's metadata, compression and order are in the
hash. **Option A applies to GATE A and M2.4:**

1. Technical Staff place the exact uploaded ZIP on the robot and extract the map from it.
2. New bridge parameters: `map_package_path` and `map_package_sha256`. Technical Staff copy `map_key` and the hash from
   the **same MapVersion row** on the Technical web, and a second person checks both against that row.
3. When `commands_enabled`, the bridge hashes the ZIP and compares it with the parameter.
4. It reads `yaml_filename` from `map_server` by parameter service, so it checks what was **actually loaded**, not what
   config claims.
5. It compares that yaml and the image named by its `image:` field with the ZIP members, byte for byte. `map2.yaml`
   points to `map_fix.pgm`, so filenames cannot be assumed.

Any failure: `MAP_CONTENT_MISMATCH`, or `MAP_EVIDENCE_MISSING` when a file or parameter is absent, `motionReady=false`,
and GoTo refused with `MAP_MISMATCH`. The check reruns before accepting each GoTo from a cached result no older than 5 s.

Limit of option A: the expected hash is hand-copied, so software cannot catch a pairing mistake (key of version 2, hash
of version 1). The two-person check is the control. Option B is a follow-up (see the end of this ADR).

### 5. One goal sender [ADR-0042, Design]

When `commands_enabled`:

- The bridge sets its own `goal_uuid` in `send_goal_async`, so status arriving before the goal response is not misread.
- It subscribes to `<action>/_action/status` for the actions in the `BUSY_ACTIONS` list of `initialpose_guard.py`,
  because `navigate_to_pose` is not the only path to `cmd_vel`. It uses `count_publishers`, since a crashed server
  leaves its last status latched.
- `navigate_to_pose`, `navigate_through_poses`, `follow_waypoints` and `go_to_stop` can only come from an outside sender.
  `bt_navigator` itself sends `follow_path`, `spin`, `backup`, `drive_on_heading`, `wait` and `assisted_teleop` while it
  runs a goal, so those count only when no navigation goal has been active for 1 s.
- An active goal (status 1, 2 or 3) with a UUID that is not the bridge's: `FOREIGN_NAV_GOAL`, `motionReady=false`, permit
  false, so the gate latches.
- The bridge never cancels a goal it does not own.

At startup with an active goal: telemetry `status=UNKNOWN`, `UNOWNED_GOAL_AT_STARTUP`, permit false, no cancel. It clears
only once status shows no active goal. A person ends that goal.

`route_test.py` reads `commands_enabled` through `/<ns>/fleet_bridge/get_parameters` and refuses to run when it is true.
No reply also refuses, unless the operator passes an explicit `--no-command-bridge`. It also refuses if a goal is active.
This is check-then-act, so the bridge-side detection stays the real control. Its README claim that the bridge is
telemetry-only must be corrected.

### 6. Failure modes

| # | Failure | Mechanism | Test | Evidence needed |
|---|---|---|---|---|
| 1 | Silent network loss (no socket close) | Poll age > `T_link`, permit false, latch | Unit; Gazebo with stub blocked; GATE A | Event to `cmd_vel=0` and wheels still ≤ 3 s; no motion ≥ 30 s after recovery |
| 2 | Backend dead or restarting | As 1. 409/5xx do not stamp | Unit; Gazebo stub stopped; GATE A | As 1 |
| 3 | `fleet_bridge` crash | Permit expires after `T_permit`, latch | Gazebo kill; GATE A | ≤ 3 s; restarted bridge does not clear the latch |
| 4 | `fleet_bridge` hung | Executor hung: permit stops. HTTPS hung: age grows on the executor | Unit | Permit false in both |
| 5 | `mode_manager` crash | `cmd_vel` stops, `stm32_bridge` `cmd_timeout` 0.5 s sends STOP. Restart comes up LATCHED(BOOT) | Unit for boot; GATE A | Stop time; offline figure 510 ms needs confirmation |
| 6 | `stm32_bridge` crash | Firmware `CMD_TIMEOUT_MS` 300 ms. `wheel/odom` staleness drops the permit, so a restarted bridge cannot resume | Unit; GATE A | Stop time; no motion after restart |
| 7 | Orphan Nav2 goal when the bridge dies | Latch holds; reset refused while the goal is alive; restarted bridge reports UNKNOWN | Gazebo; GATE A | Reset refused; no cancel-all sent |
| 8 | Foreign goal (RViz, `route_test.py`) | Decision 5 | Unit; Gazebo CLI goal; GATE A | Fault in telemetry; latch; foreign goal not cancelled by the bridge |
| 9 | Wrong map, same `map_key` | Decision 4 | Unit; Gazebo altered file; GATE A | GoTo refused, fault reported |
| 10 | Not localized | Decision 3 | Unit; Gazebo no initial pose; GATE A | `localized` null or false, Start refused |
| 11 | Physical E-stop | Hardware only, through the existing PA10 chain. Reported working by the owner, **no measurement recorded yet**. Software cannot see it until step 3.4. Operating rule in Decision 10 until then | A10 | Motor power cut with server off; no motion on release |
| 12 | Person-sized obstacle | Nav2 costmap. Unchanged here. **Expected to fail** (Decision 9) | A11, dummy only | Stops ≥ 0.3 m at 0.2 m/s |
| 13 | Cancel delayed or lost | Gate holds independently of cancel | Unit; Gazebo with Nav2 stalled | `cmd_vel=0` while the goal stays active |
| 14 | `commands_enabled` with no gate | `DISABLED` makes `motionReady` false | Unit | GoTo refused |
| 15 | Direct `/cmd_vel` publisher | **Not covered.** Convention and existing static tests only | Static | Recorded residual risk |

### 7. Telemetry period

`report_period_sec` is `0.5` in the fleet command profile, and must stay below `MaxTelemetryAgeSeconds` (2 s). The
existing warning at `node.py:124-126` becomes a startup refusal when `commands_enabled`. The telemetry-only default of
2.0 s is unchanged.

### 8. Enabling and emergency shutdown

| Switch | Who | Requires | Scope |
|---|---|---|---|
| `IsDispatchEnabled` | TechnicalStaff through the step 3.3 endpoint | Signed GATE A-command record as `evidenceRef`, stating which steps it covers; active robot, credential, assigned map, latest deployment check PASS on that map, no `NeedsInspection` | Durable, per robot. With A1 to A9 only, it covers B1 and must be set false afterwards until the A10 evidence exists |
| `FleetCommands:Enabled` | Whoever runs the test environment, for one agreed session | Attendant present; environment variable plus restart | Test environment only |
| `commands_enabled` + `require_motion_permit` | Robot operator, for one attended session | Set together in one params profile, never one alone | Session |

Agents never set any of these on a real robot or a shared environment.

**Emergency order:**

1. Physical E-stop. Until A10 has passed, nothing runs on the floor. Do not release it until the Decision 10 operating
   rule is met.
2. `ros2 service call .../emergency_stop std_srvs/srv/SetBool "{data: true}"` from the robot.
3. Set `IsDispatchEnabled` false.
4. Revoke the robot credential if needed.

Steps 3 and 4 block new motion. They do not stop a moving robot.

### 9. GATE A checklist

The step `m2-3d` kit expands this with measurement boxes. Run on the commit under test, with an attendant present.
Record every run in a new `$HOME/amr_logs/runs/` directory.

GATE A is split in two. Each part has its own record:

| Part | Steps | Required before |
|---|---|---|
| **GATE A-command** | A1 to A9 | M2.4, including B1 (wheels raised, attendant present) |
| **GATE A-command** | A10 and the floor repeats A1F to A4F | B2 (running on the floor) |
| **GATE A-person** | A11 and A12 | M2.5, per SRS §7 "before outside-team viewing" |

**Preconditions for every run:** initial pose set; both flags set for the session only; Technical Staff copied `map_key`
and the hash from the same MapVersion row on the Technical web, and a second person checked both against that row.
A10, the floor repeats and GATE A-person also need the E-stop chain on PA10 connected.

**Part 1, wheels raised.** Start a GoTo, then apply each event. Capture timestamps of `cmd_vel`, `motion_permit`,
`motion_gate_state`, `emergency_stop_state` and telemetry.

| Step | Event | Measure | PASS |
|---|---|---|---|
| A1 | Silent network loss (cut uplink at the AP, not on the robot) | Event to `cmd_vel=0`; latch | ≤ 3 s, latched |
| A2 | Stop the backend | Same | ≤ 3 s, latched |
| A3 | Kill `fleet_bridge` | Same | ≤ 3 s, latched |
| A4 | Kill `mode_manager` | Event to wheels still | ≤ 3 s; LATCHED on restart |
| A5 | Restore the link after each | Watch 30 s | No motion, latch still set |
| A6 | Reset with a goal alive | Reset response | Refused |
| A7 | Foreign goal by CLI | Fault, latch | `FOREIGN_NAV_GOAL`, no cancel |
| A8 | Wrong map, same key | GoTo response | Refused, `MAP_CONTENT_MISMATCH` |
| A9 | No initial pose | Telemetry, Start | null or false, Start refused |
| A10 | Physical E-stop, server off | Supply voltage at the wheel drivers (HBS57H) on press and on release; wheels free or unable to turn | Drive supply measured off while pressed. Before step 3.4: released only under the Decision 10 rule, no motion. After step 3.4: also released with a goal alive, gate stays LATCHED(ESTOP), no motion |

**Part 2, low speed on the floor (0.2 m/s), attendant within reach, area cleared of people, after A10 passed.** A1F to
A4F repeat A1 to A4 with external standstill measurement (video with a timer, or a marked floor).

**Part 3, GATE A-person.**

| Step | Event | Measure | PASS |
|---|---|---|---|
| A11 | Person-sized **dummy** in the path | Stopping gap | ≥ 0.3 m, three of three runs |
| A12 | Attendant to E-stop | Time from a call to the press | ≤ 2 s |

**A11 is expected to FAIL today.** In the 02/11 baseline the robot stopped 0.15 m from a foot, resumed 0.3 s later and ran
over it. Passing needs separate person-detection and slow-down work, which is outside M2.3.

**Logs required:** the capture directory, the backend `RobotCommands` and `TourEvents` rows, tested commit, operator name
and every measured number. Any single FAIL fails that part.

### 10. Step 3.4: hardware E-stop input (firmware and `stm32_bridge`)

**Current hardware, kept as built.** A team member feeds the E-stop chain from PA10 through `J_3V3_AUX`. This ADR does not
change that circuit or the firmware that drives it (`CONTACTOR_ON_AT_BOOT = 1`, `contactor_on_at_startup` true). As the
code stands:

- Pressing the button is handled in hardware only. The firmware has no E-stop logic and keeps generating STEP pulses.
- On release, PA10 is still high, so power returns at once with no reset.
- After an STM32 reset or flash, PA10 goes high again at boot with no human confirmation.
- PA10 is an output, so it cannot sense the button. Step 3.4 needs a separate input.

Wheel odometry counts generated STEP pulses. If the E-stop cuts motor power while the firmware keeps generating pulses,
odometry goes wrong and the robot jerks on release. Software also cannot see the press today.

Step 3.4 adds:

1. An auxiliary contact of the E-stop wired to an STM32 input.
2. While pressed, the firmware stops generating STEP pulses and reports the state in the FB frame. `PROTOCOL_FB.md` stays
   the source of truth for that field.
3. `stm32_bridge` publishes `hardware_estop_state` (`std_msgs/Bool`).
4. `mode_manager` enters LATCHED(ESTOP) on receiving it. The Decision 1 reset refuses while it is pressed.
5. `fleet_bridge` adds it to `motionReady`, with `faultCode` `ESTOP_ENGAGED`.

**A person must confirm the wiring before any code is written.** Step 3.4 stops first to ask for the input pin. Pin
configuration follows `robot/AGENTS.md` §5 (`.ioc`, no hand edits to generated files), and flashing stays manual.
The result is reported as READY FOR HARDWARE TEST.

**Operating rule until step 3.4 is complete:** do not release the E-stop until End Early has been done and the action
status shows no remaining goal.

### 11. Simulation gates for steps 3.1 and 3.2

The implementation workstation has no ROS 2 or Gazebo. Steps 3.1 and 3.2 deliver the code, unit tests, and exact Gazebo
commands and scenarios, then stop. The team runs them on an Ubuntu VM and returns the logs as **GATE S3.1** and **GATE
S3.2**. Neither is PASS without logs.

## Consequences

- A link loss beyond about 1.5 s during a leg stops the robot and needs an on-site reset. With recorded Wi-Fi outages of
  up to 15 s, this will happen on long routes. The attendant is already required. If GATE A shows it is unworkable, the
  remedy is network coverage or a changed requirement, not a looser latch.
- A hard stop from the gate skips smoother deceleration, as the software E-stop already does.
- New ROS interfaces: `motion_permit`, `motion_gate_state`, `motion_inhibit_reset` and, from step 3.4,
  `hardware_estop_state`. They are `robot/`-internal, so they stay out of `bus_interfaces`, and are recorded in
  `docs/architecture.md` §6.
- M2.5 stays blocked until A11 passes, which needs person-detection and slow-down work not yet planned in M2.3.
- `fleet_bridge/test/test_worker.py:586-599` forbids `create_publisher` and restricts action imports. Step 3.1 changes
  this guard with a stated reason, allowing exactly `motion_permit` and still forbidding `cmd_vel` and `cancel_all`.
- `test_launch_defaults.py:47` keeps `commands_enabled` out of launch arguments, so the fleet profile is a params file.
- `nav2.py:76-82` and `commands.py:120` turn an unreadable result into `TERMINAL FAILED` while a goal may still run,
  contrary to §6. Step 3.1 fixes this (correctness bug).
- `IsDispatchEnabled` has no writer and `campus_tour_app` is denied UPDATE, asserted by `DeploymentDatabaseTests.cs:61`.
  Step 3.3 needs a grant change and a changed test, with reason stated.
- Physical stopping behaviour, Nav2 behaviour with output held at zero, and false-trip rate are unknown until GATE A.
- A person with shell access on the robot can still call the reset service or publish to `/cmd_vel`.

## Accepted by the owner on 08/11/2026

`T_link` 1.5 s, `T_permit` 0.6 s and the 2.7 s budget (to be measured at GATE A); permit from successful polls only;
LATCHED(BOOT); reset refused while a goal is alive; `motion_gate_state`; teleop stays live under a latch while the
E-stop still blocks it.

## Follow-up

**Map hash option B.** Give the robot the hash from a robot-authenticated source, such as `mapPackageSha256` on GoTo, so
software catches a mis-paired key and hash. This is a public contract change, revises ADR-0042's omission of
`mapChecksum`, and needs a backend PR. It is not part of GATE A or M2.4.

## Still open

1. **Measured E-stop evidence.** The owner reports that the E-stop works and keeps the circuit as the team member built
   it. SRS §7 needs physical evidence, so A10 records the wheel drive supply on press and release. If it is not cut, A10
   fails and the circuit needs the team member's fix.
2. **Step 3.4 wiring (the team member who built the circuit).** The auxiliary contact and the STM32 input pin.
