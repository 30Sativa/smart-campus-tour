"""sonar_mode wiring: off changes nothing, shadow only listens, enforce puts the
collision_monitor between the controller and the velocity smoother.

Resolves the real navigation.launch.py (as test_camera_launch_scope.py does) with a
stand-in for nav2_bringup that declares the two Nav2 nodes and the remaps the Humble
navigation_launch.py gives them, then applies rcl's first-matching-rule order to find
the topic each one really uses. Runs in a fresh interpreter because other packages'
tests stub ROS imports. robot/docs/sonar-perception.md.
"""

from pathlib import Path
import subprocess
import sys
from unittest import mock

import pytest
import yaml


SRC = Path(__file__).resolve().parents[2]
CONFIG = SRC / 'robot_navigation/config/sonar_collision_monitor.yaml'


def effective(rules, node, topic):
    """rcl: the first rule that matches (an optional 'node:' prefix must name this node)."""
    for src, dst in rules:
        prefix, _, name = src.rpartition(':')
        if name == topic and prefix in ('', node):
            return dst
    return topic


def run_probe(robot_id):
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

    def nav2_standin():
        # What nav2_bringup/launch/navigation_launch.py (Humble) does to these two names.
        return LaunchDescription([
            Node(package='nav2_controller', executable='controller_server', name='controller_server',
                 remappings=[('cmd_vel', 'cmd_vel_nav')]),
            Node(package='nav2_velocity_smoother', executable='velocity_smoother', name='velocity_smoother',
                 remappings=[('cmd_vel', 'cmd_vel_nav'), ('cmd_vel_smoothed', 'cmd_vel')]),
        ])

    def load_source(source, location):
        if location.endswith('/nav2_bringup/launch/navigation_launch.py'):
            return nav2_standin()
        if location.startswith('/external/'):
            return LaunchDescription()
        return original_load(source, location)

    def find_share(_substitution, package):
        local = SRC / package
        return str(local) if local.is_dir() else '/external/' + package

    v3 = str(SRC / 'robot_control/config/nav2_params_v3.yaml')
    with mock.patch.object(FindPackageShare, 'find', find_share), \
            mock.patch.object(PythonLaunchDescriptionSource, '_get_launch_description', load_source):
        for mode in ('off', 'shadow', 'enforce', 'Enforce'):
            context = LaunchContext()
            context.launch_configurations.update(
                robot_id=robot_id, sonar_mode=mode, rviz='false', nav2_params_file=v3,
                map=str(SRC / 'robot_navigation/maps/warehouse_12x12.yaml'))
            nodes = {}
            shutdowns = []

            def capture_node(node, node_context):
                if node.node_package not in ('stm32_bridge', 'nav2_collision_monitor', 'robot_navigation',
                                             'nav2_lifecycle_manager', 'nav2_controller',
                                             'nav2_velocity_smoother'):
                    return []                   # robot_state_publisher would run xacro, etc.
                node._perform_substitutions(node_context)
                params = {}
                if node._Node__parameters:
                    for entry in evaluate_parameters(node_context, node._Node__parameters):
                        if isinstance(entry, dict):
                            params.update(entry)
                nodes[node.node_name.split('/')[-1]] = (node, params, list(node.expanded_remapping_rules or []))
                return []

            from launch.actions import Shutdown, TimerAction
            with mock.patch.object(Node, 'execute', capture_node), \
                    mock.patch.object(TimerAction, 'execute', lambda s, c: list(s.actions)), \
                    mock.patch.object(Shutdown, 'execute', lambda s, c: shutdowns.append(s) or []):
                source = PythonLaunchDescriptionSource(str(SRC / 'robot_navigation/launch/navigation.launch.py'))
                visit_all_entities_and_collect_futures(source.get_launch_description(context), context)

            ctrl = effective(nodes['controller_server'][2], 'controller_server', 'cmd_vel')
            smoother_in = effective(nodes['velocity_smoother'][2], 'velocity_smoother', 'cmd_vel')
            smoother_out = effective(nodes['velocity_smoother'][2], 'velocity_smoother', 'cmd_vel_smoothed')
            assert ctrl == 'cmd_vel_ctrl', ctrl
            assert smoother_out == 'cmd_vel_nav', smoother_out
            [bridge] = [params for node, params, _ in nodes.values() if node.node_package == 'stm32_bridge']
            if mode == 'Enforce':                       # not a mode: refuse, never half-wire
                assert shutdowns, 'invalid sonar_mode must shut the launch down'
                assert 'collision_monitor' not in nodes
                continue
            assert not shutdowns
            if mode == 'off':
                assert smoother_in == 'cmd_vel_ctrl'
                assert not {'collision_monitor', 'sonar_memory', 'lifecycle_manager_sonar'} & set(nodes)
                assert bridge['sonar_max_range'] == 2.0
                continue
            assert bridge['sonar_max_range'] == 6.0
            cm_node, cm, _ = nodes['collision_monitor']
            assert cm_node.expanded_node_namespace == ('/' + robot_id if robot_id else '/')
            # cmd_vel_in_topic and the rest come from the YAML (test_collision_monitor_config_contract);
            # the launch only adds the mode's output topic.
            files = [str(e) for e in evaluate_parameters(context, cm_node._Node__parameters)
                     if not isinstance(e, dict)]
            assert any(f.endswith('robot_navigation/config/sonar_collision_monitor.yaml') for f in files), files
            if mode == 'enforce':
                assert smoother_in == 'cmd_vel_sonar' == cm['cmd_vel_out_topic']
            else:
                assert smoother_in == 'cmd_vel_ctrl'
                assert cm['cmd_vel_out_topic'] == 'cmd_vel_sonar_shadow'
            _, mem, _ = nodes['sonar_memory']
            assert yaml.safe_load(mem['footprint']) == yaml.safe_load(
                yaml.safe_load(open(v3))['local_costmap']['local_costmap']['ros__parameters']['footprint'])
            assert mem['padding'] == 0.05
            _, lcm, _ = nodes['lifecycle_manager_sonar']
            assert list(lcm['node_names']) == ['collision_monitor'] and lcm['autostart'] is True, lcm
    return 0


@pytest.mark.parametrize('robot_id', ['', 'robot_01'])
def test_sonar_mode_wiring(robot_id):
    result = subprocess.run([sys.executable, str(Path(__file__).resolve()), robot_id],
                            capture_output=True, text=True, timeout=60)
    if result.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert result.returncode == 0, result.stdout + result.stderr


def test_rcl_rule_order_helper():
    rules = [('velocity_smoother:cmd_vel', 'cmd_vel_sonar'), ('cmd_vel', 'cmd_vel_ctrl'),
             ('cmd_vel', 'cmd_vel_nav')]
    assert effective(rules, 'velocity_smoother', 'cmd_vel') == 'cmd_vel_sonar'
    assert effective(rules, 'controller_server', 'cmd_vel') == 'cmd_vel_ctrl'
    assert effective(rules, 'controller_server', 'odom') == 'odom'


def test_collision_monitor_config_contract():
    cm = yaml.safe_load(open(CONFIG))['/**/collision_monitor']['ros__parameters']
    assert cm['cmd_vel_in_topic'] == 'cmd_vel_ctrl'
    assert cm['base_frame_id'] == 'base_footprint' and cm['odom_frame_id'] == 'odom'
    # Exactly one polygon, and it can only slow down: approach, never a static stop zone
    # (a stop zone blocks turning on the spot and moving away too).
    assert cm['polygons'] == ['SonarApproach']
    poly = cm['SonarApproach']
    assert poly['action_type'] == 'approach'
    assert poly['footprint_topic'] == 'sonar_guard/footprint'
    assert 1.0 <= poly['time_before_collision'] <= 2.5
    # Sonar only, relative topics (resolved in the robot namespace), plus the memory.
    sources = cm['observation_sources']
    assert sources == ['sonar1', 'sonar2', 'sonar3', 'sonar4', 'memory']
    for i in range(1, 5):
        assert cm[f'sonar{i}'] == {'type': 'range', 'topic': f'ultrasonic/sonar{i}/range',
                                   'obstacles_angle': cm[f'sonar{i}']['obstacles_angle']}
    assert cm['memory']['type'] == 'pointcloud' and cm['memory']['topic'] == 'sonar_guard/memory'
    assert cm['memory']['min_height'] <= 0.10 <= cm['memory']['max_height']   # sonar_memory point_z
    # A silent source is ignored after source_timeout (fail-open to the LiDAR baseline),
    # and must not outlive a dead bridge by much.
    assert 0.5 <= cm['source_timeout'] <= 2.0


def test_sim_launch_uses_the_same_wiring():
    sim = (SRC.parent.parent / 'tools/nav2_bench/sim/sim.launch.py').read_text()
    nav = (SRC / 'robot_navigation/launch/navigation.launch.py').read_text()
    for text in (sim, nav):
        assert "SetRemap(src='velocity_smoother:cmd_vel', dst='cmd_vel_sonar'" in text
        assert text.index("src='velocity_smoother:cmd_vel'") < text.index("SetRemap(src='cmd_vel', dst='cmd_vel_ctrl')")
    assert 'sonar_guard.launch.py' in sim and 'sonar_guard.launch.py' in nav


if __name__ == '__main__':
    sys.exit(run_probe(sys.argv[1]))
