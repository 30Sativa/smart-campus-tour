import json
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fleet_bridge.command_worker import CommandWorkerConfig, FleetCommandWorker, create_command_path
from fleet_bridge.commands import (
    CancelCommand,
    CommandExecutor,
    GoToCommand,
    build_result,
    outcome_from_nav2,
    parse_poll_response,
    parse_timestamp,
)
from fleet_bridge.http_client import (
    FleetCommandsHttpClient,
    FleetSyncHttpClient,
    HttpResponse,
    TransportFailure,
    commands_url_from_sync_url,
)
from fleet_bridge.protocol import build_report

FIXTURES = Path(__file__).resolve().parent / 'fixtures/fleet-commands'
ROBOT_ROOT = Path(__file__).resolve().parents[4]
NOW = datetime(2026, 11, 10, 2, 0, 5, tzinfo=timezone.utc)
STREAM = '5b0f7d0e-2a51-4c55-9f43-7d3a6c1e9b10'
MAP = 'tang-6-v1'

sys.path.insert(0, str(ROBOT_ROOT / 'tools/fleet_commands_stub'))
from fleet_commands_stub import StubState, serve  # noqa: E402


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


class FakeNavigator:
    def __init__(self):
        self.goals = []
        self.cancels = 0

    def send_goal(self, x, y, yaw, frame_id, on_response, on_result):
        self.goals.append((x, y, yaw, frame_id))
        self.on_response, self.on_result = on_response, on_result

    def cancel(self):
        self.cancels += 1


def make(max_results=32):
    navigator = FakeNavigator()
    return CommandExecutor(MAP, 'map', navigator, wall_clock=lambda: NOW, max_results=max_results), navigator


def goto(leg='7a3e9c12-4b6d-4f1e-8c2a-9d0b1e2f3a41', command='0d6c2f4a-8f0e-4b8c-9a51-2c7e4f1a3b01', **changes):
    values = {'map_key': MAP, 'frame_id': 'map', 'accept_by': NOW + timedelta(seconds=5)}
    values.update(changes)
    return GoToCommand(command, leg, values['map_key'], values['frame_id'], 1.0, 2.0, 0.5, values['accept_by'])


def results(executor):
    found = []
    while (item := executor.next_result()) is not None:
        found.append(json.loads(item.body))
        executor.acknowledge(item)
    return found


class FixtureTests(unittest.TestCase):
    def test_fixtures_are_the_shared_contract(self):
        for parent in Path(__file__).resolve().parents:
            shared = parent / 'docs/contracts/fleet-commands/v1'
            if shared.is_dir():
                for file in FIXTURES.glob('*.json'):
                    self.assertEqual(json.loads((shared / file.name).read_text(encoding='utf-8')),
                                     json.loads(file.read_text(encoding='utf-8')), file.name)
                return
        self.skipTest('Repository docs are not present (standalone package build).')

    def test_poll_fixtures_parse(self):
        self.assertIsNone(parse_poll_response(fixture('poll-response-empty.json')))
        command = parse_poll_response(fixture('poll-response-goto.json'))
        self.assertIsInstance(command, GoToCommand)
        self.assertEqual((MAP, 'map', 12.5, -3.25, 1.5708), (command.map_key, command.frame_id, command.x, command.y, command.yaw))
        self.assertEqual(datetime(2026, 11, 10, 2, 0, 10, tzinfo=timezone.utc), command.accept_by)
        self.assertIsInstance(parse_poll_response(fixture('poll-response-cancel.json')), CancelCommand)

    def test_a_body_off_the_contract_is_refused(self):
        for mutate in (lambda c: c.update(kind='Stop'), lambda c: c.update(x='1'), lambda c: c.update(commandId='nope'),
                       lambda c: c.pop('mapKey'), lambda c: c.update(acceptBy='soon'), lambda c: c.update(yaw=float('nan'))):
            body = fixture('poll-response-goto.json')
            mutate(body['data']['command'])
            with self.assertRaises(ValueError):
                parse_poll_response(body)
        with self.assertRaises(ValueError):
            parse_poll_response({'success': True})

    def test_result_serializes_to_the_fixture_shape(self):
        expected = fixture('result-terminal-arrived.json')
        result = build_result(expected['commandId'], expected['legId'], expected['streamId'],
                              parse_timestamp(expected['reportedAt']), 'TERMINAL', 'ARRIVED')
        body = json.loads(result.body)
        self.assertEqual(sorted(expected), sorted(body))
        self.assertEqual({k: v for k, v in expected.items() if k != 'reportedAt'}, {k: v for k, v in body.items() if k != 'reportedAt'})
        self.assertEqual(parse_timestamp(expected['reportedAt']), parse_timestamp(body['reportedAt']))

    def test_timestamps_accept_any_fraction_width(self):
        self.assertEqual(120000, parse_timestamp('2026-11-10T02:00:00.12+00:00').microsecond)
        self.assertEqual(123456, parse_timestamp('2026-11-10T02:00:00.1234567+00:00').microsecond)
        self.assertEqual(0, parse_timestamp('2026-11-10T02:00:00Z').microsecond)


class ExecutorTests(unittest.TestCase):
    def test_goto_sends_one_goal_and_reports_accepted_then_arrived(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        self.assertEqual([(1.0, 2.0, 0.5, 'map')], navigator.goals)
        self.assertEqual({'status': 'NAVIGATING', 'leg_id': goto().leg_id}, executor.snapshot())
        navigator.on_response(True, None)
        navigator.on_result('SUCCEEDED')
        self.assertEqual([('ACCEPTED', None), ('TERMINAL', 'ARRIVED')], [(r['phase'], r['outcome']) for r in results(executor)])
        self.assertEqual({'status': 'IDLE', 'leg_id': None}, executor.snapshot())

    def test_map_mismatch_creates_no_goal(self):
        for change in ({'map_key': 'other'}, {'frame_id': 'odom'}):
            executor, navigator = make()
            executor.handle(goto(**change), STREAM)
            self.assertEqual([], navigator.goals)
            self.assertEqual([('REJECTED', 'MAP_MISMATCH')], [(r['phase'], r['reason']) for r in results(executor)])

    def test_a_goto_received_after_accept_by_is_expired(self):
        executor, navigator = make()
        executor.handle(goto(accept_by=NOW - timedelta(seconds=1)), STREAM)
        self.assertEqual([], navigator.goals)
        self.assertEqual('EXPIRED', results(executor)[0]['reason'])

    def test_busy_rejects_another_leg_without_preempting(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        executor.handle(goto(leg='11111111-1111-4111-8111-111111111111', command='22222222-2222-4222-8222-222222222222'), STREAM)
        self.assertEqual(1, len(navigator.goals))
        self.assertEqual(0, navigator.cancels)
        self.assertEqual([('REJECTED', 'BUSY')], [(r['phase'], r['reason']) for r in results(executor)])

    def test_a_repeated_command_id_creates_no_second_goal(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        executor.handle(goto(), STREAM)
        navigator.on_result('SUCCEEDED')
        executor.handle(goto(), STREAM)
        self.assertEqual(1, len(navigator.goals))

    def test_nav2_refusal_is_rejected_and_frees_the_robot(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        navigator.on_response(False, 'NAV2_UNAVAILABLE')
        self.assertEqual([('REJECTED', 'NAV2_UNAVAILABLE')], [(r['phase'], r['reason']) for r in results(executor)])
        self.assertEqual('IDLE', executor.snapshot()['status'])

    def test_cancel_stops_the_right_goal_and_is_idempotent(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        navigator.on_response(True, None)
        cancel = CancelCommand('9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a502', goto().leg_id)
        executor.handle(cancel, STREAM)
        executor.handle(cancel, STREAM)
        self.assertEqual(1, navigator.cancels)
        navigator.on_result('CANCELED')
        phases = [(r['commandId'], r['phase'], r['outcome']) for r in results(executor)]
        self.assertEqual([(goto().command_id, 'ACCEPTED', None), (cancel.command_id, 'ACCEPTED', None),
                          (goto().command_id, 'TERMINAL', 'CANCELLED')], phases)

    def test_arrival_beats_cancel(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        executor.handle(CancelCommand('9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a502', goto().leg_id), STREAM)
        navigator.on_result('SUCCEEDED')
        self.assertEqual('ARRIVED', results(executor)[-1]['outcome'])

    def test_cancel_for_a_leg_that_is_not_running_is_rejected(self):
        executor, navigator = make()
        executor.handle(CancelCommand('9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a502', goto().leg_id), STREAM)
        self.assertEqual(0, navigator.cancels)
        self.assertEqual([('REJECTED', 'UNKNOWN_LEG')], [(r['phase'], r['reason']) for r in results(executor)])

    def test_an_unrequested_cancel_is_a_failure_never_cancelled(self):
        self.assertEqual(('FAILED', 'NAV2_CANCELED'), outcome_from_nav2('CANCELED', False))
        self.assertEqual(('CANCELLED', None), outcome_from_nav2('CANCELED', True))
        self.assertEqual(('FAILED', 'NAV2_ABORTED'), outcome_from_nav2('ABORTED', True))

    def test_a_late_callback_for_an_old_leg_changes_nothing(self):
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        stale = navigator.on_result
        stale('SUCCEEDED')
        results(executor)
        executor.handle(goto(leg='11111111-1111-4111-8111-111111111111', command='22222222-2222-4222-8222-222222222222'), STREAM)
        stale('ABORTED')
        self.assertEqual([], results(executor))
        self.assertEqual('NAVIGATING', executor.snapshot()['status'])

    def test_a_full_buffer_keeps_terminals_and_refuses_new_work(self):
        executor, navigator = make(max_results=2)
        for index in range(2):
            executor.handle(goto(leg=f'{index}1111111-1111-4111-8111-111111111111', command=f'{index}2222222-2222-4222-8222-222222222222'), STREAM)
            navigator.on_response(True, None)
            navigator.on_result('SUCCEEDED')
        kept = []
        while (item := executor.next_result()) is not None:
            kept.append(item.phase)
            executor.acknowledge(item)
        # The full buffer refused the second GoTo; the first leg's ACCEPTED made room, its TERMINAL did not.
        self.assertEqual(['TERMINAL', 'REJECTED'], kept)

        executor, navigator = make(max_results=1)
        executor.handle(goto(), STREAM)
        navigator.on_result('SUCCEEDED')
        executor.handle(goto(leg='11111111-1111-4111-8111-111111111111', command='22222222-2222-4222-8222-222222222222'), STREAM)
        self.assertEqual(1, len(navigator.goals))

    def test_a_restart_remembers_nothing_and_runs_nothing(self):
        first, navigator = make()
        first.handle(goto(), STREAM)
        restarted, new_navigator = make()
        self.assertEqual([], new_navigator.goals)
        self.assertEqual(0, new_navigator.cancels)
        self.assertEqual('IDLE', restarted.snapshot()['status'])
        self.assertIsNone(restarted.next_result())


class ScriptedTransport:
    def __init__(self, polls=(), results=()):
        self.polls = list(polls)
        self.result_replies = list(results)
        self.posted = []

    def poll(self, body):
        self.last_poll = json.loads(body)
        reply = self.polls.pop(0) if self.polls else HttpResponse(200, fixture('poll-response-empty.json'))
        if isinstance(reply, Exception):
            raise reply
        return reply

    def post_result(self, command_id, body):
        self.posted.append((command_id, body))
        reply = self.result_replies.pop(0) if self.result_replies else HttpResponse(200, {'success': True})
        if isinstance(reply, Exception):
            raise reply
        return reply


class WorkerTests(unittest.TestCase):
    def worker(self, transport):
        executor, navigator = make()
        return FleetCommandWorker(CommandWorkerConfig(), executor, transport, lambda: STREAM), executor, navigator

    def test_a_terminal_result_is_retried_byte_for_byte_until_acknowledged(self):
        transport = ScriptedTransport(results=[TransportFailure('URLError'), HttpResponse(503, {'errors': {'code': 'COMMAND_TRANSPORT_DISABLED'}}),
                                               HttpResponse(401, None), HttpResponse(200, {'success': True})])
        worker, executor, navigator = self.worker(transport)
        executor.handle(goto(), STREAM)
        navigator.on_result('SUCCEEDED')
        for healthy in (False, False, False, True):
            self.assertEqual(healthy, worker.run_once())
        self.assertEqual(4, len(transport.posted))
        self.assertEqual(1, len({body for _, body in transport.posted}))
        self.assertIsNone(executor.next_result())

    def test_a_definitive_rejection_drops_the_result(self):
        for status, code in ((400, None), (404, 'COMMAND_NOT_FOUND'), (409, 'RESULT_CONFLICT')):
            transport = ScriptedTransport(results=[HttpResponse(status, {'errors': {'code': code}})])
            worker, executor, navigator = self.worker(transport)
            executor.handle(goto(), STREAM)
            navigator.on_result('SUCCEEDED')
            worker.run_once()
            self.assertIsNone(executor.next_result(), status)

    def test_poll_uses_the_telemetry_stream_and_a_refusal_runs_nothing(self):
        transport = ScriptedTransport(polls=[HttpResponse(409, {'errors': {'code': 'STREAM_NOT_CURRENT'}})])
        worker, _, navigator = self.worker(transport)
        self.assertTrue(worker.run_once())
        self.assertEqual({'streamId': STREAM}, transport.last_poll)
        self.assertEqual([], navigator.goals)

    def test_a_malformed_command_runs_nothing(self):
        worker, _, navigator = self.worker(ScriptedTransport(polls=[HttpResponse(200, {'data': {'command': {'kind': 'GoTo'}}})]))
        self.assertFalse(worker.run_once())
        self.assertEqual([], navigator.goals)

    def test_results_are_sent_before_new_work_is_taken(self):
        order = []

        class Recording(ScriptedTransport):
            def poll(self, body):
                order.append('poll')
                return super().poll(body)

            def post_result(self, command_id, body):
                order.append('result')
                return super().post_result(command_id, body)

        worker, executor, navigator = self.worker(Recording())
        executor.handle(goto(), STREAM)
        navigator.on_result('SUCCEEDED')
        worker.run_once()
        self.assertEqual(['result', 'poll'], order)

    def test_a_failing_result_post_does_not_keep_a_cancel_away(self):
        for failure in (TransportFailure('URLError'), OSError('reset'), HttpResponse(500, None),
                        HttpResponse(503, {'errors': {'code': 'COMMAND_TRANSPORT_DISABLED'}})):
            transport = ScriptedTransport(polls=[HttpResponse(200, fixture('poll-response-cancel.json'))], results=[failure])
            worker, executor, navigator = self.worker(transport)
            executor.handle(goto(), STREAM)
            navigator.on_response(True, None)  # the ACCEPTED result is the one that cannot be posted
            self.assertFalse(worker.run_once(), failure)
            self.assertEqual(1, len(transport.posted), failure)
            self.assertEqual({'streamId': STREAM}, transport.last_poll, failure)
            self.assertEqual(1, navigator.cancels, failure)
            pending = results(executor)
            self.assertEqual([(goto().command_id, 'ACCEPTED'), ('9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a502', 'ACCEPTED')],
                             [(r['commandId'], r['phase']) for r in pending], failure)

    def test_a_failing_result_post_still_refuses_a_new_goto_while_busy(self):
        other = fixture('poll-response-goto.json')
        other['data']['command'].update(commandId='22222222-2222-4222-8222-222222222222', legId='11111111-1111-4111-8111-111111111111')
        transport = ScriptedTransport(polls=[HttpResponse(200, other)], results=[HttpResponse(502, None)])
        worker, executor, navigator = self.worker(transport)
        executor.handle(goto(), STREAM)
        navigator.on_response(True, None)
        self.assertFalse(worker.run_once())
        self.assertEqual(1, len(navigator.goals))
        self.assertEqual(0, navigator.cancels)
        self.assertEqual([('ACCEPTED', None), ('REJECTED', 'BUSY')], [(r['phase'], r['reason']) for r in results(executor)])

    def test_health_needs_both_the_results_and_the_poll(self):
        worker, executor, navigator = self.worker(ScriptedTransport(results=[TransportFailure('URLError')]))
        executor.handle(goto(), STREAM)
        navigator.on_response(True, None)
        self.assertFalse(worker.run_once())  # poll answered, results did not
        self.assertTrue(worker.run_once())   # the result went through on the next round
        worker, _, _ = self.worker(ScriptedTransport(polls=[TransportFailure('URLError')]))
        self.assertFalse(worker.run_once())  # nothing to flush, poll failed

    def test_disabled_builds_nothing_and_touches_no_transport(self):
        def forbidden():
            raise AssertionError('commands_enabled=false must not build the command path')
        self.assertIsNone(create_command_path(False, forbidden, forbidden, CommandWorkerConfig(), MAP, 'map', forbidden))


class ProtocolTests(unittest.TestCase):
    def test_reports_carry_navigating_with_its_leg_and_stay_unchanged_without_one(self):
        leg = goto().leg_id
        report = build_report('robot_01', STREAM, 1, NOW, MAP, 'map', None, 'NAVIGATING', leg)
        self.assertEqual(('NAVIGATING', leg), (report['status'], report['legId']))
        self.assertIsNone(build_report('robot_01', STREAM, 1, NOW, MAP, 'map', None, 'UNKNOWN')['legId'])
        with self.assertRaises(ValueError):
            build_report('robot_01', STREAM, 1, NOW, MAP, 'map', None, 'NAVIGATING')

    def test_command_url_is_the_sibling_of_the_sync_url(self):
        self.assertEqual('https://api.example.test/api/fleet/commands/v1',
                         commands_url_from_sync_url('https://api.example.test/api/fleet/v1/sync'))
        with self.assertRaises(ValueError):
            commands_url_from_sync_url('https://api.example.test/other')


class StubBackendTests(unittest.TestCase):
    """The real HTTP client and worker against the fake backend, with a fake Nav2."""

    def setUp(self):
        self.state = StubState('robot_01', 'test-credential', MAP)
        self.server = serve(self.state)
        self.addCleanup(self.server.shutdown)
        base = f'http://127.0.0.1:{self.server.server_port}'
        FleetSyncHttpClient(f'{base}/api/fleet/v1/sync', 'robot_01', 'test-credential').post(json.dumps({'streamId': STREAM}))
        self.navigator = FakeNavigator()
        self.executor = CommandExecutor(MAP, 'map', self.navigator)
        self.transport = FleetCommandsHttpClient(f'{base}/api/fleet/commands/v1', 'robot_01', 'test-credential')
        self.worker = FleetCommandWorker(CommandWorkerConfig(), self.executor, self.transport, lambda: STREAM)

    def test_goto_runs_to_arrived_and_a_repeated_poll_changes_nothing(self):
        command = self.state.add_goto(1.0, 2.0, 0.0)
        self.assertTrue(self.worker.run_once())
        self.assertTrue(self.worker.run_once())
        self.assertEqual(1, len(self.navigator.goals))
        self.navigator.on_response(True, None)
        self.navigator.on_result('SUCCEEDED')
        self.assertTrue(self.worker.run_once())
        self.assertEqual([('ACCEPTED', None), ('TERMINAL', 'ARRIVED')],
                         [(r['phase'], r['outcome']) for r in self.state.results_for(command['commandId'])])

    def test_goto_then_cancel_mid_way_ends_cancelled(self):
        command = self.state.add_goto(1.0, 2.0, 0.0)
        self.worker.run_once()
        self.navigator.on_response(True, None)
        self.worker.run_once()
        cancel = self.state.add_cancel(command['legId'])
        self.worker.run_once()
        self.assertEqual(1, self.navigator.cancels)
        self.navigator.on_result('CANCELED')
        self.worker.run_once()
        self.assertEqual('ACCEPTED', self.state.results_for(cancel['commandId'])[0]['phase'])
        self.assertEqual('CANCELLED', self.state.results_for(command['commandId'])[-1]['outcome'])

    def test_wrong_credentials_are_refused_and_run_nothing(self):
        self.state.add_goto(1.0, 2.0, 0.0)
        wrong = FleetCommandsHttpClient(self.transport.url, 'robot_01', 'wrong')
        worker = FleetCommandWorker(CommandWorkerConfig(), self.executor, wrong, lambda: STREAM)
        self.assertFalse(worker.run_once())
        self.assertEqual([], self.navigator.goals)

    def test_a_stale_stream_gets_nothing(self):
        self.state.add_goto(1.0, 2.0, 0.0)
        worker = FleetCommandWorker(CommandWorkerConfig(), self.executor, self.transport, lambda: '11111111-1111-4111-8111-111111111111')
        worker.run_once()
        self.assertEqual([], self.navigator.goals)

    def test_the_worker_thread_stops_cleanly(self):
        stop = threading.Event()
        worker = FleetCommandWorker(CommandWorkerConfig(poll_period_sec=0.01), self.executor, self.transport, lambda: STREAM, stop_event=stop)
        worker.start()
        worker.stop(join_timeout_sec=2.0)
        self.assertFalse(worker._thread.is_alive())


if __name__ == '__main__':
    unittest.main()
