# System Architecture

How the pieces of CampusTour DT-AMR fit together. This file covers what
crosses a folder boundary. Anything internal to one folder is documented
inside that folder.

- Robot internals: [`robot/README.md`](../robot/README.md)
- Digital Twin research tooling: [`digital-twin/README.md`](../digital-twin/README.md)
- Backend internals: [`backend/AGENTS.md`](../backend/AGENTS.md)
- AI tour-guide internals: [`ai-assistant/README.md`](../ai-assistant/README.md)
- Frontend internals: [`web/AGENTS.md`](../web/AGENTS.md)

The current backend persistence model is defined by
`backend/database/smart-campus-tour-schema-v1.0.sql` and
[ADR-0006](decisions/0006-demo-first-tour-schema.md). This document also
records decided **planned** boundaries; a diagram or flow below does not imply
that its API, dispatch, bridge, or realtime implementation already exists.

---

## 1. Components and ownership

```text
   Student browser                 Campus staff browser
      |                                 |
      v                                 v
   +----------------------+   +--------------------------+
   | web/ student + staff |   | web/ Staff Operations   |
   | browser experiences |   | and operational Twin    |
   +----------+-----------+   +------------+-------------+
              ^                            ^
              | livestream media path      | backend projections
              +------------------+---------+
                                 |
                                 v
                     +-------------------------+
                     | backend / tour services |
                     +-----------+-------------+
                                 ^
                                 | fleet/navigation state
                                 |
                     +-----------+-------------+   +----------------------+
                     | Physical AMR             |   | Fleet Emulator      |
                     | ROS 2 + fleet_bridge    |   | digital-twin/ (WP4) |
                     +-------------------------+   +----------------------+

Student browser -> Backend / cloud AI -> private STT / LLM / TTS Q&A
Approved, pre-generated narration assets -> browser playback
```

This is a conceptual boundary only; livestream and browser/cloud AI transport
details remain for their integration work. Students join remotely in the
browser. A School Representative registers the group and uploads its roster;
student self-booking is not part of the current product baseline.

The backend schema currently models `Route`, `RouteStop`, `Poi`, `Tour`,
`GroupRegistration`, `RosterRow`, `Robot`, and `TourEvent`, alongside user,
token, and audit data. Backend ownership of POI targets, tour progression,
and robot assignment is a decided boundary; the dispatch use cases are not
implemented yet. A robot is intended to execute one navigation leg at a time
without owning the tour workflow. The web app owns the 3D Operational Digital
Twin UI, while `digital-twin/` owns the Fleet Emulator scaffold and future
load experiments, not the 3D frontend. Production fleet transport is selected
by [ADR-0008](decisions/0008-production-fleet-transport.md), with a Python
compatibility acceptance gate that has not passed yet.

---

## 2. Robot subsystem

Sensor hierarchy is settled by
[ADR-0001](decisions/0001-lidar-primary-astra-supplementary.md):

```text
RPLiDAR A3M1        -> /scan                 -> local + global costmap, AMCL, SLAM
STM32 STEP counts   -> /wheel/odom -\
BNO085 orientation  -> /imu/data   -> EKF -> /odom + odom -> base_footprint TF
Astra Pro (depth)   -> /camera/depth/points  -> LOCAL costmap ONLY
4x SR04T sonar      -> /ultrasonic/sonarN/range -> LOCAL costmap ONLY
Astra Pro (RGB)     -> person detection      -> Nav2 speed limit
                       (`robot_perception`, not the AI tour guide)
```

Wheel odometry is derived from the STEP pulses the STM32 generated, not from
encoder feedback: the HBS57H closes its encoder loop internally and ROS never
reads encoder position. The EKF fuses `vx`, the nonholonomic `vy = 0`
constraint and wheel-derived `vyaw` from `wheel/odom`, plus BNO085 **orientation
yaw** from `imu/data`. Firmware publishes no raw gyro rate, so nothing in this
stack fuses gyro yaw-rate.

### 2.0 Navigation baseline

Planner `nav2_smac_planner/SmacPlanner2D`, controller
`RegulatedPurePursuitController` at 0.20 m/s, autonomous reverse disabled in
both the controller and the behaviour tree -
[ADR-0007](decisions/0007-smac2d-rpp-no-autonomous-reverse.md).

RPP does path tracking plus collision checking against the local costmap. It is
not a local trajectory planner and does not search for detours. So: an obstacle
the LiDAR sees reaches the global costmap and the planner can route around it;
an obstacle only the depth camera or sonar sees reaches the local costmap only,
and the baseline requirement is that the robot **detects it and stops safely** -
an automatic detour is not guaranteed and is not claimed.

The four SR04T sonars are mounted diagonally at the chassis corners with poses
that are schematic rather than measured. They are not 360-degree coverage, they
do not constitute rear safety coverage, and `RangeSensorLayer.no_readings_timeout`
is a single shared timer rather than a per-sensor health watchdog.

`mode_manager` provides manual override, E-stop and command timeouts. It is
**not** an independent collision monitor; `nav2_collision_monitor` is a later
phase. Early runs are supervised, in a controlled area, at low speed.

The STM32G431 owns real-time stepping. ROS 2 sends wheel-speed commands over
USB CDC serial and does not reach below that line.

The current `go_to_stop` ROS 2 action (`bus_manager` / `bus_interfaces`)
resolves a named stop through `bus_stops.yaml`. That is retained for local ROS
development and manual test fixtures. It is not the production source of truth
for POI coordinates or a production transport fallback. The selected production
mapping is directly to Nav2 `NavigateToPose`, as described in Section 3.5 and
[ADR-0008](decisions/0008-production-fleet-transport.md); it is not implemented
by this documentation change.

### 2.1 Robot identity and ROS namespace

The canonical robot ID format is `robot_NN`, starting with `robot_01`. The
same value is used by backend/twin identity, `BusStatus.bus_id`, and the ROS
namespace. Do not introduce parallel names such as `bus1`, `amr1`, or
`robot1` for the same vehicle.

Robot-owned ROS topics, actions, and services use relative names. With no
namespace they retain the original single-robot names such as `/cmd_vel`; with
`robot_id:=robot_01` the same interface resolves below `/robot_01`:

| Relative interface | Namespaced example |
|---|---|
| `cmd_vel`, `cmd_vel_manual`, `cmd_vel_nav` | `/robot_01/cmd_vel`, `/robot_01/cmd_vel_manual`, `/robot_01/cmd_vel_nav` |
| `wheel/odom`, `imu/data`, `odom`, `scan` | `/robot_01/wheel/odom`, `/robot_01/imu/data`, `/robot_01/odom`, `/robot_01/scan` |
| `robot_mode`, `robot_mode_state` | `/robot_01/robot_mode`, `/robot_01/robot_mode_state` |
| `emergency_stop`, `emergency_stop_state` | `/robot_01/emergency_stop`, `/robot_01/emergency_stop_state` |
| `go_to_stop`, `bus_status` | `/robot_01/go_to_stop`, `/robot_01/bus_status` |

The global campus frame remains `map`. Per-robot frames must use the canonical
ID as a prefix when multi-robot TF is implemented:

```text
map -> robot_01/odom -> robot_01/base_footprint -> robot_01/base_link
map -> robot_02/odom -> robot_02/base_footprint -> robot_02/base_link
```

The current milestone supports one namespaced real robot or one namespaced
Gazebo robot. Multi-entity Gazebo and prefixed TF frames are not a core fleet
validation requirement. Until both are implemented and hardware-tested, do
not run multiple robot stacks in one ROS domain: topic isolation alone is not
enough to prevent TF and Gazebo controller collisions.

This is deliberate and explicit in the launch files. Nav2's own
`navigation_launch.py` remaps `/tf -> tf` on every node, which under a pushed
namespace would give Nav2 a private `/robot_01/tf` while AMCL, the EKF and
`robot_state_publisher` keep broadcasting on the global `/tf`. The Nav2 group
therefore inserts identity remaps `/tf -> /tf` and `/tf_static -> /tf_static`
to shadow nav2's and keep one global TF tree. **ROS namespace-ready topics are
not multi-robot TF isolation.** Frame prefixing is a separate, cross-stack
change and is not implemented.

Two further namespace notes, both load-bearing:

- Nav2 nodes are placed in the robot namespace by `PushRosNamespace(robot_id)`
  in each launch file. `nav2_bringup/navigation_launch.py` on Humble uses its
  own `namespace` argument only for `RewrittenYaml(root_key=...)`, so without
  that push the servers start at the ROS root and match none of the rewritten
  parameters.
- Costmap sensor topics cannot be plain relative names: costmap plugins
  subscribe on the costmap node, whose namespace is `<robot_ns>/local_costmap`.
  They are written as `$(var robot_ns)/scan` in `nav2_params.yaml` and
  substituted at launch time.

---

## 3. Backend-owned tour orchestration and fleet contract

**Decided contract, implementation and compatibility checkpoint pending:** the
backend does not speak ROS. [ADR-0005](decisions/0005-backend-authoritative-poi-per-leg-orchestration.md)
defines ownership; [ADR-0008](decisions/0008-production-fleet-transport.md)
selects **SignalR JSON Hub Protocol over TLS** for the physical `fleet_bridge`
and Fleet Emulator. Production use depends on a successful Python client
compatibility checkpoint against ASP.NET Core/.NET 10. That compatibility has
not been demonstrated.

```text
Physical fleet_bridge -- outbound --\
                                    <-> /hubs/fleet <-> Backend Application
Fleet Emulator ------- outbound --/                         |
                                                  operations projection
                                                           |
                                                   /hubs/operations
                                                           |
                                                   Staff Web / 3D Twin

Separate development path (already exists):
Gazebo -> gazebo_preview_bridge -> /api/simulation/pose
                               -> /hubs/simulation -> preview browser
```

| Boundary | Clients and purpose |
|---|---|
| `/hubs/fleet` | Physical bridge and Fleet Emulator; bidirectional machine command/state contract. |
| `/hubs/operations` | Backend-to-browser projections for Staff Web / Operational Digital Twin. |
| `/hubs/simulation` | Existing development-only SimulationPreview; unchanged. |

Do not merge these Hubs. Browsers do not connect to the fleet Hub; robots do not
connect to operations. Different URLs are not authorization: Section 3.7 defines
the required identity separation. The production Hubs are not implemented yet.

Application owns a future gateway boundary such as `IFleetGateway`. Hubs and
the thin SignalR adapter using `IHubContext` belong in Api, without an
Infrastructure-to-Api reference. Application stays independent of SignalR and
ROS types. The bridge translates fleet commands/state only; it owns no booking,
scheduling, assignment, or tour state machine. Execution tracking and result
retention belong to the adapter, not to tour orchestration.

The conceptual MVP contract is below. Method names and semantics are selected;
these are not implemented DTOs or new database entities. Exact binding,
validation limits, and acknowledgement encoding remain implementation work.
`?` denotes an optional/nullable value. Commands travel backend-to-robot;
reports travel robot-to-backend.

```text
GoTo { legId, mapKey, frameId, x, y, yaw, stopId? }
Cancel { legId }

ReportState {
  robotId, streamId, seq, reportedAt,
  mapKey, frameId,
  pose?: { x, y, yaw, capturedAt },
  status, legId?, localized?, faultCode?, batteryPercent?
}

ReportCommandResult {
  legId, commandKind, phase, outcome?, reason?
}
```

`GoTo` carries the resolved target, never a route to execute locally. `stopId`
is optional metadata, not a robot-local lookup key; no SQL `stop_id` column or
mapping to `Poi`/`RouteStop` is introduced. End/return legs need not have a stop.

The navigation MVP has no manual drive, raw `/cmd_vel`, cloud E-stop, or Head
command. Head support remains separate despite the existing frontend/schema
references; this MVP does not complete the full remote-tour feature set.

### 3.1 POI target invariant

Production target poses belong to backend-managed `Route` and `Poi` data.
`Route` stores its map key/frame and start pose, plus an end mode and optional
end pose. `Poi` stores its map key/frame, `X`, `Y`, `Yaw`, and narration data.
`RouteStop` links one `Route` to one `Poi` with `StopOrder`, `DwellSeconds`,
and `HeadStepsJson`. Coordinates must be interpreted in their stored
map/frame context; robot-local `bus_stops.yaml` is not the production source.

A navigation leg (called `TourLeg` in ADR-0005) is a **conceptual runtime
operation**, not a table or scaffolded entity. A future use case can derive
its target from the tour's route/stop and POI, or the route's end pose.
`Tour.CurrentLegId` and `TourEvent.LegId` identify execution attempts without
a leg foreign key. `TourEvent` can retain a target pose and map/frame snapshot
for history. This invariant does not introduce a MapVersion subsystem.

### 3.2 Current persistence model and planned tour flow

The current SQL relationships are:

```text
Route --< RouteStop >-- Poi          Tour --> Route
Tour --< GroupRegistration --< RosterRow
Tour --< TourEvent                   User --< UserRole
User --< RefreshToken               User --< AuditLog
Tour -- AssignedRobotId --> Robot    Robot -- CurrentTourId --> Tour
```

`GroupRegistration.TourId` references a **Tour**, not a Route.
`RosterRow.RegistrationId` references its `GroupRegistration`; roster rows
represent students without individual user accounts. A registration also
references a representative `User` and optionally a reviewing `User`.
`Tour.CreatedByUserId`, `TourEvent.ActorUserId`, and `AuditLog.ActorUserId`
link their records to users. The diagram omits other optional event links to
`Robot` and `Poi` for readability.

`Tour.State` stores the `SCHEDULED`, `READY`, `RUNNING`, `COMPLETED`, or
`CANCELLED` business state; `GroupRegistration.State` stores `SUBMITTED`,
`APPROVED`, `REJECTED`, or `CANCELLED` review state. These are string columns
whose allowed values are described by schema comments, not database `CHECK`
constraints or implemented state machines. `Tour` also stores
`OperationalStatus`, `CurrentStep`, leg/stop identifiers, hold/dwell
information, and a SQL `RowVersion` concurrency token.
The current schema has no visitor capacity or participant-count column and no
individual `Booking` table. It does not establish a capacity policy.

`Tour.AssignedRobotId` records the assigned robot, while
`Robot.CurrentTourId` records the tour currently holding that robot. Both are
nullable foreign keys, and `Tour.AssignedRobotId` may remain after a tour
ends. The database checks that referenced rows exist; it does not enforce
agreement between these two fields or uniqueness of active assignments.
`Robot.NeedsInspection` and `IsDispatchEnabled` are persisted dispatch inputs.
Live pose, connection, battery, and external execution state are transient
fleet telemetry, separate from persisted tour business state and `TourEvent`.

**Planned, not implemented:** an Application dispatch use case selects an
eligible robot for a ready `Tour`, sends one conceptual navigation leg through
the fleet gateway, handles arrival and the configured POI dwell/interaction,
then decides whether to send another leg or complete the tour. The selected
operational rules below are not backend implementations. Requirements such as
one active assignment per robot and ignoring stale or duplicate results need
explicit application/persistence
enforcement; the v1.0 schema does not provide those guarantees by itself.

FleetHub transport is not tour orchestration. The later Application work owns:

```text
Tour/dispatch -> derive current leg -> persist execution intent/current leg
             -> external send -> reconcile result -> TourEvent / dwell
             -> decide next leg
```

The current `UnitOfWorkBehavior` commits after a handler returns. Sending an
external `GoTo` and assuming the subsequent commit is atomic with robot
execution is incorrect. Persist intent before sending, then reconcile ambiguous
results in the later orchestration design; no distributed transaction or
pipeline implementation change is introduced here.

Physical and emulated robots share external schema, command/reconnect semantics,
and identity model, without referencing backend implementation projects. Each
emulated robot has its own identity/connection. Keep `Robot.SourceType` and
eligibility checks so synthetic robots cannot be dispatched into real tours;
shared transport does not erase source or validation boundaries.

#### Remote Tour operational rules (planned Application behavior)

These rules make explicit the existing remote-tour intent in
`backend/database/smart-campus-tour-schema-v1.0.sql`,
`web/docs/staff-operations.md`, `web/src/api/contracts/staff.ts`, and
`web/src/features/staff/reason.ts`. The web mock illustrates the flow; it is not
an implemented persistence/concurrency guarantee. Backend evaluates allowed
actions and records operator actions, leg intent/results, visit closure, and
recovery as meaningful events.

Head/pan preset support is a V1 requirement. The specific sequencing
`Next -> confirmed FRONT -> next leg` (and FRONT before the first leg) is a
**current Remote Tour orchestration decision**, reflected in the schema/web
contract and mock. No independently verified business source establishes this
specific sequence as a Capstone requirement; do not attribute it to scope.
The decision remains the implementation baseline unless explicitly revised.

| Operation | Application behavior | Robot interaction |
|---|---|---|
| Start | Only from READY after device/business checks and on-site confirmations. Atomically claim an eligible physical robot and transition the tour, so concurrent Starts cannot share it. No automatic mid-tour reassignment. | Confirm head FRONT before the first GoTo; one current leg. |
| Hold | Only during observation at a POI; set `IsHeld` to prevent automatic departure when dwell ends. Reject it during a navigation leg. | No navigation command; this is not pause/resume of motion. |
| Next | Close the current visit exactly once, resolving races with dwell completion/Hold through persisted concurrency checks and `StopVisitClosedAt`. | Wait for confirmed FRONT, then send a new leg to the next POI/end point. |
| End Early | Record reason and tour CANCELLED; stop further progression. Set `Robot.NeedsInspection` and retain `Robot.CurrentTourId` until terminal execution is reconciled and on-site release is confirmed. | Cancel an active leg; send completion or `IDLE` alone does not release the robot. Not an E-stop. |
| Retry leg | Require authorized recovery, live/readiness checks, and confirmed end of the old leg; unknown execution blocks retry. | Use a new `legId`; never blindly resume a previous goal. |
| Re-run POI / Retry FRONT | A new visit or head-command attempt; preserve history and gate subsequent progression on its result. | Head contract/controller work is required; not a new navigation command. |
| Backend restart | Reconcile active tours as needing assistance (`BackendRestarted`); do not restore a dwell timer or automatically continue navigation. | Reconcile actual execution before any recovery action. |

Do not copy the mock's early clearing of its transient robot `tourId` into SQL:
the schema explicitly retains `Robot.CurrentTourId` through End Early until
release confirmation. `NeedsInspection` additionally prevents redispatch.
`Tour.AssignedRobotId` may remain as history after release.

Persisted intent is necessary but insufficient for safe retries: a bridge
restart may lose in-memory idempotency state. Reconcile before replay. Late
results for an old leg may be recorded, but must not advance a new leg or
restart a canceled tour. End Early racing with a send requires coordinated
send/cancel reconciliation, not only a check before the send. Publish business
notifications after the corresponding state/event commit. Define tour revision
semantics across backend restart before wiring the frontend revision guard.

Rotating head/pan presets remain a V1 requirement outside the navigation wire
MVP. FRONT gating is the current orchestration decision described above, not a
separately established Capstone requirement. A separate patch must define presets,
command/result correlation, timeout/fault/retry behavior, and the actuator's
ROS interface. Do not invent a completed FRONT report or make a navigation leg
proceed merely because a head command was sent. This document does not yet
select a `SetHead` method or add head fields to the current navigation DTO.

The older `TourRoute` / `TourSlot` / `Booking` / `TourInstance` flow is
historical and is not the current persisted model. No `Mission` entity exists.
See [ADR-0006](decisions/0006-demo-first-tour-schema.md) for the schema change
and `backend/AGENTS.md` for the command/query implementation flow.

The SQL file is the Database First source: it was scaffolded into Domain
entities and Infrastructure `ApplicationDbContext`. There is no normal EF
migration flow. See `backend/AGENTS.md` for the re-scaffold procedure.

### 3.3 State storage and realtime delivery

When the backend receives robot pose/state, it is transient latest-state data
and belongs in memory or a suitable cache at the architecture level. This
does not select or add Redis. SQL Server stores meaningful business events
and state transitions; it
must not receive every pose update. A controlled benchmark may write telemetry
to a dedicated experiment log/file.


Backend-to-browser realtime uses the selected `/hubs/operations` boundary.
`FleetUpdated`, `TourUpdated(tourId, revision)`, and `AssistanceRequired` are
the operations event vocabulary; payloads are backend projections, not raw
fleet reports. `web/src/api/contracts/staff-realtime.ts` records the unwired
frontend proposal. Exact payload mapping and reconnect/refetch behavior still
need implementation agreement, including revision handling across backend
restart. This decision does not approve or implement the proposed staff/admin
HTTP APIs in `web/src/api/contracts/staff.ts` and
`web/src/api/contracts/admin.ts`, nor their error/version contracts.

No robot-to-backend or backend-to-browser frequency is fixed in this decision.
Production integration must declare configurable operational rates and
freshness thresholds, independently of ROS internal rates. Send execution/fault
changes promptly; bound buffers and
keep network I/O off ROS callbacks. Latest-state pose delivery must not discard
terminal results, which require separate retention/retry. The SimulationPreview
10 Hz limit remains local to preview. Research implementation and benchmark
execution are deferred under Section 5. Research requirements impose no
constraints or acceptance gates on this production milestone; the Capstone
scope remains unchanged.

The backend already has a development SimulationHub. Production fleet and
operations Hubs, authentication, and dispatch remain unimplemented. A single
backend process with per-robot latest state is the initial implementation
baseline; multiple instances would require shared-state and connection-routing
design, not just separate Hub names.

### 3.4 State and command-result semantics

| Field | Requirement and meaning |
|---|---|
| `robotId` | Required canonical code such as `robot_01`; maps to `Robot.RobotCode`, not the SQL GUID `Robot.Id`. Must match authenticated identity. |
| `streamId` | Required process-start identifier; retained across network reconnect, changed on process restart. |
| `seq` | Required positive sequence increasing within a stream; ordering key is `(robotId, streamId, seq)`. |
| `reportedAt` | Required UTC wall-clock report creation time. Backend adds its own receipt time for liveness. |
| `mapKey`, `frameId` | Required loaded-map context; `frameId` is currently `map`. Targets must match that context, not just the same frame name. |
| `pose` | Optional/nullable when unavailable; if present, requires finite `x`, `y` in metres, `yaw` in radians, and `capturedAt`. |
| `pose.capturedAt` | UTC wall-clock time of the represented pose sample, distinct from report creation time. Never refresh it just because a heartbeat is new. |
| `status` | Required execution status: `IDLE`, `NAVIGATING`, `ARRIVED`, `FAILED`, or `UNKNOWN`. |
| `legId` | Required for active-leg state and leg-specific results; otherwise nullable. Correlates an execution attempt, not a whole tour. |
| `localized` | Optional/nullable localization assessment; missing/null means unknown, not ready. TF existence alone cannot establish `true`. |
| `faultCode` | Optional stable fault identifier when available; do not fabricate a fault merely from connection loss. |
| `batteryPercent` | Optional/nullable measured percentage; the physical robot is not assumed to provide it and it is not a mandatory dispatch rule. |

Numeric JSON `seq` must stay within `1..9007199254740991` for exact representation
in the browser; a backend int64 type alone does not guarantee this.

Use `reportedAt` and `pose.capturedAt` to distinguish a living bridge from a stale
pose. ROS time and wall-clock conversion/freshness thresholds must be documented
when implementing the bridge. Sequence ordering does not depend on synchronized
wall clocks. Server-side source metadata comes from `Robot.SourceType`; no
per-sample source/version field is required by this MVP.

Execution status is separate from both `Tour.State` and connection/freshness.
`UNKNOWN` means the bridge/robot cannot determine execution, for example after
losing goal information. Backend loss of contact marks its connection view
stale/disconnected; it does not turn a known robot execution report into a new
robot-reported `UNKNOWN` or prove that navigation stopped.

For `ReportCommandResult`, `commandKind` is `GoTo` or `Cancel`, and `phase` is
`ACCEPTED`, `REJECTED`, or `TERMINAL`. `outcome` is required only for `TERMINAL`
and is `ARRIVED`, `CANCELLED`, or `FAILED`; `reason` is optional explanatory
context. Robot identity is supplied by the authenticated current connection.
Correlate by robot, leg, and command kind, distinguishing acceptance from the
later terminal phase. Deduplicate repeated terminal reports while reconciling
one actual terminal leg outcome if both GoTo and Cancel reports arrive.
One logical outcome may be transmitted repeatedly until acknowledged; do not
interpret it as "send TERMINAL only once". Completion of a result invocation is
an acknowledgement only when the handler waits for required processing and
state/event commit. A transport-level send or receipt does not establish that.

```text
Cancel(legId) -> ACCEPTED -> Nav2 terminal result
             -> ReportCommandResult(legId, Cancel, TERMINAL, actual outcome)
             -> IDLE
```

`CANCELLED` is a terminal result, never a `ReportState.status` value. Neither
SignalR send completion, `ACCEPTED`, nor later `IDLE` proves a cancellation.
If arrival precedes effective cancellation, report `ARRIVED`. A result timeout
without a confirmed Nav2 outcome requires reconciliation, not a fabricated
`FAILED`/`CANCELLED`. Retain and resend terminal results until backend processing
is acknowledged; an idle heartbeat cannot replace the result of the exact leg.

### 3.5 ROS mapping and navigation ownership

Production pose uses TF `map -> base_footprint`, combining AMCL global
correction with EKF odometry; `/amcl_pose` is not the sole fleet pose source.
Check transform availability and freshness. Good localization still needs an
explicit readiness criterion, not merely a present TF. The current global TF
tree and multi-robot limitations in Section 2.1 are unchanged.

`GoTo` maps directly to the robot's namespaced Nav2 `NavigateToPose` action
using the backend target pose/map/frame. `Cancel` targets that leg's goal.
`GoToStop.action` and `bus_stops.yaml` stay local/manual development fixtures.
There is exactly one production navigation-goal owner: fleet bridge, local
stop navigator, and RViz must not send competing goals. Keep the existing
Nav2 -> mode manager -> motor path; the backend/bridge never publishes raw
`/cmd_vel`. No ROS interface, Nav2, AMCL, or EKF implementation changes here.

Bind the robot's `mapKey` to its deployed, loaded map through explicit
configuration/validation. Do not copy the requested key from GoTo or derive map
identity merely from the frame name `map`. Reject a mismatched map/frame before
creating a Nav2 goal; `MAP_MISMATCH` is the proposed reason to finalize with DTO
binding. Readiness also requires live/fresh state, no active unresolved leg,
localization readiness, available Nav2, and locally permitted motion (including
E-stop/manual ownership checks). A missing `faultCode` is not positive evidence
of readiness. Proposed diagnostic codes such as `NAV2_UNAVAILABLE`, `TF_STALE`,
and `ESTOP_ENGAGED` need actual local evidence and a mapping contract.

Before physical end-to-end testing, define the initial-pose/operator procedure
and readiness evidence. `set_initial_pose: false` is deliberate; neither an
RViz initial-pose message nor `Route.StartX/Y/Yaw` proves the robot is localized
at that position. This prerequisite does not block the transport-only spike.

### 3.6 Connection lifecycle and idempotency

- Retry initial connection failure and automatically reconnect after disconnect,
  with bounded backoff and jitter. Register handlers once, not on every retry.
- Keep one current authenticated connection per robot. A valid new connection
  supersedes the old; reject reports from the old connection and prevent its
  disconnect callback from removing the new one.
- Reject duplicate/out-of-order state within `(robotId, streamId, seq)`. Bind
  streams to the authenticated current connection; reconcile new streams after
  process restart rather than comparing sequence numbers across streams.
- Duplicate `GoTo` with the same leg and target returns existing execution/result
  information without creating a new goal. The same leg with a different target
  is rejected. A busy robot rejects other legs, without automatic preemption or
  an implicit queue.
- `Cancel` is idempotent and leg-specific. A late duplicate GoTo, including one
  arriving after Cancel for that leg, must not revive canceled execution.
- Keep terminal results through reconnect until backend processing is confirmed;
  backend result handling is idempotent and must not advance a tour twice.
- Reconnect sends current execution state for reconciliation before new dispatch.
  Lost execution information after restart requires `UNKNOWN`/reconciliation,
  not blind replay. Backend restart or connection loss must not be mistaken for
  robot-reported execution failure. The robot-local connectivity-loss stop and
  no-auto-resume requirement is in Section 6; its detection budget, crash
  coverage, and recovery mechanism must be validated before physical operation.
  Replaying a persisted intent after bridge restart is not automatically safe:
  in-memory idempotency history may be gone. Reconcile first.

These are application guarantees, not exactly-once delivery or distributed
consensus supplied by SignalR.

### 3.7 Authentication and compatibility acceptance gate

The local-only spike may bootstrap with dummy/local identity. Passing the
checkpoint requires valid credentials, invalid-credential rejection,
authenticated reconnect, and backend restart. Outside that spike, before
allowing navigation commands require TLS, a machine credential per robot, and
a fleet-machine authorization policy. User/browser identities cannot submit
robot state or use the fleet Hub. Operations requires separate user access.
Reuse `Robot.CredentialHash`; auth implementation and credential lifecycle are
later work, without adding PKI/mTLS or a device-management platform to the MVP.

After these docs are merged, the next task is a small Python SignalR client
against an ASP.NET Core/.NET 10 test Hub. The acceptance checklist is in
[ADR-0008](decisions/0008-production-fleet-transport.md#python-compatibility-checkpoint-next-step-after-documentation-merge):
runtime parity with the robot's Humble image; verified TLS/auth; bidirectional
representative payloads; initial retry; clean and silent loss detection;
authenticated reconnect/backend restart; observable result acknowledgement and
idempotent replay; bounded offline buffering; and an at least 30-minute soak
at a declared configurable test rate with memory/queue/callback evidence.
The test rate is not a production frequency or research requirement. No ROS
nodes, TF, Nav2, or hardware is needed. Spike measurements do not establish a
physical stop budget.

**Python SignalR compatibility with ASP.NET Core/.NET 10 is unproven and must
pass this checkpoint before production fleet bridge implementation.** No Python
client dependency is selected here. If it fails, review the transport for both
the physical bridge and Fleet Emulator; no fallback implementation is chosen.


---

## 4. Web-based 3D Operational Digital Twin

The current `web/` project has a React Three Fiber demo canvas and a staff
Digital Twin page; the canvas is not yet connected to a campus model or live
robot poses. The **planned** UI will load the campus model, render robot
models, and visualize backend fleet state: robot identity, pose/heading,
connection and operational state, active tour/leg, fault/health, and battery
only when that telemetry is actually available. Physical, Gazebo, and
synthetic robots should appear through the same backend state view.

Mapping a ROS/backend pose into the Twin world requires an explicit transform
with origin offset, axis conversion, rotation, and scale. Do not scatter a
single hardcoded formula such as `x, -z, yaw` across frontend components. The
campus model should use the same floor-plan/SLAM reference so scale and origin
can be aligned deliberately.

The web twin is not a physics engine, web Nav2 implementation, collision
simulator, LiDAR point-cloud or camera-texture viewer, scenario editor, or
predictive engine.

### Remote viewer and livestream integration boundary

Remote visitors receive a read-only projection of tour progress, robot position,
and POI/narration cues. This is separate from staff control and must not expose
rosters or navigation commands. Audience authorization and exact delivery
endpoint remain to be specified in the viewer integration patch; this decision
does not select group-code authentication or a new Hub.

Livestream is a separate media path, not payload on `/hubs/fleet` or a camera
texture requirement for the operational Twin. Staff start/progression checks
need an explicit, testable source of stream availability. Its owner, observation
method, freshness, and manual-confirmation policy must be defined before full
Remote Tour acceptance. A media outage is distinct from loss of the backend
control connection: the existing staff recovery flow can let a navigating leg
finish and hold at the POI on media outage; it does not waive the local
connectivity-loss stop requirement.

The older booking-oriented `web/src/api/contracts/visitor.ts` includes visitor
pause/resume/end calls. Those calls are not an authorized Remote Tour robot
control contract; reconcile that frontend separately without changing it in
this documentation patch. Browser narration/media responsibilities also do not
add audio or head commands to the navigation fleet MVP.

---

## 5. Fleet-scale validation and research

### Local Gazebo display integration

The first executable display integration is a **development-only, read-only,
single-Gazebo-robot** path. It does not implement the production fleet command
contract, robot authentication, dispatch, or physical localization above.

- Enable backend `SimulationPreview:Enabled=true` in `Development` only.
  Preview endpoints accept loopback connections only; use an SSH tunnel when
  Gazebo/backend run on another computer. They are unavailable by default and
  in Production. No database is required in this explicit preview mode.
- `POST /api/simulation/pose`: JSON fields `robotId` (`robot_01`), `source`
  (`gazebo`), `worldId` (`map3d-preview-v1`), `frameId` (`gazebo_world`),
  `streamId` (bridge-start UUID), `seq` (positive monotonic integer),
  `capturedAt` (UTC wall-clock ISO timestamp), `x`, `y`, `z` (metres),
  `yaw` (radians). This is Gazebo ground truth, **not** AMCL localization.
- `gazebo_preview_bridge` subscribes to `/gazebo/model_states` from
  `libgazebo_ros_state.so`, selects `amr_robot`, and posts at most 10 Hz.
  Its one-slot latest-state buffer bounds memory and keeps HTTP off the ROS
  callback thread. No commands or motor topics are exposed to the browser.
- SignalR `/hubs/simulation` emits `PoseUpdated` with the same fields plus
  backend `receivedAt`. A newly connected client receives the last snapshot.
  Backend rejects invalid, stale (>10 s), future (>5 s), duplicate or reordered
  samples. Sequence order applies within one stream; a restarted stream must
  have a newer capture timestamp. This preview permits one publisher only.
- The web explicitly selects Demo or Gazebo, retries initial connections,
  reconnects, and considers samples stale after 2 s. It never substitutes demo
  poses for missing telemetry. Demo controls cannot command Gazebo.
- Map source: `robot/Map3d/map.obj` + `robot/Map3d/map.mtl`. Deployment copies
  live in `robot/ros2_ws/src/simulation/models/map3d_preview/meshes/` and
  `web/public/models/simulator-map/`. Both use scale `20 / 659.524231`,
  source center X `5.7220155`, source center Z `38.546127`, source floor Y `10`.
  Gazebo is Z-up: `(s*(X-cx), -s*(Z-cz), s*(Y-10))`. The web scene is Y-up:
  `(gazebo.x, gazebo.z, -gazebo.y)` and rotation about scene Y is Gazebo yaw.
  Assets are display-calibrated; this is not measured campus geometry. The
  ground plane fills mesh gaps. The imported mesh supplies static collisions.

Run instructions and behavioral acceptance checks:
`robot/docs/gazebo-web-preview.md`. Ubuntu ROS 2 Humble / Gazebo Classic and
hardware-style physics must still be exercised before claiming behavioral
correctness. The legacy Classic integration is retained, not migrated here.

The external Fleet Emulator belongs in `digital-twin/`; see
[ADR-0004](decisions/0004-external-fleet-emulator.md). Only its executable
scaffold exists today. Its **planned** behavior simulates pose/state
progression toward per-leg `GoTo` targets and supplies controlled multi-robot
load through the same external contract as physical and Gazebo robots. It must
not reference `SmartCampus.Application`,
`SmartCampus.Infrastructure`, or other backend implementation projects. A
shared wire-contract package may be considered later if DTO duplication
becomes a real problem; none is introduced now.

The planned validation environments have distinct claims:

| Environment | Validates | Does not establish |
|---|---|---|
| Physical AMR | Real hardware integration, ROS 2/Nav2, leg execution, and state synchronization | Fleet-scale capacity by itself |
| One Gazebo AMR | Navigation simulation, route testing, and per-leg contract compatibility | Multi-entity fleet load as a core requirement |
| N Fleet Emulator robots | Multi-robot dispatch, concurrent tours, fleet monitoring, and backend/realtime load | Nav2 quality, obstacle avoidance, physical safety, or multi-robot collision avoidance |

Scenario orchestration, what-if analysis, replay engines, predictive
simulation, Isaac Sim, and a stress-test scenario editor are future/stretch
work, not core requirements.

**Research implementation and benchmark execution are deferred until the production
Remote Tour end-to-end path works.** Fleet-scale synchronization research stays
in project scope; it is not a prerequisite for the production transport,
fail-safe, head integration, or tour orchestration work.

The Capstone documents, including the Register's research methodology, remain
authoritative and unchanged. This deferral neither removes nor redefines any
official research requirement. All research-related architecture decisions are
frozen for this milestone: do not reconcile research telemetry rates, latency
metrics or targets, freshness ratio, emulator fleet size, measurement clients,
benchmark SLOs, or the measurement pipeline as part of production work. None
may constrain or block the production end-to-end path. Revisit research
implementation and benchmarking in a separate task after that path works.

---

## 6. Safety boundary

Planned backend/web operations claim a robot at Start and may cancel a tour or
navigation leg; no automatic mid-tour reassignment is part of this flow.
Cloud/web cancellation is not an Emergency Stop and must not be presented as
one. Physical/local emergency-stop and
fail-safe behaviour remain robot-side safety concerns; the real ROS
emergency-stop interfaces are unchanged.

Production physical fleet operation requires a **robot-local stop/inhibit on
backend connectivity loss beyond a validated `T_loss`, with no automatic
resume**. A cloud request cannot provide this guarantee during a partition.
Transport recovery alone must not restart motion; staff recovery requires
reconciled execution, readiness/on-site checks, and a new leg attempt.

Existing layers are insufficient evidence of WAN-loss coverage:

- `robot/ros2_ws/src/robot_control/config/mode_manager.yaml` sets
  `nav_timeout: 0.5` for stale Nav2 velocity input, not backend connectivity.
- The STM32 serial timeout is `CMD_TIMEOUT_MS = 300` in
  `robot/firmware/stm32/motor_controller/Core/Inc/usb_protocol.h`;
  `Protocol_CheckTimeout` calls `Motor_StopAll` after valid serial traffic stops.
  It cannot detect WAN loss while the miniPC continues supplying valid traffic,
  and its constant is not a measured upper bound on physical stopping distance.
- An active Nav2 goal may outlive its fleet action client; bridge crash/orphan
  goal behavior must be tested, not inferred from socket disconnection.

Before the first physical GoTo through the fleet path, a separate robot safety
patch must specify and test the local liveness detector/supervisor, timeout
budget, motion-inhibition path through robot control, and targeted Nav2 goal
cancellation/reconciliation. It must cover silent loss, backend restart, bridge
crash, and startup with unknown goals. A detector inside the bridge alone does
not cover bridge crash. Inhibition must remain effective when action cancellation
is delayed or fails; do not depend solely on a cooperative Nav2 result.
Keep command ownership explicit instead of unconditionally canceling every
goal at bridge startup. No firmware or robot-control implementation changes
are made here.

Choose `T_loss` using transport measurements plus the acceptable stopping budget
and hardware evidence; the Python spike cannot determine safety by itself.
Coordinate backend stale/assistance thresholds with this policy without making
backend stale detection the local safety mechanism. A locally interrupted leg
must retain its cause (connectivity loss, local stop, or navigation fault), not
pretend it received a backend Cancel. Final reason/outcome mapping and recovery
are required in that patch; until termination is known, report uncertainty
rather than manufacturing a terminal result. If ARRIVED occurred before the
interruption took effect, retain that actual outcome. Physical acceptance must
observe motor stopping and no automatic restart, not only successful action RPCs.

---

## 7. AI narration and visitor Q&A

POI narration does not require an LLM. The student browser plays approved,
pre-generated narration assets. Private student Q&A follows the browser/cloud
path through STT, LLM and TTS; it is not a robot-to-assistant audio path. V1
uses one project language; multilingual and per-tour language selection are
out of scope.

`robot_perception` and the AI tour-guide assistant remain separate systems:

| Concern | Owner | Runs on | Responsibility |
|---|---|---|---|
| Person perception | WP3, `robot/ros2_ws/src/robot_perception/` | robot miniPC | RGB-D person detection and Nav2 speed limiting |
| Student AI Q&A | WP4, browser/cloud path and `ai-assistant/` | browser + server/cloud | private STT, LLM and TTS in one project language |

The robot owns navigation, physical sensors, the fleet bridge and rotating-head
hardware. It does not own visitor audio playback or AI narration. The assistant
never publishes `/cmd_vel`, sets Nav2 goals, alters `/speed_limit`, or makes a
movement/safety decision. Student audio/Q&A and livestream use browser/cloud
paths; their final media transports remain undecided.

---

## 8. Deployment

| Unit | Built by | Deployed how | Target |
|---|---|---|---|
| `robot/` ROS 2 | GitHub Actions -> DockerHub | `docker compose --profile hardware pull robot-ros2 && docker compose --profile hardware up -d --force-recreate robot-ros2` | robot miniPC |
| `robot/` firmware | GitHub Actions (compile only) | manual ST-Link flash | STM32G431 |
| `digital-twin/` | <!-- TODO(WP4) --> | service/container | simulation workstation/server |
| `backend/` | <!-- TODO(WP2) --> | <!-- TODO(WP2): docker image? dotnet publish? --> | AWS EC2 |
| `ai-assistant/` | <!-- TODO(WP4) --> | service/container | server/cloud, not robot miniPC |
| `web/` | Vercel (git integration) | auto-deploy on push | Vercel, one project |

CI never flashes the STM32 and the miniPC never auto-flashes it; see
[ADR-0002](decisions/0002-manual-stlink-flash-no-can-bootloader.md).
