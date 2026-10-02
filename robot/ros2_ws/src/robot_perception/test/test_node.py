"""Node-state regression tests using the lightweight ROS stubs from test_math."""
import sys
import threading
import time
import types
import unittest

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
    _enqueue = P.PersonPerceptionNode._enqueue
    _consume = P.PersonPerceptionNode._consume
    _health_tick = P.PersonPerceptionNode._health_tick
    _policy_tick = P.PersonPerceptionNode._policy_tick
    _set_unknown = P.PersonPerceptionNode._set_unknown
    _publish_limit = P.PersonPerceptionNode._publish_limit
    _tf = P.PersonPerceptionNode._tf
    _worker_loop = P.PersonPerceptionNode._worker_loop

    def _publish_diagnostics(self, percent=None):
        self.last_diagnostic_percent = percent

    def _publish_debug(self, *_args):
        self.debug_published = True

    def _publish_people(self, *_args):
        self.people_published = True

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
    node._last_pair_stamp = None
    node._last_valid_mono = None
    node._last_obs_ros = None
    node._pending_policy = None
    node._counts = {'dropped': 0, 'duplicate': 0, 'errors': 0}
    node._latencies = []
    node._e2e_latencies = []
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
    return node


def inference_result(image_s, cloud_s=None, *, queued_at=0.0, error='', boxes=None):
    snapshot = P.Snapshot(
        image=image(image_s), cloud=message(cloud_s, cloud=True) if cloud_s is not None else None,
        info=object() if cloud_s is not None else None, image_stamp=image_s,
        cloud_stamp=cloud_s, queued_at=queued_at)
    boxes = np.empty((0, 4), np.float32) if boxes is None else boxes
    return P.InferenceResult(snapshot, boxes, np.zeros(len(boxes), np.float32), 0.01, error)


class PersonPerceptionNodeTests(unittest.TestCase):
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
        node._last_pair_stamp = 100.0
        node._health_tick()
        self.assertEqual(node._status_reason, 'ROS clock moved backwards')
        self.assertIsNone(node._last_image_stamp)
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
