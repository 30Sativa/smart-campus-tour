# ADR-0049: M2.3 robot-local safety before a physical robot accepts fleet commands

- **Status:** Proposed 08/11/2026. Pending the repository owner's acceptance. **Not implemented**: no permit topic,
  motion gate, readiness source, map content check or dispatch writer exists yet. Every number below is a proposal to
  be measured at GATE A.
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
| The hardware E-stop does not work. `/emergency_stop_state` is software-only and no E-stop input reaches the STM32. | `robot-baseline-2026-11-02.md:85`, `mode_manager_node.py`, `PIN_MAP.md`, `PROTOCOL_FB.md` | **GATE A cannot pass today** (Open question 2). |
| No document states what PA10 (contactor) powers. `contactor/state` is the commanded state, not the real contact. It turns ON at every STM32 boot. | `HEAD_CONTROL.md:65-66`, `PIN_MAP.md:66-73`, `WIRING_MOTOR_245.md` | Not used in `motionReady` (Open question 3). |
| `PackageSha256` is over the whole uploaded ZIP. The robot holds only extracted files and the backend gives it no map data. | `MapPackageValidator.cs:72`, `backend/docs/map-poi-versioning.md:102` | The hash cannot be recomputed from yaml + pgm (Decision 4, Open question 1). |
| `mode_manager`'s latch is in memory, and its release clears stored commands only. Its Nav2 cancel is one-shot, untargeted and skipped if the service is not ready. | `mode_manager_node.py:57,130-139,206-215` | Starts latched in fleet mode. A reset must prove no goal is alive. |
| Any graph participant can call a ROS service. | `HEAD_CONTROL.md:140-141` | "Only a human resets" is a procedure plus static tests, not an enforced property. |
| Wheel odometry counts generated STEP pulses, not encoders. | `robot_control/README.md:332-336` | Odometry does not show that a wheel moved. Standstill at GATE A is measured externally. |
| LiDAR scans at 26.7 cm, feet are invisible, camera depth is off, no `collision_monitor`, and the robot ran over a foot on 02/11. | `robot-baseline-2026-11-02.md:9-10,126-155` | Obstacle trials use a dummy. **Never a person.** |
| Wi-Fi outages of up to 15 s are recorded on long routes. | `robot-status-2026-10-22.md:21` | A latch will trip in routine roaming (Consequences). |

## Decision

Tags: **[SRS]**, **[ADR-n]** inherited; **[Design]** proposed here.

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
3. From step 3.2: wheel odometry is fresh, no unowned goal is active, and the map check passed.

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

| Symbol | Proposed | Meaning |
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

The contactor is excluded until Open question 3 is answered. Even then, `contactor/state` is only the commanded state.

`faultCode` carries the first active of, in this order: `MOTION_GATE_LATCHED`, `MOTION_GATE_DISABLED`, `ESTOP_ENGAGED`,
`FOREIGN_NAV_GOAL`, `UNOWNED_GOAL_AT_STARTUP`, `MAP_CONTENT_MISMATCH`, `MAP_EVIDENCE_MISSING`, `STM32_LINK_STALE`,
`NAV2_UNAVAILABLE`, `TF_STALE`. Absence of a code is not readiness evidence [§3.5].

The bridge also refuses a GoTo locally with the same checks, because the backend can hand one out up to `AcceptBy` after
readiness went false. Step 3.3 adds the backend recheck.

### 4. Map content check [Design; Open question 1]

The robot cannot recompute `PackageSha256` from extracted files: the ZIP's metadata, compression and order are in the
hash. **Proposed option A:**

1. Technical Staff place the exact uploaded ZIP on the robot and extract the map from it.
2. New bridge parameters: `map_package_path` and `map_package_sha256`. The hash is copied from the Technical web next to
   `FLEET_ROBOT_MAP_KEY`.
3. When `commands_enabled`, the bridge hashes the ZIP and compares it with the parameter.
4. It reads `yaml_filename` from `map_server` by parameter service, so it checks what was **actually loaded**, not what
   config claims.
5. It compares that yaml and the image named by its `image:` field with the ZIP members, byte for byte. `map2.yaml`
   points to `map_fix.pgm`, so filenames cannot be assumed.

Any failure: `MAP_CONTENT_MISMATCH`, or `MAP_EVIDENCE_MISSING` when a file or parameter is absent, `motionReady=false`,
and GoTo refused with `MAP_MISMATCH`. The check reruns before accepting each GoTo from a cached result no older than 5 s.

Limit of option A: the expected hash is hand-copied, so a pairing mistake (key of version 2, hash of version 1) is not
caught. **Option B** closes that gap with a robot-authenticated source of the hash, such as `mapPackageSha256` on GoTo.
That is a public contract change, revises ADR-0042's omission of `mapChecksum`, and needs a backend PR.

### 5. One goal sender [ADR-0042, Design]

When `commands_enabled`:

- The bridge sets its own `goal_uuid` in `send_goal_async`, so status arriving before the goal response is not misread.
- It subscribes to `<action>/_action/status` for the existing `BUSY_ACTIONS` list in `initialpose_guard.py`, because
  `navigate_to_pose` is not the only path to `cmd_vel`. It uses `count_publishers`, since a crashed server leaves its
  last status latched.
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
| 11 | Physical E-stop | Hardware only. **Not installed.** Software cannot see it | GATE A | Motor power cut with server off; attendant ≤ 2 s; no motion on release |
| 12 | Person-sized obstacle | Nav2 costmap. Unchanged here | GATE A, dummy only | Stops ≥ 0.3 m at 0.2 m/s |
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
| `IsDispatchEnabled` | TechnicalStaff through the step 3.3 endpoint | Signed GATE A evidence as `evidenceRef`; active robot, credential, assigned map, latest deployment check PASS on that map, no `NeedsInspection` | Durable, per robot |
| `FleetCommands:Enabled` | Whoever runs the test environment, for one agreed session | Attendant present; environment variable plus restart | Test environment only |
| `commands_enabled` + `require_motion_permit` | Robot operator, for one attended session | Set together in one params profile, never one alone | Session |

Agents never set any of these on a real robot or a shared environment.

**Emergency order:**

1. Physical E-stop. Until it exists, the session may not run under load.
2. `ros2 service call .../emergency_stop std_srvs/srv/SetBool "{data: true}"` from the robot.
3. Set `IsDispatchEnabled` false.
4. Revoke the robot credential if needed.

Steps 3 and 4 block new motion. They do not stop a moving robot.

### 9. GATE A checklist

The step `m2-3d` kit expands this with measurement boxes. Run on the commit under test, with an attendant at the E-stop.
Record every run in a new `$HOME/amr_logs/runs/` directory.

**Preconditions:** Open questions 2 and 3 closed; hardware E-stop installed; initial pose set; both flags set for the
session only.

**Phase 1, wheels raised.** Start a GoTo, then apply each event. Capture timestamps of `cmd_vel`, `motion_permit`,
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
| A10 | Physical E-stop, server off | Motor power, release behaviour | Power cut, no motion on release |

**Phase 2, low speed on the floor (0.2 m/s), attendant within reach, area cleared of people.** Repeat A1 to A4 with
external standstill measurement (video with a timer, or a marked floor).

| Step | Event | Measure | PASS |
|---|---|---|---|
| A11 | Person-sized **dummy** in the path | Stopping gap | ≥ 0.3 m, three of three runs |
| A12 | Attendant to E-stop | Time from a call to the press | ≤ 2 s |

**Logs required:** the capture directory, the backend `RobotCommands` and `TourEvents` rows, tested commit, operator name
and every measured number. Any single FAIL fails the gate.

## Consequences

- A link loss beyond about 1.5 s during a leg stops the robot and needs an on-site reset. With recorded Wi-Fi outages of
  up to 15 s, this will happen on long routes. The attendant is already required. If GATE A shows it is unworkable, the
  remedy is network coverage or a changed requirement, not a looser latch.
- A hard stop from the gate skips smoother deceleration, as the software E-stop already does.
- New ROS interfaces: `motion_permit`, `motion_gate_state`, `motion_inhibit_reset`. They are `robot/`-internal, so they
  stay out of `bus_interfaces`, but must be recorded in `docs/architecture.md`.
- `fleet_bridge/test/test_worker.py:586-599` forbids `create_publisher` and restricts action imports. Step 3.1 changes
  this guard with a stated reason, allowing exactly `motion_permit` and still forbidding `cmd_vel` and `cancel_all`.
- `test_launch_defaults.py:47` keeps `commands_enabled` out of launch arguments, so the fleet profile is a params file.
- `nav2.py:76-82` and `commands.py:120` turn an unreadable result into `TERMINAL FAILED` while a goal may still run,
  contrary to §6. Step 3.1 fixes this (correctness bug).
- `IsDispatchEnabled` has no writer and `campus_tour_app` is denied UPDATE, asserted by `DeploymentDatabaseTests.cs:61`.
  Step 3.3 needs a grant change and a changed test, with reason stated.
- Physical stopping behaviour, Nav2 behaviour with output held at zero, and false-trip rate are unknown until GATE A.
- A person with shell access on the robot can still call the reset service or publish to `/cmd_vel`.

## Open questions (owner decision required)

1. **Map hash source.** Option A (ZIP kept on the robot, hash copied by hand, no API change) or option B (backend gives
   the robot the hash, contract change). Proposal: A for GATE A and M2.4, B if the pairing risk proves real.
2. **Hardware E-stop.** The 02/11 baseline says it does not work. Has that changed, what does the current switch cut, and
   who installs a real one? Its release behaviour also matters: with no input to the STM32, software cannot see a press,
   so motors can move again on release if a goal is alive. Wiring an auxiliary contact to the STM32 would be a separate
   firmware task.
3. **Contactor load.** What does PA10 actually switch? It needs the wiring or someone who built it. Until then it is
   excluded from `motionReady` and is not a stop mechanism.
4. **`docs/architecture.md`.** Root `AGENTS.md` requires new interfaces to be recorded there, while the task forbids a
   second top-level folder per PR. Proposal: add the record to this docs PR once the ADR is accepted, so 3.1 stays inside
   `robot/`.
5. **Values and deviations to accept:** `T_link`, `T_permit`, the localization limits, permit from poll only, LATCHED(BOOT)
   requiring a human arm in every session, and teleop staying live under a latch.
