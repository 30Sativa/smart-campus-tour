"""Unit tests for stm32_bridge.motor_alarm (pure Python, no ROS needed).

Simulated FB lines only: this checks the bridge logic, not the HBS57H ALM
output on the real robot.
"""

import os
import sys

_PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from stm32_bridge.imu_health import parse_fb_counters  # noqa: E402
from stm32_bridge.motor_alarm import (  # noqa: E402
    ALARM, ALM_OK, DISABLED, ERROR, MALFORMED, NO_SIGNAL, OK, STALE, UNKNOWN, WARN,
    AlarmFields, MotorAlarmHealth, parse_fb_alarm)

# 24-field frame of the current firmware (contactor last).
FB24 = 'FB,7,100,200,20,OK,-17981,1' + ',0,0' * 4 + ',3,4,1,22,9000,-1500,1,1'


def fb(left, right, trips_left=0, trips_right=0, extra=''):
    return f'{FB24},{left},{right},{trips_left},{trips_right}{extra}'


def f(left, right, trips_left=0, trips_right=0):
    return AlarmFields((left, right), (trips_left, trips_right))


def levels(events):
    return [level for level, _ in events]


def test_parse_old_and_new_firmware():
    assert len(FB24.split(',')) == 24
    assert parse_fb_alarm(FB24) is None, 'firmware without ALM fields'
    assert parse_fb_alarm('FB,1,2,3') is None
    assert parse_fb_alarm(fb(ALM_OK, ALARM, 0, 3)) == f(ALM_OK, ALARM, 0, 3)
    assert parse_fb_alarm(fb(ALM_OK, ALM_OK, extra=',99,abc')) == f(ALM_OK, ALM_OK), \
        'unknown trailing fields are ignored'
    assert parse_fb_alarm(fb('x', ALM_OK)) is MALFORMED, 'present but unreadable != old firmware'
    assert parse_fb_alarm(fb(ALM_OK, ALM_OK, -1, 0)) is MALFORMED
    assert parse_fb_alarm('ALM,1,EN=1' + ',0' * 30) is None
    # Earlier fields keep their positions.
    assert parse_fb_counters(fb(ALM_OK, ALARM, 0, 3)) == (4, 1)


def test_old_firmware_is_reported_once_and_ok():
    h = MotorAlarmHealth()
    assert h.status(0.0, True)[:2] == (OK, 'waiting for STM32 feedback')
    first = h.on_feedback(0.0, parse_fb_alarm(FB24))
    assert levels(first) == [OK] and 'does not report' in first[0][1]
    assert h.on_feedback(0.02, None) == []
    assert h.status(1.0, True)[:2] == (OK, 'firmware does not report ALM')
    assert h.status(1.0, False)[0] == STALE


def test_unwired_inputs_warn_but_never_error():
    h = MotorAlarmHealth()
    events = []
    for k in range(200):
        events += h.on_feedback(k * 0.02, f(NO_SIGNAL, NO_SIGNAL))
    assert ERROR not in levels(events)
    assert len(events) == 1, 'one startup summary, no repeated logs'
    level, message, values = h.status(4.0, True)
    assert level == WARN and 'left' in message and 'right' in message
    assert values['left_state'] == 'NO_SIGNAL' and values['monitoring_only'] == 'true'


def test_both_drivers_normal():
    h = MotorAlarmHealth()
    events = []
    for k in range(100):
        events += h.on_feedback(k * 0.02, f(ALM_OK, ALM_OK))
    assert levels(events) == [OK]
    assert h.status(2.0, True)[:2] == (OK, 'drivers OK')


def test_one_driver_alarm_then_clear():
    h = MotorAlarmHealth()
    h.on_feedback(0.0, f(ALM_OK, ALM_OK))
    events = h.on_feedback(1.0, f(ALARM, ALM_OK, 1, 0))
    assert levels(events) == [ERROR]
    assert 'left driver ALARM' in events[0][1] and 'NOT stopped' in events[0][1]
    assert h.on_feedback(1.02, f(ALARM, ALM_OK, 1, 0)) == [], 'sustained alarm logged once'
    level, message, values = h.status(1.5, True)
    assert level == ERROR and 'left' in message and 'right' not in message
    assert values['left_trips_since_mcu_boot'] == '1' and values['right_last_alarm_age_s'] == 'never'
    cleared = h.on_feedback(4.0, f(ALM_OK, ALM_OK, 1, 0))
    assert levels(cleared) == [WARN] and 'after 3.0 s' in cleared[0][1]
    level, message, _ = h.status(4.0, True)
    assert level == OK and 'left=1' in message


def test_both_drivers_alarm():
    h = MotorAlarmHealth()
    h.on_feedback(0.0, f(ALM_OK, ALM_OK))
    events = h.on_feedback(0.02, f(ALARM, ALARM, 1, 1))
    assert levels(events) == [ERROR, ERROR]
    level, message, _ = h.status(0.1, True)
    assert level == ERROR and 'left, right' in message


def test_alarm_already_present_when_bridge_starts():
    h = MotorAlarmHealth()
    events = h.on_feedback(0.0, f(ALM_OK, ALARM, 0, 1))
    assert levels(events) == [OK, ERROR]


def test_short_alarm_between_frames_is_not_missed():
    h = MotorAlarmHealth()
    h.on_feedback(0.0, f(ALM_OK, ALM_OK))
    events = h.on_feedback(0.02, f(ALM_OK, ALM_OK, 0, 1))
    assert levels(events) == [ERROR] and 'short ALARM' in events[0][1]
    assert h.status(0.5, True)[2]['right_last_alarm_age_s'] == '0.5'


def test_wire_breaks_and_reconnects():
    h = MotorAlarmHealth()
    h.on_feedback(0.0, f(ALM_OK, ALM_OK))
    lost = h.on_feedback(1.0, f(ALM_OK, NO_SIGNAL))
    assert levels(lost) == [WARN] and 'right' in lost[0][1]
    back = h.on_feedback(2.0, f(ALM_OK, ALM_OK))
    assert levels(back) == [OK] and 'now connected' in back[0][1]


def test_mcu_reset_counters_go_back():
    h = MotorAlarmHealth()
    h.on_feedback(0.0, f(ALARM, ALM_OK, 2, 0))
    events = h.on_feedback(5.0, f(UNKNOWN, UNKNOWN, 0, 0))
    assert any('MCU restarted' in text for _, text in events)
    assert ERROR not in levels(events)
    assert h.status(5.0, True)[:2] == (OK, 'ALM starting')
    again = h.on_feedback(5.1, f(ALARM, ALM_OK, 1, 0))
    assert levels(again) == [ERROR], 'latched alarm after reset is reported again'


def test_bridge_reconnect_is_stateless():
    """A serial reconnect delivers the same firmware counters: no new events,
    no false 'MCU restarted'."""
    h = MotorAlarmHealth()
    h.on_feedback(0.0, f(ALM_OK, ALM_OK, 1, 0))
    assert h.status(3.0, False)[0] == STALE   # link down
    assert h.on_feedback(4.0, f(ALM_OK, ALM_OK, 1, 0)) == []
    assert h.status(4.0, True)[0] == OK


def test_firmware_monitoring_disabled():
    h = MotorAlarmHealth()
    events = h.on_feedback(0.0, f(DISABLED, DISABLED))
    assert levels(events) == [OK]
    assert h.status(1.0, True)[:2] == (OK, 'ALM monitoring disabled in firmware')


def test_malformed_frame_keeps_the_alarm():
    """One unreadable frame during an ALARM: no 'old firmware', no repeated ALARM."""
    h = MotorAlarmHealth()
    h.on_feedback(0.0, parse_fb_alarm(fb(ALARM, ALM_OK, 1, 0)))
    bad = h.on_feedback(0.02, parse_fb_alarm(fb('x', ALM_OK, 1, 0)))
    assert levels(bad) == [WARN] and 'malformed' in bad[0][1]
    assert h.on_feedback(0.04, parse_fb_alarm(fb(ALARM, '?', 1, 0))) == [], 'warned once per run'
    assert h.status(0.05, True)[0] == ERROR, 'still ALARM'
    assert h.on_feedback(0.06, parse_fb_alarm(fb(ALARM, ALM_OK, 1, 0))) == [], \
        'no duplicate ALARM event, no "monitoring" banner again'
    cleared = h.on_feedback(2.0, parse_fb_alarm(fb(ALM_OK, ALM_OK, 1, 0)))
    assert levels(cleared) == [WARN] and 'after 2.0 s' in cleared[0][1], 'alarm duration kept'


def test_unknown_state_code_is_not_drivers_ok():
    h = MotorAlarmHealth()
    h.on_feedback(0.0, parse_fb_alarm(fb(ALM_OK, ALM_OK)))
    ev = h.on_feedback(0.02, parse_fb_alarm(fb(7, ALM_OK)))
    assert levels(ev) == [WARN] and 'code 7' in ev[0][1]
    assert h.on_feedback(0.04, parse_fb_alarm(fb(7, ALM_OK))) == [], 'logged on change only'
    level, message, values = h.status(0.05, True)
    assert level == WARN and 'left=7' in message
    assert values['left_state'] == 'code_7'
    assert h.status(0.05, True)[0] != OK
    h.on_feedback(0.06, parse_fb_alarm(fb(7, ALARM, 0, 1)))
    assert h.status(0.07, True)[0] == ERROR, 'a real ALARM still wins'
