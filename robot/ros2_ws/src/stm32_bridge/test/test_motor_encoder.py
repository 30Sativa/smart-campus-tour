"""Unit tests for stm32_bridge.motor_encoder (pure Python, no ROS needed).

Simulated FB lines only: this checks the comparison logic, not the encoders,
the AM26LV32E receiver or the counts per STEP of the real robot.
"""

import os
import sys

_PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from stm32_bridge.motor_alarm import parse_fb_alarm  # noqa: E402
from stm32_bridge.motor_encoder import (  # noqa: E402
    DISABLED, ERROR, NO_MOTION, OK, RATIO_MISMATCH, RESULT_OK, RX_OFF, RX_ON,
    STALE, WARN, WRONG_DIRECTION, EncoderFields, MotorEncoderMonitor,
    WheelCalibration, diff32, parse_fb_encoder)


def fb28(step_left, step_right):
    """28-field frame of the ALM firmware, with chosen STEP counts."""
    return (f'FB,7,{step_left},{step_right},20,OK,-17981,1' + ',0,0' * 4
            + ',3,4,1,22,9000,-1500,1,1,2,2,0,0')


def fb(step_left, step_right, enc_left, enc_right, state=RX_ON, terr_left=0, terr_right=0,
       extra=''):
    return (f'{fb28(step_left, step_right)},{state},{enc_left},{enc_right},'
            f'{terr_left},{terr_right}{extra}')


def fields(step_left, step_right, enc_left, enc_right, state=RX_ON, terr_left=0,
           terr_right=0):
    return EncoderFields(state, (step_left, step_right), (enc_left, enc_right),
                         (terr_left, terr_right))


def levels(events):
    return [level for level, _ in events]


def drive(mon, frames, step_rate, count_rate, start=(0, 0, 0, 0), t0=0.0, dt=0.02,
          state=RX_ON, terr=(0, 0)):
    """Feed `frames` FB frames; rates are per frame for (left, right)."""
    sl, sr, el, er = start
    events = []
    t = t0
    for _ in range(frames):
        sl += step_rate[0]
        sr += step_rate[1]
        el += count_rate[0]
        er += count_rate[1]
        t += dt
        events += mon.on_feedback(t, fields(sl, sr, el, er, state, *terr), dt)
    return events, (sl, sr, el, er), t


def test_parse_old_and_new_firmware():
    assert len(fb28(0, 0).split(',')) == 28
    assert parse_fb_encoder(fb28(0, 0)) is None, 'ALM firmware without encoder fields'
    assert parse_fb_encoder('FB,1,2,3') is None
    line = fb(100, -200, 250, 500, RX_ON, 1, 2)
    assert len(line.split(',')) == 33
    assert parse_fb_encoder(line) == fields(100, -200, 250, 500, RX_ON, 1, 2)
    assert parse_fb_encoder(fb(1, 2, 3, 4, extra=',99,abc')) == fields(1, 2, 3, 4), \
        'unknown trailing fields are ignored'
    assert parse_fb_encoder(fb(1, 2, 'x', 4)) is None
    assert parse_fb_encoder(fb(1, 2, 3, 4, terr_left=-1)) is None
    assert parse_fb_encoder('ENC,1,EN=1' + ',0' * 40) is None
    # Earlier fields keep their positions: ALM still parses.
    assert parse_fb_alarm(line).states == (2, 2)


def test_diff32_wraps():
    assert diff32(5, 3) == 2
    assert diff32(-2147483648, 2147483647) == 1
    assert diff32(2147483647, -2147483648) == -1


def test_old_firmware_is_reported_once_and_ok():
    mon = MotorEncoderMonitor()
    assert mon.status(0.0, True)[:2] == (OK, 'waiting for STM32 feedback')
    first = mon.on_feedback(0.0, parse_fb_encoder(fb28(0, 0)), 0.02)
    assert levels(first) == [OK] and 'does not report' in first[0][1]
    assert mon.on_feedback(0.02, None, 0.02) == []
    assert mon.status(1.0, True)[:2] == (OK, 'firmware does not report motor encoders')
    assert mon.status(1.0, False)[0] == STALE


def test_disabled_firmware_is_ok():
    mon = MotorEncoderMonitor()
    drive(mon, 50, (40, 40), (0, 0), state=DISABLED)
    level, message, _ = mon.status(1.0, True)
    assert (level, message) == (OK, 'motor encoders disabled in firmware')


def test_uncalibrated_tracking_reports_measured_ratio():
    """Nominal 2.5 counts/STEP, signs opposite per wheel (mirrored motors)."""
    mon = MotorEncoderMonitor()
    events, _, t = drive(mon, 100, (40, -40), (100, 100))
    assert ERROR not in levels(events) and WARN not in levels(events)
    assert any('left motor first encoder/STEP window' in text for _, text in events)
    level, message, values = mon.status(t, True)
    assert level == OK and 'not calibrated' in message
    assert values['left_last_window'] == RESULT_OK
    assert values['left_measured_counts_per_step'] == '+2.5000'
    assert values['right_measured_counts_per_step'] == '-2.5000', \
        'sign relative to the firmware STEP direction'
    assert values['left_last_window_step_rate_hz'] == '+2000'
    assert values['left_last_window_encoder_cps'] == '+5000'
    assert values['left_configured_counts_per_step'] == 'uncalibrated'


def test_no_motion_is_an_error_even_uncalibrated():
    mon = MotorEncoderMonitor()
    events, _, t = drive(mon, 60, (40, 40), (100, 3))   # right: 3 counts per 40 STEP
    errors = [text for level, text in events if level == ERROR]
    assert len(errors) == 1 and 'right motor' in errors[0] and 'NOT stopped' in errors[0]
    level, message, values = mon.status(t, True)
    assert level == ERROR and 'right NO_MOTION' in message
    assert values['right_last_window'] == NO_MOTION
    assert values['right_measured_counts_per_step'] == 'n/a', \
        'a stalled window does not pollute the calibration figure'
    # Logged once, not every window.
    more, _, _ = drive(mon, 60, (40, 40), (100, 3), start=(2400, 2400, 6000, 180), t0=t)
    assert ERROR not in levels(more)
    # Motion resumes -> OK again.
    back, _, t = drive(mon, 60, (40, 40), (100, 100), start=(4800, 4800, 12000, 360), t0=t)
    assert any(level == OK and 'agrees with STEP again' in text for level, text in back)
    assert mon.status(t, True)[0] == OK


def test_standstill_and_slow_motion_do_not_false_alarm():
    mon = MotorEncoderMonitor()
    events, _, t = drive(mon, 500, (0, 0), (0, 0))                  # 10 s parked
    events += drive(mon, 500, (1, 1), (0, 0), t0=t)[0]              # 50 STEP/s, encoder lag
    assert ERROR not in levels(events)
    assert mon.status(t, True)[0] == OK


def test_hand_rotation_without_step_is_counted_not_flagged():
    mon = MotorEncoderMonitor()
    events, _, t = drive(mon, 100, (0, 0), (50, -20))
    assert ERROR not in levels(events)
    values = mon.status(t, True)[2]
    assert values['left_counts_without_step'] == str(99 * 50)
    assert values['right_counts_without_step'] == str(99 * 20)


def test_direction_and_ratio_checks_once_calibrated():
    cal = (WheelCalibration(2.5, +1), WheelCalibration(2.5, -1))
    mon = MotorEncoderMonitor(cal, steps_per_meter=26184.875)
    events, end, t = drive(mon, 100, (40, 40), (100, -100))
    assert ERROR not in levels(events) and WARN not in levels(events)
    level, message, values = mon.status(t, True)
    assert (level, message) == (OK, 'encoders agree with STEP')
    assert values['left_last_window_encoder_mm_s'] == '+76.4'   # 2000 STEP/s
    assert values['right_last_window_encoder_mm_s'] == '+76.4'

    events, end, t = drive(mon, 60, (40, 40), (-100, -100), start=end, t0=t)
    wrong = [text for level, text in events if level == ERROR]
    assert len(wrong) == 1 and 'left motor turns against' in wrong[0]
    assert mon.status(t, True)[0] == ERROR

    mon = MotorEncoderMonitor(cal)
    events, _, t = drive(mon, 60, (40, 40), (100, -70))   # right 1.75 = -30 %
    warn = [text for level, text in events if level == WARN]
    assert len(warn) == 1 and 'right motor' in warn[0] and 'expected 2.500' in warn[0]
    level, message, values = mon.status(t, True)
    assert level == WARN and 'right RATIO_MISMATCH' in message
    assert values['right_last_window'] == RATIO_MISMATCH


def test_reversal_starts_a_new_window():
    cal = (WheelCalibration(2.5, +1), WheelCalibration(2.5, +1))
    mon = MotorEncoderMonitor(cal)
    # 15 frames forward (600 STEP, below the 800-STEP window), then backward.
    events, end, t = drive(mon, 15, (40, 40), (100, 100))
    events += drive(mon, 60, (-40, -40), (-100, -100), start=end, t0=t)[0]
    assert ERROR not in levels(events) and WARN not in levels(events)


def test_transition_errors_warn_and_rate_limit():
    mon = MotorEncoderMonitor()
    events, end, t = drive(mon, 10, (40, 40), (100, 100))
    events, end, t = drive(mon, 1, (40, 40), (100, 100), start=end, t0=t, terr=(0, 3))
    assert levels(events) == [WARN] and 'right encoder transition errors +3' in events[0][1]
    assert mon.status(t, True)[:2] == (WARN, 'right transition errors')
    events, end, t = drive(mon, 1, (40, 40), (100, 100), start=end, t0=t, terr=(0, 5))
    assert events == [], 'rate limited'
    events, end, t = drive(mon, 600, (40, 40), (100, 100), start=end, t0=t, terr=(0, 5))
    assert WARN not in levels(events)
    assert mon.status(t, True)[0] == OK, 'WARN clears after TERR_HOLD_S without new errors'


def test_receiver_off_warns_and_pauses_comparison():
    mon = MotorEncoderMonitor()
    events, end, t = drive(mon, 10, (40, 40), (100, 100))
    events, end, t = drive(mon, 60, (40, 40), (0, 0), start=end, t0=t, state=RX_OFF)
    assert any(level == WARN and 'switched OFF' in text for level, text in events)
    assert ERROR not in levels(events), 'frozen counts with the receiver off are not a stall'
    assert mon.status(t, True)[:2] == (WARN, 'encoder receiver OFF')
    events, end, t = drive(mon, 60, (40, 40), (100, 100), start=end, t0=t)
    assert any('receiver ON' in text for _, text in events)
    assert mon.status(t, True)[0] == OK


def test_mcu_restart_rebaselines_without_false_alarm():
    mon = MotorEncoderMonitor()
    _, end, t = drive(mon, 100, (40, 40), (100, 100), terr=(4, 0))
    # MCU reboots: every counter back near 0.
    events, _, t = drive(mon, 60, (40, 40), (100, 100), t0=t)
    assert any('MCU restarted?' in text for _, text in events)
    assert ERROR not in levels(events)


def test_reset_baseline_after_reconnect():
    mon = MotorEncoderMonitor()
    _, end, t = drive(mon, 10, (40, 40), (100, 100))
    mon.reset_baseline()
    # Frames lost while disconnected: counters moved on without us.
    events, _, _ = drive(mon, 60, (40, 40), (100, 100),
                         start=(end[0] + 5000, end[1] + 5000, end[2], end[3]), t0=t + 2)
    assert ERROR not in levels(events), 'the gap is not taken as STEP without encoder motion'
