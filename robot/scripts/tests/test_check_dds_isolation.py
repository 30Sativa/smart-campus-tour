"""check-dds-isolation parsing and verdicts on `ss` output captured from the
miniPC (2026-10-17) and from the isolated configuration."""
import importlib.machinery
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
loader = importlib.machinery.SourceFileLoader('check_dds_isolation',
                                              os.path.join(HERE, '..', 'check-dds-isolation'))
spec = importlib.util.spec_from_loader(loader.name, loader)
cdi = importlib.util.module_from_spec(spec)
loader.exec_module(cdi)

# Today: discovery server open on every interface, a node bound to 0.0.0.0.
UDP_OPEN = '''\
UNCONN 0 0 0.0.0.0:11811 0.0.0.0:* users:(("fast-discovery-",pid=2268,fd=10))
UNCONN 0 0 10.86.7.244:47970 0.0.0.0:* users:(("fast-discovery-",pid=2268,fd=14))
UNCONN 0 0 0.0.0.0:29410 0.0.0.0:* users:(("amcl",pid=4001,fd=7))
UNCONN 0 0 239.255.0.1:29400 0.0.0.0:* users:(("amcl",pid=4001,fd=6))
UNCONN 0 0 0.0.0.0:21119 0.0.0.0:* users:(("rustdesk",pid=1954,fd=26))
UNCONN 0 0 [::]:41641 [::]:*
'''
# After S1-S3 (loopback server profile).
UDP_CLOSED = '''\
UNCONN 0 0 127.0.0.1:11811 0.0.0.0:* users:(("fast-discovery-",pid=2268,fd=10))
UNCONN 0 0 127.0.0.1:29410 0.0.0.0:* users:(("amcl",pid=4001,fd=7))
UNCONN 0 0 239.255.0.1:29400 0.0.0.0:* users:(("amcl",pid=4001,fd=6))
UNCONN 0 0 0.0.0.0:21119 0.0.0.0:* users:(("rustdesk",pid=1954,fd=26))
'''
TCP_BRIDGE_LO = 'LISTEN 0 128 127.0.0.1:8765 0.0.0.0:* users:(("foxglove_bridge",pid=5000,fd=9))\n'
TCP_BRIDGE_OPEN = 'LISTEN 0 128 0.0.0.0:8765 0.0.0.0:* users:(("foxglove_bridge",pid=5000,fd=9))\n'
DDS = {2268: 'fast-discovery-', 4001: 'amcl', 5000: 'foxglove_bridge'}


def levels(results):
    return [lvl for lvl, _ in results]


def test_parse_ss_handles_v4_v6_scope_and_missing_process():
    rows = cdi.parse_ss(UDP_OPEN + 'UNCONN 0 0 100.1.2.3%tailscale0:5 0.0.0.0:*\n')
    assert rows[0] == ('0.0.0.0', '11811', [('fast-discovery-', 2268)])
    assert rows[5] == ('::', '41641', [])
    assert rows[6][0] == '100.1.2.3'


def test_multicast_and_loopback_classification():
    assert cdi.is_multicast('239.255.0.1') and cdi.is_multicast('ff02::1')
    assert not cdi.is_multicast('23.1.2.3') and not cdi.is_multicast('10.86.7.244')
    assert cdi.is_loopback('127.0.0.1') and cdi.is_loopback('::1')
    assert not cdi.is_loopback('0.0.0.0')


def test_current_minipc_state_fails():
    res = cdi.check_sockets(cdi.parse_ss(UDP_OPEN), cdi.parse_ss(TCP_BRIDGE_OPEN), DDS)
    text = ' '.join(t for _, t in res)
    assert levels(res).count('FAIL') == 3, res
    for word in ('discovery server', 'amcl[4001]', 'foxglove_bridge listens'):
        assert word in text, word
    assert 'rustdesk' not in text, 'non-DDS processes are out of scope'


def test_isolated_state_passes():
    res = cdi.check_sockets(cdi.parse_ss(UDP_CLOSED), cdi.parse_ss(TCP_BRIDGE_LO), DDS)
    assert 'FAIL' not in levels(res), res


def test_env_checks_include_the_e1b_trap():
    ok = cdi.check_env({'ROS_LOCALHOST_ONLY': '1', 'ROS_DISCOVERY_SERVER': '127.0.0.1:11811'})
    assert levels(ok) == ['PASS', 'PASS']
    trap = cdi.check_env({'ROS_LOCALHOST_ONLY': '1', 'ROS_DISCOVERY_SERVER': '10.86.7.244:11811'})
    assert levels(trap).count('FAIL') == 2
    today = cdi.check_env({'ROS_LOCALHOST_ONLY': '0', 'ROS_DISCOVERY_SERVER': '127.0.0.1:11811'})
    assert levels(today) == ['FAIL', 'PASS']
    assert 'FAIL' in levels(cdi.check_env({}))


def test_sshd_password_warning(tmp_path):
    cfg = tmp_path / 'sshd_config'
    cfg.write_text('KbdInteractiveAuthentication no\n')
    assert levels(cdi.check_host(str(cfg))) == ['WARN']
    (tmp_path / 'sshd_config.d').mkdir()
    (tmp_path / 'sshd_config.d' / '50-keys.conf').write_text('PasswordAuthentication no\n')
    assert levels(cdi.check_host(str(cfg))) == ['PASS']
    cfg.write_text('PasswordAuthentication yes\n')       # first match wins: the .d file
    assert levels(cdi.check_host(str(cfg))) == ['PASS']
