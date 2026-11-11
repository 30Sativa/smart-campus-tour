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
from geometry_msgs.msg import Twist
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_msgs.msg import Bool
from std_srvs.srv import SetBool
rclpy.init(); n = rclpy.create_node('fake_mode_manager')
log = open(sys.argv[1], 'a'); behaviour = sys.argv[2]          # good | silent | moving
latched = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL)
state_pub = n.create_publisher(Bool, '/robot_01/emergency_stop_state', latched)
cmd_pub = n.create_publisher(Twist, '/robot_01/cmd_vel', 10)
stopped = [False]
state_pub.publish(Bool(data=False))
def estop(req, res):
    log.write(f'estop {req.data}\n'); log.flush(); stopped[0] = req.data
    state_pub.publish(Bool(data=req.data)); res.success = True; return res
def cancel(req, res):
    log.write(f'cancel {req.goal_info.goal_id.uuid.tolist() == [0] * 16}\n'); log.flush(); return res
def tick():
    if behaviour == 'silent':
        return
    t = Twist(); t.linear.x = 0.0 if (stopped[0] and behaviour == 'good') else 0.1; cmd_pub.publish(t)
n.create_service(SetBool, '/robot_01/emergency_stop', estop)
n.create_service(CancelGoal, '/robot_01/navigate_to_pose/_action/cancel_goal', cancel)
n.create_timer(0.05, tick)
end = time.time() + 25
while time.time() < end: rclpy.spin_once(n, timeout_sec=0.02)
'''


def private_env(base):
    pytest.importorskip('rclpy')
    env = dict(os.environ, ROS_DOMAIN_ID=str(base + os.getpid() % 10), ROS_LOCALHOST_ONLY='1')
    for k in ('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_DEFAULT_PROFILES_FILE'):
        env.pop(k, None)
    return env


def run_stopkey(tmp_path, behaviour, keys):
    env = private_env(60)
    log = tmp_path / 'calls.log'
    (tmp_path / 'fake.py').write_text(FAKE_MODE_MANAGER)
    fake = subprocess.Popen([sys.executable, str(tmp_path / 'fake.py'), str(log), behaviour], env=env)
    try:
        time.sleep(1.5)
        r = subprocess.run([sys.executable, os.path.join(HERE, 'stopkey.py'), '/robot_01'], env=env,
                           input=keys, capture_output=True, text=True, timeout=30)
    finally:
        fake.terminate()
        fake.wait(10)
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout, log.read_text().split('\n')


def test_stopkey_stops_confirms_and_releases_only_on_yes(tmp_path):
    out, calls = run_stopkey(tmp_path, 'good', '\nr\nno\nr\nyes\nq\n')
    assert 'does NOT cut motor power' in out
    assert 'SOFTWARE STOP CONFIRMED' in out and 'NOT CONFIRMED' not in out, out
    # one stop + cancel-all (zero goal id), then a release only after "yes"
    assert sorted(calls[:2]) == ['cancel True', 'estop True'], calls
    assert calls[2:] == ['estop False', ''], calls


def test_stopkey_never_claims_a_stop_it_cannot_see(tmp_path):
    out, _ = run_stopkey(tmp_path, 'silent', '\nq\n')
    assert 'SOFTWARE STOP NOT CONFIRMED' in out and 'cmd_vel message' in out, out
    assert 'PRESS THE HARDWARE E-STOP' in out


def test_stopkey_reports_a_stop_that_did_not_take(tmp_path):
    out, _ = run_stopkey(tmp_path, 'moving', '\nq\n')
    assert 'SOFTWARE STOP NOT CONFIRMED: cmd_vel not zero' in out, out


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


def test_stopkey_says_when_it_cannot_reach_mode_manager(tmp_path):
    env = private_env(65)
    p = subprocess.Popen([sys.executable, os.path.join(HERE, 'stopkey.py'), '/robot_01'], env=env,
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        out, _ = p.communicate(timeout=9)
    except subprocess.TimeoutExpired:
        p.kill()
        out, _ = p.communicate()
    assert 'SOFTWARE STOP NOT AVAILABLE' in out and 'HARDWARE E-STOP' in out, out
    assert 'READY' not in out
