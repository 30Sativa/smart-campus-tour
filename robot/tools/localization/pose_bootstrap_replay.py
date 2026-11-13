#!/usr/bin/env python3
"""End-to-end offline check: real nav2 AMCL + pose_bootstrap fed from a recorded nav bag.

AMCL starts WITHOUT an initial pose (as on the robot). The bag's scan, odom, odom->base TF,
static TF and map are replayed in real time (the recorded map->odom is dropped). pose_bootstrap
must find the pose on its own; the script prints its status and compares the resulting AMCL
pose with the pose AMCL had live in the bag.

Run with a clean ROS environment and a private domain (never on the robot's graph):
  env -i HOME=$HOME PATH=/usr/bin:/bin bash -c 'source /opt/ros/humble/setup.bash; \\
    export ROS_DOMAIN_ID=89 ROS_LOCALHOST_ONLY=1; python3 pose_bootstrap_replay.py BAG MAP_YAML [--seconds 25] [--shift 2.0]'
--shift moves nothing in the data; it plants a saved pose that far from the truth, as if the
robot had been pushed after the last run (the saved pose must then fail and the search take over).
"""
import argparse, json, math, os, sqlite3, subprocess, sys, tempfile, time

import rclpy
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message
from rosgraph_msgs.msg import Clock
from tf2_msgs.msg import TFMessage
from sensor_msgs.msg import LaserScan
from nav_msgs.msg import OccupancyGrid, Odometry
from geometry_msgs.msg import PoseWithCovarianceStamped
from std_msgs.msg import String
from lifecycle_msgs.srv import ChangeState
from lifecycle_msgs.msg import Transition

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, '..', '..', 'ros2_ws', 'src', 'robot_navigation')
sys.path.insert(0, PKG)
from robot_navigation.pose_bootstrap_config import map_key, write_saved_pose  # noqa: E402
from robot_navigation.pose_bootstrap_core import Pose2D  # noqa: E402

yawq = lambda q: math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
st = lambda h: h.stamp.sec + h.stamp.nanosec * 1e-9


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('bag'); ap.add_argument('map_yaml')
    ap.add_argument('--seconds', type=float, default=25.0); ap.add_argument('--shift', type=float, default=None)
    a = ap.parse_args()
    con = sqlite3.connect(a.bag); top = {r[1]: (r[0], r[2]) for r in con.execute('select id,name,type from topics')}

    def rows(name):
        tid, typ = top[name]; cls = get_message(typ)
        return [(ts / 1e9, deserialize_message(d, cls)) for ts, d in con.execute('select timestamp,data from messages where topic_id=? order by timestamp', (tid,))]
    ev = []
    t_first = None
    for ts, m in rows('/tf'):
        keep = [t for t in m.transforms if not (t.header.frame_id.endswith('map') and t.child_frame_id.endswith('odom'))]
        if keep: ev.append((ts, 'tf', TFMessage(transforms=keep)))
    for ts, m in rows('/robot_01/scan'):
        ev.append((ts, 'scan', m))
    for ts, m in rows('/robot_01/odom'):
        ev.append((ts, 'odom', m))
    ev.sort(key=lambda e: e[0]); t_first = ev[0][0]
    ev = [e for e in ev if e[0] - t_first <= a.seconds]
    static = rows('/tf_static')[0][1]; grid = rows('/robot_01/map')[0][1]
    live = [(st(m.header), m.pose.pose) for _, m in rows('/robot_01/amcl_pose')]
    ref = live[0][1]; ref_p = Pose2D(ref.position.x, ref.position.y, yawq(ref.orientation))

    state = tempfile.mkdtemp(prefix='pose_bootstrap_state_')
    if a.shift is not None:
        write_saved_pose(state, map_key(a.map_yaml), Pose2D(ref_p.x + a.shift, ref_p.y, ref_p.yaw), time.time(), a.map_yaml)
    loc = os.path.join(PKG, 'config', 'localization_params.yaml')
    # The binary itself, in its own process group: "ros2 run" leaves the node behind when killed.
    amcl = subprocess.Popen(['/opt/ros/humble/lib/nav2_amcl/amcl', '--ros-args', '--params-file', loc,
                             '-p', 'use_sim_time:=false', '--log-level', 'warn'], stderr=subprocess.DEVNULL,
                            start_new_session=True)
    env = dict(os.environ, PYTHONPATH=PKG + os.pathsep + os.environ.get('PYTHONPATH', ''), PYTHONUNBUFFERED='1',
               RCUTILS_LOGGING_BUFFERED_STREAM='0')
    boot = subprocess.Popen([sys.executable, '-c', 'from robot_navigation.pose_bootstrap import main; main()',
                             '--ros-args', '--params-file', os.path.join(PKG, 'config', 'pose_bootstrap.yaml'),
                             '-p', f'map_yaml:={a.map_yaml}', '-p', f'state_dir:={state}', '-p', 'start_delay:=1.0'],
                            env=env, start_new_session=True)
    rclpy.init(); node = Node('pose_bootstrap_replay')
    lat = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE)
    pubs = dict(tf=node.create_publisher(TFMessage, '/tf', 100), scan=node.create_publisher(LaserScan, 'scan', 10),
                odom=node.create_publisher(Odometry, 'odom', 10))
    pub_static = node.create_publisher(TFMessage, '/tf_static', lat)
    pub_map = node.create_publisher(OccupancyGrid, 'map', lat)
    out = dict(status=[], amcl=[])
    node.create_subscription(String, 'pose_bootstrap/status', lambda m: out['status'].append(m.data), lat)
    node.create_subscription(PoseWithCovarianceStamped, 'amcl_pose', lambda m: out['amcl'].append(
        (m.pose.pose.position.x, m.pose.pose.position.y, yawq(m.pose.pose.orientation), m.pose.covariance[0],
         m.pose.covariance[7], m.pose.covariance[35], st(m.header))), lat)
    now = node.get_clock().now().to_msg
    for t in static.transforms: t.header.stamp = now()
    grid.header.stamp = now(); pub_static.publish(static); pub_map.publish(grid)
    cli = node.create_client(ChangeState, '/amcl/change_state'); cli.wait_for_service(timeout_sec=20)
    for tid in (Transition.TRANSITION_CONFIGURE, Transition.TRANSITION_ACTIVATE):
        f = cli.call_async(ChangeState.Request(transition=Transition(id=tid))); rclpy.spin_until_future_complete(node, f, timeout_sec=10)
    t_wall = time.monotonic()
    shift_ns = None
    for ts, kind, msg in ev:
        while time.monotonic() - t_wall < ts - t_first:
            rclpy.spin_once(node, timeout_sec=0.002)
        # re-stamp to the wall clock, keeping the recorded spacing (both nodes use wall time)
        stamp_now = node.get_clock().now()
        if shift_ns is None:
            shift_ns = stamp_now.nanoseconds - int(ts * 1e9)
        if kind == 'tf':
            for t in msg.transforms:
                ns = int(st(t.header) * 1e9) + shift_ns; t.header.stamp.sec, t.header.stamp.nanosec = ns // 10**9, ns % 10**9
        else:
            ns = int(st(msg.header) * 1e9) + shift_ns; msg.header.stamp.sec, msg.header.stamp.nanosec = ns // 10**9, ns % 10**9
        pubs[kind].publish(msg)
    end = time.monotonic() + 2
    while time.monotonic() < end: rclpy.spin_once(node, timeout_sec=0.05)
    for p in (boot, amcl):
        try:
            os.killpg(p.pid, 2)
            p.wait(5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try: os.killpg(p.pid, 9)
            except ProcessLookupError: pass
    last = out['amcl'][-1] if out['amcl'] else None
    if last:   # live AMCL pose at the same bag time (replay stamps = bag stamps + shift_ns)
        t_bag = last[6] - shift_ns / 1e9
        before = [p for t, p in live if t <= t_bag + 0.05]
        if before:
            ref = before[-1]; ref_p = Pose2D(ref.position.x, ref.position.y, yawq(ref.orientation))
    res = dict(status=out['status'], reference=[round(ref_p.x, 2), round(ref_p.y, 2), round(math.degrees(ref_p.yaw), 1)],
               err_yaw_deg=round(math.degrees(abs(math.atan2(math.sin(last[2] - ref_p.yaw), math.cos(last[2] - ref_p.yaw)))), 1) if last else None,
               amcl_last=[round(last[0], 2), round(last[1], 2), round(math.degrees(last[2]), 1), round(last[3], 3),
                          round(last[4], 3), round(last[5], 3)] if last else None,
               err_m=round(math.hypot(last[0] - ref_p.x, last[1] - ref_p.y), 2) if last else None,
               saved_files=os.listdir(state))
    print(json.dumps(res))


if __name__ == '__main__':
    main()
