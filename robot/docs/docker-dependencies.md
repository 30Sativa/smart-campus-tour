# ROS 2 dependencies, image architecture and Ubuntu verification

## Review and dependency classification

The first multi-target patch separated rqt/PlotJuggler/Gazebo but still made
hardware inherit `ros:humble-ros-base`, build tools, test dependencies, source,
build/install/log directories and rosdep caches. The upstream ros-base image
itself installs build-essential, Git, colcon, rosdep and vcstool; ros-core also
installs a broad metapackage containing ament test/lint/generator packages.
Removing packages in a later layer would not remove those original bytes.

| Classification | Dependencies / evidence | Current location |
|---|---|---|
| Build-time/development | build-essential/compiler, CMake, Git, colcon, rosdep, pip, full build/test manifest dependencies | `dependencies`, `builder`, debug/sim |
| Common runtime | Standard ROS CLI verbs via ros2cli-common-extensions, Fast DDS RMW and rosbag2 including record/play and default storage plugins | `base` |
| Hardware runtime | STM32/serial, LiDAR, Nav2, SLAM, EKF, topic relays, robot descriptions/launch/config, Python/C++ bus interfaces, perception/OpenCV | `runtime` apt list + complete hardware install space |
| Perception runtime | NumPy 1.26.4, OpenVINO 2024.6.0, telemetry 2024.1.0 | Pinned in `dependencies`, complete local wheels copied to hardware; also available in debug/sim development |
| Debug only | RViz executable, rqt graph/topic/plot/reconfigure/service-caller, PlotJuggler ROS plugins, compressed transport, joint-state GUI | `debug` |
| Simulation only | Gazebo ROS/messages, Gazebo ros2_control, controller manager, diff-drive/joint-state controllers; RViz executable for simulation | `sim`, resolved from full manifests |
| Native camera host | Astra driver, OpenNI2/libuvc/udev and the host RGB compressor's compressed transport | MiniPC host, outside Docker |

`robot_control/launch/manual_mode.launch.py` executes xacro with
`use_sim:=false use_ros2_control:=false`. **xacro remains hardware runtime**.
The real mapping/exploration/navigation launches default `rviz:=false` and
resolve RViz executables only when the optional Node runs. The local RViz
configuration resources stay in install space; `ros-humble-rviz2` is omitted
from hardware and restored in debug/sim. Native manifests remain unchanged,
so native camera/display workflows keep their complete dependency declarations.

The container profile filters only these optional manifest keys:

```text
gazebo_ros gazebo_ros2_control gazebo_msgs controller_manager
diff_drive_controller joint_state_broadcaster joint_state_publisher_gui rviz2
```

## Remaining upstream dependency limitations

This is not a promise of zero CMake, headers, testing libraries or Qt bytes.
The checked ROS Jammy binary index includes these **Debian Depends** chains:

- `nav2_bringup -> navigation2 -> nav2_rviz_plugins -> rviz_common`: Qt/RViz
  libraries remain even though the RViz executable is absent. The robot launch
  uses nav2_bringup resources; replacing that upstream package is out of scope.
- Fast DDS RMW and ROSIDL runtime/type support depend on rosidl/ament CMake
  packages and Python development headers. SLAM also depends on ROSIDL generators.
- `nav2_map_server -> launch_testing -> python3-pytest`, and ROSIDL type support
  depends on ament gtest/pytest packages. These transitive packages are retained;
  the project's explicit test dependency set is not installed into hardware.
- `ros2launch -> ros2pkg -> ament_copyright -> ament_lint` remains through the
  required launch/package CLI. The broad ament-lint-auto/common set is excluded.
- EKF depends on Eigen/Boost/GeographicLib headers; Nav2 waypoint follower
  depends on cv_bridge, whose binary package depends on OpenCV development files.
- `nav2_smac_planner -> ompl -> libflann-dev -> libhdf5-mpi-dev ->
  libhdf5-openmpi-dev -> libopenmpi-dev -> gfortran-11 -> gcc-11`.
- `slam_toolbox -> libboost-all-dev -> libboost-mpi-dev ->
  libboost-mpi1.74-dev -> mpi-default-dev -> libopenmpi-dev -> gfortran-11 -> gcc-11`.
  GCC/gfortran/OpenMPI may therefore remain in hardware. Hardware does not
  intentionally install the development toolchain, although upstream runtime
  dependency closure may contain compiler packages. The guard allows gcc-N;
  it does not remove required Nav2, SLAM or MPI packages to satisfy exclusions.

These are real package constraints, not proof that robot nodes invoke a
compiler/test runner. Do not wildcard-purge `*-dev`, CMake, test packages or
RViz libraries and leave a broken apt graph. Further reduction requires a
separate upstream-packaging or launch-dependency change. The hardware build
guard rejects g++/versioned g++, build-essential, Git, colcon, rosdep, RViz executable,
rqt, PlotJuggler, Gazebo and simulation controllers if they re-enter the image.

## Builder/runtime separation and cache

`robot/Dockerfile` now uses:

```text
base (Ubuntu 22.04 + common ROS CLI/bag/Fast DDS binaries)
  -> dependencies (build/test deps + manifests + pinned perception wheels)
       -> builder (source + normal colcon build)
       -> development-builder (source + colcon build --symlink-install)
       -> debug (GUI deps first, then copy full development workspace)
       -> sim   (sim deps first, then copy full development workspace)
  -> runtime (exec/depend apt packages resolved from manifests)
       -> hardware (copy full install space + pinned Python runtime)
```

The ROS repository is configured with the same official apt-source 1.2.0
Jammy package/checksum used by the upstream ROS image. Bootstrap curl is
removed in the same layer. No apt upgrade is run. All explicit apt installs
disable recommends and remove apt lists in the same layer; a shared apt config
also disables recommends/suggests for rosdep's apt invocations. Pip disables
its download cache. Build-only `DEBIAN_FRONTEND=noninteractive` and `TZ=Etc/UTC`
make tzdata setup deterministic; neither is added as a runtime ENV or changes
application/business timezone configuration. Pinned OpenVINO/NumPy wheels are
installed before manifest COPY so manifest edits reuse their download layer.

`ros2cli-common-extensions` restores run/topic/node/param/service/action/
lifecycle/interface (and the standard remaining Humble verbs), without using
the full ros-base image. Its `ros2cli` dependency declares `python3-packaging`
as a runtime dependency, satisfying OpenVINO's packaging import through apt;
no duplicate pip packaging install is added. The hardware smoke test imports
packaging/OpenVINO explicitly. See the [upstream ros2cli manifest](https://github.com/ros2/ros2cli/blob/humble/ros2cli/package.xml).

`robot/docker/runtime_dependencies.py` uses rosdep's exec dependency selection
(including generic `depend` entries), skips only the optional keys above, then
resolves the remaining keys to a sorted apt package list. It removes sourced
builder overlay paths from the resolver environment so already-installed ROS
packages are not accidentally omitted. Unknown keys, non-apt installers and
invalid/empty output fail rather than silently dropping dependencies.
Rosdep is not shipped in hardware; apt installs the generated list with its
normal dependency closure. There is no handwritten duplicate runtime apt list.

The builder uses normal `colcon build`, not symlink-install. Hardware copies
the **whole** install space: Python modules, generated C/C++ interface support,
libraries, ament index, package/plugin metadata, launch/config, URDF/xacro and
meshes. It copies complete locally installed NumPy/OpenVINO wheel directories
to the same Python 3.10 site-packages path; no inference feature is disabled.
Hardware does not copy source/build/log, pip executables or rosdep caches.

The development-builder starts with symlink-install, avoiding Python install
directory conflicts when switching an already populated normal install space.
Debug/sim copy that entire workspace and retain the build tools, so
`cd /ros2_ws && colcon build --symlink-install` remains supported with their
existing source bind mounts. GUI/Gazebo apt layers precede that workspace copy;
ordinary source edits invalidate the build/workspace layer, not dependency
installation. All targets share metadata/build cache; existing CI's GHA cache
remains usable. A manifest change correctly invalidates dependency resolution.

`hardware` remains the last/default stage because current CI omits `--target`;
it is a CI/reference image, not the physical runtime. The miniPC builds natively.
Debug/sim retain source mounts. Model files stay external to Docker. `robot/.dockerignore` excludes models, recordings,
old build/install/log, secrets and caches without dropping source/config/resources.

## Environment and native camera host

The existing entrypoint and single `/root/.bashrc` auto-source order remain:
ROS Humble first, then `/ros2_ws/install/setup.bash`. After a development rebuild,
source the overlay again or exit/re-enter. No parent-shell environment hack is
added. `.env` continues to own ROS domain/discovery/RMW/localhost settings;
networking, USB ownership, OpenGL settings and camera behavior do not change.

The retained runbook records manual compressed-transport installation in
sections 14/25C. Container installation is now baked into debug. On the native
MiniPC camera host, keep the existing Astra setup procedure and install once:

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends ros-humble-compressed-image-transport
cd ~/smart-campus-tour/robot
set -a
source .env
set +a
source /opt/ros/humble/setup.bash
source ~/smart-campus-tour/robot/ros2_ws/install/setup.bash
```

`source scripts/source-minipc` performs the equivalent setup with checkout-relative
paths. Exporting `.env` is not dependency installation. The camera-only native
overlay exception remains; do not deploy drivetrain/Nav2 on the naked host.

## Exact Ubuntu build and verification commands

Run on the native Ubuntu development machine, from `robot/`. These are user
verification commands, not commands executed in the static optimization task.

```bash
cd ~/smart-campus-tour/robot
docker build -t robot-ros2:local .
# Optional explicit-target comparison:
# docker build --target hardware -t robot-ros2:hardware-test .
docker compose --env-file .env.vmware.example --profile debug build ros2-debug
docker compose --env-file .env.sim.example --profile sim build ros2-sim
docker image inspect --format '{{.RepoTags}} {{.Size}} bytes' robot-ros2:local robot-ros2:debug robot-ros2:sim
```

Check hardware exclusion, copied resources/native interfaces and perception:

```bash
docker run --rm -i robot-ros2:local bash <<'CHECK'
set -euo pipefail
packages="$(dpkg-query -W -f='${binary:Package}\n')"
if grep -E '^(ros-humble-(rqt|plotjuggler|gazebo|rviz2|controller-manager|diff-drive-controller|joint-state-broadcaster|joint-state-publisher-gui|ament-lint-(auto|common))(-|$)|gazebo[0-9]*$|libgazebo|build-essential$|g\+\+(-[0-9]+)?$|git$|python3-(colcon|rosdep))' <<< "$packages"; then exit 1; fi
echo 'Upstream GCC/gfortran/OpenMPI closure (informational, not exclusions):'
grep -E '^(gcc(-[0-9]+)?|gfortran(-[0-9]+)?|libopenmpi|openmpi|mpi-default)' <<< "$packages" || true
for verb in run topic node param service action lifecycle interface; do ros2 "$verb" -h; done
test ! -d /ros2_ws/src
test ! -d /ros2_ws/build
test ! -d /ros2_ws/log
for pkg in robot_control robot_navigation robot_description robot_perception bus_interfaces stm32_bridge rplidar_ros nav2_bringup; do ros2 pkg prefix "$pkg"; done
xacro "$(ros2 pkg prefix robot_description)/share/robot_description/urdf/robot.urdf.xacro" use_sim:=false use_ros2_control:=false > /tmp/robot-hardware.urdf
python3 - <<'PY'
import openvino, numpy, cv2, packaging
from rosidl_generator_py import import_type_support
import_type_support('bus_interfaces')
print(openvino.__version__, numpy.__version__, cv2.__version__)
print('packaging', packaging.__version__)
print(openvino.Core().available_devices)
PY
ros2 bag record --help
ros2 bag play --help
CHECK
```

Check debug tools/plugins, simulation packages and fresh-shell auto-source:

```bash
docker run --rm -e QT_QPA_PLATFORM=offscreen robot-ros2:debug bash -lc 'ros2 bag record --help && ros2 bag play --help && rqt --help && ros2 pkg executables plotjuggler && ros2 pkg prefix plotjuggler_ros'
docker run --rm robot-ros2:debug bash -lc 'ros2 run image_transport list_transports | grep -F image_transport/compressed'
docker run --rm robot-ros2:sim bash -lc 'ros2 pkg prefix gazebo_ros && ros2 pkg prefix gazebo_ros2_control && ros2 pkg prefix controller_manager && ros2 pkg prefix diff_drive_controller && ros2 pkg prefix simulation && ros2 pkg prefix rviz2'
for image in robot-ros2:local robot-ros2:debug robot-ros2:sim; do
  docker run --rm "$image" bash -ic 'echo "$ROS_DISTRO"; command -v ros2; ros2 pkg prefix robot_control'
done
```

Expected: Humble, a ROS executable and overlay prefix in fresh shells;
`image_transport/compressed`; `plotjuggler plotjuggler` executable resolution.
The binary archive audit confirmed `libDataLoadROS2.so`/`libDataStreamROS2.so`
and the executable used by `ros2 run plotjuggler plotjuggler`.

Smoke test RViz, close it, then smoke test the standalone Gazebo/Nav2 launch
(Ctrl-C when finished). These containers have no hardware devices and use the
existing standalone-sim env template and GUI options:

```bash
xhost +local:docker
docker run --rm -it --env-file .env.sim.example -e QT_X11_NO_MITSHM=1 -v /tmp/.X11-unix:/tmp/.X11-unix:rw robot-ros2:debug rviz2
docker run --rm -it --env-file .env.sim.example -e QT_X11_NO_MITSHM=1 -v /tmp/.X11-unix:/tmp/.X11-unix:rw robot-ros2:sim ros2 launch robot_navigation sim_navigation.launch.py rviz:=true
xhost -local:docker
```

For a live debug session use existing Compose/environment setup. Record with
`ros2 bag record -o /maps/nav-debug /robot_01/scan /robot_01/odom /tf /tf_static`;
stop with Ctrl-C. `/maps` is the existing persistent debug mount. Copy the bag
into isolated sim as `/tmp/nav-debug`, then `ros2 bag play /tmp/nav-debug`.

## Static verification status — 2026-10-05

The optimization request explicitly excludes Docker builds/runtime tests here.
Run static checks from the repo root:

```bash
git diff --check
bash scripts/verify robot
```

Contract tests cover dependency/artifact isolation, resolver parsing/filtering,
cache ordering, source/model mounts, CI default target and environment setup.
Executed: `bash scripts/verify robot` exited 0, including 11 image/dependency
contract tests, Python/YAML syntax and the build-output guard. Compose config
for hardware/debug/sim and `git diff --check` passed. Bash syntax passed for
entrypoint/source/verify scripts and all Dockerfile RUN bodies and documented
Bash blocks. Ruff/xacro and Tier 2 colcon were skipped because their tools and
ROS Humble are unavailable here; these are not reported as passed.

**NOT RUNTIME TESTED — USER WILL VERIFY ON UBUNTU.** Hardware/debug/sim sizes
remain UNMEASURED. Expected savings are builder files/tools/caches and the RViz
executable; unavoidable upstream dependency closures limit the reduction.
PlotJuggler ROS pulls Boost/Qt development packages but stays debug-only.
No numerical MB/build-time savings are claimed. Apt/rosdep data are not snapshot
pinned; deploy an immutable image tag/digest for repeatable comparisons.
No VMware documentation migration, commit or push belongs to this task.
