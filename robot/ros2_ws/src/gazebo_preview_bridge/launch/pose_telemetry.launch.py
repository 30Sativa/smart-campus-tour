"""Pose telemetry for a robot already running AMCL (navigation.launch.py or localization.launch.py).

    ros2 launch fleet_bridge pose_telemetry.launch.py robot_id:=robot_01 \
        endpoint:=https://<backend>/api/robots/telemetry map_key:=campus_v1

Needs ROBOT_TELEMETRY_SECRET in the environment.
"""
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    config = os.path.join(get_package_share_directory('fleet_bridge'), 'config', 'pose_telemetry.yaml')
    overrides = {name: LaunchConfiguration(name) for name in ('endpoint', 'robot_code', 'source', 'map_key')}
    return LaunchDescription([
        DeclareLaunchArgument('robot_id', default_value='', description='ROS namespace of the robot (amcl_pose lives under it)'),
        DeclareLaunchArgument('endpoint', default_value='http://127.0.0.1:5000/api/robots/telemetry'),
        DeclareLaunchArgument('robot_code', default_value='robot_01'),
        DeclareLaunchArgument('source', default_value='physical'),
        DeclareLaunchArgument('map_key', default_value='campus_v1'),
        DeclareLaunchArgument('use_sim_time', default_value='false'),
        Node(package='fleet_bridge', executable='pose_telemetry', name='pose_telemetry',
             namespace=LaunchConfiguration('robot_id'), output='screen',
             parameters=[config, overrides, {'use_sim_time': LaunchConfiguration('use_sim_time')}]),
    ])
