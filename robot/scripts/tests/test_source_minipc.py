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


def source(tmp_path, localhost_only, server):
    root = tmp_path / 'robot'
    (root / 'scripts').mkdir(parents=True)
    (root / 'ros2_ws' / 'install').mkdir(parents=True)
    (root / 'ros2_ws' / 'install' / 'setup.bash').write_text('')
    shutil.copy(SCRIPT, root / 'scripts' / 'source-minipc')
    (root / '.env').write_text('ROS_DOMAIN_ID=30\nRMW_IMPLEMENTATION=rmw_fastrtps_cpp\n'
                               f'ROS_DISCOVERY_SERVER="{server}"\n'
                               f'ROS_LOCALHOST_ONLY={localhost_only}\n')
    return subprocess.run(['bash', '-c', f'source {root}/scripts/source-minipc'],
                          capture_output=True, text=True, env={'PATH': os.environ['PATH']})


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
