"""HBS57H motor encoders seen through the STM32 feedback stream (pure Python, no ROS).

The firmware decodes both motor encoders in hardware (TIM3 left, TIM8 right,
quadrature x4) and appends the receiver state, the accumulated counts and a
transition-error counter to every FB frame (fields 28-32, see
robot/docs/PROTOCOL_FB.md). The STEP counts of the same frame (fields 2-3) are
at most 1 ms apart from them (the encoder count is the last 1 kHz SysTick
sample); both accumulate, so that skew does not build up across frames.

This class compares them over windows of commanded motion and reports:

- NO_MOTION: STEP pulses went out but the encoder barely moved;
- WRONG_DIRECTION: the encoder moved against the STEP direction (only once
  the wheel's encoder sign is calibrated);
- RATIO_MISMATCH: encoder counts per STEP away from the calibrated value
  (only once counts per STEP is calibrated);
- transition errors (both channels changed at once: lost edge or noise).

MONITORING ONLY: nothing here stops the wheels or changes odometry, which
still integrates STEP counts. The encoder counts per STEP and the sign of
each wheel are not verified on hardware yet; until they are set, only the
sign-free NO_MOTION check runs, and the measured ratio is reported so it can
be calibrated (firmware/stm32/motor_controller/docs/ENCODER_HBS57H.md).
"""

from typing import Dict, List, NamedTuple, Optional, Tuple

OK, WARN, ERROR, STALE = 0, 1, 2, 3  # diagnostic_msgs/DiagnosticStatus levels

# Wire codes from motor/motor_encoder_core.h.
DISABLED, RX_OFF, RX_ON = 0, 1, 2
STATE_NAMES = {DISABLED: 'DISABLED', RX_OFF: 'RX_OFF', RX_ON: 'RX_ON'}
WHEELS = ('left', 'right')
FB_ENCODER_MIN_FIELDS = 33

# Window results.
NONE, RESULT_OK, NO_MOTION, WRONG_DIRECTION, RATIO_MISMATCH = (
    'n/a', 'OK', 'NO_MOTION', 'WRONG_DIRECTION', 'RATIO_MISMATCH')
_BAD_RESULTS = (NO_MOTION, WRONG_DIRECTION)

# Evaluate after this many STEP pulses in one direction (800 = 1/20 wheel
# turn, ~30 mm with the 16000 STEP/turn drivetrain) ...
DEFAULT_WINDOW_STEPS = 800
# ... or after this long, if at least a quarter of that has gone out.
DEFAULT_WINDOW_MAX_S = 2.0
# NO_MOTION below this fraction of the expected counts. Uncalibrated, the
# expected value is taken as 1 count/STEP: far below the nominal 2.5 (1000-line
# encoder x4 / 1600 STEP per motor turn) yet far above a stalled motor.
DEFAULT_STALL_FRACTION = 0.1
UNCALIBRATED_COUNTS_PER_STEP = 1.0
DEFAULT_RATIO_TOLERANCE = 0.2
# A transition error keeps the status WARN this long.
TERR_HOLD_S = 10.0
TERR_LOG_PERIOD_S = 10.0
# One FB frame cannot move more than this (12 kHz STEP cap, 20 ms frames,
# generous slack); bigger jumps mean the MCU restarted or a frame was garbled.
MAX_STEP_JUMP = 30000
MAX_COUNT_JUMP = 200000


class EncoderFields(NamedTuple):
    state: int
    steps: Tuple[int, int]      # FB 2-3: firmware STEP counts (logical direction)
    counts: Tuple[int, int]     # FB 29-30: encoder counts (wiring direction)
    terr: Tuple[int, int]       # FB 31-32: transition-error counters


class WheelCalibration(NamedTuple):
    counts_per_step: float = 0.0   # 0 = not calibrated
    sign: int = 0                  # +1/-1: encoder count sign per positive STEP; 0 = unknown


def parse_fb_encoder(line: str) -> Optional[EncoderFields]:
    """FB fields 28-32 plus the STEP counts, or None for older firmware."""
    parts = line.split(',')
    if len(parts) < FB_ENCODER_MIN_FIELDS or parts[0] != 'FB':
        return None
    try:
        state = int(parts[28])
        steps = (int(parts[2]), int(parts[3]))
        counts = (int(parts[29]), int(parts[30]))
        terr = (int(parts[31]), int(parts[32]))
    except ValueError:
        return None
    if any(t < 0 for t in terr):
        return None
    return EncoderFields(state, steps, counts, terr)


def state_name(code: Optional[int]) -> str:
    if code is None:
        return 'n/a'
    return STATE_NAMES.get(code, f'code_{code}')


def diff32(current: int, previous: int) -> int:
    """Signed difference of two int32 counters that wrap."""
    delta = (current - previous) & 0xFFFFFFFF
    return delta - 0x100000000 if delta >= 0x80000000 else delta


def _sign(value: float) -> int:
    return (value > 0) - (value < 0)


class _Wheel:

    def __init__(self):
        self.prev: Optional[Tuple[int, int, int]] = None   # step, count, terr
        self.clear_window()
        self.result = NONE
        self.result_time: Optional[float] = None
        self.result_ratio: Optional[float] = None
        self.result_step_rate = 0.0
        self.result_cps = 0.0
        self.total_steps = 0         # |STEP| over evaluated, moving windows
        self.total_counts = 0        # encoder counts in the STEP direction
        self.counts_without_step = 0
        self.last_terr_time: Optional[float] = None
        self.last_terr_log: Optional[float] = None
        self.terr_unlogged = 0
        self.ratio_logged = False

    def clear_window(self):
        self.w_steps = 0
        self.w_counts = 0
        self.w_time = 0.0


class MotorEncoderMonitor:

    def __init__(self,
                 calibration: Tuple[WheelCalibration, WheelCalibration] = (
                     WheelCalibration(), WheelCalibration()),
                 steps_per_meter: Optional[float] = None,
                 window_steps: int = DEFAULT_WINDOW_STEPS,
                 window_max_s: float = DEFAULT_WINDOW_MAX_S,
                 stall_fraction: float = DEFAULT_STALL_FRACTION,
                 ratio_tolerance: float = DEFAULT_RATIO_TOLERANCE):
        self._cal = tuple(WheelCalibration(max(0.0, float(c.counts_per_step)), _sign(c.sign))
                          for c in calibration)
        self._steps_per_meter = steps_per_meter
        self._window_steps = max(1, int(window_steps))
        self._window_max_s = window_max_s
        self._stall_fraction = stall_fraction
        self._ratio_tolerance = ratio_tolerance
        self._fields: Optional[EncoderFields] = None
        self._has_fields: Optional[bool] = None   # None = no FB yet
        self._wheels = [_Wheel(), _Wheel()]

    def reset_baseline(self) -> None:
        """Next frame is a new reference (serial reconnect); keep the results."""
        for w in self._wheels:
            w.prev = None
            w.clear_window()

    # -- input -------------------------------------------------------------
    def on_feedback(self, now: float, fields: Optional[EncoderFields],
                    dt_s: float = 0.0) -> List[Tuple[int, str]]:
        events: List[Tuple[int, str]] = []
        if fields is None:
            if self._has_fields is not False:
                events.append((OK, 'STM32 firmware does not report motor encoders '
                                   f'(FB has fewer than {FB_ENCODER_MIN_FIELDS} fields); '
                                   'encoder monitoring inactive'))
            self._has_fields = False
            self._fields = None
            return events

        prev_state = self._fields.state if self._fields is not None else None
        if self._has_fields is not True:
            events.append((OK, 'Motor encoder monitoring (monitoring only, odometry stays on '
                               f'STEP counts): receiver {state_name(fields.state)}, '
                               + self._calibration_summary()))
        self._has_fields = True
        self._fields = fields

        if prev_state is not None and fields.state != prev_state:
            if fields.state == RX_OFF:
                events.append((WARN, 'Motor encoder receiver switched OFF (ENC,<seq>,OFF?); '
                                     'encoder counts frozen'))
            elif fields.state == RX_ON:
                events.append((OK, 'Motor encoder receiver ON'))

        dt_s = dt_s if dt_s > 0.0 else 0.0
        for i, wheel in enumerate(WHEELS):
            self._wheel_feedback(now, i, wheel, fields, dt_s, events)
        return events

    def _wheel_feedback(self, now, i, wheel, fields, dt_s, events):
        w = self._wheels[i]
        cur = (fields.steps[i], fields.counts[i], fields.terr[i])
        prev, w.prev = w.prev, cur
        if prev is None:
            w.clear_window()
            return
        d_step = diff32(cur[0], prev[0])
        d_count = diff32(cur[1], prev[1])
        d_terr = cur[2] - prev[2]
        if d_terr < 0 or abs(d_step) > MAX_STEP_JUMP or abs(d_count) > MAX_COUNT_JUMP:
            events.append((OK, f'{wheel} STEP/encoder counters jumped (STEP {d_step:+d}, '
                               f'encoder {d_count:+d}, TERR {d_terr:+d}); MCU restarted? '
                               'Comparison restarts from this frame'))
            w.clear_window()
            return

        if d_terr > 0:
            w.last_terr_time = now
            w.terr_unlogged += d_terr
            if w.last_terr_log is None or now - w.last_terr_log >= TERR_LOG_PERIOD_S:
                events.append((WARN, f'{wheel} encoder transition errors +{w.terr_unlogged} '
                                     f'(total since MCU boot {cur[2]}): A and B changed together '
                                     '- lost edge, noise or loose wire'))
                w.last_terr_log = now
                w.terr_unlogged = 0

        if fields.state != RX_ON:
            w.clear_window()
            return
        if d_step == 0:
            w.counts_without_step += abs(d_count)

        if d_step != 0 and w.w_steps != 0 and _sign(d_step) != _sign(w.w_steps):
            w.clear_window()   # reversed: a window must be one direction
        w.w_steps += d_step
        w.w_counts += d_count
        w.w_time += dt_s

        if abs(w.w_steps) >= self._window_steps:
            self._evaluate(now, i, wheel, events)
        elif w.w_time >= self._window_max_s:
            if abs(w.w_steps) >= self._window_steps // 4:
                self._evaluate(now, i, wheel, events)
            else:
                w.clear_window()

    def _evaluate(self, now, i, wheel, events):
        w = self._wheels[i]
        cal = self._cal[i]
        steps, counts = w.w_steps, w.w_counts
        ratio = counts / steps
        scale = cal.counts_per_step if cal.counts_per_step > 0 else UNCALIBRATED_COUNTS_PER_STEP
        if abs(counts) < self._stall_fraction * scale * abs(steps):
            result = NO_MOTION
        elif cal.sign != 0 and _sign(ratio) != cal.sign:
            result = WRONG_DIRECTION
        elif (cal.counts_per_step > 0 and
              abs(abs(ratio) / cal.counts_per_step - 1.0) > self._ratio_tolerance):
            result = RATIO_MISMATCH
        else:
            result = RESULT_OK

        if result != NO_MOTION:
            w.total_steps += abs(steps)
            w.total_counts += counts * _sign(steps)
        old = w.result
        w.result, w.result_time, w.result_ratio = result, now, ratio
        w.result_step_rate = steps / w.w_time if w.w_time > 0 else 0.0
        w.result_cps = counts / w.w_time if w.w_time > 0 else 0.0
        w.clear_window()

        what = f'{steps:+d} STEP -> {counts:+d} encoder counts ({ratio:+.3f} counts/STEP)'
        if result != old:
            if result == NO_MOTION:
                events.append((ERROR, f'{wheel} motor: {what}. STEP pulses went out but the '
                                      'encoder barely moved (stalled, driver off/alarm, or '
                                      'encoder not wired). Monitoring only: wheels NOT stopped'))
            elif result == WRONG_DIRECTION:
                events.append((ERROR, f'{wheel} motor turns against the STEP direction: {what} '
                                      f'(calibrated sign {cal.sign:+d}). Monitoring only'))
            elif result == RATIO_MISMATCH:
                events.append((WARN, f'{wheel} motor: {what}, expected '
                                     f'{cal.counts_per_step:.3f} +-{self._ratio_tolerance:.0%} '
                                     '(slip, missed steps or wrong calibration)'))
            elif old in (NO_MOTION, WRONG_DIRECTION, RATIO_MISMATCH):
                events.append((OK, f'{wheel} motor encoder agrees with STEP again: {what}'))
        if result == RESULT_OK and not w.ratio_logged:
            w.ratio_logged = True
            events.append((OK, f'{wheel} motor first encoder/STEP window: {what}'))

    # -- output ------------------------------------------------------------
    def measured_counts_per_step(self, i: int) -> Optional[float]:
        """Encoder counts per STEP over all moving windows, signed: + = the
        encoder counts up when the firmware STEP count goes up."""
        w = self._wheels[i]
        return w.total_counts / w.total_steps if w.total_steps else None

    def status(self, now: float, feedback_alive: bool) -> Tuple[int, str, Dict[str, str]]:
        f = self._fields
        values = {'monitoring_only': 'true',
                  'receiver': state_name(f.state) if f else 'n/a'}
        for i, wheel in enumerate(WHEELS):
            w, cal = self._wheels[i], self._cal[i]
            measured = self.measured_counts_per_step(i)
            values[f'{wheel}_step_count'] = str(f.steps[i]) if f else 'n/a'
            values[f'{wheel}_encoder_count'] = str(f.counts[i]) if f else 'n/a'
            values[f'{wheel}_transition_errors'] = str(f.terr[i]) if f else 'n/a'
            values[f'{wheel}_last_window'] = w.result
            values[f'{wheel}_last_window_age_s'] = (
                '%.1f' % (now - w.result_time) if w.result_time is not None else 'never')
            values[f'{wheel}_last_window_counts_per_step'] = (
                '%+.4f' % w.result_ratio if w.result_ratio is not None else 'n/a')
            values[f'{wheel}_last_window_step_rate_hz'] = '%+.0f' % w.result_step_rate
            values[f'{wheel}_last_window_encoder_cps'] = '%+.0f' % w.result_cps
            values[f'{wheel}_measured_counts_per_step'] = (
                '%+.4f' % measured if measured is not None else 'n/a')
            values[f'{wheel}_configured_counts_per_step'] = (
                '%.4f' % cal.counts_per_step if cal.counts_per_step > 0 else 'uncalibrated')
            values[f'{wheel}_configured_sign'] = '%+d' % cal.sign if cal.sign else 'unknown'
            if cal.counts_per_step > 0 and self._steps_per_meter:
                values[f'{wheel}_last_window_encoder_mm_s'] = '%+.1f' % (
                    1000.0 * w.result_cps * (cal.sign or 1)
                    / (cal.counts_per_step * self._steps_per_meter))
            values[f'{wheel}_counts_without_step'] = str(w.counts_without_step)
        if not feedback_alive:
            return STALE, 'no STM32 feedback', values
        if self._has_fields is None:
            return OK, 'waiting for STM32 feedback', values
        if f is None:
            return OK, 'firmware does not report motor encoders', values
        if f.state == DISABLED:
            return OK, 'motor encoders disabled in firmware', values
        bad = [f'{WHEELS[i]} {w.result}' for i, w in enumerate(self._wheels)
               if w.result in _BAD_RESULTS]
        if bad:
            return ERROR, ', '.join(bad) + ' (monitoring only, wheels not stopped)', values
        if f.state == RX_OFF:
            return WARN, 'encoder receiver OFF', values
        warn = [f'{WHEELS[i]} {RATIO_MISMATCH}' for i, w in enumerate(self._wheels)
                if w.result == RATIO_MISMATCH]
        warn += [f'{WHEELS[i]} transition errors' for i, w in enumerate(self._wheels)
                 if w.last_terr_time is not None and now - w.last_terr_time < TERR_HOLD_S]
        if warn:
            return WARN, ', '.join(warn), values
        if any(c.counts_per_step <= 0 or c.sign == 0 for c in self._cal):
            return OK, 'encoders counting (not calibrated: only the no-motion check runs)', values
        return OK, 'encoders agree with STEP', values

    def _calibration_summary(self) -> str:
        parts = []
        for wheel, cal in zip(WHEELS, self._cal):
            if cal.counts_per_step > 0 or cal.sign:
                parts.append(f'{wheel} {cal.counts_per_step:.4f} counts/STEP sign {cal.sign:+d}')
            else:
                parts.append(f'{wheel} uncalibrated')
        return ', '.join(parts)
