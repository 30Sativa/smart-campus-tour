"""Freeze test for Nav2 Baseline V2 (robot/docs/nav2-baseline-v2.md).

V2 = V1 (nav2_params_smooth.yaml, still frozen by test_nav2_baseline_v1_contract.py)
+ exactly two changes: RPP lookahead_dist 0.60 -> 0.80 and velocity_smoother
angular max_decel -2.50 -> -1.20. Development baseline (2026-10-22), opt-in,
not the production default, not yet fully hardware validated.

Any value change makes it a new baseline version (V3, ...): add a new file, doc
and hash instead of editing V2. Comments/formatting may change.
"""

import hashlib
import json
from pathlib import Path

import yaml


SRC = Path(__file__).resolve().parents[2]
V1_PARAMS = 'robot_control/config/nav2_params_smooth.yaml'
V2_PARAMS = 'robot_control/config/nav2_params_v2.yaml'
# sha256 of json.dumps(yaml.safe_load(file), sort_keys=True)
V2_PARAMS_SHA256 = '57a60cae616f312f749029f52faf585ca6d850f679f75462eea4f2a5d56d85c3'
V2_DIFF = {
    ('controller_server', 'FollowPath', 'lookahead_dist'): (0.60, 0.80),
    ('velocity_smoother', 'max_decel'): ([-0.50, 0.0, -2.50], [-0.50, 0.0, -1.20]),
}


def _load(relative_path):
    return yaml.safe_load((SRC / relative_path).read_text(encoding='utf-8'))


def _flat(d, prefix=()):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(_flat(v, prefix + (k,)))
        else:
            out[prefix + (k,)] = v
    return out


def _strip_ros_params(key):
    return tuple(part for part in key if part != 'ros__parameters')


def test_baseline_v2_params_are_frozen():
    canonical = json.dumps(_load(V2_PARAMS), sort_keys=True).encode()
    assert hashlib.sha256(canonical).hexdigest() == V2_PARAMS_SHA256, (
        'nav2_params_v2.yaml changed: this is no longer Nav2 Baseline V2. '
        'Publish a new baseline version (see robot/docs/nav2-baseline-v2.md).')


def test_baseline_v2_differs_from_v1_only_in_the_two_documented_keys():
    v1 = {_strip_ros_params(k): v for k, v in _flat(_load(V1_PARAMS)).items()}
    v2 = {_strip_ros_params(k): v for k, v in _flat(_load(V2_PARAMS)).items()}
    changed = {k for k in set(v1) | set(v2) if v1.get(k) != v2.get(k)}
    assert changed == set(V2_DIFF), changed
    for key, (old, new) in V2_DIFF.items():
        assert (v1[key], v2[key]) == (old, new), key


def test_baseline_v2_keeps_the_safety_relevant_v1_settings():
    v2 = _load(V2_PARAMS)
    follow = v2['controller_server']['ros__parameters']['FollowPath']
    assert follow['use_collision_detection'] is True
    assert follow['desired_linear_vel'] == 0.20
    smoother = v2['velocity_smoother']['ros__parameters']
    assert smoother['max_decel'][0] == -0.50          # linear braking unchanged
    assert smoother['max_velocity'] == [0.24, 0.0, 0.45]
    checker = v2['controller_server']['ros__parameters']['goal_checker']
    assert checker['plugin'] == 'robot_nav_plugins::LatchedGoalChecker'


def test_baseline_v2_is_not_the_production_default():
    navigation = (SRC / 'robot_navigation/launch/navigation.launch.py').read_text(
        encoding='utf-8')
    assert 'nav2_params_v2' not in navigation
    assert "'nav2_params.yaml'" in navigation
