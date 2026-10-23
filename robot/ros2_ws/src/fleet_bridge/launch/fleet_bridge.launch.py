from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import (
    EnvironmentVariable,
    LaunchConfiguration,
    PathJoinSubstitution,
)
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument(
            'robot_namespace',
            default_value='robot_01',
            description='Existing ROS namespace (default robot_01); does not start or alter Nav2.'),
        DeclareLaunchArgument(
            'use_sim_time',
            default_value='false',
            description='Must remain false for UTC Fleet Sync timestamps.'),
        Node(
            package='fleet_bridge',
            executable='fleet_bridge',
            name='fleet_bridge',
            namespace=LaunchConfiguration('robot_namespace'),
            output='screen',
            parameters=[
                PathJoinSubstitution([
                    FindPackageShare('fleet_bridge'), 'config', 'fleet_bridge.yaml']),
                {
                    'backend_url': EnvironmentVariable('FLEET_SYNC_URL', default_value=''),
                    'robot_code': EnvironmentVariable('FLEET_ROBOT_CODE', default_value=''),
                    'map_key': EnvironmentVariable('FLEET_ROBOT_MAP_KEY', default_value=''),
                    'frame_id': EnvironmentVariable('FLEET_ROBOT_FRAME_ID', default_value='map'),
                    'use_sim_time': ParameterValue(
                        LaunchConfiguration('use_sim_time'), value_type=bool),
                },
            ],
        ),
    ])
