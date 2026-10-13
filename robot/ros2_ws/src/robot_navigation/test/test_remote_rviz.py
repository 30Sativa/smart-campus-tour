"""Package contract plus real Humble launch/QoS/message forwarding checks.

Use a fresh interpreter for ROS checks: other packages' offline tests stub ROS.
"""

import os
from pathlib import Path
import runpy
import subprocess
import sys
import time
from unittest import mock
import xml.etree.ElementTree as ET

import pytest
import yaml


PACKAGE = Path(__file__).resolve().parents[1]


def test_relay_and_launch_are_installed(monkeypatch):
    monkeypatch.chdir(PACKAGE)
    with mock.patch('setuptools.setup') as setup:
        runpy.run_path(str(PACKAGE / 'setup.py'))
    metadata = setup.call_args.kwargs
    assert 'robot_navigation' in metadata['packages']
    assert metadata['entry_points']['console_scripts'] == [
        'tf_rviz_relay = robot_navigation.tf_rviz_relay:main',
        'scan_rviz = robot_navigation.scan_rviz:main']
    installed = dict(metadata['data_files'])
    assert 'launch/remote_rviz.launch.py' in installed['share/robot_navigation/launch']
    assert 'rviz/navigation.rviz' in installed['share/robot_navigation/rviz']
    assert 'rviz/remote_navigation.rviz' in installed['share/robot_navigation/rviz']
    assert 'config/scan_rviz.yaml' in installed['share/robot_navigation/config']
    manifest = ET.parse(PACKAGE / 'package.xml').getroot()
    dependencies = {entry.text for entry in manifest.findall('exec_depend')}
    assert {'rclpy', 'tf2_msgs', 'rviz2', 'nav2_rviz_plugins'} <= dependencies
    assert {'tf2_ros_py', 'sensor_msgs', 'sensor_msgs_py', 'std_msgs'} <= dependencies


def test_remote_cloud_frame_and_display_contract():
    config = yaml.safe_load((PACKAGE / 'rviz/remote_navigation.rviz').read_text())
    params = yaml.safe_load((PACKAGE / 'config/scan_rviz.yaml').read_text())
    manager = config['Visualization Manager']
    assert manager['Global Options']['Fixed Frame'] == params['/**']['ros__parameters']['target_frame']
    assert not any(display['Class'] == 'rviz_default_plugins/LaserScan'
                   for display in manager['Displays'])
    [lidar] = [display for display in manager['Displays']
               if display.get('Topic', {}).get('Value') == 'scan_rviz']
    assert lidar['Class'] == 'rviz_default_plugins/PointCloud2'
    assert lidar['Enabled']
    assert lidar['Topic'] == {
        'Value': 'scan_rviz', 'Depth': 1, 'History Policy': 'Keep Last',
        'Reliability Policy': 'Best Effort', 'Durability Policy': 'Volatile'}
    assert lidar['Decay Time'] == 0


def run_qt_layout_probe():
    try:
        from PyQt5 import QtCore, QtWidgets
    except ImportError:
        return 77

    config = yaml.safe_load((PACKAGE / 'rviz/remote_navigation.rviz').read_text())
    geometry = config['Window Geometry']
    assert not geometry['Hide Left Dock']
    assert not geometry['Hide Right Dock']
    state = QtCore.QByteArray.fromHex(geometry['QMainWindow State'].encode())
    app = QtWidgets.QApplication([])
    expected = {'Displays': QtCore.Qt.LeftDockWidgetArea,
                'Views': QtCore.Qt.RightDockWidgetArea,
                'Navigation 2': QtCore.Qt.LeftDockWidgetArea}
    # RViz Humble creates panels on the left, with objectName == panel Name,
    # then calls QMainWindow.restoreState(). Repeat in a fresh window to check
    # persistence, including a Qt save/restore round trip.
    for _ in range(2):
        window = QtWidgets.QMainWindow()
        window.resize(geometry['Width'], geometry['Height'])
        window.setCentralWidget(QtWidgets.QWidget())
        toolbar = window.addToolBar('Tools')
        toolbar.setObjectName('Tools')
        docks = {}
        for panel in config['Panels']:
            name = panel['Name']
            dock = QtWidgets.QDockWidget(name, window)
            dock.setObjectName(name)
            dock.setWidget(QtWidgets.QWidget())
            window.addDockWidget(QtCore.Qt.LeftDockWidgetArea, dock)
            docks[name] = dock
        assert window.restoreState(state), 'Qt rejected the saved RViz docking state'
        window.show()
        app.processEvents()
        assert set(docks) == set(expected)
        for name, area in expected.items():
            assert window.dockWidgetArea(docks[name]) == area, name
            assert not docks[name].isFloating(), name
            assert docks[name].isVisible(), name
        assert docks['Displays'].geometry().right() < window.centralWidget().geometry().left()
        assert window.centralWidget().geometry().right() < docks['Views'].geometry().left()
        state = window.saveState()
        window.close()
    return 0


def test_remote_rviz_docking_restores():
    env = os.environ.copy()
    env['QT_QPA_PLATFORM'] = 'offscreen'
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), '--qt-layout'],
        env=env, capture_output=True, text=True, timeout=15)
    if result.returncode == 77:
        pytest.skip('PyQt5 unavailable; verify docking in RViz on the laptop')
    assert result.returncode == 0, result.stdout + result.stderr


def run_ros_probe(robot_id):
    try:
        import rclpy
        from launch import LaunchContext
        from launch.actions import DeclareLaunchArgument
        from launch_ros.actions import Node as LaunchNode
    except ImportError:
        return 77

    from geometry_msgs.msg import TransformStamped
    from rclpy.executors import SingleThreadedExecutor
    from rclpy.node import Node
    from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy
    sys.path.insert(0, str(PACKAGE))
    from robot_navigation.tf_rviz_relay import TfRvizRelay
    from tf2_msgs.msg import TFMessage

    generate_launch_description = runpy.run_path(
        str(PACKAGE / 'launch/remote_rviz.launch.py'))['generate_launch_description']
    # Resolve the actual launch actions without starting RViz or any robot process.
    for sim_time in ('false', 'true'):
        description = generate_launch_description()
        context = LaunchContext()
        context.launch_configurations.update(robot_id=robot_id, use_sim_time=sim_time)
        for action in description.entities:
            if isinstance(action, DeclareLaunchArgument):
                action.execute(context)
        nodes = [action for action in description.entities if isinstance(action, LaunchNode)]
        assert len(nodes) == 3
        relay_action, scan_action, rviz_action = nodes
        for node in nodes:
            node._perform_substitutions(context)
            assert node.expanded_node_namespace == ('/' + robot_id if robot_id else '/')
            params_file, is_file = node._Node__expanded_parameter_arguments[-1]
            assert is_file
            params = yaml.safe_load(Path(params_file).read_text())
            assert list(params.values()) == [
                {'ros__parameters': {'use_sim_time': sim_time == 'true'}}]
        assert not relay_action.expanded_remapping_rules
        assert scan_action.expanded_remapping_rules == [('/tf', 'tf_rviz')]
        scan_params_file, is_file = scan_action._Node__expanded_parameter_arguments[0]
        assert is_file
        params = yaml.safe_load(Path(scan_params_file).read_text())
        assert params['/**']['ros__parameters']['target_frame'] == 'map'
        assert context.launch_configurations['rviz_config'].endswith('/rviz/remote_navigation.rviz')
        assert rviz_action.expanded_remapping_rules == [('/tf', 'tf_rviz')]
        assert not rviz_action.condition.evaluate(context)
        context.launch_configurations['rviz'] = 'true'
        assert rviz_action.condition.evaluate(context)

    # Isolate even the global TF input from any real robot running on this host.
    rclpy.init(args=['--ros-args', '-r', '__ns:=/' + robot_id,
                    '-r', '/tf:=/remote_rviz_test_input'])
    relay = TfRvizRelay()
    peer = Node('remote_rviz_test_peer')
    executor = SingleThreadedExecutor()
    executor.add_node(relay)
    executor.add_node(peer)

    def spin_until(predicate, timeout=5.0):
        deadline = time.monotonic() + timeout
        while not predicate() and time.monotonic() < deadline:
            executor.spin_once(timeout_sec=0.02)
        assert predicate(), 'DDS discovery or delivery timed out'

    try:
        assert relay.subscription.topic_name == '/remote_rviz_test_input'
        expected_output = ('/' + robot_id if robot_id else '') + '/tf_rviz'
        assert relay.publisher.topic_name == expected_output
        for endpoint, reliability in (
                (relay.subscription, ReliabilityPolicy.BEST_EFFORT),
                (relay.publisher, ReliabilityPolicy.RELIABLE)):
            qos = endpoint.qos_profile
            assert qos.reliability == reliability
            assert qos.history == HistoryPolicy.KEEP_LAST
            assert qos.depth == 100
            assert qos.durability == DurabilityPolicy.VOLATILE
        assert {sub.topic_name for sub in relay.subscriptions} == {'/remote_rviz_test_input'}
        assert '/tf_static' not in {pub.topic_name for pub in relay.publishers}

        received = []
        listener = peer.create_subscription(
            TFMessage, expected_output, received.append,
            QoSProfile(depth=100, reliability=ReliabilityPolicy.RELIABLE))
        spin_until(lambda: relay.publisher.get_subscription_count() == 1)
        # Accept both the robot's reliable broadcaster and a best-effort test source.
        for reliability in (ReliabilityPolicy.RELIABLE, ReliabilityPolicy.BEST_EFFORT):
            source = peer.create_publisher(
                TFMessage, '/tf', QoSProfile(depth=100, reliability=reliability))
            spin_until(lambda: source.get_subscription_count() == 1)
            transforms = []
            for parent, child, nanos in [('odom', 'base_footprint', 123),
                                         ('map', 'odom', 456)]:
                transform = TransformStamped()
                transform.header.frame_id = parent
                transform.child_frame_id = child
                transform.header.stamp.sec = 42
                transform.header.stamp.nanosec = nanos
                transform.transform.translation.x = -1.25
                transform.transform.rotation.w = 1.0
                transforms.append(transform)
            sample = TFMessage(transforms=transforms)
            received.clear()
            source.publish(sample)
            spin_until(lambda: len(received) > 0)
            assert received == [sample], 'TF payload or timestamps changed'
            peer.destroy_publisher(source)
        peer.destroy_subscription(listener)
    finally:
        executor.shutdown()
        peer.destroy_node()
        relay.destroy_node()
        rclpy.shutdown()
    return 0


@pytest.mark.parametrize('robot_id', ['', 'robot_01'])
def test_remote_rviz_ros(robot_id):
    env = os.environ.copy()
    env.update(ROS_DOMAIN_ID=str(80 + os.getpid() % 20), ROS_LOCALHOST_ONLY='1')
    for setting in ('ROS_DISCOVERY_SERVER', 'FASTDDS_DEFAULT_PROFILES_FILE',
                    'FASTRTPS_DEFAULT_PROFILES_FILE'):
        env.pop(setting, None)
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), robot_id],
        env=env, capture_output=True, text=True, timeout=30)
    if result.returncode == 77:
        pytest.skip('ROS 2 rclpy/launch runtime unavailable')
    assert result.returncode == 0, result.stdout + result.stderr


if __name__ == '__main__':
    sys.exit(run_qt_layout_probe() if sys.argv[1] == '--qt-layout' else run_ros_probe(sys.argv[1]))
