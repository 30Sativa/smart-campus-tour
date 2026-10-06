"""Static contract tests for the Nav2 A->B baseline.

These parse the YAML/XML/launch sources rather than matching raw whitespace,
so reformatting the params file does not break them. They are Tier 1: they
prove the CONFIGURATION says what we think it says. They prove nothing about
runtime behaviour - that is robot_navigation/README.md section "Acceptance
tests on the real robot".
"""

import json
import math
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


def _footprint(costmap):
    """Humble parses a string of XY pairs; nested YAML arrays are not valid params."""
    configured = costmap['footprint']
    assert isinstance(configured, str)
    points = json.loads(configured)
    assert isinstance(points, list) and len(points) == 4
    for point in points:
        assert isinstance(point, list) and len(point) == 2
        assert all(type(value) in (int, float) and math.isfinite(value)
                   for value in point)
    assert len({tuple(point) for point in points}) == 4
    return points


def _footprint_edges(points):
    return zip(points, points[1:] + points[:1])


def _cross(start, end, point):
    return ((end[0] - start[0]) * (point[1] - start[1]) -
            (end[1] - start[1]) * (point[0] - start[0]))


def _inscribed_radius(costmap):
    """Distance from frame origin to the closest polygon edge (Humble inflation)."""
    return min(abs(_cross(start, end, (0.0, 0.0))) /
               math.hypot(end[0] - start[0], end[1] - start[1])
               for start, end in _footprint_edges(_footprint(costmap)))


def _cad_chassis_corners():
    root = ET.fromstring(_read('robot_description/urdf/common_properties.xacro'))
    properties = {item.attrib['name']: float(item.attrib['value'])
                  for item in root.findall('{http://www.ros.org/wiki/xacro}property')
                  if item.attrib['name'] in (
                      'base_length', 'base_width', 'base_collision_x', 'base_collision_y')}
    half_length = properties['base_length'] / 2.0
    half_width = properties['base_width'] / 2.0
    cx, cy = properties['base_collision_x'], properties['base_collision_y']
    return [(cx + half_length, cy + half_width),
            (cx - half_length, cy + half_width),
            (cx - half_length, cy - half_width),
            (cx + half_length, cy - half_width)]


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


def test_heading_and_recovery_turns_share_the_supervised_speed_envelope():
    """Recovery must not retain the old fast spin after RPP is slowed down."""
    params = _nav2_params()
    rpp = _follow_path()
    behavior = params['behavior_server']['ros__parameters']
    smoother = params['velocity_smoother']['ros__parameters']
    limit = smoother['max_velocity'][2]
    assert 0.0 < limit <= 0.40
    assert smoother['min_velocity'][2] == -limit
    assert 0.0 < rpp['rotate_to_heading_angular_vel'] <= limit
    assert (0.0 < behavior['min_rotational_vel'] <
            behavior['max_rotational_vel'] <= limit)


def test_turn_acceleration_is_limited_without_weakening_braking():
    """Check the downstream ramp as well as each turn producer's settings."""
    params = _nav2_params()
    smoother = params['velocity_smoother']['ros__parameters']
    accel = smoother['max_accel'][2]
    assert 0.0 < _follow_path()['max_angular_accel'] <= accel <= 0.50
    assert (0.0 < params['behavior_server']['ros__parameters'][
        'rotational_acc_lim'] <= accel)
    # Startup ramp changes must not silently reduce the existing brake limit.
    assert smoother['max_decel'] == [-0.50, 0.0, -2.50]
    assert smoother['velocity_timeout'] == 0.5


def test_progress_timeout_budgets_slow_half_turn_then_translation():
    """Ideal timing budget, not proof of physical acceleration or progress.

    SimpleProgressChecker only counts translation. Budget a trapezoidal
    180-degree turn, then the progress radius plus one grid cell at the
    regulated minimum cruise speed, and two seconds of scheduling margin.
    """
    params = _nav2_params()
    controller = params['controller_server']['ros__parameters']
    progress = controller[controller['progress_checker_plugin']]
    rpp = controller['FollowPath']
    smoother = params['velocity_smoother']['ros__parameters']
    speed = rpp['rotate_to_heading_angular_vel']
    accel = min(rpp['max_angular_accel'], smoother['max_accel'][2],
                -smoother['max_decel'][2])
    assert speed > 0.0 and accel > 0.0
    if math.pi >= speed * speed / accel:
        turn_seconds = math.pi / speed + speed / accel
    else:
        turn_seconds = 2.0 * math.sqrt(math.pi / accel)
    travel_seconds = (
        progress['required_movement_radius'] + _local_costmap()['resolution']
    ) / rpp['regulated_linear_scaling_min_speed']
    assert progress['movement_time_allowance'] >= turn_seconds + travel_seconds + 2.0


def test_rpp_lookahead_is_not_shorter_than_the_robot():
    params = _follow_path()
    # Preserve the existing geometric lookahead guard without a circular model.
    furthest_corner = max(math.hypot(*point) for point in _footprint(_local_costmap()))
    assert params['lookahead_dist'] >= furthest_corner


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


def test_local_costmap_keeps_lidar_depth_and_disables_sonar():
    costmap = _local_costmap()
    # Sonar is intentionally not loaded in the temporary hardware baseline.
    # Humble still processes Range messages when only enabled=false is set.
    assert costmap['plugins'] == ['lidar_obstacle_layer', 'depth_obstacle_layer',
                                  'inflation_layer']

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
    assert sonar['enabled'] is False
    assert len(sonar['topics']) == 4

    inflation = costmap['inflation_layer']
    assert inflation['plugin'] == 'nav2_costmap_2d::InflationLayer'


def test_navigation_rviz_has_four_independent_sonar_displays_off_by_default():
    config = yaml.safe_load(_read('robot_navigation/rviz/navigation.rviz'))
    displays = config['Visualization Manager']['Displays']
    group = next(display for display in displays
                 if display['Name'] == 'Sonar - display only')
    assert group['Class'] == 'rviz_common/Group'
    assert group['Enabled'] is True
    sonars = group['Displays']
    assert len(sonars) == 4
    assert len({display['Color'] for display in sonars}) == 4
    for index, display in enumerate(sonars, start=1):
        assert display['Class'] == 'rviz_default_plugins/Range'
        assert display['Enabled'] is False
        assert display['Value'] is False
        assert display['Topic']['Value'] == f'ultrasonic/sonar{index}/range'
        assert display['Topic']['Reliability Policy'] == 'Best Effort'
        assert display['Buffer Length'] == 1


def test_navigation_rviz_starts_with_only_grid_and_saved_map():
    """Keep the viewer light while AMCL waits for an operator's initial pose."""
    config = yaml.safe_load(_read('robot_navigation/rviz/navigation.rviz'))
    manager = config['Visualization Manager']
    displays = {display['Name']: display for display in manager['Displays']
                if display['Class'] != 'rviz_common/Group'}
    enabled = {'Grid', 'Map (saved)'}
    disabled = {
        'Global Costmap', 'Local Costmap', 'LiDAR /scan', 'Astra depth',
        'RobotModel', 'TF', 'Global Path', 'RPP Transformed Path',
        'Local Footprint', 'AMCL Particles',
    }
    assert set(displays) == enabled | disabled
    for name, display in displays.items():
        assert display['Enabled'] is (name in enabled), name
        assert display['Value'] is (name in enabled), name

    assert manager['Global Options']['Fixed Frame'] == 'map'
    initial_pose = next(tool for tool in manager['Tools']
                        if tool['Class'] == 'rviz_default_plugins/SetInitialPose')
    assert initial_pose['Topic']['Value'] == 'initialpose'
    assert any(panel['Class'] == 'nav2_rviz_plugins/Navigation 2'
               for panel in config['Panels'])


def test_navigation_rviz_matches_humble_amcl_and_rpp_interfaces():
    config = yaml.safe_load(_read('robot_navigation/rviz/navigation.rviz'))
    manager = config['Visualization Manager']
    by_name = {display['Name']: display for display in manager['Displays']}
    assert manager['Global Options']['Fixed Frame'] == 'map'
    assert by_name['AMCL Particles']['Class'] == 'nav2_rviz_plugins/ParticleCloud'
    assert (by_name['RPP Transformed Path']['Topic']['Value']
            == 'received_global_plan')
    assert (by_name['Local Footprint']['Topic']['Value']
            == 'local_costmap/published_footprint')
    assert any(tool['Class'] == 'nav2_rviz_plugins/GoalTool'
               for tool in manager['Tools'])


def test_navigation_rviz_topics_are_relative_for_robot_namespace():
    """One layout for every robot: rviz2 --ros-args -r __ns:=/robot_01 maps
    'map' to /robot_01/map. An absolute '/map' would ignore the namespace and
    2D Pose Estimate would miss AMCL's <robot_ns>/initialpose."""
    text = _read('robot_navigation/rviz/navigation.rviz')
    absolute = re.findall(r'^\s*Value: (/\S+)$', text, flags=re.MULTILINE)
    assert absolute == []


def test_navigation_rviz_is_in_package_install_data():
    import ast
    import os

    tree = ast.parse(_read('robot_navigation/setup.py'))
    setup_call = next(node for node in ast.walk(tree)
                      if isinstance(node, ast.Call)
                      and isinstance(node.func, ast.Name)
                      and node.func.id == 'setup')
    data_files = next(arg.value for arg in setup_call.keywords
                      if arg.arg == 'data_files')
    package = SRC / 'robot_navigation'
    entries = eval(compile(ast.Expression(data_files), '<data_files>', 'eval'), {
        '__builtins__': {}, 'os': os, 'package_name': 'robot_navigation',
        'glob': lambda pattern: [str(path.relative_to(package))
                                 for path in package.glob(pattern)],
    })
    destination = os.path.join('share', 'robot_navigation', 'rviz')
    installed = dict(entries)[destination]
    assert os.path.join('rviz', 'navigation.rviz') in installed


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


def test_camera_disabled_launch_cannot_stall_the_costmap():
    """enable_camera:=false leaves camera/depth/points with no publisher.

    expected_update_rate 0.0 tells ObstacleLayer never to mark itself stale,
    so the local costmap keeps updating from LiDAR and the lifecycle
    transition still succeeds.
    """
    depth = _local_costmap()['depth_obstacle_layer']['pointcloud']
    assert depth['expected_update_rate'] == 0.0
    launch = _read('robot_navigation/launch/navigation.launch.py')
    assert "'enable_camera', default_value='false'" in launch
    assert 'condition=IfCondition(enable_camera)' in launch
    assert "package='robot_perception'" not in launch


# ------------------------------------------------------ footprint/inflation


def test_local_inflation_radius_covers_the_inscribed_radius():
    costmap = _local_costmap()
    assert (costmap['inflation_layer']['inflation_radius'] >=
            _inscribed_radius(costmap))


def test_global_inflation_radius_covers_the_inscribed_radius():
    costmap = _global_costmap()
    assert (costmap['inflation_layer']['inflation_radius'] >=
            _inscribed_radius(costmap))


def test_inflation_settings_stay_at_the_existing_baseline():
    """Changing shape does not authorize tuning the cost field."""
    for costmap in (_local_costmap(), _global_costmap()):
        assert costmap['inflation_layer']['inflation_radius'] == 0.60
        assert costmap['inflation_layer']['cost_scaling_factor'] == 3.0


def test_costmaps_use_polygon_without_radius_or_extra_padding():
    for costmap in (_local_costmap(), _global_costmap()):
        assert 'robot_radius' not in costmap
        _footprint(costmap)
        assert costmap['footprint_padding'] == 0.0


def test_costmaps_agree_on_footprint_and_padding():
    local, global_ = _local_costmap(), _global_costmap()
    assert _footprint(local) == _footprint(global_)
    assert local['footprint_padding'] == global_['footprint_padding']


def test_chassis_collision_projection_uses_base_footprint_axes():
    """The CAD XY box is valid in base_footprint only while this transform holds."""
    root = ET.fromstring(_read('robot_description/urdf/robot.urdf.xacro'))
    joint = root.find("joint[@name='base_joint']")
    assert joint.find('parent').attrib['link'] == 'base_footprint'
    assert joint.find('child').attrib['link'] == 'base_link'
    assert joint.find('origin').attrib['xyz'] == '0 0 ${base_z}'
    assert joint.find('origin').attrib['rpy'] == '0 0 0'
    collision = root.find("link[@name='base_link']/collision")
    assert collision.find('origin').attrib['xyz'] == (
        '${base_collision_x} ${base_collision_y} ${base_collision_z}')
    assert collision.find('origin').attrib['rpy'] == '0 0 0'
    assert collision.find('geometry/box').attrib['size'] == (
        '${base_length} ${base_width} ${base_height}')


def test_footprints_are_convex_counter_clockwise_and_contain_frame_origin():
    for costmap in (_local_costmap(), _global_costmap()):
        points = _footprint(costmap)
        for index, (start, end) in enumerate(_footprint_edges(points)):
            assert _cross(start, end, points[(index + 2) % 4]) > 0.0
            assert _cross(start, end, (0.0, 0.0)) > 0.0


def test_footprints_match_and_fully_cover_the_current_cad_chassis_box():
    """Include the CAD centre offset; no millimetre tolerance hiding undersizing."""
    corners = _cad_chassis_corners()
    for costmap in (_local_costmap(), _global_costmap()):
        points = _footprint(costmap)
        # Match the four corners without prescribing which corner comes first.
        for corner in corners:
            assert any(all(math.isclose(a, b, rel_tol=0.0, abs_tol=1e-12)
                           for a, b in zip(corner, point)) for point in points)
            # Check containment, not just the polygon's axis-aligned bounds.
            for start, end in _footprint_edges(points):
                assert _cross(start, end, corner) >= -1e-12


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
