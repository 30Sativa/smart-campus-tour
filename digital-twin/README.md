# Fleet Emulator and Digital Twin research tooling

WP3 deploy unit for external fleet emulation and controlled synchronization
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

## Research measurement

Primary metrics are p95 end-to-end state synchronization latency and effective
frontend update rate/state freshness as synthetic fleet load increases. Timing
starts when a robot/emulator creates state and stops when the browser SignalR
callback receives it; Three.js rendering is excluded. Cross-machine one-way
measurements must document clock synchronization and clock policy.

Sequence gaps may reflect intentional latest-state/coalescing behaviour and
must not automatically be labelled packet loss. Experiments stop at a
predefined latency/freshness SLO violation, a predefined safe resource limit,
or a predefined test cap; crashing the server is not required.

## Status

**Not started.** No Fleet Emulator code or scaffold exists. Transport,
authentication, exact wire schema, update frequency, runtime, SLOs, safe
resource limits, and test caps remain undecided.

## Verification

```bash
digital-twin/scripts/verify
```

The script currently returns `SKIPPED` until source and a real verification
pipeline are added.
