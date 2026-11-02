#!/bin/bash
# verify_params.sh V1|V2 [lidar_yaw_rad]   (C1 = V2)  -- READ-ONLY check of what the RUNNING Nav2 actually loaded.
# Run in a sourced robot terminal (S3 helper + smoothws) AFTER the Nav2 launch is active. Prints PASS/FAIL.
cfg=$1; ly=${2:-}
case $cfg in V1) LA=0.6; DEC="-2.5";; V2|C1) LA=0.8; DEC="-1.2";; *) echo "usage: $0 V1|V2 [lidar_yaw]  (add V3 here when it exists)"; exit 2;; esac
export ROS_SUPER_CLIENT=TRUE
# Read the parameters through rclpy with a service wait. `ros2 param get --no-daemon` answers
# nothing under the S3 Discovery Server (the CLI gives up before discovery completes), which
# made every check FAIL on 2026-11-02 even though Nav2 had loaded V2.
read -r la dec vel coll < <(timeout 30 python3 - <<'PY' 2>/dev/null
import rclpy
from rcl_interfaces.srv import GetParameters
rclpy.init(); n = rclpy.create_node('verify_params_ro')
def get(node, name):
    c = n.create_client(GetParameters, node + '/get_parameters')
    if not c.wait_for_service(timeout_sec=5.0):
        return '-'
    f = c.call_async(GetParameters.Request(names=[name])); rclpy.spin_until_future_complete(n, f, timeout_sec=5.0)
    if not f.result() or not f.result().values:
        return '-'
    v = f.result().values[0]
    if v.type == 1: return str(v.bool_value)
    if v.type == 3: return repr(v.double_value)
    if v.type == 8 and len(v.double_array_value): return repr(v.double_array_value[-1])
    return '-'
print(get('/robot_01/controller_server', 'FollowPath.lookahead_dist'),
      get('/robot_01/velocity_smoother', 'max_decel'),
      get('/robot_01/controller_server', 'FollowPath.desired_linear_vel'),
      get('/robot_01/controller_server', 'FollowPath.use_collision_detection'))
PY
)
for v in la dec vel coll; do [ "${!v}" = "-" ] && printf -v "$v" ''; done
ok=1
chk() { if python3 -c "import sys; sys.exit(0 if abs(float('$2' or 'nan') - float('$3')) < 1e-6 else 1)" 2>/dev/null; then echo "PASS $1 = $2"; else echo "FAIL $1 = '${2:-<no answer>}' (expected $3)"; ok=0; fi; }
chk "lookahead_dist" "$la" "$LA"
chk "velocity_smoother max_decel[yaw]" "$dec" "$DEC"
chk "desired_linear_vel" "$vel" "0.2"
[ "$coll" = "True" ] && echo "PASS use_collision_detection = True" || { echo "FAIL use_collision_detection = '$coll'"; ok=0; }
if [ -n "$ly" ]; then
  y=$(timeout 8 python3 - <<'PY'
import math, rclpy, time
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
from tf2_msgs.msg import TFMessage
rclpy.init(); n = rclpy.create_node('verify_tf_ro'); got = []
n.create_subscription(TFMessage, '/tf_static', lambda m: got.extend(m.transforms), QoSProfile(depth=10, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE))
t0 = time.time()
while time.time() - t0 < 4: rclpy.spin_once(n, timeout_sec=0.1)
for t in got:
    if t.child_frame_id == 'lidar_link':
        q = t.transform.rotation; print(round(math.atan2(2*(q.w*q.z+q.x*q.y), 1-2*(q.y*q.y+q.z*q.z)), 4)); break
PY
)
  chk "TF lidar_link yaw (rad)" "$y" "$ly"
fi
[ $ok = 1 ] && echo "== ALL PASS ($cfg)" || { echo "== FAIL: do NOT start this round"; exit 1; }
