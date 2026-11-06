import http.client
import json
import re
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fleet_bridge.http_client import HttpResponse, TransportFailure
from fleet_bridge.lifecycle import spin_until_worker_fatal
from fleet_bridge.worker import (
    FleetSyncWorker,
    ReportState,
    WorkerConfig,
    retry_delay,
)

NOW = datetime(2026, 10, 23, 12, 0, 0, tzinfo=timezone.utc)
STREAM_ID = '90eb5a67-dfea-48b0-aea1-ef3ed6d98695'


def make_state(*, max_age=30.0, max_repairs=8, max_clock_floor_ahead=10.0):
    config = WorkerConfig(
        'robot_01', 'campus-floor-a-v1', 'map',
        report_period_sec=2.0, max_report_age_sec=max_age,
        max_clock_floor_ahead_sec=max_clock_floor_ahead,
        retry_initial_sec=1.0, retry_max_sec=8.0,
        max_ordering_conflicts=3, max_validation_repairs=max_repairs,
    )
    return ReportState(config, STREAM_ID)


def accepted(duplicate=False):
    return HttpResponse(200, {
        'success': True,
        'data': {'accepted': True, 'duplicate': duplicate, 'commands': []},
    })


def error(status, code, message=None):
    body = {'success': False, 'errors': {'code': code}}
    if message is not None:
        body['message'] = message
    return HttpResponse(status, body)


class MockFleetSyncApi:
    """Small ordering/freshness model used to test client recovery sequences."""

    def __init__(self, now=NOW):
        self.now = now
        self.latest = None
        self.retired = set()
        self.bodies = []
        self.lose_next_response = False

    def post(self, body):
        self.bodies.append(body)
        incoming = json.loads(body)
        reported_at = datetime.fromisoformat(incoming['reportedAt'].replace('Z', '+00:00'))
        if reported_at < self.now - timedelta(seconds=30) or reported_at > self.now + timedelta(seconds=5):
            return HttpResponse(400, {
                'success': False,
                'errors': {'reportedAt': ['reportedAt must be UTC and within the configured report freshness window.']},
            })

        latest = self.latest
        duplicate = False
        if latest is None:
            self.latest = incoming
        elif incoming['streamId'] == latest['streamId']:
            if incoming['seq'] < latest['seq']:
                return error(409, 'OUT_OF_ORDER')
            if incoming['seq'] == latest['seq']:
                if incoming != latest:
                    return error(409, 'SEQUENCE_REUSED')
                duplicate = True
            elif reported_at < datetime.fromisoformat(latest['reportedAt'].replace('Z', '+00:00')):
                return error(409, 'OUT_OF_ORDER')
            else:
                self.latest = incoming
        else:
            if incoming['streamId'] in self.retired:
                return error(409, 'STALE_STREAM')
            if incoming['seq'] != 1:
                return error(409, 'STREAM_START_REQUIRED')
            latest_time = datetime.fromisoformat(latest['reportedAt'].replace('Z', '+00:00'))
            if reported_at < latest_time:
                return error(
                    409,
                    'STALE_STREAM',
                    'A restarted stream must report a timestamp at least as new as the current stream.',
                )
            self.retired.add(latest['streamId'])
            self.latest = incoming

        if self.lose_next_response:
            self.lose_next_response = False
            raise TransportFailure('ConnectionResetError')
        return accepted(duplicate)


class FleetSyncWorkerStateTests(unittest.TestCase):
    def test_uncertain_request_retries_identical_body_until_duplicate_ack(self):
        state = make_state()
        backend = MockFleetSyncApi()
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 10.0)
        backend.lose_next_response = True
        with self.assertRaises(TransportFailure):
            backend.post(first)
        state.handle_transport_failure(TransportFailure('TimeoutError'))
        retried = state.prepare({'pose': {'x': 9.0}, 'status': 'IDLE'}, NOW, 15.0)
        self.assertEqual(first, retried)
        duplicate = backend.post(retried)
        self.assertTrue(duplicate.body['data']['duplicate'])
        self.assertEqual('acknowledged', state.handle_response(duplicate, 15.1).action)
        self.assertEqual(2, len(backend.bodies))
        self.assertEqual(backend.bodies[0], backend.bodies[1])

    def test_wifi_absent_at_startup_expiry_keeps_first_sequence_for_new_stream(self):
        state = make_state(max_age=5.0)
        backend = MockFleetSyncApi(now=NOW + timedelta(seconds=6))
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        first_stream = json.loads(first)['streamId']

        for monotonic_now in (1.0, 2.0, 3.0, 4.0):
            self.assertEqual('retry', state.handle_transport_failure(
                TransportFailure('URLError')).action)
            self.assertEqual(first, state.prepare(
                {'pose': {'x': 1.0}, 'status': 'UNKNOWN'}, NOW, monotonic_now))

        state.expire_pending()
        recovered = json.loads(state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=6), 5.0))
        self.assertNotEqual(first_stream, recovered['streamId'])
        self.assertEqual(1, recovered['seq'])
        self.assertEqual('acknowledged', state.handle_response(
            backend.post(state.pending_body), 5.1).action)
        self.assertEqual(2, state.next_seq)

    def test_uncertain_expired_report_rotates_stream_when_backend_may_have_saved_it(self):
        state = make_state(max_age=5.0)
        backend = MockFleetSyncApi(now=NOW + timedelta(seconds=6))
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        backend.lose_next_response = True
        with self.assertRaises(TransportFailure):
            backend.post(first)
        state.handle_transport_failure(TransportFailure('TimeoutError'))
        rotation_reason = state.expire_pending()
        self.assertIn('STREAM_ROTATED cause=uncertain_report_expired', rotation_reason)
        self.assertIn(f'old_stream_id={json.loads(first)["streamId"]}', rotation_reason)
        self.assertIn(f'new_stream_id={state.stream_id}', rotation_reason)
        self.assertIn('old_seq=1', rotation_reason)
        self.assertIn('new_seq=1', rotation_reason)

        fresh = state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=6), 5.0)
        report = json.loads(fresh)
        self.assertNotEqual(json.loads(first)['streamId'], report['streamId'])
        self.assertEqual(1, report['seq'])
        self.assertEqual('acknowledged', state.handle_response(backend.post(fresh), 5.1).action)
        self.assertEqual(report['streamId'], backend.latest['streamId'])

    def test_lost_ack_then_expired_duplicate_400_never_reuses_changed_sequence(self):
        state = make_state(max_age=30.0)
        backend = MockFleetSyncApi()
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        backend.lose_next_response = True
        with self.assertRaises(TransportFailure):
            backend.post(first)  # The API stored it before the response was lost.
        state.handle_transport_failure(TransportFailure('ReadTimeout'))

        backend.now = NOW + timedelta(seconds=31)
        rejected_retry = backend.post(state.pending_body)
        self.assertEqual(400, rejected_retry.status)  # Freshness is checked before duplicate lookup.
        outcome = state.handle_response(rejected_retry, 31.0)
        self.assertEqual('repair', outcome.action)
        fresh = state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=31), 31.1)
        fresh_report = json.loads(fresh)
        self.assertNotEqual(json.loads(first)['streamId'], fresh_report['streamId'])
        self.assertEqual(1, fresh_report['seq'])
        self.assertEqual('acknowledged', state.handle_response(backend.post(fresh), 31.2).action)
        self.assertEqual(fresh_report['streamId'], backend.latest['streamId'])

    def test_definite_400_can_rebuild_same_sequence_without_sequence_reuse(self):
        state = make_state()
        backend = MockFleetSyncApi(now=NOW)
        invalid_time = NOW + timedelta(minutes=2)
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, invalid_time, 0.0)
        rejected = backend.post(first)
        outcome = state.handle_response(rejected, 0.1)
        repaired = state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=1), 1.0)

        self.assertEqual('repair', outcome.action)
        self.assertEqual(1, json.loads(first)['seq'])
        self.assertEqual(1, json.loads(repaired)['seq'])
        self.assertEqual(json.loads(first)['streamId'], json.loads(repaired)['streamId'])
        self.assertNotEqual(first, repaired)
        self.assertEqual('acknowledged', state.handle_response(backend.post(repaired), 1.1).action)

    def test_uncertain_then_400_rotates_stream_before_rebuilding_body(self):
        state = make_state()
        original = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        state.mark_uncertain()
        outcome = state.handle_response(error(400, 'VALIDATION_ERROR'), 1.0)
        rebuilt = json.loads(state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=1), 1.1))

        self.assertEqual('repair', outcome.action)
        self.assertNotEqual(json.loads(original)['streamId'], rebuilt['streamId'])
        self.assertEqual(1, rebuilt['seq'])
        self.assertEqual(NOW, state.timestamp_floor)

    def test_uncertain_400_after_ack_skips_sequence_without_rotating_stream(self):
        state = make_state()
        state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        self.assertEqual('acknowledged', state.handle_response(accepted(), 0.1).action)
        acknowledged_stream = state.stream_id
        second_body = state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=1), 1.0)
        self.assertEqual(2, json.loads(second_body)['seq'])
        state.mark_uncertain()

        outcome = state.handle_response(error(400, 'VALIDATION_ERROR'), 1.1)
        next_report = json.loads(state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=2), 1.2))

        self.assertEqual('repair', outcome.action)
        self.assertIn('UNCERTAIN_REPORT_SKIPPED cause=uncertain_400_rejection', outcome.reason)
        self.assertEqual(acknowledged_stream, state.stream_id)
        self.assertEqual(3, next_report['seq'])
        self.assertEqual(acknowledged_stream, next_report['streamId'])
        self.assertEqual(NOW + timedelta(seconds=1), state.timestamp_floor)

    def test_expired_uncertain_report_after_ack_skips_sequence_without_stream_rotation(self):
        state = make_state(max_age=5.0)
        state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        state.handle_response(accepted(), 0.1)
        stream_id = state.stream_id
        state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=1), 1.0)
        state.mark_uncertain()

        reason = state.expire_pending()
        next_report = json.loads(state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=6), 5.0))

        self.assertIn('UNCERTAIN_REPORT_SKIPPED cause=uncertain_report_expired', reason)
        self.assertEqual(stream_id, state.stream_id)
        self.assertEqual(3, next_report['seq'])
        self.assertEqual(stream_id, next_report['streamId'])

    def test_http_200_empty_or_malformed_body_is_uncertain_and_retryable(self):
        state = make_state()
        body = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        for response in (HttpResponse(200, None), HttpResponse(200, {'success': 'true'})):
            with self.subTest(response=response):
                outcome = state.handle_response(response, 0.1)
                self.assertEqual('retry', outcome.action)
                self.assertTrue(state.pending_may_have_been_accepted)
                self.assertEqual(body, state.prepare(
                    {'pose': {'x': 2.0}, 'status': 'IDLE'}, NOW, 1.0))
        self.assertEqual('acknowledged', state.handle_response(accepted(duplicate=True), 1.1).action)

    def test_http_exception_and_timeout_sequences_do_not_kill_worker(self):
        bodies = []
        attempts = [http.client.BadStatusLine('bad status'), TimeoutError('slow'), accepted()]
        wait_calls = 0

        class Transport:
            def post(self, body):
                bodies.append(body)
                result = attempts.pop(0)
                if isinstance(result, Exception):
                    raise result
                return result

        def wait(_delay):
            nonlocal wait_calls
            wait_calls += 1
            return wait_calls >= 3

        worker = FleetSyncWorker(
            make_state(), Transport(), lambda: {'pose': None, 'status': 'UNKNOWN'},
            wait=wait, wall_clock=lambda: NOW, monotonic_clock=lambda: 1.0,
            random_source=lambda: 0.5,
        )
        worker.run()

        self.assertFalse(worker.fatal_event.is_set())
        self.assertEqual(3, len(bodies))
        self.assertEqual(bodies[0], bodies[1])
        self.assertEqual(bodies[1], bodies[2])
        self.assertGreaterEqual(wait_calls, 3)

    def test_backend_restart_preserves_running_stream_and_sequence(self):
        state = make_state()
        backend = MockFleetSyncApi()
        report1 = json.loads(state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 1.0))
        self.assertEqual('acknowledged', state.handle_response(backend.post(
            json.dumps(report1, separators=(',', ':'))), 1.1).action)
        state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=2), 3.2)
        self.assertEqual('acknowledged', state.handle_response(backend.post(
            state.pending_body), 3.3).action)
        self.assertEqual(3, state.next_seq)

        backend.latest = None  # API process restart clears its in-memory ordering history.
        report_after_restart = json.loads(state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=4), 5.0))
        self.assertEqual(report1['streamId'], report_after_restart['streamId'])
        self.assertEqual(3, report_after_restart['seq'])
        self.assertEqual('acknowledged', state.handle_response(
            backend.post(state.pending_body), 5.1).action)

    def test_bridge_restart_uses_new_stream_at_one_against_existing_backend(self):
        backend = MockFleetSyncApi()
        backend.latest = {
            **json.loads(make_state().prepare(
                {'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)),
            'seq': 7,
        }
        restarted = ReportState(make_state().config)
        body = restarted.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=1), 1.0)
        report = json.loads(body)

        self.assertEqual(1, report['seq'])
        self.assertNotEqual(backend.latest['streamId'], report['streamId'])
        self.assertEqual('acknowledged', restarted.handle_response(backend.post(body), 1.1).action)

    def test_clock_correction_after_timestamp_validation_recovers_same_sequence(self):
        backend = MockFleetSyncApi(now=NOW)
        bodies = []
        wall_values = iter((NOW + timedelta(minutes=2), NOW, NOW))
        wait_calls = 0
        delays = []

        class Transport:
            def post(self, body):
                bodies.append(body)
                return backend.post(body)

        def wait(delay):
            nonlocal wait_calls
            wait_calls += 1
            delays.append(delay)
            return wait_calls > 1

        worker = FleetSyncWorker(
            make_state(), Transport(), lambda: {'pose': None, 'status': 'UNKNOWN'},
            wall_clock=lambda: next(wall_values), monotonic_clock=lambda: 1.0,
            wait=wait, random_source=lambda: 0.5,
        )
        worker.run()

        self.assertEqual(2, len(bodies))
        first, repaired = map(json.loads, bodies)
        self.assertEqual(first['streamId'], repaired['streamId'])
        self.assertEqual(1, first['seq'])
        self.assertEqual(1, repaired['seq'])
        self.assertNotEqual(first['reportedAt'], repaired['reportedAt'])
        self.assertEqual(1.0, delays[0])
        self.assertFalse(worker.fatal_event.is_set())

    def test_one_hour_clock_step_then_ntp_correction_exits_on_future_timestamp_floor(self):
        state = make_state(max_age=5.0, max_clock_floor_ahead=10.0)
        wall_values = iter((NOW + timedelta(hours=1), NOW))
        monotonic_now = [0.0]
        posted_bodies = []
        worker_events = []

        class LostResponseTransport:
            def post(self, body):
                posted_bodies.append(body)
                raise TransportFailure('ConnectionResetError')

        def wait(_delay):
            # Let the uncertain report exceed its freshness window before the
            # corrected system clock is sampled again.
            monotonic_now[0] = 5.1
            return False

        worker = FleetSyncWorker(
            state,
            LostResponseTransport(),
            lambda: {'pose': None, 'status': 'UNKNOWN'},
            on_state=lambda current, reason: worker_events.append((current, reason)),
            wall_clock=lambda: next(wall_values),
            monotonic_clock=lambda: monotonic_now[0],
            wait=wait,
            random_source=lambda: 0.5,
        )
        worker.run()

        self.assertEqual(1, len(posted_bodies))
        self.assertEqual(NOW + timedelta(hours=1), state.timestamp_floor)
        self.assertTrue(worker.fatal_event.is_set())
        self.assertIn('CLOCK_STEP_BACKWARD', worker.fatal_reason)
        self.assertIn('floor_ahead_sec=3600.0 limit_sec=10.0', worker.fatal_reason)
        self.assertTrue(any(
            current == 'retrying' and 'STREAM_ROTATED cause=uncertain_report_expired' in reason
            for current, reason in worker_events
        ))
        self.assertTrue(any(current == 'fatal' for current, _reason in worker_events))

        class Executor:
            def spin_once(self, timeout_sec):
                raise AssertionError('fatal worker should not spin ROS callbacks again')

        self.assertEqual(1, spin_until_worker_fatal(Executor(), worker.fatal_event, lambda: True))

    def test_clock_behind_backend_recovers_new_stream_without_minting_another_id(self):
        backend = MockFleetSyncApi(now=NOW + timedelta(seconds=11))
        old_report = json.loads(make_state().prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=10), 0.0))
        backend.latest = old_report
        state = ReportState(make_state().config)
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 1.0)
        rejected = backend.post(first)

        self.assertEqual('STALE_STREAM', rejected.body['errors']['code'])
        self.assertEqual('repair', state.handle_response(rejected, 1.1).action)
        corrected = state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=11), 2.0)
        self.assertEqual(json.loads(first)['streamId'], json.loads(corrected)['streamId'])
        self.assertEqual(1, json.loads(corrected)['seq'])
        self.assertEqual('acknowledged', state.handle_response(backend.post(corrected), 2.1).action)

    def test_validation_repair_budget_is_finite_and_delayed(self):
        state = make_state()
        delays = []
        for attempt in range(8):
            state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=attempt), float(attempt))
            outcome = state.handle_response(HttpResponse(400, {
                'success': False, 'errors': {'pose': ['pose.capturedAt is invalid']},
            }), float(attempt) + 0.1)
            self.assertEqual('fatal' if attempt == 7 else 'repair', outcome.action)
            delays.append(retry_delay(state.config, attempt + 1, None, lambda: 0.5))
        self.assertEqual([1.0, 2.0, 4.0, 8.0, 8.0, 8.0, 8.0, 8.0], delays)
        self.assertEqual(1, state.next_seq)

    def test_ordering_conflict_before_first_ack_does_not_skip_stream_start(self):
        state = make_state()
        state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        outcome = state.handle_response(error(409, 'OUT_OF_ORDER'), 0.1)
        self.assertEqual('fatal', outcome.action)
        self.assertEqual(1, state.next_seq)

    def test_ordering_conflict_after_ack_drops_report_and_uses_higher_sequence(self):
        state = make_state()
        state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        state.handle_response(accepted(), 0.1)
        first = json.loads(state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 1.0))
        outcome = state.handle_response(error(409, 'OUT_OF_ORDER'), 1.1)
        next_body = json.loads(state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 2.0))
        self.assertEqual('dropped', outcome.action)
        self.assertEqual(2, first['seq'])
        self.assertEqual(3, next_body['seq'])
        self.assertEqual(STREAM_ID, next_body['streamId'])

    def test_permanent_contract_errors_stop_instead_of_retrying(self):
        cases = [
            (401, 'UNAUTHORIZED'),
            (409, 'SEQUENCE_REUSED'),
            (409, 'STREAM_START_REQUIRED'),
            (409, 'STALE_STREAM'),
            (409, 'MAP_CONTEXT_MISMATCH'),
            (413, 'PAYLOAD_TOO_LARGE'),
            (503, 'MAP_CONTEXT_UNCONFIGURED'),
        ]
        for status, code in cases:
            with self.subTest(status=status, code=code):
                state = make_state()
                state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
                self.assertEqual('fatal', state.handle_response(error(status, code), 0.1).action)
                self.assertEqual(1, state.next_seq)

    def test_rate_limit_is_known_non_storage_and_retries_same_body(self):
        state = make_state()
        body = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)

        self.assertEqual('retry', state.handle_response(HttpResponse(429, {}, '4'), 0.1).action)
        self.assertFalse(state.pending_may_have_been_accepted)
        self.assertEqual(body, state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 1.0))
        self.assertEqual('retry', state.handle_response(HttpResponse(503, None), 0.2).action)
        self.assertTrue(state.pending_may_have_been_accepted)
        self.assertEqual(body, state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 2.0))

    def test_expired_known_rejection_rebuilds_same_sequence(self):
        state = make_state(max_age=5.0)
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        state.handle_response(HttpResponse(429, {}, '10'), 0.1)
        state.expire_pending()
        repaired = json.loads(state.prepare(
            {'pose': None, 'status': 'UNKNOWN'}, NOW + timedelta(seconds=6), 5.0))
        self.assertEqual(json.loads(first)['streamId'], repaired['streamId'])
        self.assertEqual(1, repaired['seq'])
        self.assertNotEqual(first, state.pending_body)

    def test_timestamps_never_move_back_after_possibly_accepted_content(self):
        state = make_state(max_age=2.0)
        first = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        state.mark_uncertain()
        state.expire_pending()
        with self.assertRaisesRegex(Exception, 'CLOCK_BEHIND_FLOOR'):
            state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW - timedelta(seconds=1), 3.0)
        self.assertEqual(NOW, state.timestamp_floor)
        self.assertEqual(1, json.loads(first)['seq'])

    def test_only_one_report_body_is_retained_for_unbounded_transport_retries(self):
        state = make_state()
        body = state.prepare({'pose': None, 'status': 'UNKNOWN'}, NOW, 0.0)
        for i in range(1000):
            self.assertEqual('retry', state.handle_transport_failure(
                TransportFailure('URLError')).action)
            self.assertEqual(body, state.prepare(
                {'pose': None, 'status': 'UNKNOWN'}, NOW, float(i)))
        self.assertEqual(body, state.pending_body)
        self.assertEqual(1, state.next_seq)

    def test_retry_delay_is_exponential_jittered_and_bounded(self):
        config = make_state().config
        self.assertEqual(1.0, retry_delay(config, 1, None, lambda: 0.5))
        self.assertEqual(8.0, retry_delay(config, 10, '100', lambda: 0.5))
        self.assertEqual(2.0, retry_delay(config, 1, '2', lambda: 0.0))
        self.assertEqual(2.0, retry_delay(config, 1, '2', lambda: 1.0))
        self.assertEqual(2.5, retry_delay(config, 1, '2.5', lambda: 0.0))

    def test_ros_executor_stops_with_nonzero_when_worker_is_fatal(self):
        fatal_event = threading.Event()

        class Executor:
            def spin_once(self, timeout_sec):
                self.timeout = timeout_sec
                fatal_event.set()

        result = spin_until_worker_fatal(Executor(), fatal_event, lambda: True)
        self.assertEqual(1, result)

    def test_unexpected_worker_exception_is_visible_to_process_lifecycle(self):
        worker = FleetSyncWorker(
            make_state(), object(), lambda: (_ for _ in ()).throw(RuntimeError('internal')))
        worker.run()
        self.assertTrue(worker.fatal_event.is_set())
        self.assertEqual('RuntimeError', worker.fatal_reason)

    def test_http_wait_runs_on_worker_thread_while_caller_remains_responsive(self):
        entered = threading.Event()
        release = threading.Event()
        transport_threads = []

        class BlockingTransport:
            def post(self, body):
                transport_threads.append(threading.current_thread().name)
                entered.set()
                release.wait(2.0)
                return accepted()

        worker = FleetSyncWorker(
            make_state(), BlockingTransport(),
            lambda: {'pose': None, 'status': 'UNKNOWN'},
        )
        worker.start()
        self.assertTrue(entered.wait(1.0))
        caller_thread = threading.current_thread().name
        release.set()
        worker.stop()

        self.assertNotEqual(transport_threads[0], caller_thread)
        self.assertEqual('fleet-sync-https', transport_threads[0])

    def test_navigation_stays_opt_in_and_no_module_publishes_velocity(self):
        package_dir = Path(__file__).resolve().parents[1] / 'fleet_bridge'
        node_source = (package_dir / 'node.py').read_text(encoding='utf-8')
        # The default path infers no execution state and has no action surface of its own.
        self.assertIn("'status': 'UNKNOWN'", node_source)
        self.assertNotIn('GoalStatus', node_source)
        self.assertNotIn('ActionClient', node_source)
        # Nav2 is reached only through the lazily imported adapter, and only there.
        self.assertNotIn('\nfrom .nav2', node_source)
        self.assertIn('            from .nav2 import Nav2Navigator', node_source)
        # The opt-in head adapter (ADR-0045) is imported lazily, like Nav2.
        self.assertNotIn('\nfrom .head_ros', node_source)
        self.assertIn('            from .head_ros import create_ros_head', node_source)
        for module in package_dir.glob('*.py'):
            source = module.read_text(encoding='utf-8')
            if module.name == 'head_ros.py':
                # Its only publishers are the stm32_bridge head topics and its only action is head/set: never motion.
                self.assertEqual(['head/jog', 'head/step'],
                                 sorted(re.findall(r"create_publisher\(\w+, '([^']+)'", source)))
                self.assertEqual(2, source.count('create_publisher'))
                self.assertEqual(['head/set'], re.findall(r"ActionClient\(node, \w+, '([^']+)'\)", source))
            else:
                self.assertNotIn('create_publisher', source, module.name)
            self.assertNotIn('cmd_vel', source, module.name)
            self.assertNotIn('cancel_all', source, module.name)
            if module.name not in ('nav2.py', 'head_ros.py'):
                self.assertNotIn('ActionClient', source, module.name)
        self.assertIn('spin_until_worker_fatal', node_source)
        self.assertNotIn('rclpy.spin(', node_source)


if __name__ == '__main__':
    unittest.main()
