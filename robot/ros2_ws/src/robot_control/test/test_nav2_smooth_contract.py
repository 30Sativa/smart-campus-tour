"""Contract tests for the opt-in motion-smoothness params (nav2_params_smooth.yaml).

The file must stay equal to nav2_params_wide_global_inflation.yaml except for
the two documented changes, so every safety setting is inherited unchanged.
"""

import copy
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml


SRC = Path(__file__).resolve().parents[2]
SMOOTH = 'robot_control/config/nav2_params_smooth.yaml'
WIDE = 'robot_control/config/nav2_params_wide_global_inflation.yaml'
GOAL_CHECKER = 'robot_nav_plugins::LatchedGoalChecker'
WHEEL_BASE = 0.4714            # stm32_bridge default, see the baseline contract
WHEEL_CAP = 0.250              # m/s, bridge max_wheel_speed_mm_s


def _load(relative_path):
    return yaml.safe_load((SRC / relative_path).read_text(encoding='utf-8'))


def _controller(params):
    return params['controller_server']['ros__parameters']


def test_smooth_changes_only_the_goal_checker_and_cruise_speed():
    smooth, wide = _load(SMOOTH), _load(WIDE)
    expected = copy.deepcopy(wide)
    controller = _controller(expected)
    controller['goal_checker'] = copy.deepcopy(_controller(smooth)['goal_checker'])
    controller['FollowPath']['desired_linear_vel'] = (
        _controller(smooth)['FollowPath']['desired_linear_vel'])
    assert smooth == expected


def test_goal_acceptance_is_not_relaxed():
    smooth = _controller(_load(SMOOTH))['goal_checker']
    wide = _controller(_load(WIDE))['goal_checker']
    assert smooth['plugin'] == GOAL_CHECKER
    for key in ('xy_goal_tolerance', 'yaw_goal_tolerance', 'stateful'):
        assert smooth[key] == wide[key], key
    assert smooth['stateful'] is True


def test_latch_parameters_are_bounded():
    checker = _controller(_load(SMOOTH))['goal_checker']
    xy = checker['xy_goal_tolerance']
    # Wider than acceptance so AMCL corrections during the final turn do not
    # drop RPP out of rotate-to-heading, but well inside the corridor.
    assert xy < checker['latched_xy_tolerance'] <= 0.40
    # A path end that moved more than this is a different goal.
    assert 0.0 < checker['relatch_distance'] <= xy


def test_goal_checker_plugin_is_exported_and_a_dependency():
    plugins = ET.parse(SRC / 'robot_nav_plugins/plugins.xml').getroot()
    types = {c.attrib['type']: c.attrib['base_class_type']
             for c in plugins.iter('class')}
    assert types[GOAL_CHECKER] == 'nav2_core::GoalChecker'
    for package in ('robot_control', 'robot_navigation'):
        manifest = (SRC / package / 'package.xml').read_text(encoding='utf-8')
        assert '<exec_depend>robot_nav_plugins</exec_depend>' in manifest, package


def test_cruise_speed_leaves_turn_headroom_under_the_wheel_cap():
    params = _load(SMOOTH)
    rpp = _controller(params)['FollowPath']
    smoother = params['velocity_smoother']['ros__parameters']
    v = rpp['desired_linear_vel']
    assert v == 0.20
    # Regulation stays active and the smoother envelope is unchanged.
    assert rpp['regulated_linear_scaling_min_speed'] < v <= smoother['max_velocity'][0]
    assert smoother['max_velocity'] == _load(WIDE)['velocity_smoother'][
        'ros__parameters']['max_velocity']
    # Cruise plus a 0.2 rad/s turn stays under the bridge cap (no pair-scaling).
    assert v + 0.20 * WHEEL_BASE / 2.0 <= WHEEL_CAP


def test_smooth_params_are_opt_in():
    for launch in ('robot_navigation/launch/navigation.launch.py',
                   'robot_navigation/launch/sim_navigation.launch.py'):
        assert 'nav2_params_smooth' not in (SRC / launch).read_text(encoding='utf-8')
