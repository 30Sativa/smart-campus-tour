"""sonar_publish_mode: which FB frames carry a sonar Range (stm32_bridge/sonar_publish.py).

every_frame (the default) must stay exactly as before: one Range per sonar per FB
frame, stamped with that frame's receive time. on_change drops repeats of the last
published (mm, valid) until a heartbeat is due; a new value goes out on the frame
that first carries it. Runs the production feedback path with no ROS (the stubs of
test_odometry) and a fake Range.
"""

import math
from types import MethodType, SimpleNamespace

import pytest

import test_odometry  # noqa: F401  (installs the ROS stubs, imports the node)
from test_launch_contract import (
    _BRIDGE_LAUNCH, _MANUAL_LAUNCH, _argument_defaults, _forwarded_by_manual_mode)

from stm32_bridge import stm32_bridge_node as node_module
from stm32_bridge.sonar_publish import (
    DEFAULT_SONAR_HEARTBEAT, DEFAULT_SONAR_PUBLISH_MODE, EVERY_FRAME, ON_CHANGE,
    SonarPublishGate)

Stm32BridgeNode = node_module.Stm32BridgeNode
FRAME = 0.025                                   # 40 Hz FB


class FakeRange:
    ULTRASOUND = 0

    def __init__(self):
        self.header = SimpleNamespace(stamp=None, frame_id='')


def fb(seq, sonars):
    """A 16-field FB frame (odometry still) with four (mm, valid) pairs."""
    pairs = ''.join(f',{mm},{int(valid)}' for mm, valid in sonars)
    return f'FB,{seq},0,0,25,OK,0,1{pairs}'


class Bridge:
    """The feedback path of Stm32BridgeNode on a settable clock; records each Range."""

    def __init__(self, monkeypatch, mode=EVERY_FRAME, heartbeat=DEFAULT_SONAR_HEARTBEAT):
        self.t = 100.0
        monkeypatch.setattr(node_module, 'time', SimpleNamespace(monotonic=lambda: self.t))
        monkeypatch.setattr(node_module, 'Range', FakeRange)
        node = test_odometry._FeedbackHarness()
        node._publish_odometry = lambda *_a: None
        node._publish_imu = lambda *_a: None
        node._publish_sonar_range = MethodType(Stm32BridgeNode._publish_sonar_range, node)
        node._parse_feedback_line = lambda line, include_sonar=False: (
            Stm32BridgeNode._parse_feedback_line(node, line, include_sonar=include_sonar))
        node.get_clock = lambda: SimpleNamespace(now=lambda: SimpleNamespace(
            nanoseconds=int(self.t * 1e9), to_msg=lambda t=self.t: t))
        node.publish_sonar = True
        node.sonar_min_range, node.sonar_max_range, node.sonar_field_of_view = 0.20, 6.0, 0.52
        node._sonar_gate = SonarPublishGate(mode, heartbeat)
        self.sent = []
        for i in range(1, 5):
            setattr(node, f'sonar{i}_frame', f'sonar{i}_link')
            setattr(node, f'_sonar{i}_pub', SimpleNamespace(publish=self.sent.append))
        self.node = node
        self.seq = 0

    def frame(self, sonars):
        """One FB frame received now; returns the Range messages it produced."""
        self.seq += 1
        before = len(self.sent)
        Stm32BridgeNode._handle_feedback_line(self.node, fb(self.seq, sonars))
        self.t += FRAME
        return self.sent[before:]


def summary(msg):
    return (msg.header.frame_id, msg.header.stamp,
            None if math.isnan(msg.range) else msg.range)


def frames(bridge, sonars, seconds):
    out = []
    for _ in range(round(seconds / FRAME)):
        out += bridge.frame(sonars)
    return out


STATIC = [(300, True), (0, False), (1500, True), (250, False)]


def test_default_mode_is_every_frame_in_the_node_and_both_launch_files():
    assert DEFAULT_SONAR_PUBLISH_MODE == EVERY_FRAME
    for path in (_BRIDGE_LAUNCH, _MANUAL_LAUNCH):
        assert _argument_defaults(path)['sonar_publish_mode'] == 'every_frame', path
    assert float(_argument_defaults(_BRIDGE_LAUNCH)['sonar_heartbeat_period']) == \
        DEFAULT_SONAR_HEARTBEAT
    assert 'sonar_publish_mode' in _forwarded_by_manual_mode()


def test_every_frame_publishes_each_sonar_with_each_frame_unchanged(monkeypatch):
    bridge = Bridge(monkeypatch)
    sent = []
    stamps = []
    for k in range(40):
        stamps.append(bridge.t)
        sent += bridge.frame(STATIC if k < 20 else STATIC[:3] + [(400, True)])
    assert len(sent) == 160
    for k, stamp in enumerate(stamps):
        assert [summary(m) for m in sent[4 * k:4 * k + 4]] == [
            ('sonar1_link', stamp, 0.3), ('sonar2_link', stamp, None),
            ('sonar3_link', stamp, 1.5), ('sonar4_link', stamp, None if k < 20 else 0.4)]
    m = sent[0]
    assert (m.radiation_type, m.field_of_view, m.min_range, m.max_range) == (0, 0.52, 0.20, 6.0)


def test_on_change_publishes_a_static_reading_once_then_on_the_heartbeat(monkeypatch):
    bridge = Bridge(monkeypatch, ON_CHANGE)
    t0 = bridge.t
    first = bridge.frame(STATIC)
    assert [summary(m) for m in first] == [
        ('sonar1_link', t0, 0.3), ('sonar2_link', t0, None),
        ('sonar3_link', t0, 1.5), ('sonar4_link', t0, None)]
    sent = frames(bridge, STATIC, 2.0)
    s1 = [m.header.stamp for m in sent if m.header.frame_id == 'sonar1_link']
    gaps = [b - a for a, b in zip([t0] + s1, s1)]
    # 2 s at 40 Hz: 80 frames, ~10 heartbeats per sonar instead of 80 copies.
    assert len(s1) in (9, 10), s1
    assert all(DEFAULT_SONAR_HEARTBEAT - 1e-9 <= g <= DEFAULT_SONAR_HEARTBEAT + FRAME + 1e-9
               for g in gaps), gaps
    assert len(sent) == 4 * len(s1)
    assert all(summary(m)[2] == summary(f)[2] for m, f in zip(sent, first * len(s1)))


def test_on_change_publishes_a_new_reading_on_the_frame_that_carries_it(monkeypatch):
    bridge = Bridge(monkeypatch, ON_CHANGE)
    bridge.frame(STATIC)
    bridge.frame(STATIC)
    t_new = bridge.t
    changed = STATIC[:]
    changed[0] = (290, True)
    out = bridge.frame(changed)
    assert [summary(m) for m in out] == [('sonar1_link', t_new, 0.29)]
    assert bridge.frame(changed) == []
    # valid alone is a change too (the same mm, now "no echo")
    t_lost = bridge.t
    changed[0] = (290, False)
    assert [summary(m) for m in bridge.frame(changed)] == [('sonar1_link', t_lost, None)]


def test_on_change_sonars_are_independent(monkeypatch):
    bridge = Bridge(monkeypatch, ON_CHANGE)
    bridge.frame(STATIC)
    frames(bridge, STATIC, 0.1)
    changed = STATIC[:3] + [(700, True)]
    assert [m.header.frame_id for m in bridge.frame(changed)] == ['sonar4_link']
    # sonar1-3 keep their own heartbeat, counted from the first frame
    beat = frames(bridge, changed, 0.1)
    assert sorted(m.header.frame_id for m in beat) == ['sonar1_link', 'sonar2_link', 'sonar3_link']


def test_on_change_republishes_on_the_first_frame_after_a_feedback_gap(monkeypatch):
    bridge = Bridge(monkeypatch, ON_CHANGE)
    bridge.frame(STATIC)
    bridge.t += 0.3                             # no FB frames: nothing is published
    t_back = bridge.t
    out = bridge.frame(STATIC)
    assert [summary(m)[:2] for m in out] == [
        (f'sonar{i}_link', t_back) for i in range(1, 5)]


def test_frames_without_sonar_fields_publish_nothing_in_either_mode(monkeypatch):
    for mode in (EVERY_FRAME, ON_CHANGE):
        bridge = Bridge(monkeypatch, mode)
        Stm32BridgeNode._handle_feedback_line(bridge.node, 'FB,1,0,0,25,OK,0,1')
        assert bridge.sent == []


def test_gate_rejects_unknown_modes_and_unsafe_heartbeats():
    with pytest.raises(ValueError):
        SonarPublishGate('onchange')
    for heartbeat in (0.0, -0.1, 0.6, 1.0):
        with pytest.raises(ValueError):
            SonarPublishGate(ON_CHANGE, heartbeat)
    gate = SonarPublishGate(EVERY_FRAME)
    assert all(gate.due(1, (300, True), 0.0) for _ in range(3))
