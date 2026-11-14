"""MotionGateReset: a new leg clears a resettable latch through mode_manager's reset, and refuses when it cannot."""

import unittest

from fleet_bridge.motion_gate_reset import LATCH_NOT_CLEARED, MotionGateReset


class _Response:
    def __init__(self, success, message='ok'):
        self.success = success
        self.message = message


class _Future:
    def __init__(self):
        self._callbacks = []
        self._result = None
        self._error = None

    def add_done_callback(self, callback):
        self._callbacks.append(callback)

    def resolve(self, result=None, error=None):
        self._result, self._error = result, error
        for callback in self._callbacks:
            callback(self)

    def result(self):
        if self._error is not None:
            raise self._error
        return self._result


class _Client:
    def __init__(self, ready=True):
        self.ready = ready
        self.calls = []

    def service_is_ready(self):
        return self.ready

    def call_async(self, request):
        future = _Future()
        self.calls.append((request, future))
        return future


class _Timer:
    def __init__(self, callback):
        self.callback = callback
        self.cancelled = False

    def cancel(self):
        self.cancelled = True


class MotionGateResetTests(unittest.TestCase):
    def setUp(self):
        self.client = _Client()
        self.timers = []
        self.needs = True
        self.answers = []

    def reset(self):
        def create_timer(_period, callback):
            timer = _Timer(callback)
            self.timers.append(timer)
            return timer
        return MotionGateReset(self.client, object, create_timer, lambda: self.needs)

    def test_no_latch_sends_at_once_without_calling_the_service(self):
        self.needs = False
        self.reset().prepare(self.answers.append)
        self.assertEqual([None], self.answers)
        self.assertEqual([], self.client.calls)

    def test_a_cleared_latch_lets_the_goal_go(self):
        self.reset().prepare(self.answers.append)
        self.assertEqual([], self.answers, 'nothing is sent before mode_manager answers')
        self.client.calls[0][1].resolve(_Response(True))
        self.assertEqual([None], self.answers)
        self.assertTrue(self.timers[0].cancelled)

    def test_a_refused_reset_refuses_the_goal(self):
        self.reset().prepare(self.answers.append)
        self.client.calls[0][1].resolve(_Response(False, 'Refused: 1 Nav2 goal(s) still active.'))
        self.assertEqual([LATCH_NOT_CLEARED], self.answers)

    def test_a_failed_call_refuses_the_goal(self):
        self.reset().prepare(self.answers.append)
        self.client.calls[0][1].resolve(error=RuntimeError('gone'))
        self.assertEqual([LATCH_NOT_CLEARED], self.answers)

    def test_no_service_refuses_the_goal(self):
        self.client.ready = False
        self.reset().prepare(self.answers.append)
        self.assertEqual([LATCH_NOT_CLEARED], self.answers)
        self.assertEqual([], self.client.calls)

    def test_a_timeout_refuses_once_and_a_late_answer_changes_nothing(self):
        self.reset().prepare(self.answers.append)
        self.timers[0].callback()
        self.client.calls[0][1].resolve(_Response(True))
        self.assertEqual([LATCH_NOT_CLEARED], self.answers)


if __name__ == '__main__':
    unittest.main()
