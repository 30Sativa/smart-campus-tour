# =============================================================================
# localization.launch.py
# map_server + AMCL + lifecycle manager. Localizes the robot on a SAVED map
# (no SLAM). Include this from navigation.launch.py, or run standalone:
#
#   ros2 launch robot_navigation localization.launch.py \
#       map:=/path/to/my_map.yaml
#
# After startup, if the robot did not start at the mapping origin, give it a
# "2D Pose Estimate" in RViz (publishes /initialpose to AMCL).
# =============================================================================
import os

from launch import LaunchDescription
from launch.actions import (DeclareLaunchArgument, LogInfo, OpaqueFunction,
                            Shutdown)
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def _check_map(context, *args, **kwargs):
    """Fail early when the required saved-map path is missing or invalid."""
    path = LaunchConfiguration('map').perform(context)
    if not path:
        return [LogInfo(msg=(
            '\n[localization] No real-world map was provided. '
            'Pass map:=/path/to/map.yaml (for example, '
            'map:=/maps/campus_map.yaml).')),
            Shutdown(reason='map launch argument is required')]
    if not os.path.isfile(path):
        return [LogInfo(msg=f'\n[localization] Map file not found: {path}\n'
                            '  Check that the saved .yaml file exists.'),
                Shutdown(reason=f'map file not found: {path}')]
    return [LogInfo(msg=f'[localization] Using map: {path}')]


def generate_launch_description():
    robot_id = LaunchConfiguration('robot_id')
    map_yaml = LaunchConfiguration('map')
    use_sim_time = LaunchConfiguration('use_sim_time')
    params_file = LaunchConfiguration('params_file')
    autostart = LaunchConfiguration('autostart')

    default_params = PathJoinSubstitution([
        FindPackageShare('robot_navigation'),
        'config',
        'localization_params.yaml',
    ])

    return LaunchDescription([
        DeclareLaunchArgument(
            'robot_id', default_value='',
            description='ROS namespace for this robot.'),
        DeclareLaunchArgument(
            'map', default_value='',
            description='Full path to the saved map .yaml file. Required; '
                        'there is no default real-world map.'),
        OpaqueFunction(function=_check_map),
        DeclareLaunchArgument(
            'use_sim_time', default_value='false',
            description='Use simulation clock.'),
        DeclareLaunchArgument(
            'params_file', default_value=default_params,
            description='AMCL / map_server parameter file.'),
        DeclareLaunchArgument(
            'autostart', default_value='true',
            description='Auto-activate the lifecycle nodes.'),

        Node(
            package='nav2_map_server',
            executable='map_server',
            name='map_server',
            namespace=robot_id,
            output='screen',
            parameters=[
                params_file,
                {
                    'yaml_filename': map_yaml,
                    'use_sim_time': use_sim_time,
                },
            ],
        ),

        Node(
            package='nav2_amcl',
            executable='amcl',
            name='amcl',
            namespace=robot_id,
            output='screen',
            parameters=[
                params_file,
                {'use_sim_time': use_sim_time},
            ],
        ),

        Node(
            package='nav2_lifecycle_manager',
            executable='lifecycle_manager',
            name='lifecycle_manager_localization',
            namespace=robot_id,
            output='screen',
            parameters=[{
                'use_sim_time': use_sim_time,
                'autostart': autostart,
                'node_names': ['map_server', 'amcl'],
            }],
        ),
    ])
