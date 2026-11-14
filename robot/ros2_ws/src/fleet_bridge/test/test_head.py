"""Fleet Head v1 robot side (ADR-0045): parse, apply once in order, JOG deadman, long-poll loop. No ROS needed."""

import json
import threading
import unittest
from pathlib import Path

from fleet_bridge.head import HeadCommandApplier, head_state_report, parse_head_command, parse_head_poll_response
from fleet_bridge.head_worker import FleetHeadWorker, HeadWorkerConfig, head_url_from_sync_url
from fleet_bridge.http_client import HttpResponse, TransportFailure

FIXTURES = Path(__file__).resolve().parent / 'fixtures/fleet-head'
EPOCH = '8d3b1f2e-6c4a-4a55-9e2f-1b7c0d9a4e61'


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


def response(commands, epoch=EPOCH):
    return {'success': True, 'message': '', 'data': {'epoch': epoch, 'commands': commands}, 'errors': None}


class FakeActuator:
    def __init__(self, fail_on=None):
        self.calls = []
        self.fail_on = fail_on

    def _record(self, *call):
        self.calls.append(call)
        if call[0] == self.fail_on:
            raise RuntimeError('service unavailable')

    def step(self, pan, tilt):
        self._record('step', pan, tilt)

    def jog(self, pan, tilt):
        self._record('jog', pan, tilt)

    def stop(self):
        self._record('stop')

    def angle(self, pan, tilt):
        self._record('angle', pan, tilt)

    def sweep(self, amplitude_deg):
        self._record('sweep', amplitude_deg)

    def home(self):
        self._record('home')


class FixtureTests(unittest.TestCase):
    def test_fixtures_are_the_shared_contract(self):
        for parent in Path(__file__).resolve().parents:
            shared = parent / 'docs/contracts/fleet-head/v1'
            if shared.is_dir():
                for file in FIXTURES.glob('*.json'):
                    self.assertEqual(json.loads((shared / file.name).read_text(encoding='utf-8')),
                                     json.loads(file.read_text(encoding='utf-8')), file.name)
                return
        self.skipTest('Repository docs are not present (standalone package build).')

    def test_fixture_commands_parse_and_run_in_order(self):
        epoch, commands = parse_head_poll_response(fixture('poll-response-commands.json'))
        self.assertEqual(EPOCH, epoch)
        self.assertEqual([42, 43, 44, 45, 46, 47, 48], [c.seq for c in commands])
        actuator = FakeActuator()
        HeadCommandApplier(actuator).apply(epoch, commands, now=100.0)
        # A SWEEP without sweepDeg asks for the robot's default (0); with it, the POI's own amplitude.
        self.assertEqual([('step', 1, 0), ('jog', -1, 0), ('jog', 0, 0), ('stop',), ('angle', 0.0, 0.0), ('sweep', 0.0),
                          ('sweep', 90.0), ('home',)], actuator.calls)
        self.assertEqual((EPOCH, []), parse_head_poll_response(fixture('poll-response-empty.json')))

    def test_home_rehomes_the_head(self):
        actuator = FakeActuator()
        HeadCommandApplier(actuator).apply(EPOCH, [parse_head_command({'seq': 1, 'kind': 'HOME'})], now=0.0)
        self.assertEqual([('home',)], actuator.calls)

    def test_request_fixture_is_what_the_worker_sends(self):
        request = fixture('poll-request.json')
        self.assertEqual({'epoch', 'afterSeq', 'waitMs', 'head'}, set(request))
        self.assertEqual({'state', 'referenced', 'panDeg', 'tiltDeg', 'observedAt'}, set(request['head']))


class ParseTests(unittest.TestCase):
    def test_refuses_contract_violations(self):
        for bad in [None, {}, {'data': {'epoch': 'x', 'commands': []}}, {'data': {'epoch': EPOCH, 'commands': {}}}]:
            with self.assertRaises(ValueError):
                parse_head_poll_response(bad)
        for raw in [{'seq': 1, 'kind': 'PARK'}, {'seq': 0, 'kind': 'STOP'}, {'seq': True, 'kind': 'STOP'},
                    {'seq': 1, 'kind': 'STEP', 'panSteps': 21}, {'seq': 1, 'kind': 'STEP', 'panSteps': 1.5},
                    {'seq': 1, 'kind': 'JOG', 'panDir': 2}, {'seq': 1, 'kind': 'JOG', 'panDir': 1, 'ttlMs': 0},
                    {'seq': 1, 'kind': 'ANGLE', 'panDeg': 0}, {'seq': 1, 'kind': 'ANGLE', 'panDeg': float('nan'), 'tiltDeg': 0},
                    {'seq': 1, 'kind': 'ANGLE', 'panDeg': 0, 'tiltDeg': 91}, {'seq': 1, 'kind': 'SWEEP', 'sweepDeg': 9},
                    {'seq': 1, 'kind': 'SWEEP', 'sweepDeg': 171}, {'seq': 1, 'kind': 'SWEEP', 'sweepDeg': 90.5}]:
            with self.assertRaises(ValueError, msg=raw):
                parse_head_command(raw)

    def test_missing_axes_mean_zero_and_ttl_defaults(self):
        jog = parse_head_command({'seq': 3, 'kind': 'JOG', 'panDir': 1})
        self.assertEqual((1, 0, 0.6), (jog.pan_dir, jog.tilt_dir, jog.ttl_sec))
        self.assertEqual(0.25, parse_head_command({'seq': 3, 'kind': 'JOG', 'panDir': 1, 'ttlMs': 250}).ttl_sec)

    def test_head_state_names(self):
        self.assertEqual({'state': 'NO_REFERENCE', 'referenced': False, 'panDeg': 12.35, 'tiltDeg': -3.6},
                         head_state_report(4, False, 12.345, -3.6, None))
        self.assertEqual('UNKNOWN', head_state_report(9, True, 0.0, 0.0, None)['state'])
        self.assertIsNone(head_state_report(1, True, float('nan'), 0.0, None)['panDeg'])

    def test_url_from_sync_url(self):
        self.assertEqual('https://api.example.edu/api/fleet/head/v1',
                         head_url_from_sync_url('https://api.example.edu/api/fleet/v1/sync'))
        with self.assertRaises(ValueError):
            head_url_from_sync_url('https://api.example.edu/sync')


class ApplierTests(unittest.TestCase):
    def setUp(self):
        self.actuator = FakeActuator()
        self.applier = HeadCommandApplier(self.actuator)

    def apply(self, commands, now=0.0, epoch=EPOCH):
        return self.applier.apply(epoch, [parse_head_command(c) for c in commands], now)

    def test_each_seq_runs_once_even_if_delivered_twice(self):
        batch = [{'seq': 1, 'kind': 'STEP', 'panSteps': 1}, {'seq': 2, 'kind': 'STEP', 'tiltSteps': -1}]
        self.assertEqual(2, self.apply(batch))
        self.assertEqual(0, self.apply(batch))
        self.assertEqual([('step', 1, 0), ('step', 0, -1)], self.actuator.calls)
        self.assertEqual((EPOCH, 2), self.applier.cursor())

    def test_a_new_epoch_starts_counting_again(self):
        self.apply([{'seq': 7, 'kind': 'STOP'}])
        other = '11111111-2222-3333-4444-555555555555'
        self.assertEqual(1, self.apply([{'seq': 1, 'kind': 'STEP', 'panSteps': 1}], epoch=other))
        self.assertEqual((other, 1), self.applier.cursor())

    def test_jog_is_kept_alive_until_its_ttl_then_released_once(self):
        self.apply([{'seq': 1, 'kind': 'JOG', 'panDir': -1, 'ttlMs': 600}], now=10.0)
        self.applier.tick(10.3)
        self.assertTrue(self.applier.jogging)
        self.applier.tick(10.61)
        self.applier.tick(10.7)
        self.assertFalse(self.applier.jogging)
        self.assertEqual([('jog', -1, 0), ('jog', -1, 0), ('jog', 0, 0)], self.actuator.calls)

    def test_a_repeated_jog_extends_the_deadline(self):
        self.apply([{'seq': 1, 'kind': 'JOG', 'panDir': 1, 'ttlMs': 600}], now=0.0)
        self.apply([{'seq': 2, 'kind': 'JOG', 'panDir': 1, 'ttlMs': 600}], now=0.5)
        self.applier.tick(0.9)
        self.assertTrue(self.applier.jogging)
        self.applier.tick(1.2)
        self.assertFalse(self.applier.jogging)

    def test_release_stop_angle_sweep_and_step_end_a_jog(self):
        for ender in [{'kind': 'JOG', 'panDir': 0, 'tiltDir': 0}, {'kind': 'STOP'}, {'kind': 'ANGLE', 'panDeg': 0, 'tiltDeg': 0},
                      {'kind': 'SWEEP'}, {'kind': 'STEP', 'panSteps': -2}, {'kind': 'HOME'}]:
            actuator = FakeActuator()
            applier = HeadCommandApplier(actuator)
            applier.apply(EPOCH, [parse_head_command({'seq': 1, 'kind': 'JOG', 'tiltDir': 1}),
                                  parse_head_command({'seq': 2, **ender})], 0.0)
            self.assertFalse(applier.jogging, ender)
            self.assertEqual(('jog', 0, 0), actuator.calls[1], ender)

    def test_a_failed_ros_call_is_logged_and_later_commands_still_run(self):
        logs = []
        actuator = FakeActuator(fail_on='stop')
        applier = HeadCommandApplier(actuator, on_log=logs.append)
        applier.apply(EPOCH, [parse_head_command({'seq': 1, 'kind': 'STOP'}),
                              parse_head_command({'seq': 2, 'kind': 'STEP', 'panSteps': 1})], 0.0)
        self.assertEqual([('stop',), ('step', 1, 0)], actuator.calls)
        self.assertEqual(1, len(logs))
        self.assertEqual((EPOCH, 2), applier.cursor())

    def test_a_step_during_a_jog_is_not_overridden_by_the_jog_keepalive(self):
        self.apply([{'seq': 1, 'kind': 'JOG', 'panDir': 1, 'ttlMs': 600},
                    {'seq': 2, 'kind': 'STEP', 'panSteps': -3}], now=0.0)
        self.applier.tick(0.1)
        self.applier.tick(0.2)
        self.assertEqual([('jog', 1, 0), ('jog', 0, 0), ('step', -3, 0)], self.actuator.calls)

    def test_release_without_jog_publishes_nothing(self):
        self.applier.release()
        self.applier.tick(5.0)
        self.assertEqual([], self.actuator.calls)


class FakeTransport:
    def __init__(self, replies):
        self.replies = list(replies)
        self.bodies = []

    def poll(self, body):
        self.bodies.append(json.loads(body))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class WorkerTests(unittest.TestCase):
    def make(self, replies, head=None):
        actuator = FakeActuator()
        transport = FakeTransport(replies)
        logs = []
        worker = FleetHeadWorker(HeadWorkerConfig(wait_ms=1500), HeadCommandApplier(actuator), transport,
                                 lambda: head, logs.append, clock=lambda: 0.0)
        return worker, transport, actuator, logs

    def test_sends_its_cursor_and_head_then_applies(self):
        head = {'state': 'IDLE', 'referenced': True, 'panDeg': 0.0, 'tiltDeg': 0.0}
        worker, transport, actuator, _ = self.make([
            HttpResponse(200, response([{'seq': 5, 'kind': 'STEP', 'panSteps': 2, 'tiltSteps': 0}])),
            HttpResponse(200, response([]))], head=head)
        self.assertTrue(worker.run_once())
        self.assertTrue(worker.run_once())
        self.assertEqual({'epoch': None, 'afterSeq': 0, 'waitMs': 1500, 'head': head}, transport.bodies[0])
        self.assertEqual({'epoch': EPOCH, 'afterSeq': 5}, {k: transport.bodies[1][k] for k in ('epoch', 'afterSeq')})
        self.assertEqual([('step', 2, 0)], actuator.calls)

    def test_failures_are_unhealthy_and_logged_once(self):
        worker, _, actuator, logs = self.make([
            TransportFailure('URLError'), TransportFailure('URLError'),
            HttpResponse(401, {'errors': None}), HttpResponse(200, {'data': None})])
        self.assertEqual([False, False, False, False], [worker.run_once() for _ in range(4)])
        self.assertEqual(['Head poll failed (URLError).', 'Head poll refused: http_401.',
                          'Head poll response ignored: missing data.'], logs)
        self.assertEqual([], actuator.calls)

    def test_backoff_grows_and_is_capped(self):
        worker, *_ = self.make([])
        worker.random_source = lambda: 0.5
        delays = []
        for failures in (1, 2, 3, 10):
            worker._failures = failures
            delays.append(worker._delay())
        self.assertEqual([0.5, 1.0, 2.0, 10.0], delays)

    def test_loop_does_not_spin_on_fast_empty_answers_and_stops(self):
        stop = threading.Event()
        waits = []
        transport = FakeTransport([HttpResponse(200, response([]))] * 3)

        def wait(seconds):
            waits.append(seconds)
            if len(waits) == 3:
                stop.set()
            return stop.is_set()

        worker = FleetHeadWorker(HeadWorkerConfig(), HeadCommandApplier(FakeActuator()), transport, lambda: None,
                                 stop_event=stop, wait=wait, clock=lambda: 0.0)
        worker.run()
        self.assertEqual([0.2, 0.2, 0.2], waits)

    def test_stop_releases_a_live_jog(self):
        actuator = FakeActuator()
        applier = HeadCommandApplier(actuator)
        applier.apply(EPOCH, [parse_head_command({'seq': 1, 'kind': 'JOG', 'panDir': 1})], 0.0)
        FleetHeadWorker(HeadWorkerConfig(), applier, FakeTransport([]), lambda: None).stop()
        self.assertEqual(('jog', 0, 0), actuator.calls[-1])


if __name__ == '__main__':
    unittest.main()
