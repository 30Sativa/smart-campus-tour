"""IMU yaw health seen through the STM32 feedback stream (pure Python, no ROS).

The bridge used to drop every FB frame with ``yaw_valid=0`` silently, so when
the BNO085 stopped reporting (2026-10-19) the EKF ran on wheel odometry alone
and nothing said so. This class turns the per-frame flag, plus the firmware's
optional recovery counters (FB fields 18-19), into log events and one status
for ``/diagnostics``. It never alters odometry or the IMU message itself.
"""

from typing import Dict, List, Optional, Tuple

OK, WARN, ERROR, STALE = 0, 1, 2, 3  # diagnostic_msgs/DiagnosticStatus levels


class ImuHealth:

    def __init__(self, stale_timeout: float = 1.0, startup_grace: float = 5.0,
                 reminder_period: float = 30.0, start: float = 0.0):
        self.stale_timeout = stale_timeout
        self.startup_grace = startup_grace
        self.reminder_period = reminder_period
        self._start = start
        self._last_valid: Optional[float] = None
        self._last_feedback: Optional[float] = None
        self._stale_since: Optional[float] = None   # set while reported stale
        self._last_reminder = 0.0
        self.outages = 0
        self.rearm: Optional[int] = None
        self.reset_seen: Optional[int] = None

    # -- inputs ------------------------------------------------------------
    def on_feedback(self, now: float, yaw_valid: bool,
                    rearm: Optional[int] = None,
                    reset_seen: Optional[int] = None) -> List[Tuple[int, str]]:
        events: List[Tuple[int, str]] = []
        self._last_feedback = now
        events += self._counters(rearm, reset_seen)
        if yaw_valid:
            if self._stale_since is not None:
                events.append((OK, f'IMU yaw back after {now - self._stale_since:.1f} s '
                                   f'without data{self._counter_text()}'))
                self._stale_since = None
            self._last_valid = now
        return events

    def check(self, now: float, feedback_alive: bool) -> List[Tuple[int, str]]:
        """Call periodically. Without feedback the IMU state is unknown: the
        bridge's own feedback timeout reports that, so stay quiet here."""
        if not feedback_alive or not self._stale(now):
            return []
        if self._stale_since is None:
            self._stale_since = self._last_valid if self._last_valid is not None else self._start
            self._last_reminder = now
            self.outages += 1
            if self._last_valid is None:
                text = f'No IMU yaw from the STM32 {now - self._start:.1f} s after start'
            else:
                text = f'IMU yaw missing for {now - self._last_valid:.1f} s'
            return [(WARN, f'{text} (FB yaw_valid=0); EKF is using wheel odometry only'
                           f'{self._counter_text()}')]
        if now - self._last_reminder >= self.reminder_period:
            self._last_reminder = now
            return [(WARN, f'IMU yaw still missing ({now - self._stale_since:.0f} s)'
                           f'{self._counter_text()}')]
        return []

    # -- output ------------------------------------------------------------
    def status(self, now: float, feedback_alive: bool) -> Tuple[int, str, Dict[str, str]]:
        values = {
            'last_valid_age_s': ('%.2f' % (now - self._last_valid)
                                 if self._last_valid is not None else 'never'),
            'outages': str(self.outages),
            'firmware_rearm_count': 'n/a' if self.rearm is None else str(self.rearm),
            'firmware_reset_seen_count': 'n/a' if self.reset_seen is None else str(self.reset_seen),
        }
        if not feedback_alive:
            return STALE, 'no STM32 feedback', values
        if self._stale_since is not None or self._stale(now):
            return WARN, 'IMU yaw missing; EKF on wheel odometry only', values
        if self._last_valid is None:
            return OK, 'waiting for first IMU yaw', values
        return OK, 'IMU yaw fresh', values

    # -- helpers -----------------------------------------------------------
    def _stale(self, now: float) -> bool:
        if self._last_valid is None:
            return now - self._start > self.startup_grace
        return now - self._last_valid > self.stale_timeout

    def _counters(self, rearm, reset_seen) -> List[Tuple[int, str]]:
        events: List[Tuple[int, str]] = []
        if rearm is None or reset_seen is None:
            return events
        if self.rearm is None:
            if rearm or reset_seen:
                events.append((OK, f'STM32 IMU counters since MCU boot: '
                                   f'rearm={rearm}, chip_resets_seen={reset_seen}'))
        elif rearm < self.rearm or reset_seen < self.reset_seen:
            events.append((OK, 'STM32 IMU counters went back to '
                               f'rearm={rearm}, chip_resets_seen={reset_seen} (MCU restarted?)'))
        else:
            if reset_seen > self.reset_seen:
                events.append((WARN, f'BNO085 reported a chip reset (chip_resets_seen={reset_seen})'))
            if rearm > self.rearm:
                events.append((WARN, 'STM32 re-sent the BNO085 report request '
                                     f'(rearm={rearm}, chip_resets_seen={reset_seen})'))
        self.rearm, self.reset_seen = rearm, reset_seen
        return events

    def _counter_text(self) -> str:
        if self.rearm is None:
            return ''
        return f' [firmware rearm={self.rearm}, chip_resets_seen={self.reset_seen}]'


def parse_fb_counters(line: str) -> Tuple[Optional[int], Optional[int]]:
    """(imu_rearm, imu_reset_seen) from FB fields 18-19, or (None, None) for
    older firmware. They follow the full 17-field frame (sonar block and
    yaw_acc), see robot/docs/PROTOCOL_FB.md."""
    parts = line.split(',')
    if len(parts) < 19:
        return None, None
    try:
        return int(parts[17]), int(parts[18])
    except ValueError:
        return None, None
