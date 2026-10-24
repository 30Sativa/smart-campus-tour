"""Freeze test for Nav2 Baseline V1 (robot/docs/nav2-baseline-v1.md).

Baseline V1 is the configuration validated on the real robot in runs B2 and B2c
(2026-10-16): LiDAR yaw calibration + nav2_params_smooth.yaml
(LatchedGoalChecker, desired_linear_vel 0.20). It is an opt-in development
baseline, not the production default.

Any change to these files changes the baseline. If the change is intended,
publish it as a new baseline version (new doc section + new hash here) instead
of silently editing V1.
"""

import hashlib
import json
from pathlib import Path

import yaml


SRC = Path(__file__).resolve().parents[2]
BASELINE_PARAMS = 'robot_control/config/nav2_params_smooth.yaml'
# sha256 of json.dumps(yaml.safe_load(file), sort_keys=True): comments and
# formatting may change, values may not.
BASELINE_PARAMS_SHA256 = '3a1f5b48e735273a913a96feb228b5d3797ff7908f2ba5c34010b737ebfa3d5b'
BASELINE_LIDAR_YAW = '-0.2225'


def _load(relative_path):
    return yaml.safe_load((SRC / relative_path).read_text(encoding='utf-8'))


def test_baseline_v1_params_are_frozen():
    canonical = json.dumps(_load(BASELINE_PARAMS), sort_keys=True).encode()
    assert hashlib.sha256(canonical).hexdigest() == BASELINE_PARAMS_SHA256, (
        'nav2_params_smooth.yaml changed: this is no longer Nav2 Baseline V1. '
        'Publish a new baseline version (see robot/docs/nav2-baseline-v1.md).')


def test_baseline_v1_key_values():
    controller = _load(BASELINE_PARAMS)['controller_server']['ros__parameters']
    checker = controller['goal_checker']
    assert checker['plugin'] == 'robot_nav_plugins::LatchedGoalChecker'
    assert (checker['xy_goal_tolerance'], checker['yaw_goal_tolerance']) == (0.15, 0.30)
    assert (checker['latched_xy_tolerance'], checker['relatch_distance'],
            checker['relatch_max_gap']) == (0.35, 0.10, 1.0)
    assert controller['FollowPath']['desired_linear_vel'] == 0.20


def test_baseline_v1_lidar_calibration_is_the_real_robot_default():
    for launch in ('robot_control/launch/manual_mode.launch.py',
                   'robot_navigation/launch/navigation.launch.py'):
        source = (SRC / launch).read_text(encoding='utf-8')
        assert f"'lidar_yaw', default_value='{BASELINE_LIDAR_YAW}'" in source, launch


def test_baseline_v1_is_not_the_production_default():
    navigation = (SRC / 'robot_navigation/launch/navigation.launch.py').read_text(
        encoding='utf-8')
    assert 'nav2_params_smooth' not in navigation
    assert "'nav2_params.yaml'" in navigation
