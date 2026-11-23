#!/bin/bash
# sonar_run.sh <config> <scenario> [seed]  -- one offline sonar run (real Nav2 V3) in domain 88
#   config  : off | legacy | shadow | enforce   (README.md)
#   scenario: clean | low_front | low_turn | low_turn_removed | low_turn_gone_early | noise | silent | cancel
# Output: $NAV2_BENCH_OUT/sonar/<config>_<scenario>_s<seed>/ (bot.npy sonar.npy goal.json nav.log ...)
# Needs: this worktree built (colcon build --packages-select stm32_bridge robot_navigation robot_control)
# over a runtime overlay that has robot_nav_plugins (SONAR_UNDERLAY, default the 7a3ef41ef7 V3 runtime).
S=$(cd "$(dirname "$0")" && pwd); WS=$(cd "$S/../../../../ros2_ws" && pwd)
B=${NAV2_BENCH_OUT:-$HOME/amr_logs/nav2_bench}/sonar; mkdir -p "$B"
cfg=$1 scen=$2 seed=${3:-1}
unset ROS_DISCOVERY_SERVER ROS_SUPER_CLIENT FASTRTPS_DEFAULT_PROFILES_FILE FASTDDS_DEFAULT_PROFILES_FILE ROS_STATIC_PEERS
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp ROS_DOMAIN_ID=88 ROS_LOCALHOST_ONLY=1
set +u; source /opt/ros/humble/setup.bash; source "${SONAR_UNDERLAY:-$HOME/.cache/sct-runtime/7a3ef41ef7/install}/setup.bash"
source "$WS/install/setup.bash"
# never beside a live robot stack or a build (the J5005 has 4 cores; results would be unfair)
for p in $(pgrep -f lib/nav2_controller/controller_server); do
  tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -qx ROS_DOMAIN_ID=88 || \
    { echo "ABORT: controller_server $p outside domain 88 is running (robot stack?)"; exit 3; }
done
pgrep -x "colcon|cc1plus|ffmpeg|scrcpy" >/dev/null && { echo "ABORT: external load running"; exit 3; }
R=$B/${cfg}_${scen}_s${seed}; rm -rf "$R"; mkdir -p "$R/roslog"; export ROS_LOG_DIR=$R/roslog
d88() { for p in $(ps -u $(id -u) -o pid=); do [ -r /proc/$p/environ ] || continue; tr "\0" "\n" < /proc/$p/environ 2>/dev/null | grep -qx "ROS_DOMAIN_ID=88" && [ "$p" != "$$" ] && [ "$p" != "$BASHPID" ] && echo $p; done; }
left=$(d88); [ -n "$left" ] && { echo "ABORT: domain-88 processes still running: $left"; exit 3; }

python3 "$S/sonar_world.py" "$R" > /dev/null
V3=$WS/src/robot_control/config/nav2_params_v3.yaml
export NAVSIM_MAP=$R/sonar_world.yaml NAVSIM_SEED=$seed NAVSIM_NOISE=${NAVSIM_NOISE:-0.01,0.3} NAVSIM_AR=0.95
export NAVSIM_START="0.0,0.0,0" NAVSIM_OUT=$R/bot.npy NAVSIM_SCAN_TOPIC=/robot_01/scan_map NAVSIM_SONAR_OUT=$R/sonar.npy
GOAL="6.8,6.0,1.5708"
case $cfg in
  off)     export NAVSIM_PARAMS=$V3 NAVSIM_SONAR_MODE=off NAVSIM_SONAR_MAX=2.0;;
  legacy)  python3 "$S/legacy_params.py" "$V3" "$R/legacy.yaml" > /dev/null
           export NAVSIM_PARAMS=$R/legacy.yaml NAVSIM_SONAR_MODE=off NAVSIM_SONAR_MAX=2.0;;
  shadow)  export NAVSIM_PARAMS=$V3 NAVSIM_SONAR_MODE=shadow NAVSIM_SONAR_MAX=6.0;;
  enforce) export NAVSIM_PARAMS=$V3 NAVSIM_SONAR_MODE=enforce NAVSIM_SONAR_MAX=6.0;;
  *) echo "unknown config $cfg"; exit 2;;
esac
LOW_TURN=${LOW_TURN:-6.25,0.65,0.10}       # inner corner of the L, swept by the left side in the turn (README.md)
case $scen in
  clean) ;;
  low_front)           export NAVSIM_SONAR_OBST="low,3.0,0.0,0.10";;
  low_turn)            export NAVSIM_SONAR_OBST="low,$LOW_TURN"; export NAVSIM_GOAL_TIMEOUT=${NAVSIM_GOAL_TIMEOUT:-420};;
  low_turn_removed)    export NAVSIM_SONAR_OBST="low,$LOW_TURN,,${REMOVE_AT:-45}";;
  low_turn_gone_early) export NAVSIM_SONAR_OBST="low,$LOW_TURN,,${REMOVE_AT:-24}";;
  noise)               export NAVSIM_SONAR_SPURIOUS=${NAVSIM_SONAR_SPURIOUS:-0.03};;
  silent)              export NAVSIM_SONAR_SILENT_AT=${NAVSIM_SONAR_SILENT_AT:-8}; export NAVSIM_GOAL_TIMEOUT=${NAVSIM_GOAL_TIMEOUT:-150};;
  cancel)              export NAVSIM_CANCEL_AT=${NAVSIM_CANCEL_AT:-15};;
  *) echo "unknown scenario $scen"; exit 2;;
esac
env | grep -E "^NAVSIM_|^LOW_TURN|^REMOVE_AT" | sort > "$R/env.txt"
setsid python3 "$S/../fakebot2.py" >> "$R/nav.log" 2>&1 & F=$!
setsid python3 "$S/sonarsim.py" >> "$R/nav.log" 2>&1 & SS=$!
sleep 2
setsid ros2 launch "$S/../sim.launch.py" >> "$R/nav.log" 2>&1 & L=$!
python3 "$S/sonar_goals.py" "$R/goal.json" "$GOAL" >> "$R/nav.log" 2>&1
sleep 1
for g in $L $SS $F; do kill -INT -- -$g 2>/dev/null; done; sleep 6
for g in $L $SS $F; do kill -9 -- -$g 2>/dev/null; done; wait 2>/dev/null
left=$(d88); [ -n "$left" ] && kill -9 $left
python3 "$S/sonar_report.py" "$R" | tee "$R/summary.txt"
