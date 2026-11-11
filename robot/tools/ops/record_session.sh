#!/usr/bin/env bash
# record_session.sh start|stop <session-dir>
#
# start: one `ros2 bag record` of the topics every workflow analysis needs, into
#        <session-dir>/bag, in its own process group (pgid in <session-dir>/rec_bag.pgid).
# stop:  SIGINT to that group, wait up to 20 s for bag/metadata.yaml, TERM only after that.
# Read a bag only after `stop` reports it closed. The topic list is the one used for the
# 19/10-02/11 sessions (~/amr_logs/tools_r3s5/rec_start.sh) plus the link-safety state.
set -u
cmd=${1:-}; dir=${2:-}
[[ -n "$cmd" && -n "$dir" ]] || { echo "usage: record_session.sh start|stop <session-dir>" >&2; exit 2; }
ns=${ROBOT_NS:-/robot_01}
TOPICS=(/rosout /tf /tf_static /diagnostics
  $ns/scan_raw $ns/scan $ns/odom $ns/wheel/odom $ns/imu/data
  $ns/amcl_pose $ns/initialpose $ns/plan $ns/map
  $ns/local_costmap/costmap $ns/local_costmap/costmap_updates
  $ns/global_costmap/costmap $ns/global_costmap/costmap_updates
  $ns/local_costmap/published_footprint
  $ns/cmd_vel_manual $ns/cmd_vel_ctrl $ns/cmd_vel_nav $ns/cmd_vel
  $ns/emergency_stop_state $ns/robot_mode_state $ns/motion_gate_state $ns/stm32_link_ok
  $ns/navigate_to_pose/_action/status $ns/navigate_to_pose/_action/feedback)
case $cmd in
  start)
    [[ -e "$dir/bag" ]] && { echo "REFUSED: $dir/bag exists (one new directory per session)" >&2; exit 2; }
    mkdir -p "$dir"
    # Under the S3 Discovery Server a recorder must be a super client to see every publisher.
    [[ -n "${ROS_DISCOVERY_SERVER:-}" ]] && export ROS_SUPER_CLIENT=TRUE
    export ROS_LOG_DIR="$dir/ros_bag"
    setsid bash -c 'echo $$ > "$0"; exec "$@"' "$dir/rec_bag.pgid" \
      ros2 bag record --include-hidden-topics -o "$dir/bag" "${TOPICS[@]}" > "$dir/rec_bag.log" 2>&1 &
    sleep 3
    g=$(cat "$dir/rec_bag.pgid" 2>/dev/null || true)
    if [[ -n "$g" ]] && kill -0 -- "-$g" 2>/dev/null; then echo "recording: $dir/bag (pgid $g)"; else echo "DEAD: see $dir/rec_bag.log" >&2; exit 1; fi
    ;;
  stop)
    f="$dir/rec_bag.pgid"; [[ -f "$f" ]] || { echo "no recorder pgid in $dir" >&2; exit 2; }
    g=$(cat "$f"); kill -INT -- "-$g" 2>/dev/null
    for _ in $(seq 40); do kill -0 -- "-$g" 2>/dev/null || break; sleep 0.5; done
    kill -0 -- "-$g" 2>/dev/null && { echo "recorder still alive after 20 s, TERM"; kill -TERM -- "-$g"; }
    if [[ -f "$dir/bag/metadata.yaml" ]]; then echo "bag closed (metadata.yaml present)"; else echo "WARNING: bag/metadata.yaml missing" >&2; exit 1; fi
    ;;
  *) echo "usage: record_session.sh start|stop <session-dir>" >&2; exit 2;;
esac
