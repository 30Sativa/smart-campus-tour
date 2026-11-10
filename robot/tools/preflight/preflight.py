#!/usr/bin/env python3
"""Read-only preflight for the MANUAL, BUILD MAP and NAV2 workflows on the real robot.

Run on the robot after the workflow launch is up and BEFORE anything moves. It only
reads: processes, TF, topic rates, mode_manager state and (NAV2) lifecycle states and
the AMCL pose. It never publishes, calls a service that changes state, or sends a goal.

    preflight.py manual|mapping|navigation --lidar-yaw RAD [--ns /robot_01] [--static]

Exit 0 = PASS (warnings allowed), 1 = at least one FAIL, 2 = usage error.
--static relaxes the checks that only matter before motion (bag recorder running).
"""
import argparse
import json
import math
import os
import re
import sys
import time

WORKFLOWS = ('manual', 'mapping', 'navigation')
# Nominal rates measured in runs/20261102_1516_route_V2: scan 11.5, wheel/odom 40.3,
# odom 20.6, imu/data 6.5 (4-7 in 6 s windows), cmd_vel 20.0 Hz. Limits are about 75 %
# of nominal; the IMU limit only catches a silent IMU.
MIN_RATE_HZ = {'scan': 8.5, 'scan_raw': 8.5, 'wheel/odom': 30.0, 'odom': 15.0, 'imu/data': 3.0, 'cmd_vel': 15.0}
NAV2_LIFECYCLE = ('map_server', 'amcl', 'controller_server', 'planner_server', 'bt_navigator',
                  'behavior_server', 'velocity_smoother')
YAW_TOL_RAD = 1e-3


def wrap(a):
    return math.atan2(math.sin(a), math.cos(a))


# ---- evaluation (pure, unit tested) ------------------------------------------------
def evaluate(workflow, snap, lidar_yaw, static=False, allow_explorer=False):
    """snap: measurements from gather(). Returns [(level, check, detail)]."""
    out = []

    def add(ok, check, detail, warn_only=False):
        out.append(('PASS' if ok else ('WARN' if warn_only else 'FAIL'), check, detail))

    procs = snap.get('processes')
    if procs is not None:
        for name in ('stm32_bridge_node', 'ekf_node', 'mode_manager_node', 'robot_state_publisher'):
            add(procs.get(name, 0) == 1, f'process {name}', f'{procs.get(name, 0)} running (need exactly 1)')
        lidar_need = 0 if workflow == 'manual' else 1
        n = procs.get('rplidar_node', 0)
        add(n == lidar_need or (workflow == 'manual' and n <= 1), 'process rplidar_node', f'{n} running (need {lidar_need})',
            warn_only=(workflow == 'manual'))
        add(procs.get('slam_toolbox', 0) == (1 if workflow == 'mapping' else 0), 'process slam_toolbox',
            f"{procs.get('slam_toolbox', 0)} running (need {1 if workflow == 'mapping' else 0}; two map->odom owners otherwise)")
        add(procs.get('amcl', 0) == (1 if workflow == 'navigation' else 0), 'process amcl',
            f"{procs.get('amcl', 0)} running (need {1 if workflow == 'navigation' else 0})")
        add(procs.get('simple_frontier_explorer', 0) == 0 or allow_explorer, 'process frontier explorer',
            f"{procs.get('simple_frontier_explorer', 0)} running (auto_explore is blocked on the real robot)")
        if not static:
            add(procs.get('ros2 bag record', 0) >= 1, 'bag recorder', f"{procs.get('ros2 bag record', 0)} running (record before moving)")
        add(procs.get('mediamtx', 0) == 0, 'Quest relay idle', f"{procs.get('mediamtx', 0)} mediamtx process(es); "
            'unplug the Quest (a live stream saturated the CPU on 19/10)', warn_only=True)

    y = snap.get('tf_lidar_yaw')
    add(y is not None and abs(wrap(y - lidar_yaw)) < YAW_TOL_RAD, 'TF base_link->lidar_link yaw',
        f'{y!r} rad, expected {lidar_yaw} (mod 2pi)')
    age = snap.get('tf_age', {})
    add(age.get('odom->base_footprint') is not None and age['odom->base_footprint'] < 0.5, 'TF odom->base_footprint fresh',
        f"age {age.get('odom->base_footprint')} s")
    m2o = age.get('map->odom')
    if workflow == 'manual':
        add(m2o is None, 'TF map->odom absent', f'age {m2o} s (no SLAM/AMCL expected)', warn_only=True)
    else:
        add(m2o is not None and m2o < 2.0, 'TF map->odom fresh', f'age {m2o} s')

    rates = snap.get('rates', {})
    needed = ['wheel/odom', 'odom', 'imu/data', 'cmd_vel'] + ([] if workflow == 'manual' else ['scan', 'scan_raw'])
    for topic in needed:
        r = rates.get(topic)
        add(r is not None and r >= MIN_RATE_HZ[topic], f'rate {topic}', f'{r} Hz (min {MIN_RATE_HZ[topic]})')

    cpu = snap.get('cpu_busy_pct')
    add(cpu is not None and cpu < 70.0, 'CPU headroom', f'{cpu} % busy over the window (max 70)', warn_only=(workflow == 'manual'))
    add(snap.get('cmd_vel_max', 1.0) < 1e-6, 'cmd_vel is zero', f"max |v|,|w| = {snap.get('cmd_vel_max')} (nothing may command motion now)")
    add(snap.get('wheel_twist_max', 1.0) < 1e-3, 'wheels commanded still', f"max wheel/odom twist {snap.get('wheel_twist_max')}")
    want_mode = 'manual' if workflow in ('manual', 'mapping') else 'explore'
    add(snap.get('mode') == want_mode, 'mode_manager mode', f"{snap.get('mode')!r}, expected {want_mode!r}")
    add(snap.get('estop') is not None, 'emergency_stop_state received', f"{snap.get('estop')!r}")
    link = snap.get('stm32_link_ok')
    add(link is True, 'stm32_link_ok', 'link-safety not deployed (topic absent)' if link is None else f'{link}', warn_only=(link is None))

    if workflow == 'navigation':
        for k in NAV2_LIFECYCLE:
            st = snap.get('lifecycle', {}).get(k)
            add(st == 'active', f'lifecycle {k}', f'{st}')
        a = snap.get('amcl')
        add(a is not None and a['sigma_xy'] < 0.30 and a['sigma_yaw_deg'] < 10.0, 'AMCL localized',
            'no amcl_pose (set the initial pose)' if a is None else f"sigma_xy {a['sigma_xy']:.3f} m, sigma_yaw {a['sigma_yaw_deg']:.1f} deg")
        vp = snap.get('verify_params')
        add(vp == 0, 'verify_params.sh V2', f'exit {vp}')
    return out


# ---- measurement (ROS, read-only) ----------------------------------------------------
def count_processes():
    found = {}
    pat = {'stm32_bridge_node': r'stm32_bridge_node', 'ekf_node': r'/ekf_node( |$)',
           'mode_manager_node': r'mode_manager_node', 'robot_state_publisher': r'/robot_state_publisher( |$)',
           'rplidar_node': r'/rplidar_node( |$)', 'slam_toolbox': r'/async_slam_toolbox_node( |$)',
           'amcl': r'/nav2_amcl/amcl( |$)', 'simple_frontier_explorer': r'simple_frontier_explorer',
           'ros2 bag record': r'ros2 bag record|ros2-bag-record|bag record ', 'mediamtx': r'(^|/)mediamtx( |$)'}
    for pid in filter(str.isdigit, os.listdir('/proc')):
        try:
            cmd = open(f'/proc/{pid}/cmdline', 'rb').read().replace(b'\0', b' ').decode(errors='replace').strip()
        except OSError:
            continue
        if not cmd or 'preflight.py' in cmd:
            continue
        # `ros2 run` / `python3 .../ros2 launch` wrappers repeat the executable name; count real binaries only
        if cmd.startswith(('/usr/bin/python3 /opt/ros/humble/bin/ros2 run', 'python3 /opt/ros/humble/bin/ros2 run')):
            continue
        for k, p in pat.items():
            if re.search(p, cmd):
                found[k] = found.get(k, 0) + 1
    return found


def gather(ns, seconds, workflow, lidar_yaw):
    if os.environ.get('ROS_DISCOVERY_SERVER'):
        os.environ.setdefault('ROS_SUPER_CLIENT', 'TRUE')
    import rclpy
    import tf2_ros
    from geometry_msgs.msg import PoseWithCovarianceStamped, Twist
    from nav_msgs.msg import Odometry
    from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
    from sensor_msgs.msg import Imu, LaserScan
    from std_msgs.msg import Bool, String
    from tf2_msgs.msg import TFMessage

    rclpy.init()
    n = rclpy.create_node('preflight_ro')
    latched = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL)
    counts, snap = {}, {'cmd_vel_max': 0.0, 'wheel_twist_max': 0.0}

    def counter(topic, extra=None):
        def cb(msg):
            counts[topic] = counts.get(topic, 0) + 1
            if extra:
                extra(msg)
        return cb

    def twist_max(key, tw):
        snap[key] = max(snap[key], abs(tw.linear.x), abs(tw.linear.y), abs(tw.angular.z))

    sens = qos_profile_sensor_data
    n.create_subscription(LaserScan, f'{ns}/scan', counter('scan'), sens)
    n.create_subscription(LaserScan, f'{ns}/scan_raw', counter('scan_raw'), sens)
    n.create_subscription(Odometry, f'{ns}/wheel/odom', counter('wheel/odom', lambda m: twist_max('wheel_twist_max', m.twist.twist)), 10)
    n.create_subscription(Odometry, f'{ns}/odom', counter('odom'), 10)
    n.create_subscription(Imu, f'{ns}/imu/data', counter('imu/data'), sens)
    n.create_subscription(Twist, f'{ns}/cmd_vel', counter('cmd_vel', lambda m: twist_max('cmd_vel_max', m)), 10)
    n.create_subscription(String, f'{ns}/robot_mode_state', lambda m: snap.__setitem__('mode', m.data), latched)
    n.create_subscription(Bool, f'{ns}/emergency_stop_state', lambda m: snap.__setitem__('estop', m.data), latched)
    n.create_subscription(Bool, f'{ns}/stm32_link_ok', lambda m: snap.__setitem__('stm32_link_ok', m.data), latched)
    n.create_subscription(PoseWithCovarianceStamped, f'{ns}/amcl_pose', lambda m: snap.__setitem__('amcl', dict(
        sigma_xy=math.sqrt(max(m.pose.covariance[0], m.pose.covariance[7])),
        sigma_yaw_deg=math.degrees(math.sqrt(m.pose.covariance[35])))), latched)

    def on_static(m):
        for t in m.transforms:
            if t.child_frame_id == 'lidar_link':
                q = t.transform.rotation
                snap['tf_lidar_yaw'] = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
    n.create_subscription(TFMessage, '/tf_static', on_static, latched)
    buf = tf2_ros.Buffer()
    tf2_ros.TransformListener(buf, n)
    def cpu_times():
        v = [int(x) for x in open('/proc/stat').readline().split()[1:]]
        return sum(v), v[3] + v[4]                     # total, idle + iowait
    c0 = cpu_times()
    t0 = time.monotonic()
    while time.monotonic() - t0 < seconds:
        rclpy.spin_once(n, timeout_sec=0.05)
    dt = time.monotonic() - t0
    c1 = cpu_times()
    snap['cpu_busy_pct'] = round(100.0 * (1 - (c1[1] - c0[1]) / max(1, c1[0] - c0[0])), 1)
    snap['rates'] = {k: round(v / dt, 1) for k, v in counts.items()}
    snap['tf_age'] = {}
    now = n.get_clock().now().nanoseconds * 1e-9
    for a, b in (('map', 'odom'), ('odom', 'base_footprint')):
        try:
            s = buf.lookup_transform(a, b, rclpy.time.Time()).header.stamp
            snap['tf_age'][f'{a}->{b}'] = round(now - (s.sec + s.nanosec * 1e-9), 2)
        except Exception:   # noqa: BLE001 - absent transform is a measured result
            snap['tf_age'][f'{a}->{b}'] = None
    if workflow == 'navigation':
        from lifecycle_msgs.srv import GetState
        snap['lifecycle'] = {}
        for k in NAV2_LIFECYCLE:
            c = n.create_client(GetState, f'{ns}/{k}/get_state')
            if not c.wait_for_service(timeout_sec=2.0):
                snap['lifecycle'][k] = 'no-service'
                continue
            f = c.call_async(GetState.Request())
            rclpy.spin_until_future_complete(n, f, timeout_sec=3.0)
            snap['lifecycle'][k] = f.result().current_state.label if f.result() else 'no-answer'
    n.destroy_node()
    rclpy.shutdown()
    if workflow == 'navigation':
        import subprocess
        here = os.path.dirname(os.path.abspath(__file__))
        vp = os.path.join(here, '..', 'nav2_bench', 'verify_params.sh')
        snap['verify_params'] = subprocess.run(['bash', vp, 'V2', str(lidar_yaw)], capture_output=True, timeout=60).returncode
    return snap


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('workflow', choices=WORKFLOWS)
    ap.add_argument('--lidar-yaw', type=float, required=True, help='expected base_link->lidar_link yaw (rad)')
    ap.add_argument('--ns', default='/robot_01')
    ap.add_argument('--seconds', type=float, default=5.0)
    ap.add_argument('--static', action='store_true', help='stationary checks only (no bag recorder required)')
    ap.add_argument('--skip-processes', action='store_true', help='offline replay: do not inspect processes')
    ap.add_argument('--json', help='write the raw measurements and verdicts here')
    a = ap.parse_args(argv)
    snap = gather(a.ns, a.seconds, a.workflow, a.lidar_yaw)
    snap['processes'] = None if a.skip_processes else count_processes()
    verdicts = evaluate(a.workflow, snap, a.lidar_yaw, static=a.static)
    for level, check, detail in verdicts:
        print(f'{level:4s}  {check:34s} {detail}')
    fails = [v for v in verdicts if v[0] == 'FAIL']
    print(f"== {'FAIL: do NOT start' if fails else 'PASS'} ({a.workflow}, {len(fails)} fail, "
          f"{sum(v[0] == 'WARN' for v in verdicts)} warn)")
    if a.json:
        json.dump(dict(snap=snap, verdicts=verdicts), open(a.json, 'w'), indent=1, default=str)
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
