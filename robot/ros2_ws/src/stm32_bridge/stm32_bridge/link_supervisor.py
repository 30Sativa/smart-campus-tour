"""STM32 link state and the wheel-motion gate derived from it (pure Python, no ROS).

The bridge used to treat a feedback timeout as a one-shot action: clear the last
command and send STOP. The next /cmd_vel re-armed the wheels 50 ms later, so
while Nav2 or teleop kept publishing the robot was driven without any feedback.
Here the link health is a level: CMD may go out only while motion_permitted is
true, and every other state sends STOP.

Feedback gaps shorter than feedback_timeout are ridden through. Anything longer,
a lost port, a step-count discontinuity or a bridge start ends the same way:
motion stays held until feedback has been steady for recovery_time and the
command source has been seen idle. There is deliberately no "short outage, resume
by itself" path. No recorded gap falls between normal jitter and a real outage,
and today's FB frame cannot prove that the MCU did not reboot.
"""

from typing import Dict, List, Optional, Tuple

OK, WARN, ERROR = 0, 1, 2  # diagnostic_msgs/DiagnosticStatus levels

DISCONNECTED = 'DISCONNECTED'
WAITING_FEEDBACK = 'WAITING_FEEDBACK'
RECOVERING = 'RECOVERING'
ONLINE = 'ONLINE'
FEEDBACK_LOST = 'FEEDBACK_LOST'

# A pause longer than this restarts the recovery hold: a few frames straggling
# in are not a link that is back.
MAX_RECOVERY_GAP_S = 0.25

Events = List[Tuple[int, str]]


class LinkSupervisor:
    """Not thread-safe: the bridge calls it with its serial lock held."""

    def __init__(self, feedback_timeout: float, recovery_time: float,
                 start: float = 0.0):
        self.feedback_timeout = feedback_timeout
        self.recovery_time = recovery_time
        self._recovery_gap = min(MAX_RECOVERY_GAP_S, feedback_timeout)
        self.state = DISCONNECTED
        self.rearm_reason: Optional[str] = 'startup'
        self.faults = 0
        self._state_since = start
        self._last_feedback: Optional[float] = None
        self._recovery_start: Optional[float] = None

    @property
    def motion_permitted(self) -> bool:
        return self.state == ONLINE and self.rearm_reason is None

    @property
    def feedback_flowing(self) -> bool:
        return self.state in (RECOVERING, ONLINE)

    # -- inputs ------------------------------------------------------------
    def on_port_opened(self, now: float) -> Events:
        self._last_feedback = None
        self._set_state(WAITING_FEEDBACK, now)
        return []

    def on_port_closed(self, now: float, reason: str) -> Events:
        if self.state == DISCONNECTED:
            return []
        self.rearm_reason = reason
        self.faults += 1
        self._last_feedback = None
        self._set_state(DISCONNECTED, now)
        return [(WARN, f'STM32 link lost ({reason}): wheels held until the '
                       'link recovers and the command source has been idle.')]

    def on_feedback(self, now: float) -> Events:
        previous = self._last_feedback
        self._last_feedback = now
        if self.state in (WAITING_FEEDBACK, FEEDBACK_LOST):
            self._set_state(RECOVERING, now)
            self._recovery_start = now
            return [(OK, 'STM32 feedback seen; waiting for it to stay steady.')]
        if (self.state == RECOVERING and previous is not None and
                now - previous > self._recovery_gap):
            self._recovery_start = now
        return []

    def on_discontinuity(self, now: float, reason: str) -> Events:
        """The feedback stream is alive but no longer continuous with its past."""
        self.rearm_reason = reason
        self.faults += 1
        self._last_feedback = now
        self._recovery_start = now
        self._set_state(RECOVERING, now)
        return [(WARN, f'STM32 feedback discontinuity ({reason}): wheels held '
                       'until feedback is steady and the command source has '
                       'been idle.')]

    def tick(self, now: float, command_idle: bool) -> Events:
        """Advance on elapsed time. command_idle: the current /cmd_vel is a
        stop, or none has arrived within cmd_timeout."""
        events: Events = []
        if (self.state in (ONLINE, RECOVERING) and
                now - self._last_feedback > self.feedback_timeout):
            self._set_state(FEEDBACK_LOST, now)
            self.rearm_reason = self.rearm_reason or 'feedback_timeout'
            self.faults += 1
            events.append((WARN, 'STM32 feedback timed out: wheels held until '
                                 'it is steady and the command source has '
                                 'been idle.'))
        elif (self.state == RECOVERING and
              now - self._recovery_start >= self.recovery_time):
            self._set_state(ONLINE, now)
            events.append((OK, 'STM32 feedback steady: link online.'))

        if self.state == ONLINE and self.rearm_reason is not None and command_idle:
            events.append((OK, 'Command source idle after '
                               f'{self.rearm_reason}: wheels released.'))
            self.rearm_reason = None
        return events

    # -- output ------------------------------------------------------------
    def seconds_without_feedback(self, now: float) -> float:
        since = self._last_feedback if self._last_feedback is not None else self._state_since
        return now - since

    def status(self, now: float) -> Tuple[int, str, Dict[str, str]]:
        values = {
            'state': self.state,
            'motion_permitted': str(self.motion_permitted).lower(),
            'rearm_reason': self.rearm_reason or 'none',
            'faults': str(self.faults),
            'seconds_in_state': '%.2f' % (now - self._state_since),
        }
        if self.motion_permitted:
            return OK, 'link online', values
        if self.state == ONLINE:
            return WARN, f'wheels held after {self.rearm_reason}: waiting for idle /cmd_vel', values
        if self.state == RECOVERING:
            return WARN, 'feedback back, holding until steady', values
        return ERROR, f'wheels held: {self.state}', values

    # -- helpers -----------------------------------------------------------
    def _set_state(self, state: str, now: float) -> None:
        self.state = state
        self._state_since = now


class FilterSwitch:
    """Keeps robot_localization's processing switch in step with the feedback.

    Without wheel or IMU data the EKF predicts from its last velocity: a robot
    held at standstill drifted 3 m in 8 s in the filter, then snapped back about
    2 m, leaving ~1 m of error. Pausing it stops that while odom TF keeps
    flowing. The filter is told nothing it did not measure.

    ready() and send(on) wrap the ROS client; send returns a future. A reply
    with status=false only means the filter already was in that state.
    """

    RETRY_S = 1.0

    def __init__(self, ready, send):
        self._ready = ready
        self._send = send
        self._applied: Optional[bool] = None
        self._requested: Optional[bool] = None
        self._future = None
        self._sent_at = 0.0

    def update(self, want_on: bool, now: float) -> None:
        if self._future is not None:
            if self._future.done():
                self._applied, self._future = self._requested, None
            elif now - self._sent_at > self.RETRY_S:
                self._future = None
            else:
                return
        if want_on != self._applied and self._ready():
            self._requested = want_on
            self._future = self._send(want_on)
            self._sent_at = now
