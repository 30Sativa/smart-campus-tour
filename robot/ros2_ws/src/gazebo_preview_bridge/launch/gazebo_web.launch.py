import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    bridge = get_package_share_directory('gazebo_preview_bridge')
    description = get_package_share_directory('robot_description')
    control = get_package_share_directory('robot_control')
    simulation = get_package_share_directory('simulation')
    return LaunchDescription([
        DeclareLaunchArgument('gui', default_value='false'),
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(os.path.join(description, 'launch', 'gazebo.launch.py')),
            launch_arguments={
                'world': os.path.join(simulation, 'worlds', 'map3d_preview.world'),
                'gui': LaunchConfiguration('gui'), 'spawn_x': '4.0',
            }.items()),
        Node(package='robot_control', executable='mode_manager_node',
             namespace='robot_01', parameters=[
                 os.path.join(control, 'config', 'mode_manager.yaml'),
                 {'use_sim_time': True, 'initial_mode': 'manual'}]),
        Node(package='topic_tools', executable='relay', name='preview_cmd_relay',
             arguments=['/robot_01/cmd_vel', '/diff_drive_controller/cmd_vel_unstamped']),
        Node(package='gazebo_preview_bridge', executable='gazebo_telemetry', output='screen',
             parameters=[os.path.join(bridge, 'config', 'gazebo_telemetry.yaml')]),
    ])
