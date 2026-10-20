"""Unit tests for odom_calib.py pure helpers (no ROS needed)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import odom_calib as oc  # noqa: E402


def run(scale=1.045, tape=10.0, yaw=0.0, reverse=False, front0=15.0, dyaw=0.0, lat=0.0):
    d = tape / scale * (-1 if reverse else 1)
    start = {'x': 0.0, 'y': 0.0, 'yaw': yaw, 'front': front0}
    end = {'x': d * math.cos(yaw) - lat * math.sin(yaw), 'y': d * math.sin(yaw) + lat * math.cos(yaw),
           'yaw': yaw + math.radians(dyaw), 'front': front0 - tape * (-1 if reverse else 1)}
    return oc.evaluate_run(start, end, tape)


def test_scale_from_tape_and_lidar():
    r = run()
    assert abs(r['scale_tape'] - 1.045) < 1e-9 and abs(r['scale_lidar'] - 1.045) < 1e-9 and not r['warnings']


def test_direction_and_heading_independent():
    r = run(yaw=2.0, reverse=True)
    assert r['reverse'] and abs(r['scale_tape'] - 1.045) < 1e-9 and not r['warnings']


def test_warnings():
    assert any('heading' in w for w in run(dyaw=5.0)['warnings'])
    assert any('lateral' in w for w in run(lat=0.3)['warnings'])
    assert any('20 %' in w for w in run(scale=1.5)['warnings'])
    bad = run(); bad = oc.evaluate_run({'x': 0, 'y': 0, 'yaw': 0, 'front': 15.0},
                                       {'x': 10 / 1.045, 'y': 0, 'yaw': 0, 'front': 15.0 - 10.3}, 10.0)
    assert any('LiDAR' in w for w in bad['warnings'])


def test_front_range_uses_robot_forward_through_lidar_yaw():
    n = 1800; inc = 2 * math.pi / n; amin = -math.pi
    ranges = [5.0] * n
    # beams whose robot-frame angle is ~0 (lidar angle = +0.2225 rad) see 3.0 m
    for i in range(n):
        if abs(amin + i * inc + oc.LIDAR_YAW) < math.radians(3):
            ranges[i] = 3.0
    assert oc.front_range(ranges, amin, inc) == 3.0


def test_summary_acceptance():
    runs = [run(scale=s, reverse=r) for s, r in [(1.044, 0), (1.046, 0), (1.045, 0), (1.045, 1), (1.043, 1), (1.047, 1)]]
    s = oc.summarize(runs)
    assert s['accepted'] and abs(s['odom_linear_scale'] - 1.045) < 1e-3
    s = oc.summarize(runs[:3])
    assert not s['accepted'] and any('both directions' in x or 'need 6' in x for x in s['reasons'])
    noisy = [run(scale=s, reverse=r) for s, r in [(1.03, 0), (1.06, 0), (1.045, 0), (1.03, 1), (1.06, 1), (1.045, 1)]]
    assert not oc.summarize(noisy)['accepted']


def test_active_scale_is_compensated():
    # bridge already running with 1.02: wheel/odom shows 10/1.045*1.02; absolute answer stays 1.045
    start = {'x': 0, 'y': 0, 'yaw': 0, 'front': None}
    end = {'x': 10 / 1.045 * 1.02, 'y': 0, 'yaw': 0, 'front': None}
    r = oc.evaluate_run(start, end, 10.0, active_scale=1.02)
    assert abs(r['scale_tape'] - 1.045) < 1e-9 and r['active_odom_linear_scale'] == 1.02
