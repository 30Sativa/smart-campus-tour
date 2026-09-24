# AGENTS.md — `robot/`

Robot-side software for CampusTour DT-AMR: ROS 2 Humble on the miniPC plus
STM32G431 motor firmware. Read the repo-root `AGENTS.md` first for the shared
rules; this file only covers what is specific to `robot/`.

---

## 1. Layout

```
robot/
├── ros2_ws/src/          ROS 2 packages (see robot/README.md for the table)
├── firmware/stm32/       STM32G431 motor controller firmware (STM32CubeIDE)
├── docker/               container entrypoint
├── tools/                PowerShell motor bring-up / debug scripts
├── docs/                 phase docs (phase1..phase4)
├── scripts/verify        this folder's verification gate
├── scripts/source-minipc `source` it on the miniPC HOST for native ROS procs
├── Dockerfile            builds the ROS 2 image (build context = robot/)
└── docker-compose.yml    what the miniPC runs
```

Architecture, package roles, sensor dataflow and run commands: **`robot/README.md`**.
Serial contract between the STM32 firmware and `stm32_bridge`:
**`robot/docs/PROTOCOL_FB.md`** — single source of truth, read it before
touching either side of the wire.
Per-phase design, close-out criteria and error tables: **`robot/docs/phase*.md`**.

---

## 2. Architecture Rules

The sensor hierarchy is a deliberate decision, not an accident
(see `docs/decisions/0001-lidar-primary-astra-supplementary.md`):

```
RPLiDAR A3M1        -> /scan                  -> local + global costmap, AMCL, SLAM
STM32 STEP counts   -> /wheel/odom -\
BNO085 orientation  -> /imu/data   -> EKF -> /odom + odom -> base_footprint TF
Astra Pro (depth)   -> /camera/depth/points   -> LOCAL costmap ONLY
Astra Pro (RGB)     -> person detection       -> Nav2 speed limit
```

- The Astra Pro is a **supplementary** obstacle sensor. Do not make it a
  localization input, do not feed it into the global costmap, do not make Nav2
  depend on it being present.
- The STM32 owns real-time stepping. ROS 2 sends wheel-speed commands over USB
  CDC serial and owns nothing below that line.
- `robot_control` is the mode manager / `cmd_vel` mux. New motion sources go
  through it, not directly onto `/cmd_vel`.
- `robot_perception` is WP3 person perception for navigation behaviour. It is
  not the WP4 AI tour-guide assistant and must not contain STT, LLM/dialogue,
  campus knowledge or TTS orchestration.
- A future robot-side tour-guide adapter stays thin: ROS stop/task events and
  audio I/O only. The conversational pipeline belongs in `ai-assistant/`; its
  cross-folder contract must be recorded in `docs/architecture.md` first.
- The **production fleet bridge** for the physical robot lives here (planned:
  `robot/ros2_ws/src/fleet_bridge/`), not in `backend/`. Its responsibility
  is `Backend fleet contract ↔ ROS navigation/state`. It is a translator
  only — ROS 2 on one side, the backend's still-TBD external transport on the
  other. It must
  not contain booking rules, scheduling, or robot-assignment logic; those are
  backend concerns (`docs/architecture.md` §3). The robot executes one leg at
  a time; it never receives a full tour to orchestrate. Bridge commands go
  through the robot navigation boundary, never straight onto `/cmd_vel`.
  The existing `gazebo_preview_bridge` is a separate development-only path:
  Gazebo → local SimulationPreview backend. It is not physical-robot
  telemetry or the production fleet transport, and the future production
  package must not depend on Gazebo or simulation.
- Production POI target poses come from backend-managed route/POI data and are
  meaningful only in their map/frame/context. The current
  `bus_manager/config/bus_stops.yaml` remains a local/manual-development
  fallback or test fixture, not the production source of truth. The ROS
  migration needed for the per-leg external contract is a separate task.
- Launch files must keep RViz **off by default** (`rviz:=true` to enable) so a
  headless miniPC does not hang.
- Fast DDS Discovery Server can make CLI graph introspection (`ros2 topic list`,
  `ros2 node info`) temporarily incomplete even while topics carry data. Follow
  the troubleshooting note in `docs/network-ros-discovery.md` before declaring
  a node or endpoint unavailable.

<!-- TODO(Duy): thêm rule kiến trúc mới ở đây mỗi khi agent làm sai một lần. Đây là chỗ harness "học". -->

---

## 3. Development Rules

- Python nodes follow the existing package layout: `package_name/package_name/`
  for source, `test/` for tests, `config/` for YAML params, `launch/` for
  launch files.
- Parameters go in `config/*.yaml`. Do not hardcode a value in a node that an
  existing config file already exposes.
- New topics/actions/messages that another work package consumes must be added
  to `bus_interfaces` and recorded in `docs/architecture.md`.
- Do not vendor third-party sources anywhere except
  `robot/ros2_ws/src/third_party/` (gitignored by design).
- Never edit anything under `build/`, `install/`, or `log/`.

---

## 4. Verification

```bash
robot/scripts/verify          # tier 1, plus tier 2 if a ROS 2 env is sourced
```

The gate has three tiers. **Only tiers 1 and 2 are automated.**

### Tier 1 — static (runs anywhere, no ROS needed)

- Python syntax compile across `robot/ros2_ws/src`
- `ruff` lint if installed
- YAML parse of every `config/` and `launch/` file
- `xacro` parse of the URDF if `xacro` is available
- guard: no `build/`, `install/`, `log/`, `__pycache__`, or firmware `Debug/`
  build output staged in git

### Tier 2 — build & test (needs a sourced ROS 2 Humble environment)

- `colcon build`
- `colcon test` + `colcon test-result --verbose`

Skipped with a clear SKIPPED notice when ROS 2 is not sourced. **A skipped
tier 2 is not a pass** — say so when reporting.

### Tier 3 — behaviour (a human runs this, an agent cannot)

Anything only observable in Gazebo, RViz, or on the real robot: navigation,
TF tree, costmap contribution, obstacle avoidance, motor response, serial
link. The close-out criteria for each are in `robot/docs/phase*.md`.

An agent changing navigation, TF, costmaps, serial, or firmware reports
**READY FOR HARDWARE TEST** (format in the root `AGENTS.md`), never DONE.

---

## 5. Hard Constraints — STM32 & Firmware

These exist because getting them wrong destroys hardware or wastes a lab day.

- **Do not change the STM32 serial protocol or motor-control logic** unless a
  task explicitly asks for it.
- **Do not edit `robot/firmware/stm32/motor_controller/Core/`, `Drivers/`, or
  `.ioc`-generated files by hand.** They are regenerated by STM32CubeIDE and
  hand edits are silently lost. Change the `.ioc` and regenerate instead.
- **Do not edit `robot/firmware/stm32/motor_controller/Debug/makefile`.** CI patches
  the Windows absolute linker-script path inside that file at build time; a
  hand edit breaks `.github/workflows/stm32-build.yml`.
- **Flashing is manual, over ST-Link, by a human.** CI must never flash. The
  miniPC must never auto-flash. There is no CAN bootloader and adding one is
  out of scope.
  See `docs/decisions/0002-manual-stlink-flash-no-can-bootloader.md`.
- **Do not change the serial defaults** `SERIAL_PORT=/dev/ttyACM0`,
  `BAUDRATE=115200`, or `LIDAR_PORT=/dev/ttyUSB0` — the miniPC `.env` and the
  compose file depend on them.
- The Docker build context is `robot/`. Paths inside `Dockerfile` are relative
  to `robot/`, not to the repo root.
- The drivetrain, navigation, and main ROS runtime deploy as a Docker image:
  build in CI, push to DockerHub, pull on the miniPC. There is no normal path
  to build the full ROS stack on the naked miniPC host. The Astra Pro's native
  host bring-up is a hardware exception for the camera package only; it does
  not authorize duplicate STM32, Nav2, or robot-control nodes outside the
  container.
  See `docs/decisions/0003-deploy-robot-via-docker-image.md`.
- **Exception, TEST phase only:** the `hardware` service currently bind-mounts
  `./ros2_ws/src:/ros2_ws/src` so a fix can be built in the container without a
  CI round trip. This is temporary and marked as such in `docker-compose.yml`.
  Remove the mount before production so what runs matches the image. This
  container overlay exception is separate from the native Astra Pro camera
  bring-up described in ADR-0003.

<!-- TODO(Duy): thêm constraint phần cứng khác nếu có (giới hạn dòng motor, tốc độ tối đa, vùng cấm...). -->
