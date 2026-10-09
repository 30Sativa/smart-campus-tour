# Native physical robot runtime

The single physical robot runs its ROS 2 Humble graph directly on Ubuntu 22.04 on the miniPC. There is one owner for STM32, RPLiDAR, EKF, mode manager, map_server/AMCL and Nav2. Docker remains available for CI image builds, laptop debug tools and Gazebo simulation; it is not a second physical startup path.

## Fresh miniPC

Install Ubuntu 22.04 and ROS 2 Humble, then clone this repository onto a Linux filesystem. Do not use a network/shared folder for the colcon workspace.

```bash
cd ~/smart-campus-tour
cp robot/.env.minipc.example robot/.env
# Set ROS_DISCOVERY_SERVER to the local Fast DDS server (normally 127.0.0.1:11811).
bash robot/scripts/install-native
bash robot/ros2_ws/src/orbbec_bringup/scripts/setup_astra_pro.sh  # optional camera
bash robot/scripts/build-native
```

`install-native` resolves checked-in package manifests with `rosdep` and does not source an old workspace. `build-native` is the only supported native build entry point. Camera setup is separate because its udev rules, OpenNI2 and libuvc belong to the host holding the USB cable.

Every terminal that inspects or runs the robot starts with:

```bash
source robot/scripts/source-minipc
```

This loads `.env`, ROS Humble and the workspace overlay explicitly. Nothing is added to `.bashrc`, and no container path such as `/ros2_ws` is assumed.

## Dependency reproducibility

Capture the actual APT/ROS state after provisioning and before hardware tests:

```bash
bash robot/scripts/capture-native-versions
```

This writes a machine-local report under `robot/.native-state/` (ignored by Git) containing Ubuntu, ROS package versions, RMW implementation and the repository revision. `robot/scripts/check-native-versions <reviewed-report>` compares a report against the current host and exits non-zero on drift. Use APT package holds only for a reviewed baseline, through `robot/scripts/hold-native-packages`; never paste a one-off TF2 downgrade into a runbook. The observed TF2 `0.25.23` versus `0.25.20` issue remains an investigation until a baseline report and repeatable test establish which version is required.

## Layered bring-up

Start one launch per terminal and stop it before switching layers:

```bash
# 1. STM32 + URDF + EKF + mode manager
ros2 launch robot_control manual_mode.launch.py \
  port:=${SERIAL_PORT:-/dev/ttyACM0} baudrate:=${BAUDRATE:-115200}

# 2. Add the LiDAR and inspect /scan, /wheel/odom, /odom and /tf
ros2 launch robot_control manual_mapping.launch.py \
  port:=${SERIAL_PORT:-/dev/ttyACM0} lidar_serial_port:=${LIDAR_PORT:-/dev/ttyUSB0}

# 3. On a saved map, LiDAR-only localization and Nav2 (camera is opt-in)
ros2 launch robot_navigation navigation.launch.py \
  map:="$ROBOT_MAP_DIR/campus_map.yaml" enable_camera:=false rviz:=false
```

Give AMCL a 2D Pose Estimate, then inspect lifecycle state, TF freshness and LaserScan rate. Only after this baseline is stable add Astra in a separate camera terminal and restart navigation with `enable_camera:=true`. Finally start person perception with its explicit model path and `camera_enable_color:=true`. Perception is opt-in and is never required for LiDAR-only Nav2.

## Auto-start policy

Do not enable systemd yet. During bring-up, launch commands stay visible so a failed lifecycle transition or stale sensor timestamp is tied to the process that produced it. Once the native baseline passes a sustained hardware test, add one reviewed systemd unit for the already-tested launch command; do not create separate units that can race for the serial device or Nav2 goal ownership.

Docker profiles remain available with `docker compose --profile debug` and `--profile sim`. The compose file intentionally has no `hardware` service.
