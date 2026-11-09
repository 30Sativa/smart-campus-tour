"""ROS-free motion gate for fleet command mode (docs/decisions/0049-m2-3-robot-local-safety.md).

The gate decides whether Nav2 velocity may pass. It never touches manual teleop. A latch is
cleared only by a local reset: a returning network or permit never clears it.
"""

from typing import Optional, Tuple


BOOT = 'BOOT'
PERMIT_LOST = 'PERMIT_LOST'
ESTOP = 'ESTOP'

DISABLED = 'DISABLED'
OPEN = 'OPEN'
BLOCKED = 'BLOCKED'


class MotionGate:
    def __init__(self, required: bool, permit_timeout: float, start_latched: bool = True):
        self.required = required
        self.permit_timeout = permit_timeout
        self.latch_reason: Optional[str] = BOOT if required and start_latched else None
        self._permit = False
        self._permit_time: Optional[float] = None

    def on_permit(self, value: bool, now: float) -> None:
        self._permit = bool(value)
        self._permit_time = now

    def permit_ok(self, now: float) -> bool:
        if not self._permit or self._permit_time is None:
            return False
        age = now - self._permit_time
        return 0.0 <= age <= self.permit_timeout

    def update(self, now: float, nav_recent: bool, emergency_stop: bool) -> bool:
        """Advance the gate for one control tick and return whether Nav2 velocity may pass."""
        if not self.required:
            return True
        if self.latch_reason is None:
            if emergency_stop:
                self.latch_reason = ESTOP
            elif nav_recent and not self.permit_ok(now):
                self.latch_reason = PERMIT_LOST
        return self.latch_reason is None and self.permit_ok(now)

    def state(self, now: float) -> str:
        if not self.required:
            return DISABLED
        if self.latch_reason is not None:
            return f'LATCHED:{self.latch_reason}'
        return OPEN if self.permit_ok(now) else BLOCKED

    def reset(self, now: float, emergency_stop: bool, nav2_status_alive: bool,
              active_goals: Optional[int]) -> Tuple[bool, str]:
        """Clear the latch only when no goal can resume.

        active_goals is None while the live action server has not published a status yet,
        which is what a Nav2 that has never had a goal looks like.
        """
        if not self.required:
            return False, 'require_motion_permit is false: there is no latch to reset.'
        if self.latch_reason is None:
            return True, 'Motion gate is not latched.'
        if emergency_stop:
            return False, 'Refused: emergency stop is engaged.'
        if not self.permit_ok(now):
            return False, 'Refused: no fresh motion permit.'
        if not nav2_status_alive:
            return False, 'Refused: Nav2 action status has no publisher, so a live goal cannot be ruled out.'
        if active_goals:
            return False, f'Refused: {active_goals} Nav2 goal(s) still active.'
        previous = self.latch_reason
        self.latch_reason = None
        return True, f'Latch {previous} cleared. Motion needs a new leg.'
