"""Static contract tests for the Nav2 A->B baseline.

These parse the YAML/XML/launch sources rather than matching raw whitespace,
so reformatting the params file does not break them. They are Tier 1: they
prove the CONFIGURATION says what we think it says. They prove nothing about
runtime behaviour - that is robot_navigation/README.md section "Acceptance
tests on the real robot".
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml


SRC = Path(__file__).resolve().parents[2]

PLANNER_PLUGIN = 'nav2_smac_planner/SmacPlanner2D'
CONTROLLER_PLUGIN = (
    'nav2_regulated_pure_pursuit_controller::RegulatedPurePursuitController')
OBSTACLE_LAYER = 'nav2_costmap_2d::ObstacleLayer'

# Every launch file that feeds nav2_params.yaml into nav2_bringup and so must
# push the namespace, keep TF global, and define $(var robot_ns).
NAV2_LAUNCH_FILES = (
    'robot_navigation/launch/navigation.launch.py',
    'robot_navigation/launch/sim_navigation.launch.py',
    'robot_control/launch/auto_explore.launch.py',
    'robot_control/launch/sim_auto_explore.launch.py',
)


def _read(relative_path):
    return (SRC / relative_path).read_text(encoding='utf-8')


def _nav2_params():
    return yaml.safe_load(_read('robot_control/config/nav2_params.yaml'))


def _local_costmap():
    return _nav2_params()['local_costmap']['local_costmap']['ros__parameters']


def _global_costmap():
    return _nav2_params()['global_costmap']['global_costmap']['ros__parameters']


def _follow_path():
    return _nav2_params()['controller_server']['ros__parameters']['FollowPath']


# --------------------------------------------------------------- planner


def test_global_planner_is_smac_2d():
    planner = _nav2_params()['planner_server']['ros__parameters']
    assert planner['planner_plugins'] == ['GridBased']
    assert planner['GridBased']['plugin'] == PLANNER_PLUGIN


def test_navfn_is_gone():
    assert 'NavfnPlanner' not in _read('robot_control/config/nav2_params.yaml')


# ------------------------------------------------------------- controller


def test_progress_checker_key_is_humble_singular():
    """Humble declares "progress_checker_plugin" (singular, a plain string).

    The plural "progress_checker_plugins" landed in Iron. On Humble the plural
    key is never read: the id falls back to default_progress_checker_id_,
    which is itself "progress_checker", so a block named exactly that still
    gets loaded by luck. Rename the block and the progress checker silently
    reverts to stock defaults with no warning in the log.
    """
    controller = _nav2_params()['controller_server']['ros__parameters']
    assert 'progress_checker_plugins' not in controller
    plugin_id = controller['progress_checker_plugin']
    assert isinstance(plugin_id, str), 'Humble wants a string, not a list'
    assert plugin_id == 'progress_checker'
    # The referenced block must exist and name a real plugin.
    assert controller[plugin_id]['plugin'] == 'nav2_controller::SimpleProgressChecker'


def test_goal_checker_and_controller_keys_stay_plural():
    """Only the progress checker is singular on Humble - do not "fix" these."""
    controller = _nav2_params()['controller_server']['ros__parameters']
    assert isinstance(controller['goal_checker_plugins'], list)
    assert isinstance(controller['controller_plugins'], list)
    assert 'goal_checker_plugin' not in controller
    assert 'controller_plugin' not in controller
    for plugin_id in controller['goal_checker_plugins']:
        assert plugin_id in controller, plugin_id
    for plugin_id in controller['controller_plugins']:
        assert plugin_id in controller, plugin_id


def test_controller_is_regulated_pure_pursuit():
    controller = _nav2_params()['controller_server']['ros__parameters']
    assert controller['controller_plugins'] == ['FollowPath']
    assert _follow_path()['plugin'] == CONTROLLER_PLUGIN


def test_rpp_baseline_safety_flags():
    params = _follow_path()
    assert params['use_rotate_to_heading'] is True
    assert params['allow_reversing'] is False
    assert params['use_collision_detection'] is True


def test_rpp_speed_stays_at_the_supervised_baseline():
    params = _follow_path()
    assert params['desired_linear_vel'] <= 0.20
    smoother = _nav2_params()['velocity_smoother']['ros__parameters']
    # The controller must never ask for more than the smoother will pass.
    assert params['desired_linear_vel'] <= smoother['max_velocity'][0]
    assert params['rotate_to_heading_angular_vel'] <= smoother['max_velocity'][2]
    assert params['max_angular_accel'] <= smoother['max_accel'][2]


def test_rpp_regulation_is_actually_active():
    """min_speed above desired_linear_vel silently disables regulation.

    The Humble default is 0.25 m/s, which is ABOVE this robot's 0.20 m/s
    baseline - leaving it unset would make curvature regulation a no-op.
    """
    params = _follow_path()
    assert params['use_regulated_linear_velocity_scaling'] is True
    assert params['regulated_linear_scaling_min_speed'] < params['desired_linear_vel']


def test_rpp_lookahead_is_not_shorter_than_the_robot():
    params = _follow_path()
    robot_radius = _local_costmap()['robot_radius']
    assert params['lookahead_dist'] >= robot_radius


def test_rpp_inflation_gain_matches_the_local_costmap():
    """RPP reads the local inflation gradient to regulate on proximity cost."""
    assert (_follow_path()['inflation_cost_scaling_factor'] ==
            _local_costmap()['inflation_layer']['cost_scaling_factor'])


def test_dwb_is_gone():
    source = _read('robot_control/config/nav2_params.yaml')
    assert 'DWBLocalPlanner' not in source
    assert 'dwb_core' not in source


def test_dwb_critics_config_is_gone():
    """A leftover critics block is what produced the old runtime failure."""
    source = _read('robot_control/config/nav2_params.yaml')
    for leftover in ('critics:', 'BaseObstacle.scale', 'PathAlign.scale',
                     'GoalAlign.scale', 'PathDist.scale', 'GoalDist.scale',
                     'RotateToGoal.scale', 'vtheta_samples', 'vx_samples',
                     'vy_samples', 'angular_granularity'):
        assert leftover not in source, leftover
    # DWB's own `sim_time` key, not `use_sim_time`.
    assert re.search(r'^\s+sim_time:', source, re.M) is None


# ---------------------------------------------------------- global costmap


def test_global_costmap_is_lidar_only():
    costmap = _global_costmap()
    assert costmap['plugins'] == ['static_layer', 'obstacle_layer',
                                  'inflation_layer']
    assert costmap['static_layer']['plugin'] == 'nav2_costmap_2d::StaticLayer'
    assert costmap['obstacle_layer']['plugin'] == OBSTACLE_LAYER
    assert costmap['obstacle_layer']['observation_sources'] == 'scan'
    assert costmap['obstacle_layer']['scan']['data_type'] == 'LaserScan'


def test_global_costmap_has_no_depth_or_sonar():
    costmap = _global_costmap()
    rendered = yaml.safe_dump(costmap)
    assert 'PointCloud2' not in rendered
    assert 'RangeSensorLayer' not in rendered
    assert 'ultrasonic' not in rendered
    assert 'depth' not in rendered


# ----------------------------------------------------------- local costmap


def test_local_costmap_separates_lidar_depth_and_sonar():
    costmap = _local_costmap()
    assert costmap['plugins'] == ['lidar_obstacle_layer', 'depth_obstacle_layer',
                                  'sonar_layer', 'inflation_layer']

    lidar = costmap['lidar_obstacle_layer']
    assert lidar['plugin'] == OBSTACLE_LAYER
    assert lidar['observation_sources'] == 'scan'
    assert lidar['scan']['data_type'] == 'LaserScan'

    depth = costmap['depth_obstacle_layer']
    assert depth['plugin'] == OBSTACLE_LAYER
    assert depth['observation_sources'] == 'pointcloud'
    assert depth['pointcloud']['data_type'] == 'PointCloud2'

    sonar = costmap['sonar_layer']
    assert sonar['plugin'] == 'nav2_costmap_2d::RangeSensorLayer'
    assert len(sonar['topics']) == 4

    inflation = costmap['inflation_layer']
    assert inflation['plugin'] == 'nav2_costmap_2d::InflationLayer'


def test_obstacle_layers_combine_with_maximum():
    """combination_method 1 = Maximum in nav2_costmap_2d on Humble.

    With 0 (Overwrite) the LiDAR layer would erase the depth layer's marks
    when it wrote into the master costmap - which is the whole reason the two
    sensors are in separate layers.
    """
    costmap = _local_costmap()
    assert costmap['lidar_obstacle_layer']['combination_method'] == 1
    assert costmap['depth_obstacle_layer']['combination_method'] == 1
    assert _global_costmap()['obstacle_layer']['combination_method'] == 1


def test_depth_is_local_only():
    assert 'PointCloud2' not in yaml.safe_dump(_global_costmap())
    assert _local_costmap()['depth_obstacle_layer'][
        'pointcloud']['data_type'] == 'PointCloud2'


def test_camera_disabled_launch_cannot_stall_the_costmap():
    """enable_camera:=false leaves camera/depth/points with no publisher.

    expected_update_rate 0.0 tells ObstacleLayer never to mark itself stale,
    so the local costmap keeps updating from LiDAR + sonar and the lifecycle
    transition still succeeds.
    """
    depth = _local_costmap()['depth_obstacle_layer']['pointcloud']
    assert depth['expected_update_rate'] == 0.0
    launch = _read('robot_navigation/launch/navigation.launch.py')
    assert "'enable_camera', default_value='true'" in launch
    assert 'condition=IfCondition(enable_camera)' in launch


# ------------------------------------------------------ footprint/inflation


def test_local_inflation_radius_covers_the_robot():
    costmap = _local_costmap()
    assert (costmap['inflation_layer']['inflation_radius'] >=
            costmap['robot_radius'])


def test_global_inflation_radius_covers_the_robot():
    costmap = _global_costmap()
    assert (costmap['inflation_layer']['inflation_radius'] >=
            costmap['robot_radius'])


def test_costmaps_agree_on_robot_radius():
    assert _local_costmap()['robot_radius'] == _global_costmap()['robot_radius']


def test_robot_radius_covers_the_cad_chassis_box():
    """robot_radius must bound the CAD collision box, not the 74x55 estimate."""
    xacro = _read('robot_description/urdf/common_properties.xacro')
    length = float(re.search(
        r'name="base_length"\s+value="([0-9.]+)"', xacro).group(1))
    width = float(re.search(
        r'name="base_width"\s+value="([0-9.]+)"', xacro).group(1))
    circumscribed = ((length ** 2 + width ** 2) ** 0.5) / 2.0
    assert _local_costmap()['robot_radius'] >= circumscribed - 1e-3


# ---------------------------------------------------------------- namespace


def test_nav2_launches_push_the_robot_namespace():
    """Root cause of "No critics defined for FollowPath".

    nav2_bringup/navigation_launch.py on Humble uses `namespace` only as
    RewrittenYaml(root_key=...); it never puts the nodes in that namespace.
    Without PushRosNamespace the servers come up at the root and match none of
    the rewritten parameters.
    """
    for launch_file in NAV2_LAUNCH_FILES:
        source = _read(launch_file)
        assert 'PushRosNamespace(robot_id)' in source, launch_file
        assert 'PushRosNamespace' in source.split(
            'from launch_ros.actions import')[1].split('\n')[0], launch_file


def test_nav2_keeps_the_global_tf_tree():
    """Nav2 remaps /tf -> tf internally; under a namespace that breaks TF."""
    for launch_file in NAV2_LAUNCH_FILES:
        source = _read(launch_file)
        assert "SetRemap(src='/tf', dst='/tf')" in source, launch_file
        assert "SetRemap(src='/tf_static', dst='/tf_static')" in source, launch_file


def test_nav2_launches_define_robot_ns_for_the_params_file():
    for launch_file in NAV2_LAUNCH_FILES:
        source = _read(launch_file)
        assert "SetLaunchConfiguration('robot_ns', robot_ns)" in source, launch_file
        assert 'robot_ns = PythonExpression(' in source, launch_file


def test_costmap_sensor_topics_resolve_under_the_robot_namespace():
    """Costmap plugins subscribe on the costmap node (<ns>/local_costmap).

    A plain relative "scan" there resolves to <ns>/local_costmap/scan, which
    nobody publishes; a hardcoded "/scan" breaks the namespaced robot. Both
    must be built from $(var robot_ns).
    """
    topics = []
    local = _local_costmap()
    topics.append(local['lidar_obstacle_layer']['scan']['topic'])
    topics.append(local['depth_obstacle_layer']['pointcloud']['topic'])
    topics.extend(local['sonar_layer']['topics'])
    topics.append(_global_costmap()['obstacle_layer']['scan']['topic'])
    for topic in topics:
        assert topic.startswith('$(var robot_ns)/'), topic
        assert 'robot_01' not in topic, topic


def test_sonar_topics_match_the_bridge():
    """stm32_bridge publishes ultrasonic/sonarN/range relative to its node."""
    bridge = _read('stm32_bridge/stm32_bridge/stm32_bridge_node.py')
    for index in (1, 2, 3, 4):
        relative = f'ultrasonic/sonar{index}/range'
        assert f"declare_parameter('sonar{index}_topic', '{relative}')" in bridge
        assert (f'$(var robot_ns)/{relative}' in
                _local_costmap()['sonar_layer']['topics'])


def test_nav2_output_still_goes_through_mode_manager():
    """use_composition must stay false or every SetRemap is silently dropped
    and Nav2 would publish straight to cmd_vel, bypassing the e-stop."""
    for launch_file in NAV2_LAUNCH_FILES:
        source = _read(launch_file)
        assert "SetRemap(src='cmd_vel', dst='cmd_vel_ctrl')" in source, launch_file
        assert ("SetRemap(src='cmd_vel_smoothed', dst='cmd_vel_nav')"
                in source), launch_file
        assert "'use_composition': 'True'" not in source, launch_file
        assert "'use_composition': 'true'" not in source, launch_file


# ----------------------------------------------------------- behavior trees


def _bt_path(name):
    return SRC / 'robot_navigation' / 'behavior_trees' / name


def test_baseline_behavior_trees_never_invoke_backup():
    params = _nav2_params()['bt_navigator']['ros__parameters']
    for key in ('default_nav_to_pose_bt_xml', 'default_nav_through_poses_bt_xml'):
        configured = params[key]
        assert configured.startswith('$(find-pkg-share robot_navigation)/')
        name = configured.rsplit('/', 1)[-1]
        tree = _bt_path(name)
        assert tree.is_file(), tree
        root = ET.parse(tree).getroot()
        assert list(root.iter('BackUp')) == [], f'{name} still invokes BackUp'
        # The recoveries we DO keep are safe in place.
        assert list(root.iter('Spin')), name
        assert list(root.iter('Wait')), name
        assert list(root.iter('ClearEntireCostmap')), name


def test_behavior_trees_are_installed():
    setup = _read('robot_navigation/setup.py')
    assert "'behavior_trees'" in setup


def test_backup_plugin_stays_loaded_for_manual_testing():
    """Loaded, but never reached by the baseline trees."""
    behavior = _nav2_params()['behavior_server']['ros__parameters']
    assert 'backup' in behavior['behavior_plugins']
    assert behavior['backup']['plugin'] == 'nav2_behaviors/BackUp'


def test_waypoint_follower_is_kept_for_tour_stops():
    assert 'waypoint_follower' in _nav2_params()


# ------------------------------------------------------------- localization


def test_real_amcl_does_not_assume_the_map_origin():
    amcl = yaml.safe_load(
        _read('robot_navigation/config/localization_params.yaml'))['/**/amcl']
    assert amcl['ros__parameters']['set_initial_pose'] is False
    launch = _read('robot_navigation/launch/localization.launch.py')
    assert "'set_initial_pose', default_value='false'" in launch


def test_sim_still_seeds_amcl_at_the_spawn_origin():
    sim = _read('robot_navigation/launch/sim_navigation.launch.py')
    assert "'set_initial_pose': 'true'" in sim


def test_amcl_frames_match_the_rest_of_the_stack():
    amcl = yaml.safe_load(
        _read('robot_navigation/config/localization_params.yaml'))[
            '/**/amcl']['ros__parameters']
    assert amcl['global_frame_id'] == 'map'
    assert amcl['odom_frame_id'] == 'odom'
    assert amcl['base_frame_id'] == 'base_footprint'
    assert amcl['tf_broadcast'] is True


def test_nav2_uses_base_footprint_everywhere():
    params = _nav2_params()
    assert params['bt_navigator']['ros__parameters'][
        'robot_base_frame'] == 'base_footprint'
    assert _local_costmap()['robot_base_frame'] == 'base_footprint'
    assert _global_costmap()['robot_base_frame'] == 'base_footprint'
    assert params['behavior_server']['ros__parameters'][
        'robot_base_frame'] == 'base_footprint'


# ----------------------------------------------------------- dependencies


def test_plugin_packages_are_declared_dependencies():
    for package in ('robot_control', 'robot_navigation'):
        manifest = _read(f'{package}/package.xml')
        for dependency in ('nav2_smac_planner',
                           'nav2_regulated_pure_pursuit_controller',
                           'nav2_costmap_2d',
                           'nav2_behaviors',
                           'nav2_bt_navigator',
                           'nav2_waypoint_follower'):
            assert f'<exec_depend>{dependency}</exec_depend>' in manifest, (
                package, dependency)


# ---------------------------------------------------- untouched calibration


def test_wheel_base_calibration_is_unchanged():
    manual = _read('robot_control/launch/manual_mode.launch.py')
    assert "'wheel_base', default_value='0.4714'" in manual
    assert "'wheel_radius', default_value='0.09725'" in manual


if __name__ == '__main__':
    tests = [value for name, value in sorted(globals().items())
             if name.startswith('test_')]
    failures = 0
    for test in tests:
        try:
            test()
            print(f'PASS  {test.__name__}')
        except AssertionError as exc:
            failures += 1
            print(f'FAIL  {test.__name__}: {exc}')
    print(f'\n{len(tests) - failures}/{len(tests)} passed')
    raise SystemExit(1 if failures else 0)
