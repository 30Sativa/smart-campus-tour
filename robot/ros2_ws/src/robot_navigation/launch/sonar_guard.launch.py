# sonar_guard.launch.py - the four SR04T as a near-field speed guard for Nav2.
#
# Included by navigation.launch.py (and the offline sim) when sonar_mode is
# shadow or enforce; robot/docs/sonar-perception.md has the design and evidence.
#
#   sonar_memory        near echoes kept in odom -> <ns>/sonar_guard/memory, and the
#                       costmap footprint + padding -> <ns>/sonar_guard/footprint
#   collision_monitor   stock nav2_collision_monitor, config/sonar_collision_monitor.yaml
#   lifecycle_manager_sonar  configures/activates collision_monitor only, so a
#                       problem here never takes the Nav2 servers down with it. Started
#                       LIFECYCLE_DELAY s late: on 23/11 (offline, CPU busy) the configure
#                       reply was lost while every node was still discovering the others,
#                       and the Humble manager then waits forever. collision_monitor stays
#                       inactive in that case, which in enforce mode means a robot that
#                       does not move: check it before a goal (sonar-perception.md 8).
#
# This file does NOT reroute the velocity smoother. In enforce mode the parent
# launch puts SetRemap('velocity_smoother:cmd_vel', 'cmd_vel_sonar') in front of
# Nav2, which makes collision_monitor the only path from cmd_vel_ctrl to the
# smoother; then a dead collision_monitor means a robot that does not move, never
# one that moves unguarded. In shadow mode the output goes to cmd_vel_sonar_shadow.

import yaml
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, LogInfo, OpaqueFunction, Shutdown, TimerAction
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare

SONAR_MODES = ('off', 'shadow', 'enforce')
SHADOW_OUTPUT = 'cmd_vel_sonar_shadow'
LIFECYCLE_DELAY = 3.0
ENFORCE_OUTPUT = 'cmd_vel_sonar'


def local_costmap_footprint(nav2_params_path):
    """The local costmap footprint string of a Nav2 params file (no root key)."""
    with open(nav2_params_path, encoding='utf-8') as f:
        data = yaml.safe_load(f)
    try:
        return str(data['local_costmap']['local_costmap']['ros__parameters']['footprint'])
    except (KeyError, TypeError):
        raise ValueError(f'{nav2_params_path} has no local_costmap footprint') from None


def _nodes(context):
    mode = LaunchConfiguration('sonar_mode').perform(context)
    if mode not in SONAR_MODES:
        return [LogInfo(msg=f'[sonar_guard] sonar_mode must be one of {SONAR_MODES}, got {mode!r}'),
                Shutdown(reason=f'invalid sonar_mode {mode!r}')]
    if mode == 'off':
        return []
    namespace = LaunchConfiguration('robot_id').perform(context)
    use_sim_time = LaunchConfiguration('use_sim_time').perform(context).lower() == 'true'
    params_path = LaunchConfiguration('nav2_params_file').perform(context)
    padding = float(LaunchConfiguration('sonar_footprint_padding').perform(context))
    config = PathJoinSubstitution([FindPackageShare('robot_navigation'), 'config',
                                   'sonar_collision_monitor.yaml'])
    output = ENFORCE_OUTPUT if mode == 'enforce' else SHADOW_OUTPUT
    return [
        LogInfo(msg=f'[sonar_guard] sonar_mode={mode}: collision_monitor cmd_vel_ctrl -> {output}, '
                    f'footprint padding {padding:.3f} m'),
        Node(package='robot_navigation', executable='sonar_memory', name='sonar_memory',
             namespace=namespace, output='screen',
             parameters=[{'footprint': local_costmap_footprint(params_path), 'padding': padding,
                          'use_sim_time': use_sim_time}]),
        Node(package='nav2_collision_monitor', executable='collision_monitor', name='collision_monitor',
             namespace=namespace, output='screen',
             parameters=[config, {'use_sim_time': use_sim_time, 'cmd_vel_out_topic': output}]),
        TimerAction(period=LIFECYCLE_DELAY, actions=[
            Node(package='nav2_lifecycle_manager', executable='lifecycle_manager',
                 name='lifecycle_manager_sonar', namespace=namespace, output='screen',
                 parameters=[{'use_sim_time': use_sim_time, 'autostart': True,
                              'node_names': ['collision_monitor'], 'bond_timeout': 4.0}])]),
    ]


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('robot_id', default_value='robot_01'),
        DeclareLaunchArgument('use_sim_time', default_value='false'),
        DeclareLaunchArgument('sonar_mode', default_value='shadow',
                              description='off | shadow | enforce (robot/docs/sonar-perception.md)'),
        DeclareLaunchArgument('nav2_params_file',
                              description='Nav2 params file; its local costmap footprint is padded'),
        DeclareLaunchArgument('sonar_footprint_padding', default_value='0.05',
                              description='Stand-off (m) added to the footprint for the approach check'),
        OpaqueFunction(function=_nodes),
    ])
