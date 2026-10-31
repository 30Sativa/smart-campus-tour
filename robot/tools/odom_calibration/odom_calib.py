#!/usr/bin/env python3
"""Straight-run odometry calibration (Localization V2). READ-ONLY: publishes nothing.

The operator drives the robot (teleop, ~0.1 m/s) along a taped straight line;
this tool only records. Run on the robot in a sourced terminal while
stm32_bridge is running:

    odom_calib.py start  RUN_ID                # robot stopped on the start mark
    odom_calib.py end    RUN_ID --tape 10.000  # robot stopped on the end mark
    odom_calib.py summary                      # all runs -> recommended odom_linear_scale

Per run it compares the tape distance with the wheel/odom displacement, and,
when a wall is straight ahead, with the change of the LiDAR front range (an
independent second reference). Results: ~/amr_logs/odom_calibration/<RUN_ID>.json
Acceptance and procedure: robot/docs/localization-v2.md.
"""
import argparse
import json
import math
import os
import sys
import time

OUT = os.path.expanduser(os.environ.get('ODOM_CALIB_DIR', '~/amr_logs/odom_calibration'))
LIDAR_YAW = -0.2225          # lidar_link yaw in base_footprint (Nav2 Baseline V1)
FRONT_HALF_ANGLE = math.radians(3.0)


# ---------------- pure helpers (unit-tested) ----------------
def yaw_of(q):
    return math.atan2(2 * (q[3] * q[2] + q[0] * q[1]), 1 - 2 * (q[1] ** 2 + q[2] ** 2))


def front_range(ranges, angle_min, angle_inc, lidar_yaw=LIDAR_YAW, half=FRONT_HALF_ANGLE):
    """Median range of beams pointing along the robot's +x (within +-half)."""
    vals = []
    for i, r in enumerate(ranges):
        a = angle_min + i * angle_inc + lidar_yaw
        a = math.atan2(math.sin(a), math.cos(a))
        if abs(a) <= half and math.isfinite(r) and 0.2 < r < 25.0:
            vals.append(r)
    if len(vals) < 5:
        return None
    vals.sort()
    return vals[len(vals) // 2]


def evaluate_run(start, end, tape, active_scale=1.0):
    """start/end: dict(x, y, yaw, front) from wheel/odom and LiDAR. Returns per-run metrics.
    active_scale: odom_linear_scale the bridge was running with (wheel/odom is already
    multiplied by it), so the absolute value to configure is active_scale * tape / odom."""
    dx, dy = end['x'] - start['x'], end['y'] - start['y']
    disp = math.hypot(dx, dy)
    dyaw = math.degrees(math.atan2(math.sin(end['yaw'] - start['yaw']), math.cos(end['yaw'] - start['yaw'])))
    heading = math.atan2(dy, dx)
    lateral = abs(-math.sin(start['yaw']) * dx + math.cos(start['yaw']) * dy)
    reverse = math.cos(heading - start['yaw']) < 0
    res = {'odom_displacement_m': disp, 'tape_m': tape,
           'scale_tape': active_scale * tape / disp if disp > 0 else None, 'heading_change_deg': dyaw,
           'active_odom_linear_scale': active_scale,
           'lateral_drift_m': lateral, 'reverse': reverse, 'scale_lidar': None, 'lidar_delta_m': None}
    if start.get('front') and end.get('front'):
        lid = abs(start['front'] - end['front'])
        res['lidar_delta_m'] = lid
        res['scale_lidar'] = active_scale * lid / disp if disp > 0 else None
    warn = []
    if abs(dyaw) > 3.0:
        warn.append(f'heading changed {dyaw:+.1f} deg (> 3): not a straight run')
    if disp < 0.8 * tape or disp > 1.2 * tape:
        warn.append('odometry displacement differs from tape by > 20 %: wrong marks or tape value?')
    if lateral > 0.15:
        warn.append(f'lateral drift {lateral:.2f} m (> 0.15): line not followed straight')
    if res['scale_tape'] and res['scale_lidar'] and abs(res['scale_tape'] - res['scale_lidar']) > 0.01:
        warn.append('tape and LiDAR scales differ by > 1 %: check the wall is straight ahead and the tape value')
    res['warnings'] = warn
    return res


def summarize(runs):
    good = [r for r in runs if r.get('scale_tape') and not r['warnings']]
    if not good:
        return {'accepted': False, 'reason': 'no clean run'}
    s = sorted(r['scale_tape'] for r in good)
    mean = sum(s) / len(s)
    sd = math.sqrt(sum((x - mean) ** 2 for x in s) / (len(s) - 1)) if len(s) > 1 else float('inf')
    fwd = [r['scale_tape'] for r in good if not r['reverse']]
    rev = [r['scale_tape'] for r in good if r['reverse']]
    dirdiff = abs(sum(fwd) / len(fwd) - sum(rev) / len(rev)) if fwd and rev else None
    reasons = []
    if len(good) < 6:
        reasons.append(f'only {len(good)} clean runs (need 6: 3 each way)')
    if sd > 0.005:
        reasons.append(f'run-to-run std {sd*100:.2f} % (> 0.5 %)')
    if dirdiff is None:
        reasons.append('need runs in both directions')
    elif dirdiff > 0.01:
        reasons.append(f'forward/back differ by {dirdiff*100:.2f} % (> 1 %)')
    if not 0.95 <= mean <= 1.08:
        reasons.append(f'mean {mean:.4f} outside the plausible 0.95-1.08 band: investigate before using it')
    return {'accepted': not reasons, 'reasons': reasons, 'n_clean': len(good), 'odom_linear_scale': round(mean, 4),
            'std': sd, 'forward_back_diff': dirdiff, 'offline_estimate': 1.045}


# ---------------- ROS capture ----------------
def capture(seconds=2.0):
    import rclpy
    from rclpy.qos import QoSProfile, ReliabilityPolicy
    from nav_msgs.msg import Odometry
    from sensor_msgs.msg import LaserScan
    rclpy.init(); n = rclpy.create_node('odom_calib_probe')
    be = QoSProfile(depth=50, reliability=ReliabilityPolicy.BEST_EFFORT)
    odo, scans = [], []
    n.create_subscription(Odometry, '/robot_01/wheel/odom', odo.append, be)
    n.create_subscription(LaserScan, '/robot_01/scan', scans.append, be)
    t0 = time.time()
    while time.time() - t0 < seconds:
        rclpy.spin_once(n, timeout_sec=0.05)
    if not odo:
        sys.exit('no /robot_01/wheel/odom received: is stm32_bridge running and this shell sourced?')
    moving = [m for m in odo if abs(m.twist.twist.linear.x) > 0.005 or abs(m.twist.twist.angular.z) > 0.01]
    if moving:
        sys.exit('robot is moving: stop on the mark and run again')
    active = 1.0
    try:   # pre-V2 bridges do not declare odom_linear_scale: treat as 1.0
        from rcl_interfaces.srv import GetParameters
        cli = n.create_client(GetParameters, '/robot_01/stm32_bridge_node/get_parameters')
        if cli.wait_for_service(timeout_sec=3.0):
            fut = cli.call_async(GetParameters.Request(names=['odom_linear_scale']))
            rclpy.spin_until_future_complete(n, fut, timeout_sec=3.0)
            v = fut.result().values[0] if fut.result() and fut.result().values else None
            if v is not None and v.type == 3:   # PARAMETER_DOUBLE
                active = v.double_value
    except Exception:
        pass
    m = odo[-1].pose.pose; q = (m.orientation.x, m.orientation.y, m.orientation.z, m.orientation.w)
    fronts = [f for f in (front_range(s.ranges, s.angle_min, s.angle_increment) for s in scans) if f]
    front = sorted(fronts)[len(fronts) // 2] if fronts else None
    n.destroy_node(); rclpy.shutdown()
    return {'t': time.time(), 'x': m.position.x, 'y': m.position.y, 'yaw': yaw_of(q), 'front': front,
            'active_odom_linear_scale': active}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    a1 = sub.add_parser('start'); a1.add_argument('run_id')
    a2 = sub.add_parser('end'); a2.add_argument('run_id'); a2.add_argument('--tape', type=float, required=True)
    sub.add_parser('summary')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if a.cmd == 'summary':
        runs = []
        for f in sorted(os.listdir(OUT)):
            if f.endswith('.json'):
                d = json.load(open(os.path.join(OUT, f)))
                if 'result' in d:
                    runs.append(d['result']); r = d['result']
                    print(f"{f[:-5]:12s} tape {r['tape_m']:.3f} odom {r['odom_displacement_m']:.3f} scale {r['scale_tape']:.4f}"
                          f" lidar {r['scale_lidar'] if r['scale_lidar'] is None else round(r['scale_lidar'], 4)}"
                          f" {'REV' if r['reverse'] else 'FWD'} {'; '.join(r['warnings'])}")
        print(json.dumps(summarize(runs), indent=1))
        return
    path = os.path.join(OUT, f'{a.run_id}.json')
    snap = capture()
    if a.cmd == 'start':
        if os.path.exists(path):
            sys.exit(f'{path} exists: use a new RUN_ID')
        json.dump({'start': snap}, open(path, 'w'), indent=1)
        print(f"start saved: odom ({snap['x']:.3f}, {snap['y']:.3f}), front wall {snap['front']} m. Now drive straight to the end mark.")
        return
    d = json.load(open(path))
    if 'start' not in d or 'result' in d:
        sys.exit('run has no start, or is already finished')
    if abs(d['start'].get('active_odom_linear_scale', 1.0) - snap['active_odom_linear_scale']) > 1e-9:
        sys.exit('odom_linear_scale changed between start and end: discard this run')
    res = evaluate_run(d['start'], snap, a.tape, snap['active_odom_linear_scale'])
    d.update(end=snap, result=res); json.dump(d, open(path, 'w'), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
