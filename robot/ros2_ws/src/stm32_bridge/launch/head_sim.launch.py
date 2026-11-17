"""Dau quay PAN/TILT gia lap cho Gazebo (robot/docs/sim-head-poi.md). CHI DUNG TRONG MO PHONG.

Khong chay cung stm32_bridge va khong chay tren robot that: head_sim mo cung ten head/* nhu stm32_bridge.

    ros2 launch stm32_bridge head_sim.launch.py
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('head_auto_home', default_value='true',
                              description='Tu HOME khi khoi dong, nhu stm32_bridge tren robot that'),
        DeclareLaunchArgument('head_frame', default_value='base_link',
                              description='Frame cua than robot de ve dau quay trong RViz'),
        Node(
            package='stm32_bridge', executable='head_sim', name='head_sim', output='screen',
            parameters=[{
                'head_auto_home': LaunchConfiguration('head_auto_home'),
                'head_frame': LaunchConfiguration('head_frame'),
            }],
        ),
    ])
