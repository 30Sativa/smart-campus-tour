"""Pure parts of the sonar acceptance tools (no ROS needed)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sonar_check import summarise, verdict, parse_expect  # noqa: E402
from sonar_shadow_report import episodes, scale_of  # noqa: E402

NAN = float('nan')


def test_summarise_counts_new_measurements_not_republished_frames():
    s = [(0.0, 0.5)] * 12 + [(0.3, 0.48)] * 12 + [(0.6, NAN)] * 16
    st = summarise(s, 1.0)
    assert st['msgs_per_s'] == 40 and st['new_per_s'] == 3
    assert math.isclose(st['valid_share'], 0.6)
    assert st['min'] == 0.48 and st['max'] == 0.5


def test_summarise_without_valid_readings_and_verdicts():
    st = summarise([(0, NAN)] * 4, 1.0)
    assert 'median' not in st and verdict(st, 0.5, 0.05)[0] is False
    assert verdict({'median': 0.52}, 0.50, 0.05)[0]
    assert not verdict({'median': 0.58}, 0.50, 0.05)[0]
    assert parse_expect(['sonar1=0.5', 'sonar3=1.2']) == {'sonar1': 0.5, 'sonar3': 1.2}


def test_episodes_merge_close_samples_and_flag_stops():
    pairs = [(0.0, (0.2, 0.0), (0.2, 0.0)),
             (0.1, (0.2, 0.1), (0.1, 0.05)),
             (0.2, (0.2, 0.1), (0.0, 0.0)),
             (0.3, (0.2, 0.1), (0.2, 0.1)),
             (2.0, (0.0, 0.45), (0.0, 0.30)),
             (3.0, (0.0, 0.0), (0.0, 0.0))]          # input ~0: not an episode
    eps = episodes(pairs)
    assert len(eps) == 2
    assert eps[0]['t0'] == 0.1 and eps[0]['t1'] == 0.2 and eps[0]['stopped']
    assert math.isclose(eps[1]['min_scale'], 0.30 / 0.45) and not eps[1]['stopped']
    assert scale_of((0.0, 0.0), (0.0, 0.0)) is None
