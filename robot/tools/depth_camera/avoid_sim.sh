#!/bin/bash
# avoid_sim.sh <new|old> <room|blocked>   -- does camera mode go around a low box (ADR-0068)?
#
# One offline run of the real Nav2 stack (robot/tools/nav2_bench/sim: fakebot2 on map2, no AMCL) with
# depthsim.py drawing a 30 x 30 x 15 cm box that only the depth camera sees, on the straight corridor
# of route R1 (about 2.9 m wide), 3.5 m from START. One goal past it.
#   new : the camera-mode params navigation.launch.py builds now (camera_params(): RPP T 4, depth in
#         the global costmap, BT clears keep a 2.2 m square)
#   old : camera mode before ADR-0068 (RPP T 4 only)
#   room    : nothing else; there is room on both sides
#   blocked : posts the LiDAR sees close both sides (gaps 0.30 m); the box is taken away after the
#             robot has stood still 10 s within 2.5 m of it (AVOID_REMOVE_AFTER=<s>, 0 = never); a thin post 1.5 m behind the box gives
#             the depth rays something to clear the box's cells against
# AVOID_FT=<s> also sets controller_server.failure_tolerance (how long RPP may report a collision
# before FollowPath fails and the BT recovers; V2/V3: 0.3 s), tagged _ft<s>.
# Output: $NAV2_BENCH_OUT/avoid/<mode>_<scene>[_ft<s>]/ (depthsim.json goals.json nav.log summary.json).
# Isolated: ROS_DOMAIN_ID 87, localhost only. Never run it while the robot stack runs on the MiniPC.
set -u
mode=${1:?new|old} scene=${2:?room|blocked}
S=$(cd "$(dirname "$0")" && pwd); SIM=$S/../nav2_bench/sim; SRC=$(cd "$S/../../ros2_ws/src" && pwd)
B=${NAV2_BENCH_OUT:-$HOME/amr_logs/nav2_bench}; R=$B/avoid/${mode}_${scene}${AVOID_FT:+_ft$AVOID_FT}${AVOID_REMOVE_AFTER:+_rm$AVOID_REMOVE_AFTER}; rm -rf "$R"; mkdir -p "$R/roslog"
pgrep -f "navigation.launch.py" > /dev/null && { echo "REFUSED: the robot stack is running"; exit 3; }
unset ROS_DISCOVERY_SERVER ROS_SUPER_CLIENT FASTRTPS_DEFAULT_PROFILES_FILE FASTDDS_DEFAULT_PROFILES_FILE ROS_STATIC_PEERS
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp ROS_DOMAIN_ID=87 ROS_LOCALHOST_ONLY=1 ROS_LOG_DIR=$R/roslog
set +u; source /opt/ros/humble/setup.bash; source "$HOME/smart-campus-tour/robot/ros2_ws/install/setup.bash"
[ -f "$HOME/.cache/armtc/smoothws/install/setup.bash" ] && source "$HOME/.cache/armtc/smoothws/install/setup.bash"; set -u
python3 - "$mode" "$SRC" "$R" "${AVOID_FT:-}" <<'EOF' || exit 2
import importlib.util, sys, yaml
mode, src, out, ft = sys.argv[1:]
spec = importlib.util.spec_from_file_location('nav', f'{src}/robot_navigation/launch/navigation.launch.py')
nav = importlib.util.module_from_spec(spec); spec.loader.exec_module(nav)
data = yaml.safe_load(open(f'{src}/robot_control/config/nav2_params_v2.yaml'))
if mode == 'new':
    params, notes = nav.camera_params(data, out); assert not notes, notes
else:
    params = data
    params['controller_server']['ros__parameters']['FollowPath']['max_allowed_time_to_collision_up_to_carrot'] = 4.0
if ft:
    params['controller_server']['ros__parameters']['failure_tolerance'] = float(ft)
yaml.safe_dump(params, open(f'{out}/params.yaml', 'w'), sort_keys=False, width=100000)
EOF
export DEPTHSIM_BOX="2.85,0.18,3.15,0.48,0.15" DEPTHSIM_OUT=$R/depthsim.json
export NAVSIM_PARAMS=$R/params.yaml NAVSIM_NOISE=0,0 NAVSIM_SEED=1 NAVSIM_OUT=$R/bot.npy NAVSIM_START="-0.49,-0.41,-5"
if [ "$scene" = blocked ]; then
  export NAVSIM_OBST="3.0,1.13,0.35;3.0,-0.47,0.35;4.65,0.33,0.10" DEPTHSIM_POSTS="3.0,1.13,0.35;3.0,-0.47,0.35;4.65,0.33,0.10"
  export DEPTHSIM_REMOVE_AFTER=${AVOID_REMOVE_AFTER:-10}   # 0: the box stays
else
  export NAVSIM_OBST="" DEPTHSIM_POSTS=""
fi
setsid nice -n 5 python3 "$SIM/fakebot2.py" >> "$R/nav.log" 2>&1 & F=$!
setsid python3 "$S/depthsim.py" >> "$R/nav.log" 2>&1 & D=$!
sleep 2
setsid ros2 launch "$SIM/sim.launch.py" >> "$R/nav.log" 2>&1 & L=$!
timeout 240 python3 "$SIM/goals.py" "$R/goals.json" "6.0,0.75,0.14" >> "$R/nav.log" 2>&1
sleep 2
for g in $L $D $F; do kill -INT -- -$g 2>/dev/null; done; sleep 5
for g in $L $D $F; do kill -9 -- -$g 2>/dev/null; done; wait 2>/dev/null
python3 - "$R" <<'EOF'
import json, sys
R = sys.argv[1]
d = json.load(open(f'{R}/depthsim.json'))
try:
    g = json.load(open(f'{R}/goals.json'))[0]
except Exception:
    g = {'status': 'none (timeout)'}
path = d.get('path', [])
near = [p for p in path if 2.6 <= p[0] <= 3.4]
lat = max((abs(p[1] - 0.33) for p in near), default=None)
names = {4: 'SUCCEEDED', 5: 'CANCELED', 6: 'ABORTED'}
log = open(f'{R}/nav.log', errors='replace').read()
s = {'status': names.get(g.get('status'), g.get('status')),
     'time_s': round(g['t1'] - g['t0'], 1) if 't1' in g else None,
     'closest_gap_to_box_m': d.get('min_gap'), 'at_pose': d.get('min_gap_pose'),
     'max_offset_from_box_centre_line_m': None if lat is None else round(lat, 2),
     'passed_box': any(p[0] > 3.4 for p in path),
     'stops_near_box': d.get('stops'), 'box_removed_at_s': d.get('removed_at'),
     'rpp_collision_reports': log.count('detected collision ahead'),
     'spins': log.count('Running spin'), 'waits': log.count('Running wait'),
     'costmap_clears': log.count('Received request to clear')}
json.dump(s, open(f'{R}/summary.json', 'w'), indent=1); print(json.dumps(s))
EOF
