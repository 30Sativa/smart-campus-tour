"""Pure parts of the sonar acceptance tools (no ROS needed)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sonar_check import summarise, verdict, parse_expect  # noqa: E402
from sonar_shadow_report import episodes, scale_of  # noqa: E402
from sonar_watch import SonarStats, parse_fb  # noqa: E402

# A 33-field frame as the deployed firmware sends it (PROTOCOL_FB.md): s1 210 mm valid,
# s2 no echo, s3 1500 mm valid, s4 no echo.
FB33 = ('FB,12,100,-100,25,OK,-1798,1,210,1,0,0,1500,1,0,0,3,4,1,0,0,0,1,1,2,2,0,0,2,'
        '10,-10,0,0')

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


def test_parse_fb_reads_the_four_pairs_of_every_known_length():
    n, pairs = parse_fb(FB33)
    assert n == 33 and pairs == [(210, True), (0, False), (1500, True), (0, False)]
    n12, pairs12 = parse_fb('FB,1,0,0,25,OK,0,0,300,1,0,0')         # 12 fields: two sonars
    assert n12 == 12 and pairs12 == [(300, True), (0, False), None, None]
    assert parse_fb('FB,1,0,0,25,OK') is None                        # too old: no sonar
    assert parse_fb('ALM,1,L=OK') is None
    assert parse_fb('FB,1,0,0,25,OK,0,0,x,1,0,0') is None


def test_stats_count_changes_not_frames():
    st = SonarStats()
    t = 0.0
    for value in [(400, True)] * 12 + [(380, True)] * 13 + [(0, False)] * 15 + [(380, True)] * 4:
        st.add(t, value)
        t += 0.025
    sm = st.summary(1.0, t)
    assert sm['frames'] == 44 and len(st.changes) == 4
    assert sm['changes_per_s'] == 4
    assert math.isclose(sm['valid_share'], 29 / 44)
    assert sm['min_mm'] == 380 and sm['max_mm'] == 400
    assert math.isclose(sm['longest_same_s'], 0.375)
    assert sm['top_values'].startswith('380x2')
    assert 'invalidx1' in sm['top_values']
