"""static_capture.py -> wall_yaw.py against a fake LiDAR on a private localhost-only domain."""
import json
import math
import os
import subprocess
import sys
import time

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from test_wall_yaw import scene  # noqa: E402

FAKE_LIDAR = r'''
import json, math, sys, time, numpy as np, rclpy
from geometry_msgs.msg import TransformStamped
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
from sensor_msgs.msg import LaserScan
from tf2_msgs.msg import TFMessage
z = np.load(sys.argv[1]); meta = json.loads(str(z['meta'])); ranges = z['ranges']; tf_yaw = float(sys.argv[2])
rclpy.init(); n = rclpy.create_node('fake_lidar')
st = n.create_publisher(TFMessage, '/tf_static', QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE,
                                                            durability=DurabilityPolicy.TRANSIENT_LOCAL))
t = TransformStamped(); t.header.frame_id = 'base_link'; t.child_frame_id = 'lidar_link'
t.transform.rotation.z = math.sin(tf_yaw / 2); t.transform.rotation.w = math.cos(tf_yaw / 2)
st.publish(TFMessage(transforms=[t]))
pub = n.create_publisher(LaserScan, '/robot_01/scan_raw', qos_profile_sensor_data)
k = [0]
def tick():
    m = LaserScan(); m.header.frame_id = 'lidar_link'; m.angle_min = meta['angle_min']; m.angle_increment = meta['inc']
    m.ranges = [float(v) for v in ranges[k[0] % len(ranges)]]; k[0] += 1; pub.publish(m)
n.create_timer(0.02, tick)
end = time.time() + 20
while time.time() < end: rclpy.spin_once(n, timeout_sec=0.01)
'''


def test_capture_then_wall_fit_recovers_the_mount(tmp_path):
    pytest.importorskip('rclpy')
    env = dict(os.environ, ROS_DOMAIN_ID=str(200 + os.getpid() % 30), ROS_LOCALHOST_ONLY='1')
    for k in ('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_DEFAULT_PROFILES_FILE'):
        env.pop(k, None)
    src, front, rear, base = scene(-181.0, 'right', 110, 1.5, n=30)
    (tmp_path / 'fake.py').write_text(FAKE_LIDAR)
    fake = subprocess.Popen([sys.executable, str(tmp_path / 'fake.py'), src, '3.1241'], env=env)
    try:
        time.sleep(2.0)
        out = tmp_path / 'cap.npz'
        r = subprocess.run([sys.executable, os.path.join(HERE, 'static_capture.py'), str(out), '--scans', '60'],
                           env=env, capture_output=True, text=True, timeout=60)
        assert r.returncode == 0, r.stdout + r.stderr
    finally:
        fake.terminate()
        fake.wait(10)
        os.unlink(src)
    z = np.load(out)
    assert z['ranges'].shape[0] == 60
    assert abs(json.loads(str(z['meta']))['tf_lidar_yaw'] - 3.1241) < 1e-4
    w = subprocess.run([sys.executable, os.path.join(HERE, 'wall_yaw.py'), str(out), '--side', 'right', '--front-cm',
                        str(front), '--rear-cm', str(rear), '--baseline-m', str(base)], capture_output=True, text=True, check=True)
    got = float(next(x for x in w.stdout.splitlines() if x.startswith('MOUNT YAW')).split()[2])
    assert abs(((got + 181.0 + 180) % 360) - 180) < 0.3, w.stdout
    assert math.isfinite(got)
