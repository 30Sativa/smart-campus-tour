"""stopkey.py and record_session.sh against fake services / an empty graph on a private
localhost-only domain. Skipped without ROS."""
import os
import subprocess
import sys
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))

FAKE_MODE_MANAGER = r'''
import sys, time, rclpy
from action_msgs.srv import CancelGoal
from std_srvs.srv import SetBool
rclpy.init(); n = rclpy.create_node('fake_mode_manager')
log = open(sys.argv[1], 'a')
def estop(req, res):
    log.write(f'estop {req.data}\n'); log.flush(); res.success = True; return res
def cancel(req, res):
    log.write(f'cancel {req.goal_info.goal_id.uuid.tolist() == [0] * 16}\n'); log.flush(); return res
n.create_service(SetBool, '/robot_01/emergency_stop', estop)
n.create_service(CancelGoal, '/robot_01/navigate_to_pose/_action/cancel_goal', cancel)
end = time.time() + 25
while time.time() < end: rclpy.spin_once(n, timeout_sec=0.05)
'''


def private_env(base):
    pytest.importorskip('rclpy')
    env = dict(os.environ, ROS_DOMAIN_ID=str(base + os.getpid() % 10), ROS_LOCALHOST_ONLY='1')
    for k in ('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_DEFAULT_PROFILES_FILE'):
        env.pop(k, None)
    return env


def test_stopkey_stops_cancels_all_and_releases_only_on_yes(tmp_path):
    env = private_env(60)
    log = tmp_path / 'calls.log'
    (tmp_path / 'fake.py').write_text(FAKE_MODE_MANAGER)
    fake = subprocess.Popen([sys.executable, str(tmp_path / 'fake.py'), str(log)], env=env)
    try:
        time.sleep(1.5)
        r = subprocess.run([sys.executable, os.path.join(HERE, 'stopkey.py'), '/robot_01'], env=env,
                           input='\nr\nno\nr\nyes\nq\n', capture_output=True, text=True, timeout=30)
    finally:
        fake.terminate()
        fake.wait(10)
    assert r.returncode == 0, r.stdout + r.stderr
    assert 'READY' in r.stdout and 'STOP at' in r.stdout
    calls = log.read_text().split('\n')
    # one stop + cancel-all (zero goal id), then a release only after "yes"
    assert sorted(calls[:2]) == ['cancel True', 'estop True'], calls
    assert calls[2:] == ['estop False', ''], calls


def test_record_session_starts_and_closes_a_bag(tmp_path):
    env = private_env(70)
    script = os.path.join(HERE, 'record_session.sh')
    d = tmp_path / 'session'
    r = subprocess.run(['bash', script, 'start', str(d)], env=env, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stdout + r.stderr
    again = subprocess.run(['bash', script, 'start', str(d)], env=env, capture_output=True, text=True, timeout=30)
    assert again.returncode == 2 and 'REFUSED' in again.stderr
    r = subprocess.run(['bash', script, 'stop', str(d)], env=env, capture_output=True, text=True, timeout=40)
    assert r.returncode == 0 and 'bag closed' in r.stdout, r.stdout + r.stderr
    assert (d / 'bag' / 'metadata.yaml').is_file()
