"""Unit tests for robot_navigation.sonar_memory_core (pure Python, no ROS)."""

import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from robot_navigation.sonar_memory_core import (  # noqa: E402
    MemoryConfig, SonarMemory, compose, half_extents, mount_in_base, pad_footprint,
    parse_footprint, pose_at)

FOV, MIN = 0.52, 0.20
FL = (0.3885, 0.2683, math.radians(45))       # sonar1 with the robot at the odom origin
ROBOT = (0.0, 0.0, 0.0)
NAN = float('nan')


def ahead(d, pose=FL):
    """The sonar pose moved d metres along its own axis."""
    return (pose[0] + d * math.cos(pose[2]), pose[1] + d * math.sin(pose[2]), pose[2])


def obs(m, t, rng, pose=FL, sensor='s1'):
    return m.observe(sensor, t, rng, MIN, FOV, pose)


def approach_and_lose(m, sensor='s1', pose=FL):
    """An object 0.30 m out, seen twice while closing in, then lost in the blind zone."""
    obs(m, 0.0, 0.30, pose, sensor)
    obs(m, 0.35, 0.26, ahead(0.04, pose), sensor)
    return obs(m, 0.70, NAN, ahead(0.10, pose), sensor)


def test_nothing_is_held_while_echoes_are_live():
    m = SonarMemory()
    obs(m, 0.0, 0.30)
    obs(m, 0.35, 0.26)
    assert m.points(0.5, ROBOT) == []


def test_a_confirmed_near_echo_then_no_echo_is_held_in_odom():
    m = SonarMemory()
    event = approach_and_lose(m)
    assert 'holding' in event
    pts = m.points(1.0, ROBOT)
    assert len(pts) == 16                      # the 0.52 rad arc, 2 deg apart
    # The arc of the LAST near echo (0.26 m from where the sonar was then), not of the
    # first one: points stay where the object was, in odom.
    sx, sy, _ = ahead(0.04)
    assert all(abs(math.hypot(x - sx, y - sy) - 0.26) < 1e-9 for x, y in pts)
    assert m.held_sensors() == ['s1']
    # Repeated "no echo" frames change nothing; it stays held indefinitely.
    obs(m, 0.725, NAN)
    assert len(m.points(600.0, ROBOT)) == 16


def test_a_single_near_echo_is_not_held():
    m = SonarMemory()
    obs(m, 0.0, 0.30)
    obs(m, 0.35, NAN)
    assert m.points(0.5, ROBOT) == []


def test_two_near_echoes_that_disagree_are_not_held():
    m = SonarMemory()
    obs(m, 0.0, 0.25)
    obs(m, 0.35, 0.38)                         # 0.13 m apart: not the same object
    obs(m, 0.70, NAN)
    assert m.points(0.8, ROBOT) == []


def test_a_value_held_longer_than_one_firmware_cycle_counts_twice():
    m = SonarMemory()
    obs(m, 0.0, 0.30)
    obs(m, 0.30, 0.30)                         # republished frame: not new
    obs(m, 0.46, 0.30)                         # still the same after a full cycle
    obs(m, 0.80, NAN)
    assert len(m.points(0.9, ROBOT)) == 16


def test_a_stale_near_echo_does_not_arm_the_hold():
    m = SonarMemory()
    obs(m, 0.0, 0.30)
    obs(m, 0.35, 0.28)
    obs(m, 2.0, NAN)                           # lost 1.65 s later: not "just now"
    assert m.points(2.1, ROBOT) == []


def test_a_far_echo_ends_the_near_track():
    m = SonarMemory()
    obs(m, 0.0, 0.30)
    obs(m, 0.35, 0.28)
    obs(m, 0.70, 0.90)
    obs(m, 1.05, NAN)
    assert m.points(1.1, ROBOT) == []


def test_only_a_long_clear_echo_from_the_same_sonar_releases_it():
    m = SonarMemory()
    approach_and_lose(m)
    stopped = ahead(0.12)
    assert obs(m, 1.0, 0.45, stopped) is None       # 0.45 m: not proof the blind zone is free
    assert len(m.points(1.1, ROBOT)) == 16
    event = obs(m, 1.4, 1.90, stopped)              # a long clean echo
    assert 'released' in event
    assert m.points(1.5, ROBOT) == []


def test_blind_clear_range_zero_never_releases_on_the_sonar_itself():
    m = SonarMemory(MemoryConfig(blind_clear_range=0.0))
    approach_and_lose(m)
    obs(m, 1.4, 1.90, ahead(0.12))
    assert len(m.points(1.5, ROBOT)) == 16


def test_another_sonar_sees_through_held_points_outside_its_blind_zone():
    m = SonarMemory()
    approach_and_lose(m)
    px, py = m.points(1.0, ROBOT)[8]           # the middle of the held arc
    # Right next to the points: inside the other sonar's blind zone, it cannot tell.
    m.observe('s2', 1.1, 1.0, MIN, FOV, (px - 0.1, py, 0.0))
    assert len(m.points(1.2, ROBOT)) == 16
    # 0.6 m back and looking through them at 1.0 m: the beam (+-0.16 m there) covers
    # the whole 0.13 m arc, so the hold is gone.
    m.observe('s2', 1.5, 1.01, MIN, FOV, (px - 0.6, py, 0.0))
    assert m.points(1.6, ROBOT) == []
    assert m.held_sensors() == []


def test_held_points_far_from_the_robot_or_inside_the_body_are_dropped():
    m = SonarMemory()
    approach_and_lose(m)
    assert m.points(1.0, (5.0, 0.0, 0.0)) == []
    m2 = SonarMemory()
    approach_and_lose(m2)
    px, py = m2.points(1.0, ROBOT)[0]
    assert len(m2.points(1.1, (px, py, 0.0))) < 16   # robot centred on part of the arc


def test_max_age_is_off_by_default_and_works_when_set():
    m = SonarMemory(MemoryConfig(max_age=5.0))
    approach_and_lose(m)
    assert m.points(4.0, ROBOT)
    assert m.points(6.0, ROBOT) == []


def test_sonars_are_independent_and_no_pose_is_harmless():
    m = SonarMemory()
    approach_and_lose(m, 's1')
    obs(m, 0.8, NAN, sensor='s3')
    assert obs(m, 0.9, 0.30, pose=None, sensor='s3') is None   # no TF yet
    assert m.held_sensors() == ['s1']


def test_needs_pose_only_for_new_values():
    m = SonarMemory()
    assert m.needs_pose('s1', 0.40, MIN)
    obs(m, 0.0, 0.40)
    assert not m.needs_pose('s1', 0.40, MIN)
    assert m.needs_pose('s1', 0.41, MIN)
    assert m.needs_pose('s1', NAN, MIN)              # valid -> no echo is a change too
    obs(m, 0.1, NAN)
    assert not m.needs_pose('s1', NAN, MIN)
    assert not m.needs_pose('s1', 0.15, MIN)         # below min_range = the same "no echo"
    assert m.needs_pose('s2', 0.40, MIN)


def turned(deg, pose=FL):
    return (pose[0], pose[1], pose[2] + math.radians(deg))


def test_an_echo_lost_because_the_robot_turned_away_is_not_held():
    m = SonarMemory()
    obs(m, 0.0, 0.30)
    obs(m, 0.35, 0.29)
    assert obs(m, 0.70, NAN, turned(60)) is None    # the spot is now 60 deg off the beam
    assert m.points(0.8, ROBOT) == []


def test_an_echo_lost_while_backing_away_is_not_held():
    m = SonarMemory()
    obs(m, 0.0, 0.30)
    obs(m, 0.35, 0.32)
    assert obs(m, 0.70, NAN, ahead(-0.30)) is None  # 0.62 m from the spot: not "too close"
    assert m.points(0.8, ROBOT) == []


def test_a_long_echo_while_pointing_elsewhere_does_not_release():
    # Offline sim 23/11: a recovery Spin swung the sonar past a wall 0.6 m away, the hold
    # was dropped, and the robot then drove into the object sitting in the blind zone.
    m = SonarMemory()
    approach_and_lose(m)
    spun = turned(70, ahead(0.12))
    assert obs(m, 1.0, 0.95, spun) is None
    assert len(m.points(1.1, ROBOT)) == 16
    event = obs(m, 1.5, 1.90, ahead(0.12))          # looking at the spot again, long echo
    assert 'released' in event
    assert m.points(1.6, ROBOT) == []


def test_footprint_parse_and_pad_match_nav2():
    fp = parse_footprint('[[0.4010999755, 0.281449967], [-0.4010999755, 0.281449967], '
                         '[-0.4010999755, -0.281350021], [0.4010999755, -0.281350021]]')
    padded = pad_footprint(fp, 0.05)
    assert padded[0] == pytest.approx((0.4510999755, 0.331449967))
    assert padded[2] == pytest.approx((-0.4510999755, -0.331350021))
    assert half_extents(fp) == pytest.approx((0.4010999755, 0.281449967))
    for bad in ('[]', '[[0, 0], [1, 1]]', '[[0, 0], [1], [1, 1]]', 'x', '[[0, .nan], [1, 0], [0, 1]]'):
        with pytest.raises(ValueError):
            parse_footprint(bad)


def test_sonar_mount_through_the_static_tree_and_odom_pose():
    static = {'base_link': ('base_footprint', (0.0, 0.0, 0.0)),
              'sonar1_link': ('base_link', (0.3885, 0.2683, math.radians(45))),
              'loop_a': ('loop_b', (0, 0, 0)), 'loop_b': ('loop_a', (0, 0, 0))}
    mount = mount_in_base(static, 'sonar1_link', 'base_footprint')
    assert mount == pytest.approx(FL)
    assert mount_in_base(static, 'sonar9_link', 'base_footprint') is None
    assert mount_in_base(static, 'loop_a', 'base_footprint') is None
    robot = (2.0, 1.0, math.pi / 2)
    x, y, yaw = compose(robot, mount)
    assert (x, y) == pytest.approx((2.0 - 0.2683, 1.0 + 0.3885))
    assert yaw == pytest.approx(math.pi / 2 + math.radians(45))
    hist = [(10.0, 0, 0, 0), (10.1, 1, 0, 0), (10.2, 2, 0, 0)]
    assert pose_at(hist, 10.12) == (1, 0, 0)
    assert pose_at(hist, 11.0) is None
    assert pose_at([], 10.0) is None


def test_released_after_creeping_on_a_curve_once_the_object_is_gone():
    # Offline sim 23/11: the robot crept on in the turn after the hold, so the held spot
    # ended ~17 deg off the beam axis; a strict +-15 deg check kept it held for 50 s.
    m = SonarMemory()
    approach_and_lose(m)
    stopped = turned(17, ahead(0.12))
    event = obs(m, 1.0, 1.89, stopped)
    assert 'released' in event
    assert m.points(1.1, ROBOT) == []
