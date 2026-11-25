"""Which FB frames carry a sonar's sensor_msgs/Range (pure Python, no ROS).

The firmware sends the last (mm, valid) of all four SR04T in every FB frame (~40 Hz)
but re-measures each sensor only every 0.29-0.42 s (sr04t.c). Publishing every frame
is ~10 copies of each measurement, 160 Range/s for the four: most of what the sonar
guard's rclpy nodes spend (robot/docs/sonar-perception.md limitation 9).

- ``every_frame`` (default): one Range per sonar per FB frame, as before.
- ``on_change``: a sonar's Range only when its (mm, valid) differs from the last one
  published, plus a heartbeat: an unchanged reading goes out again on the first FB
  frame ``heartbeat`` s or more after the previous one (0.20-0.225 s at 40 Hz FB).
  The heartbeat rides on FB frames, never on a timer, so a dead link still goes
  silent and collision_monitor drops the source after its source_timeout (1.0 s). The
  longest gap a live link can show is heartbeat + feedback_timeout (0.4 s) = 0.6 s.

A changed value is published on the frame that first carries it, exactly as in
``every_frame``, so the stamp (FB receive time) of every new measurement is
unchanged. Repeats are dropped, not delayed.
"""

from typing import Dict, Hashable, Optional, Tuple

EVERY_FRAME = 'every_frame'
ON_CHANGE = 'on_change'
SONAR_PUBLISH_MODES = (EVERY_FRAME, ON_CHANGE)
DEFAULT_SONAR_PUBLISH_MODE = EVERY_FRAME
DEFAULT_SONAR_HEARTBEAT = 0.2
# A heartbeat this long plus the longest FB gap that is ridden through (0.4 s) stays
# under collision_monitor's source_timeout (1.0 s), with margin.
MAX_SONAR_HEARTBEAT = 0.5

Reading = Tuple[int, bool]   # (mm, valid) as in the FB frame


def valid_heartbeat(seconds: float) -> bool:
    return 0.0 < seconds <= MAX_SONAR_HEARTBEAT


class SonarPublishGate:
    """Per sonar: is this FB frame's reading due for publishing?"""

    def __init__(self, mode: str = DEFAULT_SONAR_PUBLISH_MODE,
                 heartbeat: float = DEFAULT_SONAR_HEARTBEAT):
        if mode not in SONAR_PUBLISH_MODES:
            raise ValueError(f'sonar publish mode {mode!r} not in {SONAR_PUBLISH_MODES}')
        if not valid_heartbeat(heartbeat):
            raise ValueError(f'sonar heartbeat {heartbeat} s outside (0, {MAX_SONAR_HEARTBEAT}]')
        self.mode = mode
        self.heartbeat = heartbeat
        self._last: Dict[Hashable, Tuple[Reading, float]] = {}

    def due(self, sonar: Hashable, reading: Reading, now: float) -> bool:
        """True = publish it (and remember it as published). now: monotonic seconds."""
        if self.mode == EVERY_FRAME:
            return True
        last: Optional[Tuple[Reading, float]] = self._last.get(sonar)
        if last is not None and last[0] == reading and now - last[1] < self.heartbeat:
            return False
        self._last[sonar] = (reading, now)
        return True
