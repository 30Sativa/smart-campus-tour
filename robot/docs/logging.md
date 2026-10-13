# Runtime logs and rosbag sessions

This convention applies to the physical MiniPC and to a laptop running debug
tools. Each machine uses its own home directory; a laptop path is not a shared
MiniPC path. Repository paths in this document are relative to the repo root;
`$HOME/amr_logs` is a machine-local data directory, outside Git.

## One root, one directory per session

```text
$HOME/amr_logs/
  README.md                         local copy of this guide
  runs/
    YYYYMMDD_HHMMSS_poi_01_cli_XXXXXX/
      metadata.txt                  start time, host, code revision, ROS transport
      notes.md                      test conditions, exact command, outcome
      ros/                          ROS node and launch-managed log files
      launch.log                    terminal output from the robot launch
      goal.log                      action acceptance, feedback and result
      bag/                          rosbag2 output (created by the recorder)
      bag_record.log                recorder output and subscription notices
      kernel.log                    optional kernel/Wi-Fi evidence
      rviz.log                      optional RViz output on its own host
  latest -> runs/<session>          convenience pointer, not a data directory
  archive/
    before-20261013.tar.gz           historical captures, archived and verified
```

Use a descriptive label such as `poi_01_cli`, `poi_01_rviz`, `static_dds`, or
`stm32_bench`. Use Vietnam time for directory names; record a time with offset
in metadata. The random suffix from `mktemp` prevents same-second collisions.
Do not reuse an old session for a new test. Do not create new runtime captures
under the legacy `$HOME/amr_bags` root or in the source tree. Colcon's generated
workspace log directory remains managed by colcon; this convention does not
move build/install artifacts.

## Prepare the session before starting ROS

On the MiniPC, from the repo root, run this in the launch terminal. It only
creates directories and metadata; it does not launch nodes or send goals.

```bash
source robot/scripts/source-minipc
install -d -m 700 "$HOME/amr_logs/runs" "$HOME/amr_logs/archive"
AMR_RUN_DIR="$(mktemp -d "$HOME/amr_logs/runs/$(TZ=Asia/Ho_Chi_Minh date +%Y%m%d_%H%M%S)_poi_01_cli_XXXXXX")"
export AMR_RUN_DIR
mkdir -p "$AMR_RUN_DIR/ros"
export ROS_LOG_DIR="$AMR_RUN_DIR/ros"
ln -sfnT "$AMR_RUN_DIR" "$HOME/amr_logs/latest"
{
  date -Iseconds
  hostname
  git rev-parse HEAD
  printf 'ROS_DOMAIN_ID=%s\nRMW_IMPLEMENTATION=%s\nROS_DISCOVERY_SERVER=%s\n' \
    "${ROS_DOMAIN_ID:-unset}" "${RMW_IMPLEMENTATION:-unset}" "${ROS_DISCOVERY_SERVER:-unset}"
} > "$AMR_RUN_DIR/metadata.txt"
printf '# Session notes\n\nConditions:\nCommand:\nResult:\n' > "$AMR_RUN_DIR/notes.md"
```

Confirm that `AMR_RUN_DIR` names an existing directory before proceeding.
In each additional terminal for the **same** session, source the ROS environment,
then resolve the pointer once and keep that concrete path:

```bash
source robot/scripts/source-minipc
AMR_RUN_DIR="$(readlink -e "$HOME/amr_logs/latest")"
export AMR_RUN_DIR
export ROS_LOG_DIR="$AMR_RUN_DIR/ros"
```

If another session starts later, do not resolve `latest` again in a terminal
that belongs to the previous session. For simultaneous tests, pass the concrete
session path explicitly rather than relying on this shared convenience pointer.

## Capture the evidence for the authorized test

Set `ROS_LOG_DIR` **before** launching each process. Already-running processes
keep their previous location; changing the variable does not move their logs.
Add `2>&1 | tee "$AMR_RUN_DIR/launch.log"` to the approved launch command, and
`2>&1 | tee "$AMR_RUN_DIR/goal.log"` to the approved goal command. This guide
does not authorize a physical launch, goal, initial-pose change or motor test.
When checking a piped command's exit status, use Bash `PIPESTATUS[0]` immediately
after it finishes; `tee` succeeding is not evidence that the ROS command did.

For a Nav2/POI investigation, start the recorder before the approved goal:

```bash
ROS_SUPER_CLIENT=TRUE ros2 bag record --include-hidden-topics -o "$AMR_RUN_DIR/bag" \
  /rosout /tf /tf_static \
  /robot_01/scan_raw /robot_01/scan /robot_01/odom /robot_01/wheel/odom \
  /robot_01/amcl_pose /robot_01/plan \
  /robot_01/local_costmap/costmap /robot_01/local_costmap/costmap_updates \
  /robot_01/global_costmap/costmap /robot_01/global_costmap/costmap_updates \
  /robot_01/local_costmap/published_footprint \
  /robot_01/cmd_vel_ctrl /robot_01/cmd_vel_nav /robot_01/cmd_vel \
  /robot_01/emergency_stop_state /robot_01/robot_mode_state \
  /robot_01/navigate_to_pose/_action/status \
  /robot_01/navigate_to_pose/_action/feedback \
  2>&1 | tee "$AMR_RUN_DIR/bag_record.log"
```

For a heading/odometry investigation (EKF vs. wheel vs. BNO085 vs. AMCL),
also record the raw IMU, the wheel joint states and diagnostics; the POI list
above does not include them:

```bash
ROS_SUPER_CLIENT=TRUE ros2 bag record --include-hidden-topics -o "$AMR_RUN_DIR/bag" \
  /rosout /tf /tf_static /diagnostics \
  /robot_01/imu/data /robot_01/wheel/odom /robot_01/joint_states \
  /robot_01/odom /robot_01/amcl_pose /robot_01/initialpose \
  /robot_01/scan /robot_01/cmd_vel_nav /robot_01/cmd_vel \
  /robot_01/robot_mode_state /robot_01/emergency_stop_state \
  2>&1 | tee "$AMR_RUN_DIR/bag_record.log"
```

`imu/data` is published only when yaw or its accuracy changes, so its rate
is low while the robot is still; measure its rate while turning. Note in
`notes.md` which EKF file (`ekf_params_file`) the launch used.

Record exactly which topics were received. Missing inactive/optional topics do
not prove a DDS failure. CLI transport flags on this recorder do not change
the environment of an existing navigation stack. Stop the recorder with Ctrl+C
and wait for it to finish writing metadata before inspecting or archiving:

```bash
ros2 bag info "$AMR_RUN_DIR/bag"
```

Do not blindly record every camera stream: it can consume disk/network and alter
the system under investigation. A bag without costmaps cannot reconstruct the
exact obstacle grid that blocked a particular motion. For TF/network failures,
include the kernel event window and scan/TF receive times as well as header
stamps. Note whether RViz was on, the map, target position/orientation, nearby
obstacles and the outcome. Never put passwords, tokens or a full environment
dump in metadata. Preserve the user's hardware safety conditions.

## Cleanup and AI handoff

- Tell the operator the concrete host and session path being investigated.
- Keep raw captures and analysis for that session together; distinguish measured
  evidence from hypotheses in `notes.md`.
- Never auto-delete or rotate an active session. Inspect open files/processes
  and confirm recording has stopped before cleanup.
- On authorized cleanup, archive evidence outside `runs`, verify the archive
  against the originals, then remove only the agreed old captures. Do not
  delete maps, calibration, source, firmware, or build/install spaces as logs.
- Do not run cleanup or a hardware launch merely because an AI reads this guide.
- `robot/.native-state` remains for ignored provisioning reports and local
  offline development artifacts; it is not a second runtime log root.

ROS log location reference: [ROS 2 Humble logging documentation](https://docs.ros.org/en/humble/Concepts/Intermediate/About-Logging.html).
