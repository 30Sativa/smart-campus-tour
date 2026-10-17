"""Security and consistency contract for remote debugging (dds-isolation.md).

foxglove_bridge has no authentication, so what it exposes is decided here:
loopback only, read-only, an explicit read allowlist. The single remote write
(initial pose) is initialpose_guard's own loopback port, not the bridge:
bridge 3.6.0 ignores client_topic_whitelist (a test client published cmd_vel).
"""
import importlib.util
import os
import re

import yaml

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROBOT = os.path.abspath(os.path.join(PKG, '..', '..', '..'))
BRIDGE_YAML = os.path.join(PKG, 'config', 'debug_bridge.yaml')
LAUNCH = os.path.join(PKG, 'launch', 'debug_bridge.launch.py')
FOX2ROS_TOPICS = os.path.join(ROBOT, 'tools', 'rviz_over_ssh', 'fox2ros_topics.yaml')

# Things a remote viewer must never be able to read or write.
NEVER_WRITE = ['/robot_01/cmd_vel', '/cmd_vel', '/robot_01/cmd_vel_nav', '/robot_01/cmd_vel_ctrl',
               '/robot_01/initialpose', '/initialpose', '/robot_01/goal_pose', '/tf', '/tf_static',
               '/robot_01/navigate_to_pose/_action/send_goal', '/robot_01/debug/initialpose_x',
               '/robot_01/x/debug/initialpose', '/robot_01/map']
NEVER_READ = ['/robot_01/cmd_vel', '/robot_01/cmd_vel_nav', '/rosout', '/parameter_events',
              '/robot_01/initialpose', '/robot_01/debug/initialpose_status',
              '/robot_01/navigate_to_pose/_action/feedback', '/robot_01/camera/depth/points',
              '/robot_01/scan_raw', '/robot_01/imu/data', '/robot_01/scanx', '/robot_01/a/scan']


def params():
    with open(BRIDGE_YAML) as f:
        return yaml.safe_load(f)['foxglove_bridge']['ros__parameters']


def matches(patterns, topic):
    return any(re.search(p, topic) for p in patterns)


def test_bridge_listens_on_loopback_only_and_is_not_an_argument():
    p = params()
    assert p['address'] == '127.0.0.1'
    with open(LAUNCH) as f:
        src = f.read()
    assert "'address'" not in src and '"address"' not in src, 'address must not be overridable'


def test_bridge_is_read_only():
    p = params()
    # clientPublish is the only bridge capability that writes ROS topics; with
    # it the bridge would let any client publish anything (whitelist ignored).
    assert p['capabilities'] == ['connectionGraph']
    for key in ('client_topic_whitelist', 'param_whitelist', 'service_whitelist',
                'asset_uri_allowlist'):
        assert p[key] == ['(?!)'], key
    for t in NEVER_WRITE:
        assert not matches(p['client_topic_whitelist'], t), t
    assert p['remote_access'] is False and p['include_hidden'] is False


def test_read_allowlist_excludes_control_and_heavy_topics():
    allowed = params()['topic_whitelist']
    assert all(p.startswith('^') and p.endswith('$') for p in allowed), 'anchor every pattern'
    for t in NEVER_READ:
        assert not matches(allowed, t), t


def test_every_fox2ros_topic_is_exposed_by_the_robot():
    with open(FOX2ROS_TOPICS) as f:
        cfg = yaml.safe_load(f)
    allowed = params()['topic_whitelist']
    for ns in ('/robot_01', ''):
        for d in cfg['downlink']:
            topic = d['name'] if d['name'].startswith('/') else f'{ns}/{d["name"]}'
            assert matches(allowed, topic), f'{topic} is in fox2ros_topics.yaml but not exposed'
    assert set(cfg) == {'downlink'}, 'laptop -> robot only through initialpose_guard'


def test_send_buffer_fits_the_largest_message():
    # map2 map / global costmap are ~2.8 MB; a smaller limit drops them forever.
    assert 3_000_000 <= params()['send_buffer_limit'] <= 8_000_000


def load_launch():
    spec = importlib.util.spec_from_file_location('debug_bridge_launch', LAUNCH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.generate_launch_description()


def test_launch_super_client_only_for_bridge_and_both_nodes_respawn():
    from launch_ros.actions import Node
    nodes = [e for e in load_launch().entities if isinstance(e, Node)]
    assert {n.node_executable for n in nodes} == {'foxglove_bridge', 'initialpose_guard'}
    for n in nodes:
        # launch keeps these private; there is no public accessor in Humble.
        pairs = n.process_description._Executable__additional_env or []
        env = {k[0].text: v[0].text for k, v in pairs}
        if n.node_executable == 'foxglove_bridge':
            assert env == {'ROS_SUPER_CLIENT': 'TRUE'}
        else:
            assert 'ROS_SUPER_CLIENT' not in env
        assert n._ExecuteLocal__respawn is True
        prefix = ''.join(x.text for x in n.process_description._Executable__prefix)
        assert prefix == 'nice -n 10', 'debug tools must yield the CPU to Nav2'


def test_guard_port_address_is_not_configurable():
    with open(os.path.join(PKG, 'robot_navigation', 'initialpose_guard.py')) as f:
        src = f.read()
    assert "Server(('127.0.0.1', port)" in src
    assert "declare_parameter('listen_address'" not in src


def test_navigation_launch_does_not_start_remote_debugging():
    with open(os.path.join(PKG, 'launch', 'navigation.launch.py')) as f:
        src = f.read()
    for word in ('foxglove', 'debug_bridge', 'initialpose_guard', 'ROS_SUPER_CLIENT'):
        assert word not in src, word
