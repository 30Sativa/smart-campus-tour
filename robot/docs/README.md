# Robot Documentation

Robot and hardware documentation stays beside the ROS 2/firmware deploy unit.
Read [robot/README.md](../README.md) for system architecture, package map,
build and launch instructions; read [robot/AGENTS.md](../AGENTS.md) before
changing robot code.

## Contracts and operations

- [STM32 ↔ ROS serial protocol](PROTOCOL_FB.md) — source of truth before
  changing either side of the USB CDC contract.
- [ROS discovery troubleshooting](network-ros-discovery.md) — VM/miniPC
  discovery and debugging.
- [Nav2 turn test](nav2-turn-test.md) — hardware-test procedure; check its
  READY FOR HARDWARE TEST status before relying on the parameters.
- [Camera mounts](cad-sensor-mounts.md) — measured CAD positions.
- [miniPC deployment checklist](phase1-deploy-minipc.md) — operational setup.
- [Docker dependencies and targets](docker-dependencies.md) — hardware/debug/sim
  separation, native camera dependencies, image checks and size measurement.

## Phase records

- [Phase 1 camera](phase1-camera.md), [Phase 2 perception](phase2-perception.md),
  and [Phase 4 person perception](phase4-ai.md) document their named phases and
  local setup/limits.
- [Phase 3 Nav2](phase3-nav2.md) is explicitly historical; its planner and
  costmap choices were superseded. Use `robot_navigation/README.md` and the
  current ADRs for the active navigation baseline.

Firmware pin, wiring, flashing, and IMU guides live under
`robot/firmware/stm32/motor_controller/docs/`. ROS package instructions live
beside each package. They remain local references and do not define CampusTour
business behavior.
