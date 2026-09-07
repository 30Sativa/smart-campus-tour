# =============================================================================
# stop_navigator.launch.py
# Chay stop navigator (tang "ben bus" tren Nav2). Yeu cau navigation stack
# (robot_navigation navigation.launch.py / sim_navigation.launch.py) da chay.
#
#   ros2 launch bus_manager stop_navigator.launch.py
#   ros2 action send_goal /go_to_stop bus_interfaces/action/GoToStop \
#       "{stop_id: library}" --feedback
# =============================================================================
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import (LaunchConfiguration, PathJoinSubstitution,
                                  PythonExpression)
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    robot_id = LaunchConfiguration('robot_id')
    stops_file = LaunchConfiguration('stops_file')
    use_sim_time = LaunchConfiguration('use_sim_time')

    default_stops = PathJoinSubstitution([
        FindPackageShare('bus_manager'),
        'config',
        'bus_stops.yaml',
    ])

    return LaunchDescription([
        DeclareLaunchArgument(
            'robot_id', default_value='',
            description='Canonical robot ID and ROS namespace. Empty keeps '
                        'the legacy global graph and reports robot_01.'),
        DeclareLaunchArgument('stops_file', default_value=default_stops,
                              description='YAML file with named stop poses.'),
        DeclareLaunchArgument('use_sim_time', default_value='false',
                              description='Use simulation clock.'),

        Node(
            package='bus_manager',
            executable='stop_navigator',
            name='stop_navigator',
            namespace=robot_id,
            output='screen',
            parameters=[{
                'bus_id': ParameterValue(PythonExpression([
                    "'", robot_id, "' if '", robot_id,
                    "' else 'robot_01'",
                ]), value_type=str),
                'stops_file': stops_file,
                'use_sim_time': use_sim_time,
            }],
        ),
    ])
