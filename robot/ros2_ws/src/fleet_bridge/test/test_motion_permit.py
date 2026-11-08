"""ADR-0049 motion permit, link-loss interruption and unknown-result behaviour. No ROS needed."""

import json
import unittest

from fleet_bridge.command_worker import CommandWorkerConfig, FleetCommandWorker
from fleet_bridge.http_client import HttpResponse, TransportFailure
from fleet_bridge.motion_permit import MotionPermit

from test_commands import STREAM, ScriptedTransport, fixture, goto, make, results


class Clock:
    def __init__(self, now=100.0):
        self.now = now

    def __call__(self):
        return self.now


class PermitHarness:
    def __init__(self):
        self.clock = Clock()
        self.last = None
        self.active = False
        self.lost = 0
        self.permit = MotionPermit(1.5, lambda: self.last, lambda: self.active, self.on_lost, self.clock)

    def on_lost(self):
        self.lost += 1

    def success(self):
        self.last = self.clock.now


class MotionPermitTests(unittest.TestCase):
    def setUp(self):
        self.h = PermitHarness()

    def test_false_before_the_first_successful_poll(self):
        self.assertFalse(self.h.permit.evaluate())

    def test_true_while_the_last_poll_is_recent_and_false_after_the_timeout(self):
        self.h.success()
        self.h.clock.now += 1.5
        self.assertTrue(self.h.permit.evaluate())
        self.h.clock.now += 0.01
        self.assertFalse(self.h.permit.evaluate())

    def test_clock_rollback_is_not_fresh(self):
        self.h.success()
        self.h.clock.now -= 0.5
        self.assertFalse(self.h.permit.evaluate())

    def test_link_loss_while_idle_recovers_without_a_hold(self):
        self.h.success()
        self.h.clock.now += 5.0
        self.assertFalse(self.h.permit.evaluate())
        self.h.success()
        self.assertTrue(self.h.permit.evaluate())
        self.assertEqual(0, self.h.lost)

    def test_link_loss_during_a_leg_holds_the_permit_until_the_leg_ends(self):
        self.h.success()
        self.h.active = True
        self.h.clock.now += 2.0
        self.assertFalse(self.h.permit.evaluate())
        self.h.success()
        self.assertFalse(self.h.permit.evaluate(), 'recovery alone must not restore the permit')
        self.h.active = False
        self.assertTrue(self.h.permit.evaluate())

    def test_link_loss_interrupts_the_leg_only_once(self):
        self.h.success()
        self.h.active = True
        self.h.clock.now += 2.0
        for _ in range(3):
            self.h.permit.evaluate()
        self.assertEqual(1, self.h.lost)


class PollSuccessTests(unittest.TestCase):
    def worker(self, polls, window=0.0):
        self.clock = Clock()
        executor, _ = make()
        return FleetCommandWorker(CommandWorkerConfig(no_backoff_window_sec=window), executor,
                                  ScriptedTransport(polls=polls), lambda: STREAM, monotonic=self.clock,
                                  random_source=lambda: 0.5)

    def test_a_valid_200_poll_stamps_success(self):
        worker = self.worker([HttpResponse(200, fixture('poll-response-empty.json'))])
        worker.run_once()
        self.assertEqual(100.0, worker.last_poll_success)

    def test_nothing_else_stamps_success(self):
        for reply in (HttpResponse(409, {'errors': {'code': 'STREAM_NOT_CURRENT'}}),
                      HttpResponse(401, {}), HttpResponse(503, {}),
                      HttpResponse(200, {'success': True}), TransportFailure('timeout')):
            worker = self.worker([reply])
            worker.run_once()
            self.assertIsNone(worker.last_poll_success, reply)

    def test_failures_inside_the_window_do_not_back_off(self):
        worker = self.worker([HttpResponse(200, fixture('poll-response-empty.json'))], window=1.5)
        worker.run_once()
        worker._failures = 4
        self.clock.now += 1.0
        self.assertEqual(worker.config.poll_period_sec, worker._delay())

    def test_failures_after_the_window_back_off(self):
        worker = self.worker([HttpResponse(200, fixture('poll-response-empty.json'))], window=1.5)
        worker.run_once()
        worker._failures = 4
        self.clock.now += 2.0
        self.assertGreater(worker._delay(), worker.config.poll_period_sec)

    def test_default_config_keeps_the_old_backoff(self):
        worker = self.worker([HttpResponse(200, fixture('poll-response-empty.json'))])
        worker.run_once()
        worker._failures = 4
        self.assertGreater(worker._delay(), worker.config.poll_period_sec)


class LocalInterruptTests(unittest.TestCase):
    def start(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        navigator.on_response(True, None)
        results(executor)
        return executor, navigator

    def test_interrupt_cancels_only_once_and_waits_for_nav2(self):
        executor, navigator = self.start()
        executor.interrupt_leg('LOCAL_LINK_LOSS')
        executor.interrupt_leg('LOCAL_LINK_LOSS')
        self.assertEqual(1, navigator.cancels)
        self.assertEqual([], results(executor))
        self.assertTrue(executor.has_active_leg())

    def test_interrupted_leg_is_failed_with_its_own_reason_never_cancelled(self):
        for status in ('CANCELED', 'ABORTED'):
            executor, navigator = self.start()
            executor.interrupt_leg('LOCAL_LINK_LOSS')
            navigator.on_result(status)
            terminal = results(executor)[-1]
            self.assertEqual(('TERMINAL', 'FAILED', 'LOCAL_LINK_LOSS'),
                             (terminal['phase'], terminal['outcome'], terminal['reason']))
            self.assertFalse(executor.has_active_leg())

    def test_arrival_before_the_interrupt_took_effect_stays_arrived(self):
        executor, navigator = self.start()
        executor.interrupt_leg('LOCAL_LINK_LOSS')
        navigator.on_result('SUCCEEDED')
        terminal = results(executor)[-1]
        self.assertEqual(('ARRIVED', None), (terminal['outcome'], terminal['reason']))

    def test_interrupt_without_a_leg_does_nothing(self):
        executor, navigator = make()
        executor.interrupt_leg('LOCAL_LINK_LOSS')
        self.assertEqual(0, navigator.cancels)


class UnknownResultTests(unittest.TestCase):
    def setUp(self):
        self.executor, self.navigator = make()
        self.executor.handle(goto(), STREAM)
        self.navigator.on_response(True, None)
        results(self.executor)
        self.navigator.on_result('UNKNOWN')

    def test_no_terminal_result_is_invented(self):
        self.assertEqual([], results(self.executor))

    def test_telemetry_reports_unknown_with_the_leg(self):
        snapshot = self.executor.snapshot()
        self.assertEqual('UNKNOWN', snapshot['status'])
        self.assertEqual(goto().leg_id, snapshot['leg_id'])

    def test_a_new_goto_is_refused_while_the_state_is_unknown(self):
        other = goto(leg='11111111-1111-4111-8111-111111111111', command='22222222-2222-4222-8222-222222222222')
        self.executor.handle(other, STREAM)
        body = results(self.executor)[-1]
        self.assertEqual(('REJECTED', 'BUSY'), (body['phase'], body['reason']))
        self.assertEqual(1, len(self.navigator.goals))

    def test_a_later_real_result_still_closes_the_leg(self):
        self.navigator.on_result('ABORTED')
        terminal = results(self.executor)[-1]
        self.assertEqual(('TERMINAL', 'FAILED'), (terminal['phase'], terminal['outcome']))
        self.assertEqual('IDLE', self.executor.snapshot()['status'])

    def test_body_round_trip_is_json(self):
        self.executor.interrupt_leg('LOCAL_LINK_LOSS')
        self.navigator.on_result('CANCELED')
        result = self.executor.next_result()
        self.assertEqual('LOCAL_LINK_LOSS', json.loads(result.body)['reason'])
