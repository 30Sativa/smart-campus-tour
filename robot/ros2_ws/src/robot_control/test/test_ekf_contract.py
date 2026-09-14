"""Static contract tests for the real-robot odometry pipeline."""

from pathlib import Path

import yaml


SRC = Path(__file__).resolve().parents[2]


def _read(relative_path):
    return (SRC / relative_path).read_text(encoding='utf-8')


def _ekf_parameters():
    config = yaml.safe_load(_read('robot_control/config/ekf.yaml'))
    return config['/**/ekf_filter_node']['ros__parameters']


def test_ekf_fuses_diff_drive_twist_constraint_and_imu_yaw():
    params = _ekf_parameters()
    assert params['two_d_mode'] is True
    assert params['odom0'] == 'wheel/odom'
    assert params['imu0'] == 'imu/data'
    assert len(params['odom0_config']) == 15
    assert len(params['imu0_config']) == 15
    wheel_fields = [
        i for i, enabled in enumerate(params['odom0_config']) if enabled
    ]
    imu_fields = [
        i for i, enabled in enumerate(params['imu0_config']) if enabled
    ]
    assert wheel_fields == [6, 7, 11]
    assert imu_fields == [5]
    assert params['imu0_relative'] is True
    assert params['imu0_differential'] is False
    assert params['frequency'] == 30.0


def test_ekf_owns_final_odom_and_tf_in_real_launch():
    params = _ekf_parameters()
    launch = _read('robot_control/launch/manual_mode.launch.py')
    assert params['publish_tf'] is True
    assert params['world_frame'] == 'odom'
    assert params['odom_frame'] == 'odom'
    assert params['base_link_frame'] == 'base_footprint'
    assert "package='robot_localization'" in launch
    assert "executable='ekf_node'" in launch
    assert 'namespace=robot_id' in launch
    assert "'publish_tf': 'false'" in launch
    assert "remappings=[('odometry/filtered', 'odom')]" in launch
    assert 'enable_ekf' not in launch


def test_real_launch_inverts_both_feedback_counts_for_odometry():
    launch = _read('robot_control/launch/manual_mode.launch.py')
    for side in ('left', 'right'):
        argument = f'odom_invert_{side}'
        assert f"{argument} = LaunchConfiguration('{argument}')" in launch
        assert f"'{argument}', default_value='true'" in launch
        assert f"'{argument}': {argument}" in launch


def test_real_robot_speed_policy_is_explicit():
    manual = _read('robot_control/launch/manual_mode.launch.py')
    mapping = _read('robot_control/launch/manual_mapping.launch.py')
    auto_explore = _read('robot_control/launch/auto_explore.launch.py')
    navigation = _read('robot_navigation/launch/navigation.launch.py')
    bridge_launch = _read('stm32_bridge/launch/stm32_bridge.launch.py')
    bridge_node = _read('stm32_bridge/stm32_bridge/stm32_bridge_node.py')

    assert "'max_wheel_speed_mm_s', default_value='250.0'" in manual
    assert "'speed_scale', default_value='1.0'" in manual
    assert "'max_wheel_speed_mm_s', default_value='350.0'" in mapping
    assert "LaunchConfiguration('max_wheel_speed_mm_s')" in mapping
    assert "'speed_scale': '1.0'" in mapping
    assert "'max_wheel_speed_mm_s': max_wheel_speed_mm_s" in mapping
    assert "'max_wheel_speed_mm_s': '350.0'" not in auto_explore
    assert "'max_wheel_speed_mm_s': '350.0'" not in navigation
    assert "'speed_scale',\n            default_value='1.0'" in bridge_launch
    assert "declare_parameter('speed_scale', 1.0)" in bridge_node


def test_bridge_publishes_relative_measurement_topics_only():
    bridge = _read('stm32_bridge/stm32_bridge/stm32_bridge_node.py')
    assert "create_publisher(Odometry, 'wheel/odom', 10)" in bridge
    assert "declare_parameter('imu_topic', 'imu/data')" in bridge
    assert "create_publisher(Odometry, 'odom', 10)" not in bridge
    assert 'use_imu_heading' not in bridge
    assert '_imu_yaw' not in bridge


if __name__ == '__main__':
    tests = [value for name, value in sorted(globals().items())
             if name.startswith('test_')]
    for test in tests:
        test()
        print(f'PASS  {test.__name__}')
    print(f'\n{len(tests)}/{len(tests)} passed')
