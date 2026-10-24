"""Resolve real Humble launch scopes without starting hardware or Nav2 processes.

Run probes in a fresh interpreter because other packages' tests stub ROS imports.
"""

from pathlib import Path
import subprocess
import sys
from unittest import mock

import pytest


SRC = Path(__file__).resolve().parents[2]


def run_launch_probe(robot_id):
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
        # Exercise all repository includes; upstream Nav2 is outside this test.
        if location.startswith('/external/'):
            return LaunchDescription()
        return original_load(source, location)

    def find_share(_substitution, package):
        local = SRC / package
        return str(local) if local.is_dir() else '/external/' + package

    with mock.patch.object(FindPackageShare, 'find', find_share), \
            mock.patch.object(PythonLaunchDescriptionSource,
                              '_get_launch_description', load_source):
        for enabled in ('true', 'false'):
            for inherited_tf in (None, 'false', 'true'):
                context = LaunchContext()
                context.launch_configurations.update(
                    robot_id=robot_id, enable_camera=enabled, rviz='true',
                    map=str(SRC / 'robot_navigation/maps/warehouse_12x12.yaml'),
                    camera_depth_width='320', camera_depth_height='240',
                    camera_depth_fps='10', camera_pitch='0.17')
                if inherited_tf is not None:
                    context.launch_configurations['publish_tf'] = inherited_tf
                nodes = []

                def capture_node(node, node_context):
                    package = node.node_package
                    params = None
                    if package in ('stm32_bridge', 'astra_camera'):
                        # Expand the actual Node parameters and namespace, including
                        # the OpaqueFunction in astra_pro.launch.py.
                        node._perform_substitutions(node_context)
                        [params] = evaluate_parameters(node_context, node._Node__parameters)
                    nodes.append((package, node, params))
                    return []

                with mock.patch.object(Node, 'execute', capture_node):
                    source = PythonLaunchDescriptionSource(
                        str(SRC / 'robot_navigation/launch/navigation.launch.py'))
                    visit_all_entities_and_collect_futures(
                        source.get_launch_description(context), context)

                [bridge] = [entry for entry in nodes if entry[0] == 'stm32_bridge']
                assert bridge[2]['publish_tf'] is False
                assert bridge[1].expanded_node_namespace == (
                    '/' + robot_id if robot_id else '/')
                cameras = [entry for entry in nodes if entry[0] == 'astra_camera']
                mounts = [entry for entry in nodes if entry[0] == 'tf2_ros']
                if enabled == 'true':
                    [camera] = cameras
                    assert camera[2]['publish_tf'] is True
                    assert camera[1].expanded_node_namespace == (
                        '/' + robot_id + '/camera' if robot_id else '/camera')
                    assert camera[2]['enable_point_cloud'] is True
                    assert camera[2]['enable_color'] is False
                    assert camera[2]['enable_ir'] is False
                    assert (camera[2]['depth_width'], camera[2]['depth_height'],
                            camera[2]['depth_fps']) == (320, 240, 10)
                    assert len(mounts) == 1
                else:
                    assert not cameras
                    assert not mounts
                # Neither subsystem may overwrite an ancestor's generic settings.
                assert context.launch_configurations.get('publish_tf') == inherited_tf
                assert context.launch_configurations['rviz'] == 'true'
                assert 'ros_namespace' not in context.launch_configurations
                assert 'depth_width' not in context.launch_configurations
                assert 'x' not in context.launch_configurations
                assert len([entry for entry in nodes if entry[0] == 'rviz2']) == 1

        # Preserve standalone callers' explicit TF choice at the camera entry point.
        for publish_tf in ('true', 'false'):
            context = LaunchContext()
            context.launch_configurations.update(
                robot_id=robot_id, publish_tf=publish_tf, rviz='false')
            nodes = []
            source = PythonLaunchDescriptionSource(
                str(SRC / 'orbbec_bringup/launch/orbbec_with_mount.launch.py'))
            description = source.get_launch_description(context)
            # It must be an explicit wrapper argument, not accidental inheritance
            # of an undeclared generic configuration by the nested driver.
            assert 'publish_tf' in {
                action.name for action in description.entities
                if hasattr(action, 'name')}
            with mock.patch.object(Node, 'execute', capture_node):
                visit_all_entities_and_collect_futures(description, context)
            [camera] = [entry for entry in nodes if entry[0] == 'astra_camera']
            assert camera[2]['publish_tf'] is (publish_tf == 'true')
    return 0


@pytest.mark.parametrize('robot_id', ['', 'robot_01'])
def test_navigation_camera_launch_scope(robot_id):
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), robot_id],
        capture_output=True, text=True, timeout=30)
    if result.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert result.returncode == 0, result.stdout + result.stderr


if __name__ == '__main__':
    sys.exit(run_launch_probe(sys.argv[1]))
