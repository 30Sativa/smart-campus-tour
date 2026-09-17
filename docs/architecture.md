# System Architecture

How the pieces of CampusTour DT-AMR fit together. This file covers what
crosses a folder boundary. Anything internal to one folder is documented
inside that folder.

- Robot internals: [`robot/README.md`](../robot/README.md)
- Digital Twin research tooling: [`digital-twin/README.md`](../digital-twin/README.md)
- Backend internals: [`backend/AGENTS.md`](../backend/AGENTS.md)
- AI tour-guide internals: [`ai-assistant/README.md`](../ai-assistant/README.md)
- Frontend internals: [`web/AGENTS.md`](../web/AGENTS.md)

---

## 1. Components and ownership

```text
   Visitor                         Campus staff
      |                                 |
      v                                 v
   +----------------------------------------------------+
   | web/  visitor app + ops dashboard + 3D Digital Twin |
   +---------------------------+------------------------+
                               | HTTP + SignalR
                               v
   +----------------------------------------------------+
   | backend/  booking, tour orchestration and dispatch  |
   +-------------------+------------------+-------------+
                       |                  |
          transport/auth TBD             | same external fleet contract
                       |                  |
                       v                  v
   +---------------------------+   +-----------------------------+
   | robot/ physical or one    |   | digital-twin/ Fleet Emulator|
   | Gazebo AMR + fleet_bridge |   | + measurement tooling       |
   +---------------------------+   +-----------------------------+
                       |
                       | assistant integration TBD
                       v
   +----------------------------------------------------+
   | ai-assistant/  STT + visitor Q&A/LLM + TTS          |
   +----------------------------------------------------+
```

The backend owns `TourRoute`, `TourSlot`, `Booking`, `TourInstance`,
`TourLeg`, robot assignment/dispatch, and authoritative POI/navigation-target
data. A robot executes one navigation leg at a time; it does not own the tour
workflow. The web app owns the Web-based 3D Operational Digital Twin. The
`digital-twin/` deploy unit owns synthetic fleet clients and controlled
measurement tooling, not the 3D frontend.

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

The backend does not speak ROS. For a physical or Gazebo robot, a thin bridge
inside `robot/` translates between the external fleet contract and ROS 2. The
Fleet Emulator is a separate external client under `digital-twin/` and uses
the same external contract without referencing backend implementation
projects.

```text
backend/ <---- transport/auth TBD ----> robot/.../fleet_bridge <---- ROS 2 ----> robot stack
    ^
    +------- same external contract ------ digital-twin/Fleet Emulator
```

The wire transport, robot authentication, exact update frequency, and exact
schema/serialization are still TBD. The following is the decided conceptual
shape, not an instruction to hardcode a transport DTO:

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

Robot execution states are `IDLE`, `NAVIGATING`, `ARRIVED`, and `FAILED`.
Battery is an optional/nullable capability: the physical firmware/hardware is
not assumed to provide a percentage. It is not a mandatory dispatch rule.

The bridge is a translator only. It contains no booking rules, scheduling,
robot assignment, tour state machine, or persistence. Commands use the
robot's navigation boundary rather than publishing `/cmd_vel` directly. The
outbound-from-robot connection preference remains, but its transport is TBD.

### 3.1 POI target invariant

Production target poses belong to backend-managed POI/route data. A
`TourLeg` resolves to `stop_id`, `x`, `y`, and `yaw` before dispatch. Any POI
coordinate is meaningful only with the map/frame/context in which it was
defined. This invariant does not introduce a MapVersion subsystem.

### 3.2 Booking, dispatch, and per-leg flow

A `TourSlot` represents one timed tour group. Multiple visitors may book
places in it up to visitor capacity, and one `TourInstance` executes for that
group. A confirmed booking does not reserve a robot days in advance. Robot
assignment happens near the tour start.

```text
TourInstance READY
  -> dispatcher selects an AVAILABLE robot
  -> backend sends the current TourLeg
  -> robot NAVIGATING
  -> robot ARRIVED
  -> backend marks the tour AT_POI
  -> POI narration / visitor interaction
  -> timeout or visitor Continue
  -> backend sends the next TourLeg
  -> repeat until COMPLETED
```

If no robot is available at tour time, the `TourInstance` enters an
operational waiting/delayed state such as `WAITING_FOR_ROBOT` or `DELAYED` so
an operator can intervene. A previously confirmed booking does not fail merely
because a robot is temporarily unavailable. Cancellation, rescheduling,
no-show, payment, refund, and priority policies remain undecided.

Core business invariants:

- confirmed visitor count never exceeds `TourSlot` capacity;
- one robot has at most one active assignment;
- one active `TourInstance` has at most one assigned robot;
- transient robot telemetry state is separate from tour business state;
- retries or duplicate commands do not create duplicate business-level leg
  execution;
- stale or out-of-order robot state does not overwrite newer state; `seq`
  supports ordering and gap detection.

These are architecture requirements, not implementations in the current
documentation task.

### 3.3 State storage and realtime delivery

Current robot pose/state is transient latest-state data and belongs in memory
or a suitable cache at the architecture level. This does not select or add
Redis. SQL Server stores meaningful business events and state transitions; it
must not receive every pose update. A controlled benchmark may write telemetry
to a dedicated experiment log/file.

Backend-to-browser realtime delivery uses SignalR. Exact hub and method schema
remain TBD.

---

## 4. Web-based 3D Operational Digital Twin

The core Digital Twin UI is in `web/`, using the existing React Three Fiber /
Three.js stack. It loads the campus model, renders robot models, and visualizes
backend fleet state: robot identity, pose/heading, connection and operational
state, active tour/leg, fault/health, and battery only when that telemetry is
actually available. Physical, Gazebo, and multiple synthetic robots can all
appear through the same backend state view.

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
[ADR-0004](decisions/0004-external-fleet-emulator.md). It simulates
pose/state progression toward per-leg `go_to` targets and supplies controlled
multi-robot load through the same external contract as physical and Gazebo
robots. It does not reference `SmartCampus.Application`,
`SmartCampus.Infrastructure`, or other backend implementation projects. A
shared wire-contract package may be considered later if DTO duplication
becomes a real problem; none is introduced now.

Validation environments have distinct claims:

| Environment | Validates | Does not establish |
|---|---|---|
| Physical AMR | Real hardware integration, ROS 2/Nav2, leg execution, and state synchronization | Fleet-scale capacity by itself |
| One Gazebo AMR | Navigation simulation, route testing, and mission-contract compatibility | Multi-entity fleet load as a core requirement |
| N Fleet Emulator robots | Multi-robot dispatch, concurrent tours, fleet monitoring, and backend/realtime load | Nav2 quality, obstacle avoidance, physical safety, or multi-robot collision avoidance |

Scenario orchestration, what-if analysis, replay engines, predictive
simulation, Isaac Sim, and a stress-test scenario editor are future/stretch
work, not core requirements.

The primary research question is how increasing fleet load affects the
Web-based Operational Digital Twin's synchronization latency and update
freshness. Primary metrics are:

- p95 end-to-end state synchronization latency;
- effective frontend update rate / state freshness.

The measured latency starts when the robot/emulator creates state and stops
when the browser SignalR callback receives it. Three.js render time is outside
this synchronization metric. One-way measurements across machines must
document NTP/chrony or an equivalent synchronization mechanism and the clock
policy in the methodology.

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

Backend/web operational commands may assign or reassign a robot and cancel a
mission or leg. Cloud/web cancellation is not an Emergency Stop and must not
be presented as one. Physical/local emergency-stop and fail-safe behaviour
remain robot-side safety concerns; the real ROS emergency-stop interfaces are
unchanged.

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
