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
   Visitor                         Campus staff
      |                                 |
      v                                 v
   +----------------------------------------------------+
   | web/  visitor + ops UI; 3D Twin data planned           |
   +---------------------------+------------------------+
                               | HTTP API + SignalR (planned backend)
                               v
   +----------------------------------------------------+
   | backend/  tour schema; API/orchestration planned     |
   +-------------------+------------------+-------------+
                       |                  |
          fleet transport/auth TBD       | same planned fleet contract
                       |                  |
                       v                  v
   +---------------------------+   +-----------------------------+
   | robot/ physical or one    |   | digital-twin/ Fleet Emulator|
   | Gazebo AMR; bridge planned|   | scaffold; behavior planned  |
   +---------------------------+   +-----------------------------+
                       |
                       | assistant integration TBD
                       v
   +----------------------------------------------------+
   | ai-assistant/  STT + visitor Q&A/LLM + TTS          |
   +----------------------------------------------------+
```

The backend schema currently models `Route`, `RouteStop`, `Poi`, `Tour`,
`GroupRegistration`, `RosterRow`, `Robot`, and `TourEvent`, alongside user,
token, and audit data. Backend ownership of POI targets, tour progression,
and robot assignment is a decided boundary; the dispatch use cases are not
implemented yet. A robot is intended to execute one navigation leg at a time
without owning the tour workflow. The web app owns the 3D Operational Digital
Twin UI, while `digital-twin/` owns the Fleet Emulator scaffold and future
load experiments, not the 3D frontend.

---

## 2. Robot subsystem

Sensor hierarchy is settled by
[ADR-0001](decisions/0001-lidar-primary-astra-supplementary.md):

```text
RPLiDAR A3M1        -> /scan                 -> local + global costmap, AMCL, SLAM
STM32 STEP counts   -> /wheel/odom -\
BNO085 orientation  -> /imu/data   -> EKF -> /odom + odom -> base_footprint TF
Astra Pro (depth)   -> /camera/depth/points  -> LOCAL costmap ONLY
Astra Pro (RGB)     -> person detection      -> Nav2 speed limit
                       (`robot_perception`, not the AI tour guide)
```

The STM32G431 owns real-time stepping. ROS 2 sends wheel-speed commands over
USB CDC serial and does not reach below that line.

The current `go_to_stop` ROS 2 action (`bus_manager` / `bus_interfaces`)
resolves a named stop through `bus_stops.yaml`. That is retained for local ROS
development, manual testing, and as a fallback/test fixture. It is not the
production source of truth for POI coordinates. Migration to the external
per-leg contract in Section 3 is intentionally not implemented by this
documentation change; see [ADR-0005](decisions/0005-backend-authoritative-poi-per-leg-orchestration.md).

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

---

## 3. Backend-owned tour orchestration and fleet contract

**Decided boundary, implementation pending:** the backend does not speak ROS.
A future bridge inside `robot/` translates between the external fleet contract
and ROS 2. The Fleet Emulator in `digital-twin/` has a scaffold but no fleet
behavior yet; its implementation will use the same external contract without
referencing backend implementation projects.

```text
backend/ Application use case -> IFleetGateway (planned Application boundary)
    -> Infrastructure fleet adapter (planned) -> external transport/auth TBD
       +--> robot/ fleet bridge (planned) -> ROS 2 robot stack
       +--> digital-twin/ Fleet Emulator (planned alternative client)
```

The wire transport, robot authentication, exact update frequency, and exact
schema/serialization are still TBD. The following is a conceptual per-leg
shape from [ADR-0005](decisions/0005-backend-authoritative-poi-per-leg-orchestration.md),
not an implemented DTO or a new database entity. In particular, `stop_id`
has no current SQL column or settled mapping to `Poi`/`RouteStop`:

```text
go_to {
  leg_id,
  stop_id,
  x,
  y,
  yaw
}

cancel {
  leg_id
}

state {
  robot_id,
  seq,
  stamp,
  x,
  y,
  yaw,
  battery?,
  status,
  leg_id?,
  fault_code?
}
```

Robot execution states `IDLE`, `NAVIGATING`, `ARRIVED`, and `FAILED` describe
the planned external fleet contract, not `Tour.State` values.
Battery is an optional/nullable capability: the physical firmware/hardware is
not assumed to provide a percentage. It is not a mandatory dispatch rule.

The planned bridge is a translator only. It contains no registration rules,
scheduling, robot assignment, tour state machine, or persistence. Commands
use the robot's navigation boundary rather than publishing `/cmd_vel`
directly. The outbound-from-robot connection preference remains, but its
transport is TBD.

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
then decides whether to send another leg or complete the tour. No robot
availability policy, no-robot state transition, retry handling, or timing rule
is implemented yet. Requirements such as one active assignment per robot and
ignoring stale or duplicate results need explicit application/persistence
enforcement; the v1.0 schema does not provide those guarantees by itself.

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

Backend-to-browser realtime delivery is **planned** to use SignalR; the
backend has no Hub yet. Authentication implementation and the dispatch
algorithm are also pending. Exact hub/method and fleet wire schemas remain
TBD.

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

---

## 5. Fleet-scale validation and research

The external Fleet Emulator belongs in `digital-twin/`; see
[ADR-0004](decisions/0004-external-fleet-emulator.md). Only its executable
scaffold exists today. Its **planned** behavior simulates pose/state
progression toward per-leg `go_to` targets and supplies controlled multi-robot
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

The primary research question is how increasing fleet load affects the
Web-based Operational Digital Twin's synchronization latency and update
freshness. Primary metrics are:

- p95 end-to-end state synchronization latency;
- effective frontend update rate / state freshness.

The planned latency measurement starts when the robot/emulator creates state
and stops when the browser SignalR callback receives it. Three.js render time
is outside this synchronization metric. One-way measurements across machines
must document NTP/chrony or an equivalent synchronization mechanism and the
clock policy in the methodology.

Sequence numbers support ordering and gap detection. A skipped `seq` is not
automatically "packet loss": latest-state/coalescing semantics may
intentionally omit intermediate states.

Experiments increase the synthetic fleet until a predefined latency/freshness
SLO is violated, resource use approaches a predefined safe limit, or a
predefined test cap is reached. Crashing the server is not the success
criterion. Exact SLOs, update frequency, safe resource limit, and test cap
remain TBD and must be recorded with each experiment.

---

## 6. Safety boundary

Planned backend/web operational commands may assign or reassign a robot and
cancel a tour or navigation leg. Cloud/web cancellation is not an Emergency
Stop and must not be presented as one. Physical/local emergency-stop and
fail-safe behaviour remain robot-side safety concerns; the real ROS
emergency-stop interfaces are unchanged.

---

## 7. AI narration and visitor Q&A

POI narration does not require an LLM. It may use TTS from approved POI
content, or audio generated/cached when that content is published or updated.
The LLM is used for visitor Q&A. NLP and translation quality are outside the
Digital Twin synchronization research scope.

`robot_perception` and the AI tour-guide assistant remain separate systems:

| Concern | Owner | Runs on | Responsibility |
|---|---|---|---|
| Person perception | WP3, `robot/ros2_ws/src/robot_perception/` | robot miniPC | RGB-D person detection and Nav2 speed limiting |
| AI tour guide | WP4, `ai-assistant/` | server/cloud | multilingual STT, visitor Q&A/LLM, narration TTS |

The assistant never publishes `/cmd_vel`, sets Nav2 goals, alters
`/speed_limit`, or makes a movement/safety decision. A future thin robot-side
adapter may handle stop/task events, visitor audio, speech playback, and
cached narration. Event/audio transport, schemas, authentication, timeouts,
and offline fallback remain TBD.

---

## 8. Deployment

| Unit | Built by | Deployed how | Target |
|---|---|---|---|
| `robot/` ROS 2 | GitHub Actions -> DockerHub | `docker compose --profile hardware pull robot-ros2 && docker compose --profile hardware up -d --force-recreate robot-ros2` | robot miniPC |
| `robot/` firmware | GitHub Actions (compile only) | manual ST-Link flash | STM32G431 |
| `digital-twin/` | <!-- TODO(WP3) --> | service/container | simulation workstation/server |
| `backend/` | <!-- TODO(WP2) --> | <!-- TODO(WP2): docker image? dotnet publish? --> | AWS EC2 |
| `ai-assistant/` | <!-- TODO(WP4) --> | service/container | server/cloud, not robot miniPC |
| `web/` | Vercel (git integration) | auto-deploy on push | Vercel, one project |

CI never flashes the STM32 and the miniPC never auto-flashes it; see
[ADR-0002](decisions/0002-manual-stlink-flash-no-can-bootloader.md).


## FE remote-tour preview (2026-09-21)

This is a frontend-only mock contract, not an implemented backend interface.
`web/src/api/contracts/remote-tour.ts` and `web/src/mocks/remote-tour-mock.ts`
own the demo lifecycle. No backend, robot or AI service is changed.

The existing visitor, staff and administration shells are retained. `/visit/book`
is representative group registration; `/visit/bookings` lists registrations in
all tour states. `/join/:tourId` is account-free Student matching and participation.
`/admin/tours` handles tour preparation, approval and invitation simulation;
`/admin/accounts` creates/locks in-memory demo accounts. Legacy self-registration
redirects to login; accounts are provisioned by Admin. Legacy Visitor identities
remain compatible as representatives. Admin may monitor Staff screens but does
not gain operational commands.

`web/src/mocks/remote-staff-adapter.ts` projects the same remote store into the
existing dashboard, schedule, AMR and alert view models. Old HTTP DTOs remain
unwired historical contracts. Only the mock lifecycle enforces SCHEDULED-only
registration mutation, revision checks, approval-before-invitation, READY content
locking, separate Start preflight, per-step Hold/Next/recovery, return completion,
and retained robot assignment after End Early until inspection/release.
Student snapshots exclude roster and rejection reasons; live/AI access is
revalidated against the approved roster and tour state.

The three robot source labels are fixtures, not live Physical/Gazebo/Emulator
connections. Readiness and return/stop evidence are synthetic. Media, STT/TTS,
email delivery, robot commands and persistence remain unimplemented. Data is
shared only inside one browser tab and resets on reload. A browser join grant
expires after two hours in this preview; this is not a production auth contract.
Backend integration must define real readiness, stop evidence, release, stream
fault policy and multi-role authorization before deployment.
