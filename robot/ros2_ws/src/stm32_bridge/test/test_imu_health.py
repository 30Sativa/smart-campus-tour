"""Unit tests for stm32_bridge.imu_health (pure Python, no ROS needed)."""

import os
import sys

_PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from stm32_bridge.imu_health import (  # noqa: E402
    ImuHealth, OK, STALE, WARN, parse_fb_counters)

FB17 = 'FB,1,10,20,20,OK,-17981,{v},0,0,0,0,0,0,0,0,3'


def feed(h, t0, t1, valid, step=0.02, rearm=None, reset=None):
    events = []
    t = t0
    while t < t1:
        events += h.on_feedback(t, valid, rearm, reset)
        events += h.check(t, True)
        t += step
    return events


def test_parse_counters_present_and_absent():
    assert parse_fb_counters(FB17.format(v=1)) == (None, None)
    assert parse_fb_counters(FB17.format(v=1) + ',4,1') == (4, 1)
    assert parse_fb_counters(FB17.format(v=1) + ',x,1') == (None, None)
    assert parse_fb_counters('FB,1,2,3') == (None, None)
    # Firmware co dau quay: 4 truong head_* noi sau, bo dem IMU giu vi tri.
    assert parse_fb_counters(FB17.format(v=1) + ',4,1,22,9000,-1500,1,1') == (4, 1)


def test_healthy_stream_is_quiet_and_ok():
    h = ImuHealth(stale_timeout=1.0, start=0.0)
    assert feed(h, 0.0, 60.0, True) == []
    assert h.status(60.0, True)[0] == OK
    assert h.outages == 0


def test_outage_warns_once_then_recovers():
    h = ImuHealth(stale_timeout=1.0, reminder_period=30.0, start=0.0)
    feed(h, 0.0, 10.0, True)
    ev = feed(h, 10.0, 25.0, False)
    warns = [e for e in ev if e[0] == WARN]
    assert len(warns) == 1 and 'missing' in warns[0][1] and 'wheel odometry' in warns[0][1]
    assert h.status(25.0, True)[0] == WARN
    ev = feed(h, 25.0, 26.0, True)
    assert len(ev) == 1 and ev[0][0] == OK and 'back after' in ev[0][1]
    assert h.status(26.0, True)[0] == OK
    assert h.outages == 1


def test_long_outage_reminds_periodically():
    h = ImuHealth(stale_timeout=1.0, reminder_period=30.0, start=0.0)
    feed(h, 0.0, 1.0, True)
    ev = feed(h, 1.0, 100.0, False, step=0.5)
    assert len([e for e in ev if e[0] == WARN]) == 4   # first + 3 reminders


def test_no_imu_since_start_after_grace():
    h = ImuHealth(stale_timeout=1.0, startup_grace=5.0, start=0.0)
    assert feed(h, 0.0, 4.9, False) == []
    assert h.status(4.9, True)[1] == 'waiting for first IMU yaw'
    ev = feed(h, 4.9, 6.0, False)
    assert len(ev) == 1 and 'after start' in ev[0][1]


def test_no_feedback_is_not_an_imu_warning():
    h = ImuHealth(stale_timeout=1.0, start=0.0)
    feed(h, 0.0, 1.0, True)
    assert h.check(10.0, False) == []
    assert h.status(10.0, False)[0] == STALE


def test_firmware_counters_events():
    h = ImuHealth(stale_timeout=1.0, start=0.0)
    ev = h.on_feedback(0.0, True, 0, 1)        # power-on reset seen at boot
    assert len(ev) == 1 and ev[0][0] == OK and 'chip_resets_seen=1' in ev[0][1]
    assert h.on_feedback(0.1, True, 0, 1) == []
    ev = h.on_feedback(0.2, False, 0, 2)
    assert [e[0] for e in ev] == [WARN] and 'chip reset' in ev[0][1]
    ev = h.on_feedback(0.3, False, 1, 2)
    assert [e[0] for e in ev] == [WARN] and 're-sent' in ev[0][1]
    ev = h.on_feedback(0.4, True, 0, 0)        # MCU restarted
    assert len(ev) == 1 and 'MCU restarted' in ev[0][1]


def test_old_firmware_without_counters():
    h = ImuHealth(stale_timeout=1.0, start=0.0)
    assert h.on_feedback(0.0, True, None, None) == []
    values = h.status(0.0, True)[2]
    assert values['firmware_rearm_count'] == 'n/a'
