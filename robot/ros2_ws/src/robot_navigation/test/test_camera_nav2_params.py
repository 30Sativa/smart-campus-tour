"""Camera mode hands Nav2 a copy of the params with exactly these changes (RPP horizon, depth clears
from 0.65 m, depth in the global costmap, BT clears that keep the robot's surroundings); LiDAR-only
passes the params file and the trees untouched.

Runs in a fresh interpreter (other packages' tests stub ROS imports), like
test_camera_launch_scope.py. robot/docs/depth-camera.md and ADR-0068 explain the changes.
"""

from pathlib import Path
import os
import subprocess
import sys
import xml.etree.ElementTree as ET

import pytest


SRC = Path(__file__).resolve().parents[2]
KEY = ('controller_server', 'ros__parameters', 'FollowPath', 'max_allowed_time_to_collision_up_to_carrot')
BT_KEYS = [('bt_navigator', 'ros__parameters', k) for k in ('default_nav_to_pose_bt_xml', 'default_nav_through_poses_bt_xml')]
GLOBAL = ('global_costmap', 'global_costmap', 'ros__parameters')
LOCAL_DEPTH = ('local_costmap', 'local_costmap', 'ros__parameters', 'depth_obstacle_layer')
ENTIRE = {f'{c}_costmap/clear_entirely_{c}_costmap': f'{c}_costmap/clear_except_{c}_costmap' for c in ('local', 'global')}


def _flatten(d, prefix=()):
    out = {}
    for k, v in d.items():
        out.update(_flatten(v, prefix + (k,)) if isinstance(v, dict) else {prefix + (k,): v})
    return out


def _nodes(tree):
    return [(e.tag, dict(e.attrib)) for e in ET.fromstring(tree).iter()]


def check_camera_tree(original, generated, keep):
    """Same tree node for node, except each 'clear entirely' became 'clear except' the square."""
    before, after = _nodes(original), _nodes(generated)
    assert len(before) == len(after)
    swapped = 0
    for (tag, attrs), (tag2, attrs2) in zip(before, after):
        if tag == 'ClearEntireCostmap':
            swapped += 1
            assert tag2 == 'ClearCostmapExceptRegion', tag2
            assert attrs2 == {**attrs, 'service_name': ENTIRE[attrs['service_name']], 'reset_distance': str(keep)}, attrs2
        else:
            assert (tag2, attrs2) == (tag, attrs)
    # the planner retry, the FollowPath retry and the recovery subtree clear local and global
    assert swapped >= 4, swapped
    assert 'clear_entirely' not in generated
    return swapped


def run_probe(params_name, tmp):
    try:
        import importlib.util
        import yaml
        from launch import LaunchContext
        from launch.actions import LogInfo
    except ImportError:
        return 77
    os.environ['ROS_LOG_DIR'] = tmp
    spec = importlib.util.spec_from_file_location('nav_launch', SRC / 'robot_navigation/launch/navigation.launch.py')
    nav = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nav)
    from launch.substitutions import LaunchConfiguration
    source = str(SRC / 'robot_control/config' / params_name) if params_name != 'missing' else tmp + '/missing.yaml'
    if params_name == 'missing':
        Path(source).write_text('controller_server:\n  ros__parameters:\n    controller_frequency: 10.0\n')
    raw = yaml.safe_load(open(source))
    original = _flatten(raw)
    for camera in ('false', 'true'):
        ctx = LaunchContext()
        ctx.launch_configurations.update(enable_camera=camera, nav2_params_file=source)
        params, logs = nav._nav2_params_for_mode(ctx, LaunchConfiguration('nav2_params_file'), LaunchConfiguration('enable_camera'))
        used = params.perform(ctx)
        if camera == 'false' or params_name == 'missing':
            assert used == source, used
            assert (len(logs) == 1 and isinstance(logs[0], LogInfo)) == (camera == 'true')
            continue
        assert len(logs) == 1 and isinstance(logs[0], LogInfo), logs
        assert used.startswith(tmp) and used.endswith('_camera.yaml'), used
        rewritten = _flatten(yaml.safe_load(open(used)))
        assert set(original) <= set(rewritten)
        changed = {k: (original[k], rewritten[k]) for k in original if original[k] != rewritten[k]}
        assert set(changed) == {KEY, *BT_KEYS, GLOBAL + ('plugins',), LOCAL_DEPTH + ('pointcloud', 'raytrace_min_range')}, changed
        assert changed[KEY] == (1.0, 4.0)
        # 1b. the depth layer starts clearing one cell past where it stops marking
        assert changed[LOCAL_DEPTH + ('pointcloud', 'raytrace_min_range')] == (0.6, nav.CAMERA_DEPTH_RAYTRACE_MIN_RANGE) == (0.6, 0.65)
        assert nav.CAMERA_DEPTH_RAYTRACE_MIN_RANGE >= original[LOCAL_DEPTH + ('pointcloud', 'obstacle_min_range')] + 0.05
        # 2. the global costmap gets the local depth layer, before inflation, marking to 2.0 m
        plugins = rewritten[GLOBAL + ('plugins',)]
        assert [p for p in plugins if p != 'depth_obstacle_layer'] == original[GLOBAL + ('plugins',)]
        assert plugins.index('depth_obstacle_layer') == plugins.index('inflation_layer') - 1
        local = {k[len(LOCAL_DEPTH):]: v for k, v in rewritten.items() if k[:len(LOCAL_DEPTH)] == LOCAL_DEPTH}
        added = {k[len(GLOBAL) + 1:]: rewritten[k] for k in set(rewritten) - set(original)}
        assert added == {k: (nav.CAMERA_GLOBAL_DEPTH_MAX_RANGE if k[-1] == 'obstacle_max_range' else v)
                         for k, v in local.items()}, added
        assert added[('pointcloud', 'obstacle_max_range')] == 2.0 < local[('pointcloud', 'obstacle_max_range')]
        assert added[('pointcloud', 'raytrace_min_range')] == 0.65
        # 3. both trees: every clear keeps the square around the robot
        for key in BT_KEYS:
            configured, generated = changed[key]
            assert configured.startswith('$(find-pkg-share robot_navigation)/behavior_trees/'), configured
            assert generated.startswith(os.path.dirname(used)) and generated.endswith('_camera.xml'), generated
            base = configured.replace('$(find-pkg-share robot_navigation)', str(SRC / 'robot_navigation'))
            check_camera_tree(open(base).read(), open(generated).read(), nav.CAMERA_CLEAR_KEEP_M)
        # the substitution nav2_bringup resolves later must survive, also in the copied layer
        assert '$(var robot_ns)' in rewritten[GLOBAL + ('depth_obstacle_layer', 'pointcloud', 'topic')]
        # the configured file itself is never written to
        assert yaml.safe_load(open(source)) == raw
    return 0


@pytest.mark.parametrize('params_name', ['nav2_params_v2.yaml', 'nav2_params_v3.yaml', 'nav2_params.yaml', 'missing'])
def test_camera_mode_changes_exactly_horizon_global_depth_and_clears(params_name, tmp_path):
    result = subprocess.run([sys.executable, str(Path(__file__).resolve()), params_name, str(tmp_path)],
                            capture_output=True, text=True, timeout=60)
    if result.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize('tree', sorted(p.name for p in (SRC / 'robot_navigation/behavior_trees').glob('*.xml')))
def test_every_shipped_tree_has_its_clears_swapped(tree):
    """A new or edited tree keeps working in camera mode: the substitution still finds its clears.

    Runs the launch file's own camera_tree() on the shipped file, so a renamed node or a new
    attribute order shows up here instead of as a silently unchanged tree on the robot."""
    result = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--tree', tree],
                            capture_output=True, text=True, timeout=60)
    if result.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert result.returncode == 0, result.stdout + result.stderr


def run_tree(name):
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('nav_launch', SRC / 'robot_navigation/launch/navigation.launch.py')
        nav = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(nav)
    except ImportError:
        return 77
    original = (SRC / 'robot_navigation/behavior_trees' / name).read_text()
    generated, n = nav.camera_tree(original)
    assert n == check_camera_tree(original, generated, nav.CAMERA_CLEAR_KEEP_M)
    return 0


if __name__ == '__main__':
    if sys.argv[1] == '--tree':
        sys.exit(run_tree(sys.argv[2]))
    sys.exit(run_probe(sys.argv[1], sys.argv[2]))
