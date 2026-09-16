# ADR-0004: Use an external Fleet Emulator for fleet-scale validation

## Context

The project needs to validate multi-robot dispatch, concurrent tours, fleet
monitoring, and the backend/realtime path under increasing fleet load. Running
many physical AMRs is impractical. Running multiple full Gazebo/Nav2 stacks
adds substantial simulation and TF complexity, while the research question is
about Digital Twin synchronization latency and freshness rather than
navigation quality.

Putting synthetic robot behaviour inside the backend would couple test-load
generation to the system under test and blur the boundary between tour
orchestration and robot execution.

## Decision

Use an external Fleet Emulator under `digital-twin/` for fleet-scale
validation and controlled load experiments. A future layout may use
`digital-twin/src/FleetEmulator/` and `digital-twin/experiments/fleet-load/`,
but this ADR does not create that scaffold.

Each emulated robot uses the same external robot/backend contract as a
physical or Gazebo robot. It accepts one per-leg `go_to` target, models
pose/state progression toward it, and reports ordered state. It does not
reference `SmartCampus.Application`, `SmartCampus.Infrastructure`, or another
backend implementation project.

One Gazebo AMR remains the navigation-simulation environment. Multiple Gazebo
robots are not the core fleet-load mechanism.

## Consequences

Positive:

- Fleet size and state-update load can be increased deterministically without
  requiring physical robots or N full navigation stacks.
- The experiment exercises the same external boundary used by real robots,
  rather than a backend-internal shortcut.
- Load generation and research measurements remain outside the backend being
  measured.

Negative:

- Contract DTOs may initially be duplicated across deploy units. A shared
  wire-contract package is deferred until duplication becomes a demonstrated
  problem.
- Emulator motion and timing are synthetic and require explicit experiment
  configuration to make results reproducible.
- The emulator adds another external client implementation to maintain.

Validation limitation: emulator results support claims about dispatch,
concurrent tours, fleet monitoring, synchronization latency/freshness, and
backend/realtime load only. They do not validate Nav2/navigation quality,
obstacle avoidance, physical safety, or multi-robot collision avoidance.
