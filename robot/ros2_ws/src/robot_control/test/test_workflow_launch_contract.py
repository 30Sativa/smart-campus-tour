"""Launch contract for the three real-robot workflows: MANUAL, BUILD MAP and NAV2.

Resolves each real launch file (no process is started) and checks what reaches
the nodes: the LiDAR yaw in the URDF, the odometry geometry in stm32_bridge, the
mode_manager start mode, and which node owns map->odom. Probes run in a fresh
interpreter because other tests in this package stub ROS imports.
"""

import ast
import json
from pathlib import Path
import subprocess
import sys
from unittest import mock

import pytest


SRC = Path(__file__).resolve().parents[2]
HARDWARE_LAUNCHES = {
    'manual': 'robot_control/launch/manual_mode.launch.py',
    'mapping': 'robot_control/launch/manual_mapping.launch.py',
    'mapping_gamepad': 'robot_control/launch/manual_mapping_gamepad_camera.launch.py',
    'explore': 'robot_control/launch/auto_explore.launch.py',
    'navigation': 'robot_navigation/launch/navigation.launch.py',
}
CALIBRATION_DEFAULTS = {'lidar_yaw': -0.2225, 'wheel_base': 0.4714, 'wheel_radius': 0.09725,
                        'odom_linear_scale': 1.0}


def run_launch_probe(launch_path, extra_json):
    try:
        import launch.logging
        from launch import LaunchContext, LaunchDescription
        from launch.launch_description_sources import PythonLaunchDescriptionSource
        from launch.substitutions import Command
        from launch.utilities import perform_substitutions, visit_all_entities_and_collect_futures
        from launch_ros.actions import Node
        from launch_ros.substitutions import FindPackageShare
        from launch_ros.utilities import evaluate_parameters
    except ImportError:
        return 77
    original_load = PythonLaunchDescriptionSource._get_launch_description
    external, nodes, warnings = [], [], []

    def load_source(source, location):
        if location.startswith('/external/'):
            external.append(location[len('/external/'):])
            return LaunchDescription()
        return original_load(source, location)

    def find_share(_substitution, package):
        local = SRC / package
        return str(local) if local.is_dir() else '/external/' + package

    real_get_logger = launch.logging.get_logger

    def get_logger(name=None):
        logger = real_get_logger(name)
        if name == 'robot_calibration':
            logger = mock.Mock(wraps=logger)
            logger.warning.side_effect = lambda msg, *a, **k: warnings.append(msg)
        return logger

    def capture_node(node, node_context):
        node._perform_substitutions(node_context)
        params = {}
        for p in evaluate_parameters(node_context, node._Node__parameters):
            if isinstance(p, dict):
                params.update({k: v for k, v in p.items() if isinstance(v, (str, int, float, bool))})
        nodes.append(dict(package=node.node_package, executable=node.node_executable, params=params))
        return []

    context = LaunchContext()
    context.launch_configurations.update(
        robot_id='robot_01', rviz='false', enable_camera='false',
        map=str(SRC / 'robot_navigation/maps/warehouse_12x12.yaml'))
    context.launch_configurations.update(json.loads(extra_json))
    command_text = lambda self, ctx: perform_substitutions(ctx, self.command)  # noqa: E731
    with mock.patch.object(FindPackageShare, 'find', find_share), \
            mock.patch.object(PythonLaunchDescriptionSource, '_get_launch_description', load_source), \
            mock.patch.object(Node, 'execute', capture_node), \
            mock.patch.object(Command, 'perform', command_text), \
            mock.patch.object(launch.logging, 'get_logger', get_logger):
        source = PythonLaunchDescriptionSource(str(SRC / launch_path))
        visit_all_entities_and_collect_futures(source.get_launch_description(context), context)
    print(json.dumps(dict(nodes=nodes, external=external, warnings=warnings)))
    return 0


def probe(workflow, **extra):
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), HARDWARE_LAUNCHES[workflow], json.dumps(extra)],
        capture_output=True, text=True, timeout=90)
    if result.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-3000:]
    return json.loads(result.stdout.strip().splitlines()[-1])


def node(r, package):
    found = [n for n in r['nodes'] if n['package'] == package]
    assert len(found) == 1, (package, [n['package'] for n in r['nodes']])
    return found[0]


def urdf_lidar_yaw(r):
    description = node(r, 'robot_state_publisher')['params']['robot_description']
    return float(description.split('lidar_yaw:=')[1].split()[0])


@pytest.mark.parametrize('workflow', sorted(HARDWARE_LAUNCHES))
def test_a_given_lidar_yaw_reaches_the_urdf_without_a_warning(workflow):
    r = probe(workflow, lidar_yaw='3.1241')
    assert urdf_lidar_yaw(r) == 3.1241
    assert r['warnings'] == []


@pytest.mark.parametrize('workflow', sorted(HARDWARE_LAUNCHES))
def test_a_defaulted_lidar_yaw_is_reported_once(workflow):
    r = probe(workflow)
    assert urdf_lidar_yaw(r) == CALIBRATION_DEFAULTS['lidar_yaw']    # production default unchanged
    assert len(r['warnings']) == 1 and 'lidar_yaw not given' in r['warnings'][0], r['warnings']


@pytest.mark.parametrize('workflow', sorted(HARDWARE_LAUNCHES))
def test_odometry_geometry_reaches_the_bridge(workflow):
    bridge = node(probe(workflow), 'stm32_bridge')['params']
    for name in ('wheel_base', 'wheel_radius', 'odom_linear_scale'):
        assert bridge[name] == CALIBRATION_DEFAULTS[name], name
    bridge = node(probe(workflow, wheel_base='0.48', wheel_radius='0.1', odom_linear_scale='1.02'),
                  'stm32_bridge')['params']
    assert (bridge['wheel_base'], bridge['wheel_radius'], bridge['odom_linear_scale']) == (0.48, 0.1, 1.02)
    assert bridge['publish_tf'] is False          # the EKF owns odom -> base_footprint


@pytest.mark.parametrize('workflow,mode', [('manual', 'manual'), ('mapping', 'manual'),
                                           ('mapping_gamepad', 'manual'), ('explore', 'explore'),
                                           ('navigation', 'explore')])
def test_mode_manager_start_mode(workflow, mode):
    r = probe(workflow)
    mm = next(n for n in r['nodes'] if n['executable'] == 'mode_manager_node')
    assert mm['params']['initial_mode'] == mode


@pytest.mark.parametrize('workflow,owner', [('manual', None), ('mapping', 'slam_toolbox'),
                                            ('mapping_gamepad', 'slam_toolbox'), ('explore', 'slam_toolbox'),
                                            ('navigation', 'nav2_amcl')])
def test_exactly_one_map_to_odom_owner(workflow, owner):
    r = probe(workflow)
    packages = [n['package'] for n in r['nodes']]
    slam = any(e.startswith('slam_toolbox') for e in r['external'])
    amcl = packages.count('nav2_amcl')
    assert (slam, amcl) == ((owner == 'slam_toolbox'), int(owner == 'nav2_amcl')), (r['external'], packages)
    assert packages.count('robot_localization') == 1 and packages.count('robot_state_publisher') == 1


@pytest.mark.parametrize('workflow', sorted(HARDWARE_LAUNCHES))
def test_one_command_path_through_mode_manager(workflow):
    """Only mode_manager may publish cmd_vel; Nav2 is renamed onto cmd_vel_nav."""
    r = probe(workflow)
    assert sum(n['executable'] == 'mode_manager_node' for n in r['nodes']) == 1
    nav2 = any(e.startswith('nav2_bringup') for e in r['external'])
    assert nav2 == (workflow in ('explore', 'navigation'))
    source = (SRC / HARDWARE_LAUNCHES[workflow]).read_text()
    if nav2:
        assert "SetRemap(src='cmd_vel', dst='cmd_vel_ctrl')" in source
        assert "SetRemap(src='cmd_vel_smoothed', dst='cmd_vel_nav')" in source


def declared_defaults(path):
    tree = ast.parse((SRC / path).read_text())
    return {
        ast.literal_eval(call.args[0]): ast.literal_eval(keyword.value)
        for call in ast.walk(tree)
        if isinstance(call, ast.Call) and getattr(call.func, 'id', '') == 'DeclareLaunchArgument'
        for keyword in call.keywords if keyword.arg == 'default_value' and isinstance(keyword.value, ast.Constant)
    }


def test_calibration_arguments_have_one_default_everywhere():
    """Runs without ROS: the same names and defaults are declared by every hardware launch."""
    for workflow, path in HARDWARE_LAUNCHES.items():
        defaults = declared_defaults(path)
        for name, value in CALIBRATION_DEFAULTS.items():
            assert float(defaults[name]) == value, (workflow, name)



@pytest.mark.parametrize('workflow', ['mapping', 'mapping_gamepad', 'explore', 'navigation'])
def test_calibration_is_forwarded_explicitly(workflow):
    """Includes share the launch context, so an undeclared or unforwarded argument still
    arrives today. Forward it explicitly anyway: it shows in --show-args and survives a
    scoped include."""
    text = (SRC / HARDWARE_LAUNCHES[workflow]).read_text()
    for name in CALIBRATION_DEFAULTS:
        assert (f"'{name}': LaunchConfiguration('{name}')," in text or f"'{name}': {name}," in text), name


if __name__ == '__main__':
    sys.exit(run_launch_probe(sys.argv[1], sys.argv[2]))
