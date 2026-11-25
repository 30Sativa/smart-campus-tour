"""depthsim.box_gap: the footprint-to-box distance avoid_sim.sh reports as 'closest_gap_to_box_m'."""
import math
import os
import sys

import pytest

pytest.importorskip('rclpy')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from depthsim import FP, box_gap  # noqa: E402

BOX = (2.85, 0.18, 3.15, 0.48, 0.15)


def test_gap_ahead_is_distance_from_the_front_edge():
    # robot facing +x, box centre line; front edge at x + 0.4011
    assert box_gap((2.0, 0.33, 0.0), BOX) == pytest.approx(2.85 - 2.0 - FP[0], abs=1e-9)


def test_gap_beside_is_distance_from_the_side_edge():
    assert box_gap((3.0, -0.40, 0.0), BOX) == pytest.approx(0.18 - (-0.40 + FP[1]), abs=1e-9)


def test_touching_or_overlapping_is_zero():
    assert box_gap((2.85 - FP[0], 0.33, 0.0), BOX) == pytest.approx(0.0, abs=1e-9)
    assert box_gap((3.0, 0.33, 0.0), BOX) == 0.0           # box under the robot
    assert box_gap((3.0, 0.33, math.pi / 3), BOX) == 0.0


def test_corner_gap_when_turned():
    # robot turned 90 degrees: its half length now lies along y
    assert box_gap((3.0, 0.48 + FP[0] + 0.1, math.pi / 2), BOX) == pytest.approx(0.1, abs=1e-6)
