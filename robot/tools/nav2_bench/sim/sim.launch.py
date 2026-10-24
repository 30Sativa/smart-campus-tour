"""Offline Nav2 sim: the real Nav2 stack (same params/remaps/namespace as
robot_navigation/navigation.launch.py) + map_server; fakebot.py supplies
TF, odom and scan. No AMCL (fakebot publishes map->odom with modelled noise)."""
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import GroupAction, IncludeLaunchDescription, SetLaunchConfiguration
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node, PushRosNamespace, SetRemap

def generate_launch_description():
    params = os.environ['NAVSIM_PARAMS']
    mp = os.path.expanduser('~/smart-campus-tour/robot/robot_maps/map2.yaml')
    nav2_launch = os.path.join(get_package_share_directory('nav2_bringup'), 'launch', 'navigation_launch.py')
    return LaunchDescription([
        Node(package='nav2_map_server', executable='map_server', name='map_server', namespace='robot_01',
             parameters=[{'yaml_filename': mp, 'use_sim_time': False, 'topic_name': 'map', 'frame_id': 'map'}]),
        Node(package='nav2_lifecycle_manager', executable='lifecycle_manager', name='lifecycle_manager_localization',
             namespace='robot_01', parameters=[{'autostart': True, 'node_names': ['map_server']}]),
        GroupAction([
            PushRosNamespace('robot_01'),
            SetRemap(src='/tf', dst='/tf'), SetRemap(src='/tf_static', dst='/tf_static'),
            SetRemap(src='cmd_vel', dst='cmd_vel_ctrl'), SetRemap(src='cmd_vel_smoothed', dst='cmd_vel_nav'),
            SetLaunchConfiguration('robot_ns', '/robot_01'),
            IncludeLaunchDescription(PythonLaunchDescriptionSource(nav2_launch), launch_arguments={
                'namespace': 'robot_01', 'use_sim_time': 'false', 'params_file': params, 'autostart': 'true'}.items()),
        ]),
    ])
