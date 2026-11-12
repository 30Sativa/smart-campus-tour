"""The verdict step of static_lidar_check.sh, run on prepared capture/fit outputs."""
import json
import os
import re
import shutil
import subprocess
import sys
import time

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))


def verdict(tmp_path, wall_deg, tf_yaw, yaw='3.1241'):
    np.savez_compressed(tmp_path / 'capture.npz', ranges=np.zeros((1, 3)), meta=json.dumps({'tf_lidar_yaw': tf_yaw}))
    (tmp_path / 'wall_yaw.txt').write_text(f'MOUNT YAW {wall_deg:+.2f} deg = 0 rad\n')
    script = open(os.path.join(HERE, 'static_lidar_check.sh')).read()
    step = script[script.index('python3 - "$out" "$yaw"'):]
    r = subprocess.run(['bash', '-c', f'out={tmp_path}; yaw={yaw}; {step}'], capture_output=True, text=True)
    return r, dict(line.split('=', 1) for line in (tmp_path / 'verdict.txt').read_text().split())


@pytest.mark.parametrize('wall_deg,tf_yaw,want,code', [
    (-180.8, 3.1241, 'PASS', 0),
    (-182.9, 3.1241, 'INCONCLUSIVE', 1),
    (-175.9, 3.1241, 'FAIL', 1),          # the 02/11 value: the mount moved, or 02/11 was wrong
    (-181.0, -3.0695, 'FAIL', 1),         # the launch did not apply the candidate
    (-181.0, None, 'FAIL', 1),
])
def test_verdicts(tmp_path, wall_deg, tf_yaw, want, code):
    r, v = verdict(tmp_path, wall_deg, tf_yaw)
    assert r.returncode == code and v['verdict'] == want, r.stdout + r.stderr
    assert v['candidate_rad'] == '3.1241'
    assert re.fullmatch(r'-?\d+\.\d{3}', v['difference_deg'])


def test_refuses_without_a_runtime_and_leaves_no_session_dir(tmp_path):
    out = tmp_path / 'session'
    r = subprocess.run(['bash', os.path.join(HERE, 'static_lidar_check.sh'), '--motor-power-off-confirmed', '--side', 'right',
                        '--front-cm', '100', '--rear-cm', '100', '--baseline-m', '0.6', '--out', str(out)],
                       env={'HOME': str(tmp_path), 'PATH': '/usr/bin:/bin'}, capture_output=True, text=True, timeout=30)
    # On the MiniPC a live robot stack refuses first, for the better reason; either way
    # nothing starts and no session directory is left behind.
    assert r.returncode == 2, r.stdout + r.stderr
    assert 'robot_description not found' in r.stderr or 'robot processes are running' in r.stdout
    assert not out.exists()


def test_refuses_without_the_power_off_confirmation(tmp_path):
    r = subprocess.run(['bash', os.path.join(HERE, 'static_lidar_check.sh'), '--side', 'right', '--front-cm', '1',
                        '--rear-cm', '1', '--baseline-m', '0.6', '--out', str(tmp_path / 's')], capture_output=True, text=True)
    assert r.returncode == 2 and 'motor-power-off-confirmed' in r.stdout


@pytest.mark.parametrize('args', [
    ['--front-cm', 'F', '--rear-cm', 'R', '--baseline-m', 'L'],           # placeholders typed as-is
    ['--front-cm', '100', '--rear-cm', '101', '--baseline-m', '60'],      # baseline in cm by mistake
])
def test_tape_numbers_are_checked_before_anything_starts(tmp_path, args):
    out = tmp_path / 'session'
    r = subprocess.run(['bash', os.path.join(HERE, 'static_lidar_check.sh'), '--motor-power-off-confirmed',
                        '--side', 'right', *args, '--out', str(out)], capture_output=True, text=True, timeout=30)
    assert r.returncode == 2 and 'REFUSED' in (r.stdout + r.stderr), r.stdout + r.stderr
    assert not out.exists()


def test_generated_params_reach_the_namespaced_state_publisher(tmp_path):
    """The script runs robot_state_publisher under /robot_01; its params file must match."""
    pytest.importorskip('rclpy')
    rsp = '/opt/ros/humble/lib/robot_state_publisher/robot_state_publisher'
    if not os.path.exists(rsp) or not shutil.which('xacro'):
        pytest.skip('robot_state_publisher / xacro not installed')
    script = open(os.path.join(HERE, 'static_lidar_check.sh')).read()
    dump = re.search(r'python3 -c "(import sys, yaml;[^"]+)"', script).group(1)
    src = os.path.abspath(os.path.join(HERE, '..', '..', 'ros2_ws', 'src', 'robot_description'))
    idx = tmp_path / 'idx'
    (idx / 'share' / 'ament_index' / 'resource_index' / 'packages').mkdir(parents=True)
    (idx / 'share' / 'ament_index' / 'resource_index' / 'packages' / 'robot_description').write_text('')
    (idx / 'share' / 'robot_description').symlink_to(src)
    env = dict(os.environ, AMENT_PREFIX_PATH=f'{idx}:' + os.environ.get('AMENT_PREFIX_PATH', ''),
               ROS_DOMAIN_ID=str(80 + os.getpid() % 10), ROS_LOCALHOST_ONLY='1')
    for k in ('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_DEFAULT_PROFILES_FILE'):
        env.pop(k, None)
    urdf = subprocess.run(['xacro', os.path.join(src, 'urdf', 'robot.urdf.xacro'), 'use_sim:=false',
                           'use_ros2_control:=false', 'lidar_yaw:=3.1241'], env=env, capture_output=True, text=True, check=True).stdout
    (tmp_path / 'robot.urdf').write_text(urdf)
    params = subprocess.run([sys.executable, '-c', dump, str(tmp_path / 'robot.urdf')], capture_output=True, text=True, check=True).stdout
    (tmp_path / 'rsp.yaml').write_text(params)
    node = subprocess.Popen([rsp, '--ros-args', '-r', '__ns:=/robot_01', '--params-file', str(tmp_path / 'rsp.yaml')],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        time.sleep(1.5)
        assert node.poll() is None, node.communicate()[0]          # it aborted with the old params key
        probe = ('import math, time, rclpy\n'
                 'from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy\n'
                 'from tf2_msgs.msg import TFMessage\n'
                 'rclpy.init(); n = rclpy.create_node("probe"); got = []\n'
                 'n.create_subscription(TFMessage, "/tf_static", lambda m: got.extend(m.transforms), QoSProfile(depth=10, '
                 'reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL))\n'
                 't0 = time.time()\n'
                 'while time.time() - t0 < 4 and not any(t.child_frame_id == "lidar_link" for t in got): rclpy.spin_once(n, timeout_sec=0.1)\n'
                 'q = next(t.transform.rotation for t in got if t.child_frame_id == "lidar_link")\n'
                 'print(math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)))\n')
        yaw = float(subprocess.run([sys.executable, '-c', probe], env=env, capture_output=True, text=True,
                                   timeout=30, check=True).stdout.split()[-1])
        assert abs(yaw - 3.1241) < 1e-4
    finally:
        node.terminate()
        node.wait(10)
