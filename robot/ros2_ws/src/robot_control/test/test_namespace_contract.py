"""Static contract tests for namespace-ready robot interfaces."""

import re
from pathlib import Path


SRC = Path(__file__).resolve().parents[2]


def _read(relative_path):
    return (SRC / relative_path).read_text(encoding='utf-8')


def test_mode_manager_uses_relative_ros_names():
    source = _read('robot_control/robot_control/mode_manager_node.py')
    absolute_names = (
        "'/cmd_vel'",
        "'/cmd_vel_manual'",
        "'/cmd_vel_nav'",
        "'/robot_mode'",
        "'/robot_mode_state'",
        "'/emergency_stop'",
        "'/emergency_stop_state'",
        "'/navigate_to_pose/_action/cancel_goal'",
    )
    assert not any(name in source for name in absolute_names)


def test_robot_io_nodes_use_relative_ros_names():
    sources = (
        _read('stm32_bridge/stm32_bridge/stm32_bridge_node.py'),
        _read('robot_perception/robot_perception/person_perception_node.py'),
    )
    forbidden = (
        "'/cmd_vel'",
        "'/odom'",
        "'/people'",
        "'/people_markers'",
        "'/speed_limit'",
        "f'/{self.cam}",
    )
    assert not any(name in source for source in sources for name in forbidden)


def test_camera_pointcloud_remap_is_relative():
    launch = _read('orbbec_bringup/launch/astra_pro.launch.py')
    assert "('depth/color/points', 'depth_registered/points')" in launch
    assert "'/%s/depth/color/points'" not in launch


def test_primary_launch_files_accept_robot_id():
    launch_files = (
        'robot_control/launch/manual_mode.launch.py',
        'robot_control/launch/manual_mapping.launch.py',
        'robot_control/launch/auto_explore.launch.py',
        'robot_control/launch/sim_manual.launch.py',
        'robot_control/launch/sim_auto_explore.launch.py',
        'robot_navigation/launch/navigation.launch.py',
        'robot_navigation/launch/sim_navigation.launch.py',
        'robot_navigation/launch/localization.launch.py',
        'stm32_bridge/launch/stm32_bridge.launch.py',
        'orbbec_bringup/launch/orbbec_with_mount.launch.py',
        'robot_perception/launch/person_perception.launch.py',
        'bus_manager/launch/stop_navigator.launch.py',
    )
    for launch_file in launch_files:
        assert "DeclareLaunchArgument(\n            'robot_id'" in _read(launch_file)


def test_topic_parameters_are_relative():
    config_files = (
        'robot_control/config/frontier_explorer.yaml',
        'robot_control/config/mode_manager.yaml',
        'robot_control/config/nav2_params.yaml',
        'robot_control/config/slam_toolbox_online_async.yaml',
    )
    absolute_topic = re.compile(
        r'^\s*(?:[a-z0-9_]*topic|nav2_cancel_service):\s*/',
        re.MULTILINE,
    )
    for config_file in config_files:
        assert absolute_topic.search(_read(config_file)) is None


def test_canonical_robot_id_replaces_legacy_bus_id():
    node = _read('bus_manager/bus_manager/stop_navigator_node.py')
    launch = _read('bus_manager/launch/stop_navigator.launch.py')
    assert "declare_parameter('bus_id', 'robot_01')" in node
    assert "'robot_id', default_value=''" in launch
    assert "else 'robot_01'" in launch
    assert "'bus_id', default_value='bus1'" not in launch


if __name__ == '__main__':
    tests = [value for name, value in sorted(globals().items())
             if name.startswith('test_')]
    for test in tests:
        test()
        print(f'PASS  {test.__name__}')
    print(f'\n{len(tests)}/{len(tests)} passed')
