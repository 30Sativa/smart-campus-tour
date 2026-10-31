# Fleet Emulator and Digital Twin research tooling

WP4 deploy unit for external fleet emulation and controlled synchronization
research. It runs on a simulation workstation/server and owns:

- a future external Fleet Emulator using the physical/Gazebo robot contract;
- controlled multi-robot fleet-load experiments;
- synchronization latency and update-freshness measurement tooling.

The Web-based 3D Operational Digital Twin UI lives in `web/`, not here.

## Boundary with robot simulation

This deploy unit is not the `simulation` ROS package.

| `robot/ros2_ws/src/simulation/` | `digital-twin/` |
|---|---|
| Minimal Gazebo worlds and launches | External Fleet Emulator + measurements |
| Tests Nav2 without hardware | Generates controlled synthetic fleet load |
| One Gazebo AMR is the core navigation simulation | N robots exercise dispatch/realtime scaling |
| Uses the real robot stack | Uses the same external backend contract without Nav2 |

The authoritative robot model, navigation behaviour and ROS interfaces remain
in `robot/`. Do not copy them into this folder. Do not reference backend
implementation projects; use the external contract documented in
`docs/architecture.md`.

## Validation boundary

Fleet Emulator results can validate multi-robot dispatch, concurrent tours,
fleet monitoring, and backend/realtime load. They cannot validate Nav2,
navigation quality, obstacle avoidance, physical safety, or multi-robot
collision avoidance. One physical AMR covers hardware integration; one Gazebo
AMR covers navigation simulation and mission-contract compatibility.

Scenario orchestration, what-if analysis, replay engines, predictive
simulation, Isaac Sim, and a stress-test scenario editor are future/stretch
work rather than core scope.

## Research status: architecture frozen, execution deferred

Fleet research remains in project scope. Emulator implementation and benchmarks
are deferred until the production Remote Tour end-to-end path works; they do
not block physical fleet transport, robot fail-safe, rotating head, or backend
tour orchestration. A small protocol test client for production transport is
not a fleet benchmark.

The Capstone documents, including the Register's research methodology, remain
authoritative and unchanged. This deferral neither removes nor redefines any
official research requirement. All research-related architecture decisions are
frozen for this milestone. Do not reconcile research rates, latency metrics or
targets, freshness ratio, emulator fleet size, measurement clients, benchmark
SLOs, or the measurement pipeline during production work. They impose no
production constraints or acceptance gates. Revisit implementation and
benchmarking in a separate task after the production end-to-end path works.

## Foundation status

The .NET 10 Fleet Emulator console-app foundation is in place. It is an
external synthetic client and currently only prints a startup message; it does
not yet implement Fleet Sync authentication or telemetry. ADR-0019 selects
HTTPS `POST /api/fleet/v1/sync` for the robot telemetry boundary. The shared
contract is in `docs/contracts/fleet-sync/v1/`. Python HTTPS/TLS compatibility
from the ROS Humble image and the production reverse proxy remain R1 verification
gates. ADR-0008's earlier `/hubs/fleet` production transport is superseded for
robot telemetry; SignalR remains for the Staff operations projection and
development preview.

`docs/architecture.md` Section 3 records conceptual `GoTo`, `Cancel`,
`ReportState`, and `ReportCommandResult` semantics for M2, and implemented
Fleet Sync v1 telemetry/authentication for M0/B1. The emulator has not yet
implemented the shared Fleet Sync client or its retry/recovery behavior. Each
emulated robot must use its own identity. Retain `Robot.SourceType` / eligibility
so synthetic robots cannot serve real tours. The development Gazebo preview
remains a separate path.

Operational rates remain configurable and must be recorded during production
integration. Fleet Sync currently uses a 600 requests per IP per minute default;
the bridge cadence must fit that limit with retry headroom. The backend DTO,
robot authentication, and response contract are implemented; emulator/robot
client retry, recovery, and TLS deployment checks remain R1 work. Research
implementation/benchmark execution are deferred under the unchanged Capstone
scope; no research architecture decisions are made in this milestone.
No Emulator behavior or dependency is added by this documentation decision.

## Verification

```bash
digital-twin/scripts/verify
```

The verification script restores, builds, and tests
`SmartCampus.DigitalTwin.slnx`.
