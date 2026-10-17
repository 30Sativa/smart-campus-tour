"""Remote debug access for laptops, separate from navigation.launch.py.

Starts, both on the robot loopback only:
- foxglove_bridge, read-only (config/debug_bridge.yaml), port `port`;
- initialpose_guard, the single remote write path (initial pose), port
  `pose_port`.
A laptop reaches both through one SSH tunnel with
robot/tools/rviz_over_ssh/rviz-over-ssh; see robot/docs/dds-isolation.md.

Stopping or crashing this launch never affects Nav2: it only subscribes, and
publishes nothing but guarded initial poses.

  ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01

foxglove_bridge is not a package dependency on purpose (most machines never run
it); this launch stops with install instructions when it is missing.
"""
import os

from ament_index_python.packages import PackageNotFoundError, get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, LogInfo, OpaqueFunction, Shutdown
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def _preflight(context, *args, **kwargs):
    try:
        get_package_share_directory('foxglove_bridge')
    except PackageNotFoundError:
        return [LogInfo(msg='\n[debug_bridge] foxglove_bridge is not installed. On the robot:\n'
                            '  sudo apt install ros-humble-foxglove-bridge\n'
                            'then pin it: sudo apt-mark hold ros-humble-foxglove-bridge '
                            'ros-humble-rosx-introspection. '
                            'See robot/docs/dds-isolation.md.'),
                Shutdown(reason='foxglove_bridge not installed')]
    actions = []
    if os.environ.get('ROS_LOCALHOST_ONLY') != '1':
        actions.append(LogInfo(msg='[debug_bridge] WARNING: ROS_LOCALHOST_ONLY is not 1, so robot '
                                   'DDS is '
                                   'not isolated: laptops can still join the robot graph directly '
                                   '(robot/docs/dds-isolation.md, step S2).'))
    return actions


def generate_launch_description():
    robot_id = LaunchConfiguration('robot_id')
    bridge_params = PathJoinSubstitution([
        FindPackageShare('robot_navigation'), 'config', 'debug_bridge.yaml'])
    return LaunchDescription([
        DeclareLaunchArgument(
            'robot_id', default_value='',
            description='Same robot_id as navigation.launch.py (robot_01 on the real robot).'),
        DeclareLaunchArgument(
            'port', default_value='8765',
            description='Bridge port on 127.0.0.1. The address is fixed to loopback in '
                        'debug_bridge.yaml and is deliberately not an argument.'),
        DeclareLaunchArgument(
            'pose_port', default_value='8766',
            description='initialpose_guard port on 127.0.0.1 (address fixed in the node).'),
        OpaqueFunction(function=_preflight),
        Node(
            package='foxglove_bridge', executable='foxglove_bridge', name='foxglove_bridge',
            output='screen',
            parameters=[bridge_params,
                        {'port': ParameterValue(LaunchConfiguration('port'), value_type=int)}],
            # With the Discovery Server a plain client only learns endpoints it
            # matches, so the bridge would never see the robot's topics. This is
            # the only robot process that is a super client.
            additional_env={'ROS_SUPER_CLIENT': 'TRUE'},
            respawn=True, respawn_delay=2.0, emulate_tty=True,
        ),
        Node(
            package='robot_navigation', executable='initialpose_guard', name='initialpose_guard',
            namespace=robot_id, output='screen',
            parameters=[{'listen_port': ParameterValue(LaunchConfiguration('pose_port'),
                                                       value_type=int)}],
            respawn=True, respawn_delay=2.0, emulate_tty=True,
        ),
    ])
