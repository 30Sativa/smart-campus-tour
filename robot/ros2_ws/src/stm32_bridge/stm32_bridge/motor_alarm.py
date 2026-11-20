"""HBS57H wheel-driver ALM seen through the STM32 feedback stream (pure Python, no ROS).

The firmware filters the two ALM inputs (PC10 left, PC11 right) and appends
their state plus an alarm-entry counter to every FB frame (fields 24-27, see
robot/docs/PROTOCOL_FB.md). This class turns them into log events with ROS
time and one status for ``/diagnostics``.

MONITORING ONLY: nothing here stops the wheels, changes odometry or switches
the contactor. While a driver is in alarm it ignores STEP pulses, but the
firmware still counts the pulses it sends, so that wheel's odometry is wrong;
the events say so, they do not correct it.
"""

from typing import Dict, List, NamedTuple, Optional, Tuple

OK, WARN, ERROR, STALE = 0, 1, 2, 3  # diagnostic_msgs/DiagnosticStatus levels

# Wire codes from motor/motor_alarm_core.h.
DISABLED, UNKNOWN, ALM_OK, ALARM, NO_SIGNAL = 0, 1, 2, 3, 4
STATE_NAMES = {DISABLED: 'DISABLED', UNKNOWN: 'UNKNOWN', ALM_OK: 'OK',
               ALARM: 'ALARM', NO_SIGNAL: 'NO_SIGNAL'}
WHEELS = ('left', 'right')
FB_ALARM_MIN_FIELDS = 28


class AlarmFields(NamedTuple):
    states: Tuple[int, int]
    trips: Tuple[int, int]


def parse_fb_alarm(line: str) -> Optional[AlarmFields]:
    """FB fields 24-27, or None for firmware older than the 28-field frame."""
    parts = line.split(',')
    if len(parts) < FB_ALARM_MIN_FIELDS or parts[0] != 'FB':
        return None
    try:
        states = (int(parts[24]), int(parts[25]))
        trips = (int(parts[26]), int(parts[27]))
    except ValueError:
        return None
    if any(t < 0 for t in trips):
        return None
    return AlarmFields(states, trips)


def state_name(code: Optional[int]) -> str:
    if code is None:
        return 'n/a'
    return STATE_NAMES.get(code, f'code_{code}')


class MotorAlarmHealth:

    def __init__(self):
        self._fields: Optional[AlarmFields] = None
        self._has_fields: Optional[bool] = None   # None = no FB yet
        self._alarm_since: List[Optional[float]] = [None, None]
        self._last_alarm: List[Optional[float]] = [None, None]

    # -- input -------------------------------------------------------------
    def on_feedback(self, now: float, fields: Optional[AlarmFields]) -> List[Tuple[int, str]]:
        events: List[Tuple[int, str]] = []
        if fields is None:
            if self._has_fields is not False:
                events.append((OK, 'STM32 firmware does not report HBS57H ALM '
                                   '(FB has fewer than 28 fields); ALM monitoring inactive'))
            self._has_fields = False
            self._fields = None
            return events

        prev = self._fields
        if self._has_fields is not True:
            events.append((OK, 'HBS57H ALM monitoring (monitoring only, no automatic stop): '
                               + self._summary(fields)))
        self._has_fields = True
        self._fields = fields

        if prev is not None and any(fields.trips[i] < prev.trips[i] for i in range(2)):
            events.append((OK, 'STM32 ALM trip counters went back to '
                               f'left={fields.trips[0]}, right={fields.trips[1]} (MCU restarted?)'))
            prev = None
            self._alarm_since = [None, None]

        for i, wheel in enumerate(WHEELS):
            state = fields.states[i]
            old = prev.states[i] if prev is not None else None
            new_trips = fields.trips[i] - (prev.trips[i] if prev is not None else 0)
            if state == ALARM:
                if old != ALARM:
                    self._alarm_since[i] = now
                    self._last_alarm[i] = now
                    events.append((ERROR, f'HBS57H {wheel} driver ALARM '
                                          f'(trips since MCU boot={fields.trips[i]}). Monitoring only: '
                                          f'wheels are NOT stopped automatically; {wheel} STEP-count '
                                          'odometry is unreliable while the driver is in alarm'))
                continue
            if old == ALARM:
                since = self._alarm_since[i]
                held = f' after {now - since:.1f} s' if since is not None else ''
                events.append((WARN, f'HBS57H {wheel} driver ALM cleared{held}, now {state_name(state)}'))
                self._alarm_since[i] = None
            elif new_trips > 0 and prev is not None:
                # Entered and left ALARM between two FB frames.
                self._last_alarm[i] = now
                events.append((ERROR, f'HBS57H {wheel} driver had a short ALARM between FB frames '
                                      f'(trips since MCU boot={fields.trips[i]})'))
            if state == NO_SIGNAL and old not in (None, NO_SIGNAL):
                events.append((WARN, f'HBS57H {wheel} ALM input lost its signal '
                                     '(STM32 pin floating: wire not connected or broken)'))
            elif state == ALM_OK and old == NO_SIGNAL:
                events.append((OK, f'HBS57H {wheel} ALM input now connected, driver OK'))
        return events

    # -- output ------------------------------------------------------------
    def status(self, now: float, feedback_alive: bool) -> Tuple[int, str, Dict[str, str]]:
        f = self._fields
        values = {'monitoring_only': 'true'}
        for i, wheel in enumerate(WHEELS):
            values[f'{wheel}_state'] = state_name(f.states[i]) if f else 'n/a'
            values[f'{wheel}_trips_since_mcu_boot'] = str(f.trips[i]) if f else 'n/a'
            last = self._last_alarm[i]
            values[f'{wheel}_last_alarm_age_s'] = '%.1f' % (now - last) if last is not None else 'never'
        if not feedback_alive:
            return STALE, 'no STM32 feedback', values
        if self._has_fields is None:
            return OK, 'waiting for STM32 feedback', values
        if f is None:
            return OK, 'firmware does not report ALM', values
        alarm = [WHEELS[i] for i in range(2) if f.states[i] == ALARM]
        if alarm:
            return ERROR, ('HBS57H ALARM: ' + ', '.join(alarm)
                           + ' (monitoring only, wheels not stopped)'), values
        no_signal = [WHEELS[i] for i in range(2) if f.states[i] == NO_SIGNAL]
        if no_signal:
            return WARN, 'ALM input not connected: ' + ', '.join(no_signal), values
        if all(s == DISABLED for s in f.states):
            return OK, 'ALM monitoring disabled in firmware', values
        if any(s == UNKNOWN for s in f.states):
            return OK, 'ALM starting', values
        if any(f.trips):
            return OK, f'drivers OK (alarms since MCU boot: left={f.trips[0]}, right={f.trips[1]})', values
        return OK, 'drivers OK', values

    @staticmethod
    def _summary(f: AlarmFields) -> str:
        return (f'left={state_name(f.states[0])} (trips={f.trips[0]}), '
                f'right={state_name(f.states[1])} (trips={f.trips[1]})')
