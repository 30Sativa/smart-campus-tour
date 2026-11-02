#!/bin/bash
# run.sh <cfg|params.yaml> <route> <seed> [obstacles "x,y,r;..."]   -- one offline Nav2 run in domain 86
#   cfg   : a Nav2 params yaml path, or a name resolved as $NAV2_BENCH_OUT/params/<cfg>.yaml
#           (V1 / V2 resolve to the repo files robot_control/config/nav2_params_{smooth,v2}.yaml)
#   route : R1 START->POI_01->START | R2 START->POI_03->START
# Output: runs/<cfg>_<route>_s<seed>[_obst]/  (bot.npy goals.json plans*.npz cpu.csv nav.log)
S=$(cd "$(dirname "$0")" && pwd); B=${NAV2_BENCH_OUT:-$HOME/amr_logs/nav2_bench}; mkdir -p $B/runs $B/params
CFGDIR=$(cd "$S/../../../ros2_ws/src/robot_control/config" && pwd)
unset ROS_DISCOVERY_SERVER ROS_SUPER_CLIENT FASTRTPS_DEFAULT_PROFILES_FILE FASTDDS_DEFAULT_PROFILES_FILE ROS_STATIC_PEERS
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp ROS_DOMAIN_ID=86 ROS_LOCALHOST_ONLY=1
set +u; source /opt/ros/humble/setup.bash; source $HOME/smart-campus-tour/robot/ros2_ws/install/setup.bash; source $HOME/.cache/armtc/smoothws/install/setup.bash
cfg=$1 route=$2 seed=$3 obst=$4
case $cfg in
  *.yaml) PFILE=$(readlink -f $cfg); cfg=$(basename $cfg .yaml);;
  V1) echo "V1 params were removed on 2026-11-02: git show nav2-baseline-v1:robot/ros2_ws/src/robot_control/config/nav2_params_smooth.yaml > /tmp/V1.yaml, then pass /tmp/V1.yaml"; exit 2;;
  V2) PFILE=$CFGDIR/nav2_params_v2.yaml;;
  *) PFILE=$B/params/$cfg.yaml;;
esac
tag=${cfg}_${route}${TAG_SUFFIX}_s${seed}${obst:+_obst}; R=$B/runs/$tag; rm -rf $R; mkdir -p $R/roslog
export ROS_LOG_DIR=$R/roslog; echo "$obst" > $R/obst.txt
d86() { for p in $(ps -u $(id -u) -o pid=); do [ -r /proc/$p/environ ] || continue; tr "\0" "\n" < /proc/$p/environ 2>/dev/null | grep -qx "ROS_DOMAIN_ID=86" && [ "$p" != "$$" ] && [ "$p" != "$BASHPID" ] && echo $p; done; }
left=$(d86); [ -n "$left" ] && { echo "ABORT: domain-86 processes still running: $left"; exit 3; }
# fairness: never run while an external CPU load (Quest stream, builds) is active; wait for it to end
for i in $(seq 240); do pgrep -x "ffmpeg|scrcpy|colcon|cc1plus" > /dev/null || break; [ $i = 1 ] && echo "$(date +%T) waiting: external load running" >&2; sleep 30; done
case $route in
  R1) G="7.76,7.75,-1.370 -0.319,-0.535,0.077";;
  R2) G="42.460,-23.038,-1.613 -0.319,-0.535,0.077";;
esac
export NAVSIM_AR=${NAVSIM_AR:-0.7} NAVSIM_PARAMS=$PFILE NAVSIM_NOISE=${NAVSIM_NOISE:-0.015,0.6} NAVSIM_SEED=$seed NAVSIM_OUT=$R/bot.npy NAVSIM_START="-0.49,-0.41,-5" NAVSIM_OBST="$obst"
[ -n "$CPULOAD" ] && { setsid python3 $S/cpuload.py $CPULOAD >> $R/nav.log 2>&1 & LD=$!; echo "$CPULOAD" > $R/cpuload.txt; }
setsid python3 $S/fakebot2.py >> $R/nav.log 2>&1 & F=$!
setsid python3 $S/logger.py $R >> $R/logger.log 2>&1 & G2=$!
sleep 2
setsid ros2 launch $S/sim.launch.py >> $R/nav.log 2>&1 & L=$!
python3 $S/goals.py $R/goals.json $G >> $R/nav.log 2>&1
for g in $L $G2 $F $LD; do kill -INT -- -$g 2>/dev/null; done; sleep 5
for g in $L $G2 $F $LD; do kill -9 -- -$g 2>/dev/null; done; wait 2>/dev/null
left=$(d86); [ -n "$left" ] && kill -9 $left
grep -h "^goal" $R/nav.log
