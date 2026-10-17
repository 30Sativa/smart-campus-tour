# Robot Documentation

Robot and hardware documentation stays beside the ROS 2/firmware deploy unit.
Read [robot/README.md](../README.md) for system architecture, package map,
build and launch instructions; read [robot/AGENTS.md](../AGENTS.md) before
changing robot code.

## Contracts and operations

- [Runtime logs and rosbag sessions](logging.md) — standard machine-local
  storage, per-session layout, capture commands and cleanup rules for agents.
- [STM32 ↔ ROS serial protocol](PROTOCOL_FB.md) — source of truth before
  changing either side of the USB CDC contract.
- [ROS discovery troubleshooting](network-ros-discovery.md) — VM/miniPC
  discovery and debugging. Laptop access over DDS is historical once the robot
  is isolated; see the next entry.
- [DDS isolation and RViz over SSH](dds-isolation.md) — why the robot's DDS
  graph is closed to the network, the read-only debug bridge, guarded initial
  pose, security, and the S0–S6 switch-over with rollback. Not yet applied on
  the robot.
- [Nav2 turn test](nav2-turn-test.md) — hardware-test procedure; check its
  READY FOR HARDWARE TEST status before relying on the parameters.
- [Nav2 Baseline V1](nav2-baseline-v1.md) — current development/test baseline
  (LiDAR yaw −0.2225, LatchedGoalChecker, 0.20 m/s): definition, run rules,
  expected behaviour, evidence, known limits. Not production-ready.
- [Nav2 smoothness trial](nav2-smooth-trial.md) — historical trial plan and
  offline evidence that led to Baseline V1.
- [RViz / TF / Nav2 debug note](rviz-tf-nav2-debug-note.md) — operator-reported
  observations, lifecycle/planner triage and Docker comparison plan; not a
  verified hardware fix.
- [Camera mounts](cad-sensor-mounts.md) — measured CAD positions.
- [miniPC deployment checklist](phase1-deploy-minipc.md) — operational setup.
- [Native runtime](native-runtime.md) — fresh miniPC provisioning, layered
  bring-up, dependency snapshots and the deferred auto-start policy.
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
