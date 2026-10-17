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

- [Native runtime](native-runtime.md) — provisioning, build and layered
  operation on the physical MiniPC.
- [Nav2 Baseline V1](nav2-baseline-v1.md) — locked development/test
  configuration, hardware evidence and limits.
- [DDS isolation and RViz over SSH](dds-isolation.md) — R3 design, viewer,
  bridge, safeguards and staged transition.
- [R3 DDS readiness snapshot (2026-10-17)](r3-dds-readiness-2026-10-17.md) —
  actual MiniPC state, stationary S1–S3 prerequisites, verification and
  rollback. S1–S3 were **not deployed** in that snapshot.
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

- [Nav2 smoothness trial](nav2-smooth-trial.md) — historical experiment that
  informed Baseline V1.
- [Nav2 turn test](nav2-turn-test.md) — separate hardware-test plan; check its
  stated readiness and prerequisites before relying on it.
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
- [Phase 3 Nav2](phase3-nav2.md) is explicitly historical; use Baseline V1 and
  current navigation package documentation for active navigation behavior.

Firmware pin, wiring, flashing and IMU guides live under
`robot/firmware/stm32/motor_controller/docs/`. ROS package contracts and
package-specific commands live beside their source.
