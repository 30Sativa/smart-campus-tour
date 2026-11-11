"""Preflight verdicts on synthetic measurements, and one end-to-end run against fake
publishers on a private localhost-only domain (skipped without ROS)."""
import json
import math
import os
import subprocess
import sys
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import preflight as PF  # noqa: E402

YAW = 3.1241


def healthy(workflow):
    procs = {'stm32_bridge_node': 1, 'ekf_node': 1, 'mode_manager_node': 1, 'robot_state_publisher': 1,
             'rplidar_node': 0 if workflow == 'manual' else 1, 'slam_toolbox': int(workflow == 'mapping'),
             'amcl': int(workflow == 'navigation'), 'ros2 bag record': 1}
    snap = dict(processes=procs, tf_lidar_yaw=YAW, tf_age={'odom->base_footprint': 0.05,
                'map->odom': None if workflow == 'manual' else 0.2},
                rates={'scan': 11.5, 'scan_raw': 11.5, 'wheel/odom': 40.0, 'odom': 20.5, 'imu/data': 6.5, 'cmd_vel': 20.0},
                cmd_vel_max=0.0, wheel_twist_max=0.0, mode='explore' if workflow == 'navigation' else 'manual',
                estop=False, stm32_link_ok=True, cpu_busy_pct=35.0)
    if workflow == 'navigation':
        snap.update(lifecycle={k: 'active' for k in PF.NAV2_LIFECYCLE}, amcl=dict(sigma_xy=0.08, sigma_yaw_deg=3.0),
                    verify_params=0)
    return snap


def fails(workflow, snap, **kw):
    return [c for lvl, c, _ in PF.evaluate(workflow, snap, YAW, **kw) if lvl == 'FAIL']


@pytest.mark.parametrize('workflow', PF.WORKFLOWS)
def test_healthy_stack_passes(workflow):
    assert fails(workflow, healthy(workflow)) == []


@pytest.mark.parametrize('workflow', PF.WORKFLOWS)
def test_wrong_lidar_yaw_fails_and_wrapped_spelling_passes(workflow):
    s = healthy(workflow)
    s['tf_lidar_yaw'] = -3.0695
    assert 'TF base_link->lidar_link yaw' in fails(workflow, s)
    s['tf_lidar_yaw'] = YAW - 2 * math.pi             # same mount written outside (-pi, pi]
    assert fails(workflow, s) == []
    s['tf_lidar_yaw'] = None
    assert 'TF base_link->lidar_link yaw' in fails(workflow, s)


def test_two_map_to_odom_owners_fail():
    s = healthy('mapping')
    s['processes']['amcl'] = 1
    assert fails('mapping', s) == ['process amcl']
    s = healthy('navigation')
    s['processes']['slam_toolbox'] = 1
    assert fails('navigation', s) == ['process slam_toolbox']


def test_duplicate_bridge_and_explorer_fail():
    s = healthy('manual')
    s['processes']['stm32_bridge_node'] = 2
    s['processes']['simple_frontier_explorer'] = 1
    assert set(fails('manual', s)) == {'process stm32_bridge_node', 'process frontier explorer'}


def test_motion_needs_a_bag_but_static_does_not():
    s = healthy('mapping')
    s['processes']['ros2 bag record'] = 0
    assert fails('mapping', s) == ['bag recorder']
    assert fails('mapping', s, static=True) == []


def test_anything_commanding_motion_fails():
    s = healthy('manual')
    s['cmd_vel_max'] = 0.05
    s['wheel_twist_max'] = 0.05
    assert set(fails('manual', s)) == {'cmd_vel is zero', 'wheels commanded still'}


def test_slow_or_missing_topics_fail():
    s = healthy('mapping')
    s['rates']['scan'] = 3.0
    del s['rates']['imu/data']
    assert set(fails('mapping', s)) == {'rate scan', 'rate imu/data'}
    m = healthy('manual')
    del m['rates']['scan'], m['rates']['scan_raw']       # MANUAL has no LiDAR
    assert fails('manual', m) == []


def test_mode_and_map_tf():
    s = healthy('navigation')
    s['mode'] = 'manual'
    s['tf_age']['map->odom'] = None
    assert set(fails('navigation', s)) == {'mode_manager mode', 'TF map->odom fresh'}


def test_navigation_needs_lifecycle_localization_and_verify_params():
    s = healthy('navigation')
    s['lifecycle']['controller_server'] = 'inactive'
    s['amcl'] = dict(sigma_xy=0.6, sigma_yaw_deg=3.0)
    s['verify_params'] = 1
    assert set(fails('navigation', s)) == {'lifecycle controller_server', 'AMCL localized', 'verify_params.sh V2'}


def test_saturated_cpu_fails_motion_workflows():
    s = healthy('navigation')
    s['cpu_busy_pct'] = 92.0
    s['processes']['mediamtx'] = 1
    assert fails('navigation', s) == ['CPU headroom']        # the idle relay alone is only a warning
    m = healthy('manual')
    m['cpu_busy_pct'] = 92.0
    assert fails('manual', m) == []


def test_link_safety_absent_is_a_warning_not_a_fail():
    s = healthy('manual')
    s['stm32_link_ok'] = None
    v = {c: lvl for lvl, c, _ in PF.evaluate('manual', s, YAW)}
    assert v['stm32_link_ok'] == 'WARN'
    s['stm32_link_ok'] = False
    assert fails('manual', s) == ['stm32_link_ok']


FAKE_ROBOT = r'''
import math, sys, time, rclpy
from geometry_msgs.msg import TransformStamped, Twist
from nav_msgs.msg import Odometry
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
from sensor_msgs.msg import Imu, LaserScan
from std_msgs.msg import Bool, String
from tf2_msgs.msg import TFMessage
yaw = float(sys.argv[1])
rclpy.init(); n = rclpy.create_node('fake_robot')
lat = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL)
st = n.create_publisher(TFMessage, '/tf_static', lat); tf = n.create_publisher(TFMessage, '/tf', 50)
def tr(parent, child, yaw_=0.0):
    t = TransformStamped(); t.header.frame_id = parent; t.child_frame_id = child; t.header.stamp = n.get_clock().now().to_msg()
    t.transform.rotation.z = math.sin(yaw_ / 2); t.transform.rotation.w = math.cos(yaw_ / 2); return t
st.publish(TFMessage(transforms=[tr('base_link', 'lidar_link', yaw), tr('base_footprint', 'base_link')]))
n.create_publisher(String, '/robot_01/robot_mode_state', lat).publish(String(data='manual'))
n.create_publisher(Bool, '/robot_01/emergency_stop_state', lat).publish(Bool(data=False))
pubs = {k: n.create_publisher(t, '/robot_01/' + k, q) for k, t, q in (('scan', LaserScan, qos_profile_sensor_data),
        ('scan_raw', LaserScan, qos_profile_sensor_data), ('wheel/odom', Odometry, 10), ('odom', Odometry, 10),
        ('imu/data', Imu, qos_profile_sensor_data), ('cmd_vel', Twist, 10))}
period = {'scan': 0.087, 'scan_raw': 0.087, 'wheel/odom': 0.025, 'odom': 0.05, 'imu/data': 0.15, 'cmd_vel': 0.05}
for k, p in period.items():
    n.create_timer(p, lambda k=k: pubs[k].publish(pubs[k].msg_type()))
n.create_timer(0.05, lambda: tf.publish(TFMessage(transforms=[tr('odom', 'base_footprint'), tr('map', 'odom')])))
end = time.time() + float(sys.argv[2])
while time.time() < end: rclpy.spin_once(n, timeout_sec=0.01)
'''


def run_against_fake(tmp_path, published_yaw, expected_yaw):
    pytest.importorskip('rclpy')
    env = dict(os.environ, ROS_DOMAIN_ID=str(150 + os.getpid() % 50), ROS_LOCALHOST_ONLY='1')
    for k in ('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_DEFAULT_PROFILES_FILE'):
        env.pop(k, None)
    script = tmp_path / 'fake_robot.py'
    script.write_text(FAKE_ROBOT)
    fake = subprocess.Popen([sys.executable, str(script), str(published_yaw), '14'], env=env)
    try:
        time.sleep(2.0)
        out = tmp_path / 'pf.json'
        r = subprocess.run([sys.executable, os.path.join(HERE, 'preflight.py'), 'mapping', '--lidar-yaw', str(expected_yaw),
                            '--seconds', '4', '--skip-processes', '--json', str(out)],
                           env=env, capture_output=True, text=True, timeout=60)
        return r, json.loads(out.read_text())
    finally:
        fake.terminate()
        fake.wait(10)


def test_end_to_end_against_fake_publishers(tmp_path):
    r, data = run_against_fake(tmp_path, YAW, YAW)
    bad = [v for v in data['verdicts'] if v[0] == 'FAIL']
    assert r.returncode == 0 and bad == [], r.stdout + r.stderr
    r, data = run_against_fake(tmp_path, -3.0695, YAW)
    assert r.returncode == 1
    assert [v[1] for v in data['verdicts'] if v[0] == 'FAIL'] == ['TF base_link->lidar_link yaw'], r.stdout
