# AGENTS.md — `digital-twin/`

> **STATUS: FOUNDATION.** The .NET 10 Fleet Emulator project exists, but no
> emulator behaviour or research tooling is implemented yet.

External fleet emulation and synchronization research tooling for CampusTour
DT-AMR (WP3). Read the repo-root `AGENTS.md` first; this file covers only this
deploy unit.

---

## 1. Scope

This folder owns the external Fleet Emulator, controlled fleet-load experiment
tooling, and synchronization measurement/research tooling. The emulator uses
the same external robot/backend contract as a physical or Gazebo robot and
models pose/state progression toward each per-leg target.

It does not own the Web-based 3D Operational Digital Twin UI; that lives in
`web/`. It also does not own the authoritative robot model, Nav2 configuration,
firmware, or robot-stack simulation. Those remain under `robot/`; the Gazebo
development package is `robot/ros2_ws/src/simulation/`.

Scenario orchestration, what-if analysis, replay engines, predictive
simulation, Isaac Sim, and a stress-test scenario editor are future/stretch
work, not core requirements.

---

## 2. Stack and layout

The Fleet Emulator is a .NET 10 console app under `src/FleetEmulator/`.
Its future external robot/backend connection will use the official
`Microsoft.AspNetCore.SignalR.Client` package. Tests live under
`tests/FleetEmulator.Tests/` and are run through `SmartCampus.DigitalTwin.slnx`.

The current entry point is intentionally only a runnable skeleton. Do not add
emulator behaviour or research tooling until the external contract is ready.
Research implementation and benchmark execution are deferred until the
production Remote Tour end-to-end path works. The Capstone documents, including
the Register's research methodology, remain authoritative and unchanged. All
research-related architecture decisions are frozen for this milestone. Do not
reconcile research rates, metrics/targets, fleet size, measurement clients,
benchmark SLOs, or the measurement pipeline during production work; none may
constrain or block production integration. Revisit research in a separate task
after that path works. See `docs/architecture.md` Section 5.

---

## 3. Architecture rules

- Do not copy robot models, Nav2 logic or ROS interface definitions from
  `robot/`. Consume the external contract instead.
- Do not reference `SmartCampus.Application`, `SmartCampus.Infrastructure`, or
  another backend implementation project. Do not put the emulator in
  `backend/`.
- Define transport, wire schema, timestamps/clocks, update rates, and
  authentication in `docs/architecture.md` before coding the external client.
- Keep emulator control on the external fleet contract. It must not directly
  invoke backend use cases or command a physical robot.
- The experiment guidance below applies only when deferred research resumes;
  it is not a production implementation requirement or acceptance gate.
- Experiments must record emulator configuration, offered load, clock source,
  limits/caps, and metrics so another team member can reproduce the result.
- For one-way timing across machines, document NTP/chrony (or equivalent) and
  the clock policy in the experiment methodology.
- Current state is transient/latest-state data. Do not persist every pose to
  transactional SQL Server; use a dedicated experiment log/file when needed.
- Increase load until a predefined SLO is violated, resource usage approaches
  a predefined safe limit, or the predefined test cap is reached. Do not make
  a server crash the experiment goal, and do not hardcode a 20-robot limit.
- Keep generated bags, recordings, simulation caches and experiment output out
  of Git unless a task explicitly adds a small reviewed fixture.

---

## 4. Verification

```bash
digital-twin/scripts/verify
```

The current check restores, builds, and tests `SmartCampus.DigitalTwin.slnx`.
Add format/lint, integration tests, and deterministic emulator/metric checks
only when the corresponding implementation exists.

---

## 5. Hard constraints

- Do not commit visitor data, production telemetry, secrets, large rosbags or
  generated simulation/experiment output.
- Do not present Fleet Emulator results as validation of Nav2/navigation
  quality, obstacle avoidance, physical safety, or multi-robot collision
  avoidance.
- Any public interface change requires the matching update in
  `docs/architecture.md` in the same PR.
