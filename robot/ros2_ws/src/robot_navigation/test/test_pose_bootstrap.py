"""pose_bootstrap: scan-to-map search (synthetic maps, ray-cast scans), per-map config, saved
pose, and launch wiring. No ROS processes are started."""
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from unittest import mock

import numpy as np
import pytest
import yaml

from robot_navigation.pose_bootstrap_config import (ConfigError, default_config_path, load_config, map_key,
                                                    read_saved_pose, saved_pose_path, write_saved_pose)
from robot_navigation.pose_bootstrap_core import (LikelihoodField, Pose2D, SearchConfig, beams_in_base,
                                                  decide, locate)

SRC = Path(__file__).resolve().parents[2]
REPO_MAPS = SRC.parents[1] / 'robot_maps'
RES = 0.05


def room(w=12.0, h=10.0):
    """Walls round the border plus asymmetric furniture: one unique place for every pose."""
    g = np.zeros((int(h / RES), int(w / RES)), dtype=np.int16)
    g[0, :] = g[-1, :] = g[:, 0] = g[:, -1] = 100
    g[40:60, 60:64] = 100            # pillar
    g[120:124, 100:180] = 100        # long wall
    g[150:190, 30:34] = 100          # short wall
    g[20:30, 180:220] = 100          # box
    return g


def corridor(length=30.0, width=2.0):
    """Featureless straight corridor: every pose along it looks the same."""
    g = np.zeros((int(width / RES) + 2, int(length / RES)), dtype=np.int16)
    g[0, :] = g[-1, :] = 100
    return g


def raycast(grid, pose, n=360, max_range=12.0, noise=0.0, seed=0):
    """LaserScan-like ranges from pose in a grid with origin (0, 0); laser at base origin."""
    rng = np.random.default_rng(seed)
    angles = -math.pi + np.arange(n) * (2 * math.pi / n)
    out = np.full(n, np.inf)
    steps = np.arange(0.05, max_range, 0.02)
    for k, a in enumerate(angles):
        th = pose.yaw + a
        xs = pose.x + steps * math.cos(th); ys = pose.y + steps * math.sin(th)
        i = (xs / RES).astype(int); j = (ys / RES).astype(int)
        ok = (i >= 0) & (i < grid.shape[1]) & (j >= 0) & (j < grid.shape[0])
        hit = np.nonzero(ok & (grid[np.clip(j, 0, grid.shape[0] - 1), np.clip(i, 0, grid.shape[1] - 1)] >= 65))[0]
        if len(hit):
            out[k] = steps[hit[0]] + (rng.normal(0, noise) if noise else 0.0)
    return out, -math.pi, 2 * math.pi / n


def scan_points(grid, pose, **kw):
    r, amin, inc = raycast(grid, pose, **kw)
    return beams_in_base(r, amin, inc, 0.05, 25.0, (0.0, 0.0, 0.0))


CFG = SearchConfig(global_xy_step=0.3, regions=())


@pytest.fixture(scope='module')
def room_field():
    g = room()
    return g, LikelihoodField(g, RES, 0.0, 0.0, CFG)


def close(p, q, xy=0.1, yaw_deg=3):
    return p.dist(q) <= xy and math.degrees(p.dyaw(q)) <= yaw_deg


# ---------------------------------------------------------------- core
def test_known_pose_is_verified_and_refined(room_field):
    g, f = room_field
    truth = Pose2D(4.0, 3.0, math.radians(30))
    scans = [scan_points(g, truth, noise=0.01, seed=s) for s in range(3)]
    hint = Pose2D(4.3, 2.8, math.radians(40))            # saved pose a little off
    res = locate(f, scans, [('saved', hint)], CFG, use_global=False)
    assert res.status == 'VERIFIED', res
    assert close(res.pose, truth), res.pose
    assert res.score > 0.8 and res.source == 'saved'


def test_a_wrong_candidate_is_rejected_not_snapped(room_field):
    g, f = room_field
    truth = Pose2D(4.0, 3.0, 0.3)
    res = locate(f, [scan_points(g, truth)], [('START', Pose2D(9.0, 7.5, 0.3))], CFG, use_global=False)
    assert res.status != 'VERIFIED', res
    assert 'global search disabled' in res.detail


def test_robot_pushed_while_off_is_found_by_the_global_search(room_field):
    g, f = room_field
    truth = Pose2D(8.5, 4.0, math.radians(-120))
    res = locate(f, [scan_points(g, truth)], [('saved', Pose2D(4.0, 3.0, 0.0))], CFG, use_global=True)
    assert res.status == 'VERIFIED', res
    assert res.source == 'global' and close(res.pose, truth, xy=0.1, yaw_deg=3), res


def test_global_search_stays_inside_the_regions(room_field):
    g, f = room_field
    truth = Pose2D(8.5, 4.0, math.radians(-120))
    elsewhere = SearchConfig(global_xy_step=0.3, regions=((0.5, 0.5, 4.0, 4.0),))
    res = locate(f, [scan_points(g, truth)], [], elsewhere, use_global=True)
    assert res.status != 'VERIFIED' or not close(res.pose, truth, xy=1.0, yaw_deg=30)
    inside = SearchConfig(global_xy_step=0.3, regions=((7.0, 3.0, 10.0, 5.0),))
    assert locate(f, [scan_points(g, truth)], [], inside, use_global=True).status == 'VERIFIED'


def test_a_featureless_corridor_is_ambiguous_never_verified():
    g = corridor()
    f = LikelihoodField(g, RES, 0.0, 0.0, CFG)
    truth = Pose2D(15.0, 1.0, 0.0)
    res = locate(f, [scan_points(g, truth, max_range=6.0)], [('saved', Pose2D(15.0, 1.0, 0.0))], CFG, use_global=True)
    assert res.status == 'AMBIGUOUS', res      # the same scan fits 1 m further along


def test_unknown_space_and_short_scans_do_not_verify(room_field):
    _, f = room_field
    empty = [(np.array([]), np.array([]))]
    assert locate(f, [], [('x', Pose2D(1, 1, 0))], CFG, use_global=False).status == 'NO_MATCH'
    with np.errstate(invalid='ignore'):
        res = locate(f, empty, [('x', Pose2D(1, 1, 0))], CFG, use_global=False)
    assert res.status == 'NO_MATCH'


def test_decide_needs_score_and_margin():
    a, b = Pose2D(0, 0, 0), Pose2D(5, 0, 0)
    assert decide([(a, 0.9, 'h'), (b, 0.5, 'g')], CFG, []).status == 'VERIFIED'
    assert decide([(a, 0.9, 'h'), (b, 0.86, 'g')], CFG, []).status == 'AMBIGUOUS'
    assert decide([(a, 0.4, 'h')], CFG, []).status == 'NO_MATCH'
    near = Pose2D(0.2, 0, 0)                 # the same place refined twice is not a rival
    assert decide([(a, 0.9, 'h'), (near, 0.89, 'g')], CFG, []).status == 'VERIFIED'


def test_beams_in_base_applies_the_laser_mount():
    x, y = beams_in_base([1.0, np.inf, 0.01, 2.0], 0.0, math.pi / 2, 0.05, 25.0, (0.1, 0.0, math.pi))
    assert len(x) == 2                                        # inf and below range_min dropped
    assert x[0] == pytest.approx(0.1 - 1.0) and y[0] == pytest.approx(0.0, abs=1e-9)   # mounted backwards


# ---------------------------------------------------------------- config and saved pose
def write_map(tmp_path, name='m.yaml'):
    (tmp_path / 'm.pgm').write_bytes(b'P5\n2 2\n255\n\x00\x00\x00\x00')
    (tmp_path / name).write_text('image: m.pgm\nresolution: 0.05\norigin: [0, 0, 0]\n')
    return str(tmp_path / name)


def test_config_reads_homes_from_poi_files_and_inline(tmp_path):
    m = write_map(tmp_path)
    (tmp_path / 'poi_a.yaml').write_text(yaml.safe_dump({'id': 'START', 'map_yaml': 'm.yaml', 'frame_id': 'map',
                                                         'pose': {'x': 1.0, 'y': 2.0, 'yaw': 0.5}}))
    cfgp = tmp_path / 'm.pose_bootstrap.yaml'
    cfgp.write_text(yaml.safe_dump({'map_yaml': 'm.yaml', 'homes': [{'poi_file': 'poi_a.yaml'},
                                                                     {'name': 'DOCK', 'pose': {'x': 3, 'y': 4, 'yaw': 0}}],
                                    'global_search': {'enabled': True, 'regions': [[0, 0, 5, 5]]},
                                    'search': {'min_score': 0.6, 'local_yaw': 20}}))
    assert default_config_path(m) == str(cfgp)
    homes, saved, glob, cfg = load_config(str(cfgp), m)
    assert [n for n, _ in homes] == ['START', 'DOCK'] and homes[0][1] == Pose2D(1.0, 2.0, 0.5)
    assert saved and glob and cfg.regions == ((0, 0, 5, 5),)
    assert cfg.min_score == 0.6 and cfg.local_yaw == pytest.approx(math.radians(20))


@pytest.mark.parametrize('body, match', [
    ({'map_yaml': 'other.yaml'}, 'is for map'),
    ({'map_yaml': 'm.yaml', 'typo': 1}, 'unknown keys'),
    ({'map_yaml': 'm.yaml', 'global_search': {'enabled': True}}, 'needs regions'),
    ({'map_yaml': 'm.yaml', 'search': {'min_scor': 1}}, 'unknown search keys'),
    ({'map_yaml': 'm.yaml', 'homes': [{'poi_file': 'missing.yaml'}]}, 'homes\\[0\\]'),
    ({'map_yaml': 'm.yaml', 'saved_pose': False}, 'nothing to search'),
])
def test_config_errors_are_explicit(tmp_path, body, match):
    m = write_map(tmp_path)
    p = tmp_path / 'c.yaml'; p.write_text(yaml.safe_dump(body))
    with pytest.raises(ConfigError, match=match):
        load_config(str(p), m)


def test_a_poi_of_another_map_is_refused(tmp_path):
    m = write_map(tmp_path)
    (tmp_path / 'p.yaml').write_text(yaml.safe_dump({'map_yaml': 'map1.yaml', 'pose': {'x': 0, 'y': 0, 'yaw': 0}}))
    p = tmp_path / 'c.yaml'; p.write_text(yaml.safe_dump({'map_yaml': 'm.yaml', 'homes': [{'poi_file': 'p.yaml'}]}))
    with pytest.raises(ConfigError, match='belongs to map'):
        load_config(str(p), m)


def test_saved_pose_round_trip_and_never_crosses_maps(tmp_path):
    m = write_map(tmp_path)
    key = map_key(m)
    state = tmp_path / 'state'
    assert read_saved_pose(str(state), key) is None
    write_saved_pose(str(state), key, Pose2D(1.5, -2.0, 0.3), 123.0, m)
    pose, at = read_saved_pose(str(state), key)
    assert pose == Pose2D(1.5, -2.0, 0.3) and at == 123.0
    assert not [f for f in os.listdir(state) if f.startswith('.last_pose_')]     # no temp file left
    (tmp_path / 'm.pgm').write_bytes(b'P5\n2 2\n255\n\x00\x00\x00\x64')            # same YAML, new image
    assert map_key(m) != key and read_saved_pose(str(state), map_key(m)) is None
    Path(saved_pose_path(str(state), key)).write_text('{broken')
    assert read_saved_pose(str(state), key) is None


def test_repo_map2_config_loads():
    m = str(REPO_MAPS / 'map2.yaml')
    homes, saved, glob, cfg = load_config(default_config_path(m), m)
    assert [n for n, _ in homes] == ['START', 'POI_01'] and saved and glob and cfg.regions


# ---------------------------------------------------------------- launch wiring
def launch_probe(extra_json):
    try:
        from launch import LaunchContext, LaunchDescription
        from launch.launch_description_sources import PythonLaunchDescriptionSource
        from launch.utilities import visit_all_entities_and_collect_futures
        from launch_ros.actions import Node
        from launch_ros.substitutions import FindPackageShare
        from launch_ros.utilities import evaluate_parameters
    except ImportError:
        return 77
    original = PythonLaunchDescriptionSource._get_launch_description

    def load_source(source, location):
        return LaunchDescription() if location.startswith('/external/') else original(source, location)

    def find_share(_s, package):
        local = SRC / package
        return str(local) if local.is_dir() else '/external/' + package
    context = LaunchContext()
    context.launch_configurations.update(robot_id='robot_01', rviz='false', enable_camera='false',
                                         map=str(SRC / 'robot_navigation/maps/warehouse_12x12.yaml'))
    context.launch_configurations.update(json.loads(extra_json))
    found = {}

    def capture(node, node_context):
        if node.node_executable == 'pose_bootstrap':
            node._perform_substitutions(node_context)
            params = evaluate_parameters(node_context, node._Node__parameters)
            found['pose_bootstrap'] = {'files': [str(p) for p in params if not isinstance(p, dict)],
                                       'params': [p for p in params if isinstance(p, dict)]}
        return []
    with mock.patch.object(FindPackageShare, 'find', find_share), \
            mock.patch.object(PythonLaunchDescriptionSource, '_get_launch_description', load_source), \
            mock.patch.object(Node, 'execute', capture):
        src = PythonLaunchDescriptionSource(str(SRC / 'robot_navigation/launch/navigation.launch.py'))
        visit_all_entities_and_collect_futures(src.get_launch_description(context), context)
    print(json.dumps(found))
    return 0


def probe(**extra):
    r = subprocess.run([sys.executable, str(Path(__file__).resolve()), json.dumps(extra)],
                       capture_output=True, text=True, timeout=60)
    if r.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_pose_bootstrap_is_off_by_default():
    assert 'pose_bootstrap' not in probe()


def test_auto_initial_pose_launches_it_with_the_map():
    r = probe(auto_initial_pose='true')['pose_bootstrap']
    assert any(f.endswith('robot_navigation/config/pose_bootstrap.yaml') for f in r['files']), r
    merged = {k: v for d in r['params'] for k, v in d.items()}
    assert merged['map_yaml'].endswith('warehouse_12x12.yaml') and merged['config_file'] == ''


def test_node_parameter_file_parses():
    params = yaml.safe_load((SRC / 'robot_navigation/config/pose_bootstrap.yaml').read_text())
    p = params['/**/pose_bootstrap']['ros__parameters']
    assert p['accept_cov_xy'] == 0.09 and p['accept_cov_yaw'] == 0.05    # fleet_bridge "localized" limits


if __name__ == '__main__':
    sys.exit(launch_probe(sys.argv[1]))


def lookalike_room():
    """Two identical pillars 3 m apart; the walls around them differ (a door gap on one side)."""
    g = np.zeros((int(10 / RES), int(14 / RES)), dtype=np.int16)
    g[0, :] = g[-1, :] = g[:, 0] = g[:, -1] = 100
    g[0, 40:70] = 0                                   # door gap near the left pillar only
    for x in (4.0, 7.0):
        i = int(x / RES); g[90:110, i:i + 6] = 100
    g[150:154, 200:260] = 100                         # one far feature
    return g


def test_a_saved_pose_next_to_a_look_alike_does_not_win_over_the_true_pose():
    """Robot pushed 3 m while off: around the saved pose the scan fits a look-alike pillar; the true
    pose must still be found and win (virtual sweep on map2 found this, 13/11/2026)."""
    g = lookalike_room()
    cfg = SearchConfig(global_xy_step=0.3, regions=((0.5, 0.5, 13.5, 9.5),))
    f = LikelihoodField(g, RES, 0.0, 0.0, cfg)
    truth = Pose2D(4.6, 5.0, 0.4)
    saved = Pose2D(7.6, 5.0, 0.4)                    # beside the other pillar
    res = locate(f, [scan_points(g, truth, noise=0.01)], [('saved', saved)], cfg, use_global=True)
    assert not (res.status == 'VERIFIED' and not close(res.pose, truth, xy=0.3, yaw_deg=5)), res
    assert res.status == 'VERIFIED' and close(res.pose, truth, xy=0.15, yaw_deg=3), res
