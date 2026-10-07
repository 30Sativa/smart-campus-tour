"""Run on the laptop: BEST_EFFORT TF input, local RELIABLE TF for RViz."""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    robot_id = LaunchConfiguration('robot_id')
    use_sim_time = ParameterValue(
        LaunchConfiguration('use_sim_time'), value_type=bool)
    rviz_config = PathJoinSubstitution([
        FindPackageShare('robot_navigation'), 'rviz', 'navigation.rviz',
    ])

    return LaunchDescription([
        DeclareLaunchArgument(
            'robot_id', default_value='',
            description='Robot namespace for RViz topics and relay output; TF input stays global.'),
        DeclareLaunchArgument(
            'use_sim_time', default_value='false',
            description='Use simulation clock; false for the native physical robot.'),
        DeclareLaunchArgument(
            'rviz', default_value='false',
            description='Open the RViz window on this laptop; otherwise run only the relay.'),
        DeclareLaunchArgument(
            'rviz_config', default_value=rviz_config,
            description='RViz config; defaults to the existing navigation layout.'),
        Node(
            package='robot_navigation', executable='tf_rviz_relay',
            namespace=robot_id, output='screen',
            parameters=[{'use_sim_time': use_sim_time}],
        ),
        Node(
            package='rviz2', executable='rviz2', name='rviz2',
            namespace=robot_id, output='screen',
            arguments=['-d', LaunchConfiguration('rviz_config')],
            parameters=[{'use_sim_time': use_sim_time}],
            # Only this viewer uses the relay. /tf_static keeps its original QoS/path.
            remappings=[('/tf', 'tf_rviz')],
            condition=IfCondition(LaunchConfiguration('rviz')),
        ),
    ])
