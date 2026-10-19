"""source-minipc refuses ROS_LOCALHOST_ONLY=1 with a non-loopback discovery
server: the robot nodes would silently stop discovering each other
(case E1b in robot/docs/dds-isolation.md)."""
import os
import shutil
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'source-minipc')

pytestmark = pytest.mark.skipif(not os.path.isfile('/opt/ros/humble/setup.bash'),
                                reason='source-minipc sources ROS 2 Humble')


def source(tmp_path, localhost_only, server, *, active_server='', external=False,
           inherited=None, nounset=False):
    root = tmp_path / 'runtime with spaces' / 'robot'
    (root / 'scripts').mkdir(parents=True)
    (root / 'ros2_ws' / 'install').mkdir(parents=True)
    (root / 'ros2_ws' / 'install' / 'setup.bash').write_text('')
    shutil.copy(SCRIPT, root / 'scripts' / 'source-minipc')
    bin_ = tmp_path / 'bin'
    bin_.mkdir()
    (bin_ / 'pgrep').write_text('#!/bin/bash\nprintf "%s\\n" "$TEST_SERVER_CMD"\n')
    (bin_ / 'pgrep').chmod(0o755)
    (root / '.env').write_text('ROS_DOMAIN_ID=30\nRMW_IMPLEMENTATION=rmw_fastrtps_cpp\n'
                               f'ROS_DISCOVERY_SERVER="{server}"\n'
                               f'ROS_LOCALHOST_ONLY={localhost_only}\n')
    env = {'PATH': f'{bin_}:{os.environ["PATH"]}', 'TEST_SERVER_CMD': active_server,
           **(inherited or {})}
    helper = root / 'scripts' / 'source-minipc'
    if external:
        helper = SCRIPT
        env['ROBOT_RUNTIME_ROOT'] = str(root)
    command = ('set -u; ' if nounset else '') + f'source "{helper}" && '
    command += 'printf "ROOT=%s\\nMAP=%s\\nFLAGS=%s\\n" "$ROBOT_ROOT" "$ROBOT_MAP_DIR" "$-" && env'
    return subprocess.run(['bash', '-c', command], capture_output=True, text=True, env=env)


@pytest.mark.parametrize('localhost_only,server,ok', [
    ('0', '127.0.0.1:11811', True),          # today
    ('0', '10.86.7.244:11811', True),        # today, LAN server: not our business here
    ('1', '127.0.0.1:11811', True),          # after S2
    ('1', 'localhost:11811', True),
    ('1', '10.86.7.244:11811', False),       # E1b
    ('1', '127.0.0.1:11811;10.0.0.5:11811', False),
])
def test_localhost_only_requires_loopback_discovery_server(tmp_path, localhost_only, server, ok):
    r = source(tmp_path, localhost_only, server)
    assert (r.returncode == 0) == ok, r.stderr
    if not ok:
        assert 'needs ROS_DISCOVERY_SERVER on 127.0.0.1' in r.stderr


@pytest.mark.parametrize('localhost_only,command,ok', [
    ('0', '--server-id 0', True),
    ('1', '--server-id 0', False),  # loopback .env alone does not fix E1b
    ('0', '--server-id 0 -l 127.0.0.1 -p 11811', True),
    ('1', '--server-id 0 -l 127.0.0.1 -p 11811', True),
    ('1', '--server-id 0 -l 10.86.7.244 -p 11811', False),
    ('0', '-x /etc/fastdds/discovery_server_loopback.xml', False),
    ('1', '-x /etc/fastdds/discovery_server_loopback.xml', True),
])
def test_live_server_must_be_compatible_with_node_transport(tmp_path, localhost_only, command, ok):
    r = source(tmp_path, localhost_only, '127.0.0.1:11811',
               active_server=f'99 /opt/ros/humble/tools/fastdds/fast-discovery-server {command}')
    assert (r.returncode == 0) == ok, r.stderr
    if not ok:
        assert 'E1b' in r.stderr or 'server is loopback-only' in r.stderr


def test_reviewed_helper_can_load_the_existing_runtime_without_a_worktree_install(tmp_path):
    r = source(tmp_path, '0', '127.0.0.1:11811', external=True, nounset=True,
               inherited={'ROS_SUPER_CLIENT': 'TRUE',
                          'FASTRTPS_DEFAULT_PROFILES_FILE': '/wrong/profile.xml'})
    assert r.returncode == 0, r.stderr
    root = tmp_path / 'runtime with spaces' / 'robot'
    assert f'ROOT={root}' in r.stdout and f'MAP={root}/robot_maps' in r.stdout
    assert 'ROS_SUPER_CLIENT=' not in r.stdout
    assert 'FASTRTPS_DEFAULT_PROFILES_FILE=' not in r.stdout
    flags = next(s for s in r.stdout.splitlines() if s.startswith('FLAGS='))
    assert 'u' in flags
