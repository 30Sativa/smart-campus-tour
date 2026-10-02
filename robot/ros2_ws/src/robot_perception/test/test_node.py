"""Node-state regression tests using the lightweight ROS stubs from test_math."""
import sys
import threading
import time
import types
import unittest
from unittest import mock

import numpy as np

import test_math  # noqa: F401  # installs ROS interface stubs when ROS is absent
from robot_perception import person_perception_node as P


class Publisher:
    def __init__(self):
        self.messages = []

    def publish(self, message):
        self.messages.append(message)


class FakeTime:
    calls = []

    def __init__(self, *, seconds=0, nanoseconds=0):
        self.seconds = seconds
        self.nanoseconds = nanoseconds
        self.calls.append((seconds, nanoseconds))


class Harness:
    _on_pair = P.PersonPerceptionNode._on_pair
    _on_bbox_image = P.PersonPerceptionNode._on_bbox_image
    _count_input = P.PersonPerceptionNode._count_input
    _enqueue = P.PersonPerceptionNode._enqueue
    _consume = P.PersonPerceptionNode._consume
    _health_tick = P.PersonPerceptionNode._health_tick
    _policy_tick = P.PersonPerceptionNode._policy_tick
    _set_unknown = P.PersonPerceptionNode._set_unknown
    _publish_limit = P.PersonPerceptionNode._publish_limit
    _record_error = P.PersonPerceptionNode._record_error
    _tf = P.PersonPerceptionNode._tf
    _worker_loop = P.PersonPerceptionNode._worker_loop

    def _publish_diagnostics(self, percent=None):
        self.last_diagnostic_percent = percent

    def _publish_debug(self, *_args):
        self.debug_published = True

    def _publish_people(self, people, *_args):
        self.people_published = True
        self.published_people = list(people)

    def _locate(self, _snapshot, _boxes):
        return []


def stamp(seconds):
    whole = int(seconds)
    nanos = round((seconds - whole) * 1_000_000_000)
    if nanos == 1_000_000_000:
        whole += 1
        nanos = 0
    return types.SimpleNamespace(sec=whole, nanosec=nanos)


def message(seconds, *, cloud=False):
    header = types.SimpleNamespace(stamp=stamp(seconds), frame_id='camera_optical')
    if cloud:
        return types.SimpleNamespace(header=header)
    return types.SimpleNamespace(header=header, width=2, height=2)


image = message


def make_node(*, now=10.0, enabled=False, bbox_only=True):
    node = Harness()
    node._wake = threading.Condition(threading.Lock())
    node._pending = None
    node._result = None
    node._worker_busy = False
    node._stopping = False
    node._last_image_stamp = None
    node._last_cloud_stamp = None
    node._last_pair_stamp = None
    node._last_valid_mono = None
    node._last_obs_ros = None
    node._pending_policy = None
    node._counts = {'dropped': 0, 'duplicate': 0, 'errors': 0}
    node._input_counts = {'rgb_received': 0, 'cloud_received': 0, 'pairs_accepted': 0}
    node._input_group = None if bbox_only else P.SampledInputGroup()
    node.info = None
    node._latencies = []
    node._e2e_latencies = []
    node._fusion_latencies = P.deque(maxlen=100)
    node._observation_times = []
    node._bbox_count = 0
    node._valid_fusion_count = 0
    node._last_sync_delta = float('nan')
    node._last_source = ('unknown', 'unknown')
    node._status_reason = 'STARTUP'
    node._last_people = []
    node.config_error = None
    node.cfg = {'future_stamp_tolerance_s': 0.05, 'publish_speed_limit': enabled}
    node.stale = 1.0
    node.bbox_only = bbox_only
    node.policy = P.SlowdownPolicy()
    node.marker_pub = Publisher()
    node.limit_pub = Publisher() if enabled else None
    node.diag_pub = Publisher()
    node.people_pub = Publisher()
    node.base_frame = 'base_link'
    node._clock_now = now
    node.get_clock = lambda: types.SimpleNamespace(
        now=lambda: types.SimpleNamespace(
            nanoseconds=int(node._clock_now * 1e9),
            to_msg=lambda: stamp(node._clock_now)))
    node.tf_buffer = None
    node.net = None
    node.imgsz = 2
    node.conf = 0.45
    node.iou = 0.5
    node._inference_period = 0.0
    return node


def inference_result(image_s, cloud_s=None, *, queued_at=0.0, error='', boxes=None,
                     people=None, fusion_error=''):
    snapshot = P.Snapshot(
        image=image(image_s), cloud=message(cloud_s, cloud=True) if cloud_s is not None else None,
        info=object() if cloud_s is not None else None, image_stamp=image_s,
        cloud_stamp=cloud_s, queued_at=queued_at)
    boxes = np.empty((0, 4), np.float32) if boxes is None else boxes
    if people is None and cloud_s is not None and not fusion_error: people=[]
    return P.InferenceResult(snapshot, boxes, np.zeros(len(boxes), np.float32), 0.01,
                             error, people, fusion_error)


class PersonPerceptionNodeTests(unittest.TestCase):
    def test_worker_profiles_nonempty_locate_success_error_stale_and_replaced_results(self):
        cases = (
            ('success/replaced', False, True, '', True, 10.1, True),
            ('fusion error', False, True, 'fusion failed', True, 10.1, False),
            ('stale result', False, True, '', True, 12.0, False),
            ('empty boxes', False, False, '', True, 10.1, False),
            ('bbox only', True, True, '', True, 10.1, False),
            ('missing info before locate', False, True, '', False, 10.1, False),
        )
        for name, bbox_only, has_boxes, error, has_info, now, replaced in cases:
            with self.subTest(name=name):
                node = make_node(now=now, bbox_only=bbox_only)
                raw = (np.array([[[0., 0., 1., 1., .9, 0.]]], np.float32)
                       if has_boxes else np.empty((1, 0, 6), np.float32))
                node.net = types.SimpleNamespace(infer=lambda _inputs: {0: raw})
                node._rgb_array = lambda _msg: np.zeros((2, 2, 3), np.uint8)
                node._locate = mock.Mock(
                    return_value=[np.array([1., 0., 0.])] if has_boxes else [],
                    side_effect=RuntimeError(error) if error else None)
                node._pending = P.Snapshot(
                    image(10.0), message(10.0, cloud=True),
                    object() if has_info else None, 10.0, 10.0, time.monotonic())
                if replaced:
                    node._result = inference_result(9.9, 9.9)
                measured = has_boxes and has_info and not bbox_only
                # Existing statistics must survive an empty-bbox observation.
                if not has_boxes:
                    node._fusion_latencies.append(.7)
                initial = list(node._fusion_latencies)
                clock_ticks = [1., 1.1, 5., 5.25] if measured else [1., 1.1]
                fake_cv2 = types.ModuleType('cv2')
                fake_cv2.resize = lambda arr, size: np.zeros((size[1], size[0], 3), np.uint8)
                thread = threading.Thread(target=node._worker_loop, daemon=True)
                with mock.patch.dict(sys.modules, {'cv2': fake_cv2}), \
                        mock.patch.object(P.time, 'perf_counter', side_effect=clock_ticks) as timer:
                    try:
                        thread.start()
                        with node._wake:
                            self.assertTrue(node._wake.wait_for(
                                lambda: node._result is not None
                                and node._result.snapshot.image_stamp == 10.0
                                and not node._worker_busy, timeout=1))
                            result = node._result
                        self.assertAlmostEqual(result.latency_s, .1)
                        self.assertEqual(timer.call_count, 4 if measured else 2)
                    finally:
                        with node._wake:
                            node._stopping = True
                            node._wake.notify_all()
                        thread.join(timeout=1)
                self.assertFalse(thread.is_alive())
                expected = initial + ([.25] if measured else [])
                self.assertEqual(list(node._fusion_latencies), expected)
                if not bbox_only and has_info:
                    node._locate.assert_called_once()
                else:
                    node._locate.assert_not_called()
                self.assertEqual(result.fusion_error,
                                 error or ('missing CameraInfo' if not has_info else ''))
                if replaced:
                    self.assertEqual(node._counts['dropped'], 1)
                node._consume(result)
                self.assertEqual(list(node._fusion_latencies), expected)
                if now == 12.0:
                    self.assertIn('STALE/INVALID', node._status_reason)
                    self.assertEqual(node._counts['errors'], 1)
                elif error or not has_info:
                    self.assertEqual(node._status_reason, result.fusion_error)
                    self.assertEqual(node._counts['errors'], 1)
                else:
                    self.assertEqual(node._status_reason, 'BBOX_ONLY_VALID' if bbox_only else 'VALID')
                    if not has_boxes:
                        self.assertEqual(node._valid_fusion_count, 0)
                        self.assertEqual(node.published_people, [])

    def test_fusion_diagnostics_percentiles_unknown_and_last_100_attempts(self):
        class DiagnosticArray:
            def __init__(self):
                self.header = types.SimpleNamespace(stamp=None)

        class DiagnosticStatus:
            OK = 0
            ERROR = 2

        node = make_node(bbox_only=False)
        node._latencies = [.106, .124]
        node._e2e_latencies = [.65, .9]

        def diagnostics():
            with mock.patch.multiple(
                    P, DiagnosticArray=DiagnosticArray, DiagnosticStatus=DiagnosticStatus,
                    KeyValue=lambda **kwargs: types.SimpleNamespace(**kwargs)):
                P.PersonPerceptionNode._publish_diagnostics(node)
            return {value.key: value.value for value in node.diag_pub.messages[-1].status[0].values}

        original = diagnostics()
        self.assertEqual(original['fusion_p50_ms'], 'unknown')
        self.assertEqual(original['fusion_p95_ms'], 'unknown')
        node._fusion_latencies.extend([.1, .2, .3, .4])
        profiled = diagnostics()
        self.assertEqual(profiled['fusion_p50_ms'], '250.00')
        self.assertEqual(profiled['fusion_p95_ms'], '385.00')
        self.assertEqual(
            {key: value for key, value in original.items() if not key.startswith('fusion_')},
            {key: value for key, value in profiled.items() if not key.startswith('fusion_')})
        node._fusion_latencies.clear()
        node._fusion_latencies.extend(i / 1000 for i in range(101))
        self.assertEqual(len(node._fusion_latencies), 100)
        latest = diagnostics()
        self.assertEqual(latest['fusion_p50_ms'], '50.50')
        self.assertEqual(latest['fusion_p95_ms'], '95.05')

    def test_sample_group_limits_each_reader_before_take_and_keeps_latest(self):
        class Reader:
            def __init__(self):
                self.latest = None  # models DDS KEEP_LAST(1), not a Python message queue
                self.takes = 0

            def dispatch(self, group):
                if self.latest is None or not group.can_execute(self):
                    return None
                if not group.beginning_execution(self):
                    return None
                try:
                    self.takes += 1  # take/deserialization happens only after permission
                    msg, self.latest = self.latest, None
                    return msg
                finally:
                    group.ending_execution(self)

        group = P.SampledInputGroup()
        rgb, cloud = Reader(), Reader()
        group.add_entity(rgb)
        group.add_entity(cloud)
        for frame in range(6):
            rgb.latest = cloud.latest = frame
            self.assertIsNone(rgb.dispatch(group))
            self.assertIsNone(cloud.dispatch(group))
        self.assertEqual(cloud.takes, 0)
        group.release()
        self.assertEqual(rgb.dispatch(group), 5)
        self.assertEqual(cloud.dispatch(group), 5)
        for frame in range(6, 12):
            rgb.latest = cloud.latest = frame
            self.assertIsNone(rgb.dispatch(group))
            self.assertIsNone(cloud.dispatch(group))
        group.release()
        self.assertEqual(rgb.dispatch(group), 11)
        self.assertEqual(cloud.dispatch(group), 11)
        self.assertEqual((rgb.takes, cloud.takes), (2, 2))

    def test_sample_group_missed_ticks_do_not_accumulate_or_allow_concurrent_takes(self):
        class Entity:
            pass

        group = P.SampledInputGroup()
        rgb, cloud = Entity(), Entity()
        group.add_entity(rgb)
        group.add_entity(cloud)
        for _ in range(10):
            group.release()
        self.assertTrue(group.can_execute(rgb))
        self.assertTrue(group.can_execute(cloud))
        self.assertTrue(group.beginning_execution(rgb))
        self.assertFalse(group.beginning_execution(rgb))
        self.assertFalse(group.beginning_execution(cloud))
        group.ending_execution(rgb)
        self.assertFalse(group.can_execute(rgb))
        self.assertTrue(group.beginning_execution(cloud))
        group.ending_execution(cloud)
        self.assertFalse(group.can_execute(cloud))

    def test_health_tick_releases_normal_inputs_but_bbox_only_stays_ungated(self):
        class Entity:
            pass

        node = make_node(bbox_only=False)
        reader = Entity()
        node._input_group.add_entity(reader)
        self.assertFalse(node._input_group.can_execute(reader))
        node._health_tick()
        self.assertTrue(node._input_group.can_execute(reader))

        node = make_node(bbox_only=True)
        node._on_bbox_image(image(10.0))
        node._on_bbox_image(image(10.1))
        self.assertIsNone(node._input_group)
        self.assertEqual(node._pending.image_stamp, 10.1)
        self.assertEqual(node._input_counts,
                         {'rgb_received': 2, 'cloud_received': 0, 'pairs_accepted': 0})

    def test_rgbd_pending_is_latest_only_and_cloud_timestamps_cannot_be_reused(self):
        node = make_node(bbox_only=False)
        for ts in (10.0, 10.2, 10.4):
            node._on_pair(image(ts), message(ts + .01, cloud=True))
        self.assertEqual(node._pending.image_stamp, 10.4)
        self.assertAlmostEqual(node._pending.cloud_stamp, 10.41)
        self.assertEqual(node._counts['dropped'], 2)
        self.assertEqual(node._input_counts['pairs_accepted'], 3)
        node._pending = None
        for image_ts, cloud_ts in ((10.42, 10.41), (10.43, 10.40)):
            node._on_pair(image(image_ts), message(cloud_ts, cloud=True))
            self.assertIsNone(node._pending)
            self.assertEqual(node._status_reason, 'duplicate/out-of-order cloud timestamp')
        self.assertEqual(node._counts['duplicate'], 2)
        self.assertEqual(node._input_counts['pairs_accepted'], 3)

    def test_locate_empty_boxes_skips_cloud_tf_and_projection(self):
        info = types.SimpleNamespace(
            width=2, height=2,
            header=types.SimpleNamespace(frame_id='camera_optical'),
            k=[1., 0., 0., 0., 1., 0., 0., 0., 1.],
            d=[0., 0., 0., 0., 0.],
            distortion_model='plumb_bob')
        snapshot = P.Snapshot(image(10.0), message(10.0, cloud=True), info,
                              10.0, 10.0, 0.0)
        tf_calls = []
        node = types.SimpleNamespace(
            _calibration_signature=None,
            base_frame='base_link',
            _tf=lambda *_args: tf_calls.append(True))

        with mock.patch.object(P, 'cloud_xyz', side_effect=AssertionError('cloud decoded')), \
                mock.patch.object(P, 'project_points', side_effect=AssertionError('cloud projected')):
            people = P.PersonPerceptionNode._locate(
                node, snapshot, np.empty((0, 4), dtype=np.float32))

        self.assertEqual(people, [])
        self.assertEqual(tf_calls, [])

    def test_sync_accepts_40ms_and_rejects_60ms(self):
        node = make_node()
        node._enqueue(image(10.0), message(10.04, cloud=True), None)
        self.assertIsNotNone(node._pending)
        node._pending = None  # model the worker taking the accepted observation
        node._enqueue(image(11.0), message(11.06, cloud=True), None)
        self.assertIsNone(node._pending)
        self.assertIn('sync delta exceeds', node._status_reason)

    def test_duplicate_and_out_of_order_observations_are_unknown(self):
        node = make_node()
        node._enqueue(image(10.2), None, None)
        node._enqueue(image(10.2), None, None)
        self.assertEqual(node._counts['duplicate'], 1)
        self.assertIn('duplicate/out-of-order', node._status_reason)
        node._enqueue(image(10.1), None, None)
        self.assertEqual(node._counts['duplicate'], 2)

    def test_stale_rgb_and_stale_cloud_are_unknown(self):
        for result in (inference_result(98.98, 99.02),
                       inference_result(99.02, 98.98)):
            node = make_node(now=100.0, bbox_only=False)
            node._counts = {'dropped': 0, 'duplicate': 0, 'errors': 0}
            node._consume(result)
            self.assertIn('STALE/INVALID', node._status_reason)

    def test_observation_that_ages_during_inference_is_stale(self):
        node = make_node(now=100.0)
        node._consume(inference_result(98.0, queued_at=time.monotonic()))
        self.assertIn('STALE/INVALID', node._status_reason)

    def test_clock_jump_resets_timestamp_ordering_and_policy(self):
        node = make_node(now=50.0)
        node._last_obs_ros = 100.0
        node._last_valid_mono = time.monotonic()
        node._last_image_stamp = 100.0
        node._last_cloud_stamp = 100.0
        node._last_pair_stamp = 100.0
        node._health_tick()
        self.assertEqual(node._status_reason, 'ROS clock moved backwards')
        self.assertIsNone(node._last_image_stamp)
        self.assertIsNone(node._last_cloud_stamp)
        self.assertIsNone(node._last_pair_stamp)

    def test_hung_worker_keeps_one_latest_pending_and_health_timer_runs(self):
        entered = threading.Event()
        release = threading.Event()

        class SlowModel:
            def infer(self, _inputs):
                entered.set()
                release.wait(timeout=5)
                return {0: np.empty((1, 0, 6), np.float32)}

        node = make_node(now=10.0)
        node.net = SlowModel()
        node._rgb_array = lambda _msg: np.zeros((2, 2, 3), np.uint8)
        node._pending = P.Snapshot(image(10.0), None, None, 10.0, None, time.monotonic())
        fake_cv2 = types.ModuleType('cv2')
        fake_cv2.resize = lambda arr, size: np.zeros((size[1], size[0], 3), np.uint8)
        previous_cv2 = sys.modules.get('cv2')
        sys.modules['cv2'] = fake_cv2
        thread = threading.Thread(target=node._worker_loop, daemon=True)
        try:
            thread.start()
            self.assertTrue(entered.wait(timeout=1))
            node._enqueue(image(10.1), None, None)
            node._enqueue(image(10.2), None, None)
            node._enqueue(image(10.3), None, None)
            self.assertEqual(node._counts['dropped'], 2)
            self.assertEqual(node._pending.image_stamp, 10.3)
            started = time.perf_counter()
            node._health_tick()
            self.assertLess(time.perf_counter() - started, 0.2)
        finally:
            release.set()
            with node._wake:
                node._stopping = True
                node._wake.notify_all()
            thread.join(timeout=1)
            if previous_cv2 is None:
                sys.modules.pop('cv2', None)
            else:
                sys.modules['cv2'] = previous_cv2
        self.assertFalse(thread.is_alive())

    def test_worker_replaces_unconsumed_result_and_processes_only_latest_pending(self):
        entered = threading.Event()
        release = threading.Event()
        calls = []
        call_times = []

        class SlowFirstModel:
            def infer(self, _inputs):
                calls.append(len(calls) + 1)
                call_times.append(time.monotonic())
                if len(calls) == 1:
                    entered.set()
                    release.wait(timeout=5)
                return {0: np.empty((1, 0, 6), np.float32)}

        node = make_node(now=10.0)
        node._inference_period = 0.05
        node.net = SlowFirstModel()
        node._rgb_array = lambda _msg: np.zeros((2, 2, 3), np.uint8)
        node._pending = P.Snapshot(image(10.0), None, None, 10.0, None, time.monotonic())
        node._result = inference_result(9.95, error='MODEL_ERROR: previous frame failed')
        fake_cv2 = types.ModuleType('cv2')
        fake_cv2.resize = lambda arr, size: np.zeros((size[1], size[0], 3), np.uint8)
        previous_cv2 = sys.modules.get('cv2')
        sys.modules['cv2'] = fake_cv2
        thread = threading.Thread(target=node._worker_loop, name='test-inference', daemon=True)
        try:
            thread.start()
            self.assertTrue(entered.wait(timeout=1))
            node._enqueue(image(10.1), None, None)
            node._enqueue(image(10.2), None, None)
            node._enqueue(image(10.3), None, None)
            self.assertEqual(node._counts['dropped'], 2)
            self.assertEqual(node._pending.image_stamp, 10.3)

            release.set()
            with node._wake:
                self.assertTrue(node._wake.wait_for(
                    lambda: node._result is not None
                    and node._result.snapshot.image_stamp == 10.3
                    and not node._worker_busy,
                    timeout=2))

            self.assertEqual(calls, [1, 2])
            self.assertGreaterEqual(call_times[1] - call_times[0], 0.04)
            self.assertIsNone(node._pending)
            # Two overwritten pending snapshots and two replaced completed results.
            self.assertEqual(node._counts['dropped'], 4)
            # A replaced failed result still contributes to the error counter.
            self.assertEqual(node._counts['errors'], 1)
        finally:
            release.set()
            with node._wake:
                node._stopping = True
                node._wake.notify_all()
            thread.join(timeout=1)
            if previous_cv2 is None:
                sys.modules.pop('cv2', None)
            else:
                sys.modules['cv2'] = previous_cv2
        self.assertFalse(thread.is_alive())

    def test_idle_worker_exits_when_shutdown_notifies_condition(self):
        node = make_node()
        thread = threading.Thread(target=node._worker_loop, name='test-idle-worker', daemon=True)
        thread.start()
        time.sleep(0.01)
        with node._wake:
            node._stopping = True
            node._wake.notify_all()
        thread.join(timeout=1)
        self.assertFalse(thread.is_alive())

    def test_rgbd_fusion_runs_on_worker_and_fusion_errors_remain_unknown(self):
        fusion_threads = []
        node = make_node(now=10.1, bbox_only=False)
        node.net = types.SimpleNamespace(
            infer=lambda _inputs: {0: np.empty((1, 0, 6), np.float32)})
        node._rgb_array = lambda _msg: np.zeros((2, 2, 3), np.uint8)
        node._locate = lambda _snap, _boxes: (
            fusion_threads.append(threading.current_thread().name) or [])
        node._pending = P.Snapshot(image(10.0), message(10.0, cloud=True), object(),
                                   10.0, 10.0, time.monotonic())
        fake_cv2 = types.ModuleType('cv2')
        fake_cv2.resize = lambda arr, size: np.zeros((size[1], size[0], 3), np.uint8)
        previous_cv2 = sys.modules.get('cv2')
        sys.modules['cv2'] = fake_cv2
        thread = threading.Thread(target=node._worker_loop, name='person-inference-test', daemon=True)
        try:
            thread.start()
            with node._wake:
                self.assertTrue(node._wake.wait_for(
                    lambda: node._result is not None and not node._worker_busy,
                    timeout=1))
                result = node._result
                node._result = None
            self.assertEqual(fusion_threads, ['person-inference-test'])
            node._consume(result)
            self.assertEqual(node._status_reason, 'VALID')
            self.assertTrue(node.people_published)
            self.assertEqual(node.published_people, [])
            self.assertEqual(node._valid_fusion_count, 0)
            self.assertEqual(node._pending_policy, ([], 10.0))
            node._policy_tick()
            self.assertIsNone(node._pending_policy)
            self.assertEqual(node.last_diagnostic_percent, 50.0)

            failed = inference_result(10.01, 10.01, fusion_error='TF lookup failed')
            node._consume(failed)
            self.assertEqual(node._status_reason, 'TF lookup failed')
            self.assertEqual(node._counts['errors'], 1)
        finally:
            with node._wake:
                node._stopping = True
                node._wake.notify_all()
            thread.join(timeout=1)
            if previous_cv2 is None:
                sys.modules.pop('cv2', None)
            else:
                sys.modules['cv2'] = previous_cv2
        self.assertFalse(thread.is_alive())

    def test_future_rgb_or_cloud_timestamp_is_still_unknown(self):
        for result in (inference_result(10.06, 10.0),
                       inference_result(10.0, 10.06)):
            node = make_node(now=10.0, bbox_only=False)
            node._consume(result)
            self.assertIn('STALE/INVALID', node._status_reason)

    def test_model_load_failure_is_reported(self):
        logs = []
        node = types.SimpleNamespace(cfg={'model_xml': ''},
            get_logger=lambda: types.SimpleNamespace(error=logs.append))
        self.assertIsNone(P.PersonPerceptionNode._load_model(node))
        self.assertIn('model_xml is empty', logs[0])

    def test_inference_exception_and_unsupported_tensor_are_model_error(self):
        for model in (
            types.SimpleNamespace(infer=lambda _inputs: (_ for _ in ()).throw(RuntimeError('infer failed'))),
            types.SimpleNamespace(infer=lambda _inputs: {0: np.zeros((1, 3, 9), np.float32)}),
        ):
            node = make_node(now=10.0)
            node.net = model
            node._rgb_array = lambda _msg: np.zeros((2, 2, 3), np.uint8)
            node._pending = P.Snapshot(image(10.0), None, None, 10.0, None, time.monotonic())
            fake_cv2 = types.ModuleType('cv2')
            fake_cv2.resize = lambda arr, size: np.zeros((size[1], size[0], 3), np.uint8)
            previous_cv2 = sys.modules.get('cv2')
            sys.modules['cv2'] = fake_cv2
            thread = threading.Thread(target=node._worker_loop, daemon=True)
            try:
                thread.start()
                deadline = time.monotonic() + 1
                while node._result is None and time.monotonic() < deadline:
                    time.sleep(.005)
                self.assertIsNotNone(node._result)
                self.assertTrue(node._result.error)
                result = node._result
                node._result = None
                node._consume(result)
                self.assertTrue(node._status_reason.startswith('MODEL_ERROR'))
            finally:
                with node._wake:
                    node._stopping = True
                    node._wake.notify_all()
                thread.join(timeout=1)
                if previous_cv2 is None:
                    sys.modules.pop('cv2', None)
                else:
                    sys.modules['cv2'] = previous_cv2

    def test_model_error_survives_stale_health_tick(self):
        node = make_node(now=10.0)
        node._status_reason = 'MODEL_ERROR: model unavailable'
        node._health_tick()
        self.assertEqual(node._status_reason, 'MODEL_ERROR: model unavailable')

    def test_tf_lookup_uses_latest_transform_and_missing_tf_is_not_hidden(self):
        class Transform:
            transform = types.SimpleNamespace(
                rotation=types.SimpleNamespace(x=0., y=0., z=0., w=1.),
                translation=types.SimpleNamespace(x=1., y=2., z=3.))

        class Buffer:
            def __init__(self): self.calls = []
            def lookup_transform(self, target, source, at):
                self.calls.append((target, source, at))
                return Transform()

        old_time = P.rclpy.time.Time
        P.rclpy.time.Time = FakeTime
        FakeTime.calls = []
        try:
            node = types.SimpleNamespace(tf_buffer=Buffer())
            P.PersonPerceptionNode._tf(node, 'base_link', 'camera_optical')
            self.assertEqual(node.tf_buffer.calls[0][:2], ('base_link', 'camera_optical'))
            self.assertEqual(FakeTime.calls[-1], (0, 0))

            class MissingBuffer:
                def lookup_transform(self, *_args): raise LookupError('no latest transform')
            node.tf_buffer = MissingBuffer()
            with self.assertRaisesRegex(LookupError, 'latest transform'):
                P.PersonPerceptionNode._tf(node, 'base_link', 'camera_optical')
        finally:
            P.rclpy.time.Time = old_time

    def test_stale_100_percent_and_errors_fall_back_to_50(self):
        node = make_node(enabled=True, bbox_only=False)
        node._status_reason = 'VALID'
        node._last_valid_mono = time.monotonic() - 2
        node.policy.slowing = False
        node._policy_tick()
        self.assertEqual(node.limit_pub.messages[-1].speed_limit, 50)
        self.assertTrue(all(m.speed_limit != 0 for m in node.limit_pub.messages))

        node._status_reason = 'VALID'
        node._last_valid_mono = time.monotonic()
        node._set_unknown('INFERENCE_ERROR: thrown')
        node._policy_tick()
        self.assertEqual(node.limit_pub.messages[-1].speed_limit, 50)

    def test_speed_limit_off_publishes_nothing(self):
        node = make_node(enabled=False, bbox_only=False)
        node._policy_tick()
        self.assertIsNone(node.limit_pub)

    def test_source_stamp_to_detection_e2e_metric(self):
        node = make_node(now=20.5, bbox_only=True)
        node._counts = {'dropped': 0, 'duplicate': 0, 'errors': 0}
        node._consume(inference_result(20.0, queued_at=0.0))
        self.assertAlmostEqual(node._e2e_latencies[-1], .5)

    def test_exact_policy_boundaries(self):
        policy = P.SlowdownPolicy()
        policy.slowing = False
        self.assertEqual(policy.observe([(2.0, 0.0, 0.0)], 1.0), 100)
        policy.slowing = True
        self.assertEqual(policy.observe([(2.5, 0.0, 0.0)], 1.2), 50)
        policy.slowing = False
        self.assertEqual(policy.observe([(1.0, 0.8, 0.0)], 1.4), 100)


if __name__ == '__main__':
    unittest.main()
