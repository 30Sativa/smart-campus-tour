# =============================================================================
# sim_navigation.launch.py
# GAZEBO: navigate on a SAVED map (no SLAM, no explorer, no real hardware).
#
# Chain:
#   RViz "Nav2 Goal" -> Nav2 -> /cmd_vel_nav
#     -> mode_manager (explore) -> /cmd_vel
#     -> relay -> /diff_drive_controller/cmd_vel_unstamped -> Gazebo robot
#   Localization: map_server + AMCL using Gazebo /scan.
#
# Prerequisite: save a map of the sim world first, e.g.
#   ros2 launch robot_control sim_manual.launch.py   (or sim_auto_explore)
#   ros2 run nav2_map_server map_saver_cli -f \
#       <ros2_ws>/src/robot_navigation/maps/warehouse_12x12
#
# Run:
#   ros2 launch robot_navigation sim_navigation.launch.py \
#       map:=/path/to/warehouse_12x12.yaml
#
# NOTE: this launch passes set_initial_pose:=true, which seeds AMCL at (0,0,0).
# That is correct HERE because Gazebo spawns the robot at the world origin and
# the bundled map was recorded from that spawn point. The real robot
# (navigation.launch.py) deliberately does not seed itself - see
# localization.launch.py.
# =============================================================================
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import (DeclareLaunchArgument, GroupAction,
                            IncludeLaunchDescription, SetLaunchConfiguration)
from launch.conditions import IfCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import (LaunchConfiguration, PathJoinSubstitution,
                                  PythonExpression)
from launch_ros.actions import Node, PushRosNamespace, SetRemap
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    default_world = os.path.join(
        get_package_share_directory('simulation'),
        'worlds', 'warehouse_12x12.world')
    robot_id = LaunchConfiguration('robot_id')

    # '' -> '' and 'robot_01' -> '/robot_01'. Consumed by nav2_params.yaml
    # through $(var robot_ns); see the Nav2 GroupAction below.
    robot_ns = PythonExpression(
        ["'' if '", robot_id, "' == '' else '/' + '", robot_id, "'.strip('/')"])
    world = LaunchConfiguration('world')
    use_sim_time = LaunchConfiguration('use_sim_time')
    enable_teleop = LaunchConfiguration('enable_teleop')
    drive_cmd_topic = LaunchConfiguration('drive_cmd_topic')
    map_yaml = LaunchConfiguration('map')
    localization_params_file = LaunchConfiguration('localization_params_file')
    nav2_params_file = LaunchConfiguration('nav2_params_file')

    gazebo_launch = PathJoinSubstitution([
        FindPackageShare('robot_description'), 'launch', 'gazebo.launch.py',
    ])
    localization_launch = PathJoinSubstitution([
        FindPackageShare('robot_navigation'), 'launch',
        'localization.launch.py',
    ])
    nav2_launch = PathJoinSubstitution([
        FindPackageShare('nav2_bringup'), 'launch', 'navigation_launch.py',
    ])
    mode_manager_config = PathJoinSubstitution([
        FindPackageShare('robot_control'), 'config', 'mode_manager.yaml',
    ])
    default_map = PathJoinSubstitution([
        FindPackageShare('robot_navigation'), 'maps', 'warehouse_12x12.yaml',
    ])
    default_localization_params = PathJoinSubstitution([
        FindPackageShare('robot_navigation'), 'config',
        'localization_params.yaml',
    ])
    default_nav2_params = PathJoinSubstitution([
        FindPackageShare('robot_control'), 'config', 'nav2_params.yaml',
    ])

    return LaunchDescription([
        DeclareLaunchArgument(
            'robot_id', default_value='',
            description='ROS namespace for this simulated robot.'),
        DeclareLaunchArgument(
            'use_sim_time', default_value='true',
            description='Use the Gazebo clock for all nodes.'),
        DeclareLaunchArgument(
            'enable_teleop', default_value='false',
            description='Optional manual override teleop -> /cmd_vel_manual.'),
        DeclareLaunchArgument(
            'drive_cmd_topic',
            default_value='/diff_drive_controller/cmd_vel_unstamped',
            description='Gazebo diff_drive_controller command topic.'),
        DeclareLaunchArgument(
            'map', default_value=default_map,
            description='Full path to the saved map .yaml.'),
        DeclareLaunchArgument(
            'localization_params_file',
            default_value=default_localization_params,
            description='AMCL / map_server parameter file.'),
        DeclareLaunchArgument(
            'nav2_params_file', default_value=default_nav2_params,
            description='Nav2 parameter file.'),
        DeclareLaunchArgument(
            'world', default_value=default_world,
            description='Gazebo .world file to load.'),

        # 1) Gazebo + robot + diff_drive_controller (publishes /scan, odom, tf).
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(gazebo_launch),
            launch_arguments={'world': world}.items(),
        ),

        # 2) Mode manager mux -> /cmd_vel, starting in explore (nav source).
        Node(
            package='robot_control',
            executable='mode_manager_node',
            name='mode_manager_node',
            namespace=robot_id,
            output='screen',
            parameters=[
                mode_manager_config,
                {
                    'initial_mode': 'explore',
                    'use_sim_time': ParameterValue(use_sim_time, value_type=bool),
                },
            ],
        ),

        # 3) Relay /cmd_vel -> Gazebo controller command topic.
        Node(
            package='topic_tools',
            executable='relay',
            name='cmd_vel_sim_relay',
            namespace=robot_id,
            output='screen',
            arguments=['cmd_vel', drive_cmd_topic],
        ),
        Node(
            package='topic_tools',
            executable='relay',
            name='odom_sim_relay',
            namespace=robot_id,
            output='screen',
            arguments=['/diff_drive_controller/odom', 'odom'],
        ),
        Node(
            package='topic_tools',
            executable='relay',
            name='scan_sim_relay',
            namespace=robot_id,
            output='screen',
            condition=IfCondition(PythonExpression([
                "'", robot_id, "' != ''",
            ])),
            arguments=['/scan', 'scan'],
        ),

        # 4) Localization on the saved map (replaces slam_toolbox).
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(localization_launch),
            launch_arguments={
                'robot_id': robot_id,
                'map': map_yaml,
                'use_sim_time': use_sim_time,
                'params_file': localization_params_file,
                # Gazebo really does spawn the robot at the world origin the
                # sim map was recorded from, so seeding AMCL there is correct
                # here. The real robot deliberately does not (see
                # localization.launch.py).
                'set_initial_pose': 'true',
            }.items(),
        ),

        # 5) Nav2, velocity output remapped to /cmd_vel_nav for the mux.
        GroupAction([
            # Nav2 Humble's navigation_launch.py already wires an internal
            # chain, and it uses BOTH of the names this stack cares about:
            #
            #   controller_server  pub "cmd_vel"           -\
            #   behavior_server    pub "cmd_vel"            |-> nav2 remaps to
            #   velocity_smoother  sub "cmd_vel"           -/   cmd_vel_nav
            #   velocity_smoother  pub "cmd_vel_smoothed"  ---> nav2 remaps to
            #                                                   cmd_vel
            #
            # SetRemap rules are inserted BEFORE a node's own remappings, and
            # rcl applies the FIRST matching rule. So remapping cmd_vel_smoothed
            # to /cmd_vel_nav made velocity_smoother publish onto the very topic
            # it subscribes to: a feedback loop. Its own output kept refreshing
            # last_command_time_, so the velocity_timeout stop never fired, and
            # /cmd_vel_nav ended up with two competing publishers (raw 10 Hz
            # controller + smoothed 20 Hz echo), which also defeats
            # mode_manager's nav_timeout watchdog.
            #
            # Fix: rename nav2's INTERNAL topic instead of its output, so each
            # topic has exactly one publisher:
            #
            #   controller_server -\
            #                       >-> /cmd_vel_ctrl -> velocity_smoother
            #   behavior_server   -/                          |
            #                                                 v
            #                     /cmd_vel_nav -> mode_manager -> /cmd_vel
            #
            # NOTE: SetRemap only reaches plain Node actions. Composable nodes
            # ignore it. navigation_launch.py defaults to use_composition:=False
            # so this works - but never pass use_composition:=True here or every
            # rule below is silently dropped and Nav2 drives /cmd_vel directly,
            # bypassing mode_manager and the e-stop.
            # NAMESPACE - this is the root cause of the old runtime failure
            # "controller_server: No critics defined for FollowPath".
            # On Humble, nav2_bringup/launch/navigation_launch.py does NOT put
            # its nodes in a namespace. The `namespace` argument is used only
            # for RewrittenYaml(root_key=...) and for the composition
            # container name; no Node gets namespace= and there is no
            # PushRosNamespace. So with robot_id:=robot_01 the servers came up
            # at the ROOT (/controller_server, /planner_server, ...) while the
            # rewritten YAML declared parameters under /robot_01/... . Nothing
            # matched, every Nav2 server started with an EMPTY parameter set,
            # and controller_server failed on the first goal - even though
            # FollowPath and its critics were right there in nav2_params.yaml.
            # With robot_id:='' RewrittenYaml skips the root key entirely,
            # which is why the bug only ever showed up namespaced.
            PushRosNamespace(robot_id),

            # TF STAYS GLOBAL. navigation_launch.py remaps /tf -> tf on every
            # node; under a pushed namespace that becomes /robot_01/tf. But
            # AMCL, the EKF and robot_state_publisher broadcast on the global
            # /tf (tf2's broadcaster uses the absolute name), so namespaced
            # Nav2 would see an empty TF tree and never move. Global remap
            # rules are inserted BEFORE a node's own remappings and rcl takes
            # the FIRST matching rule, so these identity rules shadow nav2's
            # and the whole stack keeps sharing one TF tree - exactly as it
            # did before the namespace was fixed.
            # Per-robot frame prefixes are a separate cross-stack change; see
            # docs/architecture.md section 2.1.
            SetRemap(src='/tf', dst='/tf'),
            SetRemap(src='/tf_static', dst='/tf_static'),

            SetRemap(src='cmd_vel', dst='cmd_vel_ctrl'),
            SetRemap(src='cmd_vel_smoothed', dst='cmd_vel_nav'),

            # nav2_params.yaml reads this as "$(var robot_ns)" to build the
            # costmap sensor topics. It must be '' or '/robot_01'.
            # Why the costmaps cannot just use relative names: costmap plugins
            # subscribe on the costmap node, whose namespace is
            # <robot_ns>/local_costmap (Costmap2DROS pushes a sub-namespace),
            # so a plain "scan" would resolve to
            # <robot_ns>/local_costmap/scan - a topic nobody publishes.
            # Upstream nav2 hardcodes "/robot1/scan" in its multirobot params;
            # this does the same without baking the robot id into the file.
            SetLaunchConfiguration('robot_ns', robot_ns),

            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(nav2_launch),
                launch_arguments={
                    'namespace': robot_id,
                    'use_sim_time': use_sim_time,
                    'params_file': nav2_params_file,
                    'autostart': 'true',
                }.items(),
            ),
        ]),

        # 6) Optional manual override teleop -> /cmd_vel_manual (mux priority).
        Node(
            package='teleop_twist_keyboard',
            executable='teleop_twist_keyboard',
            name='teleop_keyboard',
            namespace=robot_id,
            output='screen',
            emulate_tty=True,
            condition=IfCondition(enable_teleop),
            remappings=[
                ('cmd_vel', 'cmd_vel_manual'),
            ],
        ),
    ])
