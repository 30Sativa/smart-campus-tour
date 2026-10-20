"""Localization V2 wiring: odometry launch arguments and the V2 AMCL file.

Resolves the real navigation.launch.py (no processes started) and checks the
parameters that actually reach stm32_bridge_node and amcl. Probes run in a fresh
interpreter because other packages' tests stub ROS imports.
"""

import json
from pathlib import Path
import subprocess
import sys
from unittest import mock

import pytest
import yaml


SRC = Path(__file__).resolve().parents[2]
CFG = SRC / 'robot_navigation/config'


def run_launch_probe(extra_json):
    try:
        from launch import LaunchContext, LaunchDescription
        from launch.launch_description_sources import PythonLaunchDescriptionSource
        from launch.utilities import visit_all_entities_and_collect_futures
        from launch_ros.actions import Node
        from launch_ros.substitutions import FindPackageShare
        from launch_ros.utilities import evaluate_parameters
    except ImportError:
        return 77
    original_load = PythonLaunchDescriptionSource._get_launch_description

    def load_source(source, location):
        if location.startswith('/external/'):
            return LaunchDescription()
        return original_load(source, location)

    def find_share(_substitution, package):
        local = SRC / package
        return str(local) if local.is_dir() else '/external/' + package

    context = LaunchContext()
    context.launch_configurations.update(
        robot_id='robot_01', rviz='false', enable_camera='false',
        map=str(SRC / 'robot_navigation/maps/warehouse_12x12.yaml'))
    context.launch_configurations.update(json.loads(extra_json))
    found = {}

    def capture_node(node, node_context):
        if node.node_package in ('stm32_bridge', 'nav2_amcl'):
            node._perform_substitutions(node_context)
            found[node.node_package] = evaluate_parameters(node_context, node._Node__parameters)
        return []

    with mock.patch.object(FindPackageShare, 'find', find_share), \
            mock.patch.object(PythonLaunchDescriptionSource, '_get_launch_description', load_source), \
            mock.patch.object(Node, 'execute', capture_node):
        import os
        source = PythonLaunchDescriptionSource(os.environ.get('NAV_LAUNCH_UNDER_TEST', str(SRC / 'robot_navigation/launch/navigation.launch.py')))
        visit_all_entities_and_collect_futures(source.get_launch_description(context), context)
    bridge = next(p for p in found['stm32_bridge'] if isinstance(p, dict))
    amcl_files = [str(p) for p in found.get('nav2_amcl', []) if not isinstance(p, dict)]
    print(json.dumps({k: bridge[k] for k in ('wheel_radius', 'wheel_base', 'odom_linear_scale')} |
                     {'amcl_files': amcl_files}))
    return 0


def probe(**extra):
    result = subprocess.run([sys.executable, str(Path(__file__).resolve()), json.dumps(extra)],
                            capture_output=True, text=True, timeout=60)
    if result.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_defaults_reach_the_bridge_unchanged_v1():
    r = probe()
    assert (r['wheel_radius'], r['wheel_base'], r['odom_linear_scale']) == (0.09725, 0.4714, 1.0)
    assert any(f.endswith('/localization_params.yaml') for f in r['amcl_files']), r


def test_v2_arguments_reach_the_nodes():
    v2 = str(CFG / 'localization_params_v2.yaml')
    r = probe(odom_linear_scale='1.045', localization_params_file=v2)
    assert r['odom_linear_scale'] == 1.045
    assert (r['wheel_radius'], r['wheel_base']) == (0.09725, 0.4714)   # V2 does not touch them
    assert v2 in r['amcl_files'], r


def test_navigation_launch_declares_odometry_arguments_explicitly():
    """Before V2 these only reached the bridge through implicit launch-configuration
    inheritance (works today, but invisible in --show-args and lost if the include
    is ever scoped). Declare and forward them explicitly."""
    src = (SRC / 'robot_navigation/launch/navigation.launch.py').read_text()
    for name, default in (('wheel_base', '0.4714'), ('wheel_radius', '0.09725'), ('odom_linear_scale', '1.0')):
        assert f"DeclareLaunchArgument('{name}', default_value='{default}'" in src, name
        assert f"'{name}': {name}," in src, name
    manual = (SRC / 'robot_control/launch/manual_mode.launch.py').read_text()
    for name, default in (('wheel_base', '0.4714'), ('wheel_radius', '0.09725'), ('odom_linear_scale', '1.0')):
        assert f"DeclareLaunchArgument('{name}', default_value='{default}'" in manual, name   # same defaults


def test_wheel_geometry_is_forwarded_from_navigation_launch():
    r = probe(wheel_radius='0.1', wheel_base='0.48')
    assert (r['wheel_radius'], r['wheel_base']) == (0.1, 0.48)


def test_v2_amcl_file_differs_from_v1_only_in_update_thresholds():
    v1 = yaml.safe_load((CFG / 'localization_params.yaml').read_text())
    v2 = yaml.safe_load((CFG / 'localization_params_v2.yaml').read_text())
    a1, a2 = v1['/**/amcl']['ros__parameters'], v2['/**/amcl']['ros__parameters']
    assert (a2['update_min_d'], a2['update_min_a']) == (0.10, 0.10)
    assert (a1['update_min_d'], a1['update_min_a']) == (0.25, 0.2)    # V1 untouched
    changed = {k for k in set(a1) | set(a2) if a1.get(k) != a2.get(k)}
    assert changed == {'update_min_d', 'update_min_a'}
    assert {k: v for k, v in v1.items() if k != '/**/amcl'} == {k: v for k, v in v2.items() if k != '/**/amcl'}


if __name__ == '__main__':
    sys.exit(run_launch_probe(sys.argv[1]))
