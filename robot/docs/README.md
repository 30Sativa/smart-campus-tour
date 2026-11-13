# Robot documentation

This folder is the durable documentation home for the ROS 2 and firmware
deploy unit. It separates current guidance from dated evidence and historical
phase notes.

## Start here for a new contributor or AI agent

1. Read the repository [AGENTS.md](../../AGENTS.md) and
   [robot/AGENTS.md](../AGENTS.md).
2. Read [robot/README.md](../README.md) for architecture, package roles and
   the native runtime model.
3. Read [Robot architecture and handoff status](project-status.md). It defines
   the evidence vocabulary and snapshots GitHub, MiniPC and laptop state.
4. Continue with the relevant operating guide below, then inspect the source
   and tests at the exact Git ref named by the status page.

The root `docs/README.md` explains the repository-wide document authority.
Dated reports are evidence for their stated date and revision, not a promise
that a machine or branch still has that state. A command in a runbook is not
permission to execute it.

## Current architecture and operations

- [Three workflows: MANUAL, BUILD MAP, NAV2](workflows.md) — **read first**: the
  shared core and what each workflow adds, who may drive `cmd_vel`, calibration
  arguments, which config each workflow loads, commands and tools.
- [Test readiness 2026-11-10](test-readiness-2026-11-10.md) — what may run on the
  robot now (offline / static / controlled motion / blocked), preflight and
  PASS/FAIL per step, the static LiDAR check, the E-stop/link-safety audit.
- [Launcher `robot`](robot-launcher.md) — per-process environment from one machine
  profile, one workflow at a time, teleop and stop separate, candidate LiDAR yaw only
  for the static check, session logs and retention. Not installed yet.
- [Fleet service](fleet-service.md) — `fleet_bridge` from boot as a systemd user unit supervised
  by the launcher (`robot fleet --service`): telemetry always, commands only while
  `robot nav --fleet` runs; NTP gate, restart policy, offline end-to-end evidence, install steps.
- [Runtime deploy and rollback](runtime-deploy.md) — how the MiniPC runtime
  differs from source today, staging an immutable overlay from one commit, and
  rolling back by sourcing the previous overlay.
- [Maps and POI](../robot_maps/README.md) — which map is the baseline and where
  new maps go.
- [Native runtime](native-runtime.md) — provisioning, build and layered
  operation on the physical MiniPC.
- [R1 ROS Fleet Bridge](fleet-bridge.md) — telemetry-only TF observation,
  HTTPS contract mapping, Backend deployment gates and stationary test plan.
- [Localization V2 (candidate)](localization-v2.md) — odometry distance scale
  and AMCL update thresholds for long low-feature corridors; offline evidence,
  calibration procedure and rollback. Not the default.
- [Robot baseline 2026-11-02](robot-baseline-2026-11-02.md) — **current
  baseline and how to launch it**: Nav2 V2 + `lidar_yaw:=-3.0695`, launch/verify/
  route/stop steps, rollback, evidence, known limits (not safe with people close
  to the path), next optimisations and the history of removed Nav2 configs.
- [Nav2 Baseline V2](nav2-baseline-v2.md) — definition of the V2 params (V1 + RPP
  lookahead 0.8 + angular decel −1.2), offline and on-robot evidence and the
  criteria to call it hardware validated. Tools: [nav2_bench](../tools/nav2_bench/README.md).
- [Nav2 Baseline V1](nav2-baseline-v1.md) — record of the previous baseline; its
  params file was removed on 2026-11-02 (git tag `nav2-baseline-v1`).
- [DDS isolation and RViz over SSH](dds-isolation.md) — R3 design, viewer,
  bridge, safeguards and staged transition.
Dated evidence (true for its date; later pages supersede it):

- [Robot status 2026-10-22](robot-status-2026-10-22.md) — LiDAR mount
  moved (yaw now about −4.8°, `lidar_yaw:=-0.0833` arg), START↔POI_03 done,
  Nav2 Baseline V2, sessions without rosbag and the `go.sh` guard, next steps.
- [Robot status 2026-10-20](robot-status-2026-10-20.md) — firmware
  PR #63 flashed, long-route POI survey, localization root cause (odometry
  distance scale), Localization V2 branch state and next steps.
- [Robot status 2026-10-19](robot-status-2026-10-19.md) — S3
  deployed, S4/S5a results, CPU contention with the Quest stream, silent IMU
  outage and the PR #63 fix, open issues and next steps.
- [R3 DDS readiness snapshot (2026-10-17)](r3-dds-readiness-2026-10-17.md) —
  actual MiniPC state, stationary S1–S3 prerequisites, verification and
  rollback. S1–S3 were **not deployed** in that snapshot.
- [R3 stationary review (2026-10-17)](r3-stationary-review-2026-10-17.md) —
  S0b real-device evidence (viewer, tunnel/bridge restart, QoS, guard
  rejections, cleanup, resources). Its rollout prerequisite is superseded by
  the readiness snapshot.
- [ROS Discovery Server troubleshooting](network-ros-discovery.md) — legacy
  multi-machine diagnosis; follow the R3 boundary before connecting a laptop
  directly to robot DDS.
- [Runtime logs and rosbag sessions](logging.md) — machine-local evidence
  storage and capture rules.
- [STM32 ↔ ROS serial protocol](PROTOCOL_FB.md) — source of truth for the
  USB CDC contract.
- [RViz over SSH utility](../tools/rviz_over_ssh/README.md) — laptop viewer
  and adapter behavior.

## Test and design records

- [Camera mounts](cad-sensor-mounts.md) — measured CAD positions.
- [Docker dependencies and targets](docker-dependencies.md) — CI, laptop
  debug and simulation image boundaries.

## Historical phase records

- [Phase 1 camera](phase1-camera.md), [Phase 2 perception](phase2-perception.md)
  and [Phase 4 person perception](phase4-ai.md) keep their original phase
  evidence and limits.
- [Phase 1 MiniPC deployment checklist](phase1-deploy-minipc.md) is retained
  as a historical record. Its old clone/build procedure was superseded by
  [Native runtime](native-runtime.md).
- [Phase 3 Nav2](phase3-nav2.md) is explicitly historical; use the
  [2026-11-02 baseline](robot-baseline-2026-11-02.md) and [workflows.md](workflows.md)
  for active navigation behavior.

Firmware pin, wiring, flashing and IMU guides live under
`robot/firmware/stm32/motor_controller/docs/`. ROS package contracts and
package-specific commands live beside their source.
