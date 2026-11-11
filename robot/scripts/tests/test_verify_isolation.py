"""verify pins its tests to a private domain, whatever the calling shell carries."""
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFY = os.path.join(HERE, '..', 'verify')


def header():
    text = open(VERIFY).read()
    return text[:text.index('FAILURES=0')]


def run(env_extra):
    script = header() + '\nenv | grep -E "^(ROS_|FAST)" | sort\n'
    env = dict(os.environ, **env_extra)
    return subprocess.run(['bash', '-c', script, VERIFY], env=env, capture_output=True, text=True)


def test_robot_shell_environment_is_replaced():
    r = run({'ROS_DOMAIN_ID': '30', 'ROS_LOCALHOST_ONLY': '1', 'ROS_DISCOVERY_SERVER': '127.0.0.1:11811',
             'ROS_SUPER_CLIENT': 'TRUE', 'FASTRTPS_DEFAULT_PROFILES_FILE': '/x.xml'})
    lines = r.stdout.split()
    assert 'ROS_DOMAIN_ID=101' in lines and 'ROS_LOCALHOST_ONLY=1' in lines, r.stdout
    assert not [x for x in lines if x.startswith(('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_'))]


def test_the_robot_domain_is_refused_as_a_test_domain():
    r = run({'VERIFY_ROS_DOMAIN_ID': '30'})
    assert r.returncode == 2 and 'must not be the robot domain' in r.stderr
