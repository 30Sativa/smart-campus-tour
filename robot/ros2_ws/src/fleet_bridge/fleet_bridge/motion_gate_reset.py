"""Clears a resettable mode_manager latch just before a backend GoTo is sent (ADR-0049 addendum).

A BOOT or PERMIT_LOST latch exists only because nobody has asked for motion since boot or since a link loss. The
Operator's new leg is that request, so this bridge asks mode_manager's own `motion_inhibit_reset` service, which still
refuses unless the permit is fresh, no Nav2 goal is active and no emergency stop is engaged. An ESTOP latch is never
resettable here. rclpy-free: the service client and the timer factory are passed in.
"""

from __future__ import annotations

from collections.abc import Callable

LATCH_NOT_CLEARED = 'MOTION_GATE_LATCHED'


class MotionGateReset:
    def __init__(self, client, request_factory: Callable[[], object], create_timer, needs_reset: Callable[[], bool],
                 timeout_sec: float = 2.0, on_log=None):
        self._client = client
        self._request_factory = request_factory
        self._create_timer = create_timer
        self._needs_reset = needs_reset
        self._timeout_sec = timeout_sec
        self._log = on_log or (lambda message: None)

    def prepare(self, done: Callable[[str | None], None]) -> None:
        """Call `done(None)` when the goal may be sent, or `done(reason)` to refuse it. Called exactly once."""
        if not self._needs_reset():
            done(None)
            return
        if not self._client.service_is_ready():
            self._log('Motion gate is latched and motion_inhibit_reset is not available; GoTo refused.')
            done(LATCH_NOT_CLEARED)
            return
        answered = False
        timer = None

        def finish(reason: str | None) -> None:
            nonlocal answered
            if answered:
                return
            answered = True
            if timer is not None:
                timer.cancel()
            done(reason)

        def on_timeout() -> None:
            self._log('motion_inhibit_reset did not answer in time; GoTo refused.')
            finish(LATCH_NOT_CLEARED)

        def on_answer(future) -> None:
            try:
                response = future.result()
            except Exception:  # noqa: BLE001 - any failure leaves the latch in place
                response = None
            if response is not None and response.success:
                self._log(f'Motion gate latch cleared for a new leg: {response.message}')
                finish(None)
            else:
                self._log(f'motion_inhibit_reset refused: {getattr(response, "message", "no answer")}; GoTo refused.')
                finish(LATCH_NOT_CLEARED)

        timer = self._create_timer(self._timeout_sec, on_timeout)
        self._client.call_async(self._request_factory()).add_done_callback(on_answer)
