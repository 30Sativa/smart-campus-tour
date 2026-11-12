#!/bin/bash
# Static LiDAR mount check: robot standing beside a straight wall, drive power OFF.
# Starts ONLY rplidar_node and robot_state_publisher, on a private localhost-only domain,
# records 150 scans, and compares the wall direction with two tape distances.
# It never starts stm32_bridge, mode_manager, Nav2 or SLAM, and refuses to run if any of
# them (or another rplidar_node) is running.
#
# usage: static_lidar_check.sh --motor-power-off-confirmed --side left|right \
#          --front-cm F --rear-cm R --baseline-m L [--lidar-yaw 3.1241] [--out DIR]
set -u
here=$(cd "$(dirname "$0")" && pwd)
yaw=3.1241; side=; front=; rear=; base=; confirmed=0; out=
while [ $# -gt 0 ]; do
  case $1 in
    --motor-power-off-confirmed) confirmed=1;;
    --side) side=$2; shift;; --front-cm) front=$2; shift;; --rear-cm) rear=$2; shift;;
    --baseline-m) base=$2; shift;; --lidar-yaw) yaw=$2; shift;; --out) out=$2; shift;;
    *) echo "unknown argument $1"; exit 2;;
  esac; shift
done
[ "$confirmed" = 1 ] || { echo "REFUSED: pass --motor-power-off-confirmed only after the drive supply is cut (E-stop pressed or driver power off)"; exit 2; }
[ -n "$side" ] && [ -n "$front" ] && [ -n "$rear" ] && [ -n "$base" ] || { echo "usage: see header"; exit 2; }
# Check the tape numbers BEFORE anything starts: F, R and L are placeholders for measurements.
python3 - "$side" "$front" "$rear" "$base" "$yaw" <<'PY' || exit 2
import math, sys
side, front, rear, base, yaw = sys.argv[1:]
def num(name, text, lo, hi, unit):
    try:
        v = float(text)
    except ValueError:
        sys.exit(f'REFUSED: {name}={text!r} is not a number; put the tape measurement in {unit} there')
    if not (lo < v < hi) or not math.isfinite(v):
        sys.exit(f'REFUSED: {name}={v} {unit} is outside ({lo}, {hi})')
if side not in ('left', 'right'):
    sys.exit(f'REFUSED: --side must be left or right, got {side!r}')
num('--front-cm', front, 5, 500, 'cm')
num('--rear-cm', rear, 5, 500, 'cm')
num('--baseline-m', base, 0.1, 2.0, 'm')
num('--lidar-yaw', yaw, -7, 7, 'rad')
PY
busy=$(pgrep -a -f 'stm32_bridge_node|mode_manager_node|/rplidar_node( |$)|async_slam_toolbox_node|nav2_amcl/amcl|controller_server' | grep -v -e pgrep -e static_lidar_check)
[ -z "$busy" ] || { echo "REFUSED: robot processes are running (stop the stack first):"; echo "$busy"; exit 2; }
out=${out:-$HOME/amr_logs/runs/$(date +%Y%m%d_%H%M)_static_lidar_check}
[ -e "$out" ] && { echo "REFUSED: $out exists (one new directory per session)"; exit 2; }
mkdir -p "$out"

# The URDF comes from the runtime the caller selected (`robot lidar-check` builds it);
# /opt/ros alone has no robot_description.
prefix=$(ros2 pkg prefix robot_description 2>/dev/null) \
  || { echo "REFUSED: robot_description not found; run through 'robot lidar-check' or source the runtime first" >&2; rmdir "$out"; exit 2; }
unset ROS_DISCOVERY_SERVER ROS_SUPER_CLIENT FASTRTPS_DEFAULT_PROFILES_FILE
export ROS_DOMAIN_ID=${STATIC_CHECK_DOMAIN:-97} ROS_LOCALHOST_ONLY=1 ROS_LOG_DIR="$out/ros_log"
[ "$ROS_DOMAIN_ID" = 30 ] && { echo "REFUSED: STATIC_CHECK_DOMAIN must not be the robot domain 30" >&2; exit 2; }
xacro_file=$prefix/share/robot_description/urdf/robot.urdf.xacro
xacro "$xacro_file" use_sim:=false use_ros2_control:=false lidar_yaw:="$yaw" > "$out/robot.urdf" || exit 1
# '/**/' so the parameters match the node under its /robot_01 namespace (a bare
# 'robot_state_publisher' key left robot_description empty and the node aborted).
python3 -c "import sys, yaml; print(yaml.safe_dump({'/**/robot_state_publisher': {'ros__parameters': {'robot_description': open(sys.argv[1]).read()}}}))" \
  "$out/robot.urdf" > "$out/rsp.yaml"
pids=()
cleanup() { for p in "${pids[@]}"; do kill -INT "$p" 2>/dev/null; done; sleep 2; for p in "${pids[@]}"; do kill -TERM "$p" 2>/dev/null; done; }
trap cleanup EXIT
/opt/ros/humble/lib/robot_state_publisher/robot_state_publisher --ros-args -r __ns:=/robot_01 --params-file "$out/rsp.yaml" > "$out/rsp.log" 2>&1 & pids+=($!)
# Same driver parameters as navigation.launch.py / manual_mapping.launch.py.
/opt/ros/humble/lib/rplidar_ros/rplidar_node --ros-args -r __ns:=/robot_01 -r scan:=scan_raw \
  -p channel_type:=serial -p serial_port:=/dev/ttyUSB0 -p serial_baudrate:=256000 -p frame_id:=lidar_link \
  -p inverted:=false -p angle_compensate:=true -p scan_mode:=Sensitivity > "$out/rplidar.log" 2>&1 & pids+=($!)
sleep 6
fail() {
  echo "== FAIL: $1"
  printf 'verdict=FAIL\ncandidate_rad=%s\nreason=%s\ntf_ok=False\n' "$yaw" "$1" > "$out/verdict.txt"
  exit 1
}
kill -0 "${pids[0]}" 2>/dev/null || fail "robot_state_publisher stopped: $(tail -n 2 "$out/rsp.log" | tr '\n' ' ')"
kill -0 "${pids[1]}" 2>/dev/null || fail "rplidar_node stopped: $(tail -n 2 "$out/rplidar.log" | tr '\n' ' ')"
python3 "$here/static_capture.py" "$out/capture.npz" --topic /robot_01/scan_raw --scans 150 | tee "$out/capture.txt"
[ "${PIPESTATUS[0]}" = 0 ] || fail "capture failed (see capture.txt)"
cleanup; trap - EXIT
python3 "$here/wall_yaw.py" "$out/capture.npz" --side "$side" --front-cm "$front" --rear-cm "$rear" --baseline-m "$base" 2>&1 | tee "$out/wall_yaw.txt"
[ "${PIPESTATUS[0]}" = 0 ] || fail "wall fit failed (see wall_yaw.txt)"
python3 - "$out" "$yaw" <<'PY'
import json, math, re, sys, numpy as np
out, yaw = sys.argv[1], float(sys.argv[2])
txt = open(out + '/wall_yaw.txt').read()
m = re.search(r'MOUNT YAW ([-+0-9.]+) deg', txt)
if not m:
    print('== FAIL: the wall fit printed no MOUNT YAW')
    open(out + '/verdict.txt', 'w').write(f'verdict=FAIL\ncandidate_rad={yaw}\nreason=no wall fit\ntf_ok=False\n')
    sys.exit(1)
mount = math.radians(float(m.group(1)))
tf = json.loads(str(np.load(out + '/capture.npz')['meta'])).get('tf_lidar_yaw')
d = math.degrees(math.atan2(math.sin(mount - yaw), math.cos(mount - yaw)))
tf_ok = tf is not None and abs(math.atan2(math.sin(tf - yaw), math.cos(tf - yaw))) < 1e-3
print(f'TF lidar_link yaw {tf} rad -> {"PASS" if tf_ok else "FAIL"} (expected {yaw})')
print(f'wall method {math.degrees(mount):+.2f} deg vs candidate {math.degrees(yaw):+.2f} deg: difference {d:+.2f} deg')
verdict = 'PASS' if tf_ok and abs(d) <= 1.5 else ('FAIL' if abs(d) > 3.0 or not tf_ok else 'INCONCLUSIVE (1.5-3 deg: re-measure the tape)')
print(f'== {verdict}')
# Machine-readable record for `robot calibration accept` (robot/docs/robot-launcher.md).
with open(out + '/verdict.txt', 'w') as f:
    f.write(f'verdict={verdict.split()[0]}\ncandidate_rad={yaw}\nwall_mount_deg={math.degrees(mount):.3f}\n'
            f'difference_deg={d:.3f}\ntf_ok={tf_ok}\n')
sys.exit(0 if verdict == 'PASS' else 1)
PY
