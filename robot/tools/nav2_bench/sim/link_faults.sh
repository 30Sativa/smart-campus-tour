#!/bin/bash
# link_faults.sh [--no-guards]   -- STM32 link faults against real Nav2, offline, domain 86.
# Needs a built workspace (colcon build) next to this tool. See link_faults.py.
S=$(cd "$(dirname "$0")" && pwd); ROBOT=$(cd "$S/../../.." && pwd); SRC=$ROBOT/ros2_ws/src
B=${NAV2_BENCH_OUT:-$HOME/amr_logs/nav2_bench}
unset ROS_DISCOVERY_SERVER ROS_SUPER_CLIENT FASTRTPS_DEFAULT_PROFILES_FILE FASTDDS_DEFAULT_PROFILES_FILE ROS_STATIC_PEERS
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp ROS_DOMAIN_ID=86 ROS_LOCALHOST_ONLY=1
set +u; source /opt/ros/humble/setup.bash; source "$ROBOT/ros2_ws/install/setup.bash"
tag=$([ "$1" = --no-guards ] && echo no_guards || echo guards)
export LINK_FAULTS_OUT=$B/link_faults/$tag LINK_FAULTS_SRC=$SRC LINK_FAULTS_SIM=$S
export NAVSIM_PARAMS=$SRC/robot_control/config/nav2_params_v2.yaml NAVSIM_SEED=1
export PYTHONPATH=$S:$SRC/stm32_bridge:$SRC/robot_control:$PYTHONPATH
rm -rf "$LINK_FAULTS_OUT"; mkdir -p "$LINK_FAULTS_OUT"; export ROS_LOG_DIR=$LINK_FAULTS_OUT/roslog
exec python3 -u "$S/link_faults.py" "$@"
