"""rclpy-free motion permit decision (docs/decisions/0049-m2-3-robot-local-safety.md, Decision 1).

The permit is true only while a successful command poll is recent. If that link is lost during a
leg, the permit stays false until Nav2 has ended that leg, so a goal cannot resume on reconnect.
"""

from __future__ import annotations

import time
from collections.abc import Callable


class MotionPermit:
    def __init__(self, link_timeout_sec: float, last_poll_success: Callable[[], float | None],
                 has_active_leg: Callable[[], bool], on_link_lost: Callable[[], None], monotonic=None,
                 allowed: Callable[[], bool] | None = None):
        self._link_timeout_sec = link_timeout_sec
        self._last_poll_success = last_poll_success
        self._has_active_leg = has_active_leg
        self._on_link_lost = on_link_lost
        self._monotonic = monotonic or time.monotonic
        # Local conditions: wheel odometry fresh, no unowned goal, map verified.
        self._allowed = allowed or (lambda: True)
        self._held = False

    def evaluate(self) -> bool:
        last = self._last_poll_success()
        fresh = last is not None and 0.0 <= self._monotonic() - last <= self._link_timeout_sec
        if not self._has_active_leg():
            self._held = False
        elif not fresh and not self._held:
            self._held = True
            self._on_link_lost()
        return fresh and not self._held and self._allowed()
