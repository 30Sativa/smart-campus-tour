#!/usr/bin/env bash
# Clean Humble environment, private ROS domain 89 (88 is used by tools_analysis replays), localhost only: never on the robot's graph.
# usage: run_bootstrap_replay.sh BAG MAP_YAML [pose_bootstrap_replay.py options]
here=$(dirname "$(readlink -f "$0")")
exec env -i HOME="$HOME" PATH=/usr/bin:/bin LANG=C.UTF-8 ROS_DOMAIN_ID=89 ROS_LOCALHOST_ONLY=1 \
  /bin/bash -c 'source /opt/ros/humble/setup.bash && exec python3 "$0" "$@"' "$here/pose_bootstrap_replay.py" "$@"
