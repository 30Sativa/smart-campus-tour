"""Exercise real Humble takes and message_filters in an isolated process.

The existing offline tests install ROS stubs, so this probe deliberately runs
in a fresh interpreter. It skips only when a real rclpy runtime is unavailable.
"""
import math
import os
from pathlib import Path
import subprocess
import sys
import time
import types
import unittest
from unittest import mock


def run_ros_probe(bbox_only):
    try:
        import rclpy
    except ImportError:
        print('ROS 2 rclpy runtime unavailable')
        return 77

    import numpy as np
    from rclpy.executors import SingleThreadedExecutor
    from rclpy.node import Node
    from rclpy.qos import QoSProfile, ReliabilityPolicy
    from sensor_msgs.msg import CameraInfo, Image, PointCloud2
    from robot_perception import person_perception_node as P
    from message_filters import ApproximateTimeSynchronizer, SimpleFilter

    if not bbox_only:
        # Exercise the real synchronizer deterministically, independently of
        # DDS arrival timing: 40 ms accepted, 60 ms rejected, queue bounded.
        rgb_filter, cloud_filter = SimpleFilter(), SimpleFilter()
        sync = ApproximateTimeSynchronizer([rgb_filter, cloud_filter], 1, .05)
        matched = []
        sync.registerCallback(lambda rgb, cloud: matched.append((rgb, cloud)))

        def sample(msg_type, seconds, nanos=0):
            msg = msg_type()
            msg.header.stamp.sec = seconds
            msg.header.stamp.nanosec = nanos
            return msg

        rgb_filter.signalMessage(sample(Image, 10))
        cloud_filter.signalMessage(sample(PointCloud2, 10, 40_000_000))
        assert len(matched) == 1
        assert all(not queue for queue in sync.queues), 'matched input was retained/reusable'
        rgb_filter.signalMessage(sample(Image, 11))
        cloud_filter.signalMessage(sample(PointCloud2, 11, 60_000_000))
        assert len(matched) == 1, '60 ms pair was accepted'
        for nanos in range(0, 300_000_000, 10_000_000):
            cloud_filter.signalMessage(sample(PointCloud2, 12, nanos))
            assert all(len(queue) <= 1 for queue in sync.queues)
        rgb_filter.signalMessage(sample(Image, 12, 290_000_000))
        assert len(matched) == 2
        assert matched[-1][1].header.stamp.nanosec == 290_000_000
        rgb_filter.signalMessage(sample(Image, 12, 300_000_000))
        assert len(matched) == 2, 'a consumed cloud was reused'

    args = ['--ros-args', '-r', f'__ns:=/perception_input_test_{os.getpid()}',
            '-p', f'bbox_only:={str(bbox_only).lower()}']
    rclpy.init(args=args)
    model = types.SimpleNamespace(infer=lambda _inputs: {0: np.empty((1, 0, 6), np.float32)})
    with mock.patch.object(P.PersonPerceptionNode, '_load_model', return_value=model), \
            mock.patch.object(P.PersonPerceptionNode, '_locate', return_value=[]):
        node = P.PersonPerceptionNode()
        camera = Node('sampling_test_camera')
        qos = QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT)
        rgb_pub = camera.create_publisher(Image, 'camera/color/image_raw', qos)
        cloud_pub = camera.create_publisher(PointCloud2, 'camera/depth/points', qos)
        info_pub = camera.create_publisher(CameraInfo, 'camera/color/camera_info', qos)
        published = []
        pairs = []
        original_enqueue = node._enqueue

        def enqueue(image, cloud, info):
            before = node._input_counts['pairs_accepted']
            original_enqueue(image, cloud, info)
            if node._input_counts['pairs_accepted'] > before:
                pairs.append((P.stamp_seconds(image.header.stamp),
                              P.stamp_seconds(cloud.header.stamp)))

        node._enqueue = enqueue

        def publish():
            stamp = camera.get_clock().now().to_msg()
            rgb = Image()
            rgb.header.stamp = stamp
            rgb.header.frame_id = 'camera_optical'
            rgb.width = rgb.height = 2
            rgb.encoding = 'rgb8'
            rgb.step = 6
            rgb.data = bytes(12)
            cloud = PointCloud2()
            cloud.header = rgb.header
            info = CameraInfo()
            info.header = rgb.header
            info.width = info.height = 2
            info.k = [1., 0., 0., 0., 1., 0., 0., 0., 1.]
            info_pub.publish(info)
            rgb_pub.publish(rgb)
            cloud_pub.publish(cloud)
            published.append(P.stamp_seconds(stamp))

        camera.create_timer(1.0 / 30.0, publish)

        class CountingExecutor(SingleThreadedExecutor):
            def __init__(self):
                super().__init__()
                self.cloud_takes = 0

            def _take_subscription(self, sub):
                # In Humble this calls rcl_take + convert_to_py, before callback.
                result = super()._take_subscription(sub)
                if not bbox_only and sub is node.cloud_sub.sub and result is not None:
                    self.cloud_takes += 1
                return result

        executor = CountingExecutor()
        executor.add_node(node)
        executor.add_node(camera)
        duration = 2.2
        try:
            end = time.monotonic() + duration
            while time.monotonic() < end:
                executor.spin_once(timeout_sec=.02)
            assert len(published) >= 20, f'publisher only sent {len(published)} frames'
            counts = node._input_counts
            if bbox_only:
                assert node._input_group is None
                assert counts['cloud_received'] == counts['pairs_accepted'] == 0
                assert counts['rgb_received'] >= 20, counts
                assert node._status_reason == 'BBOX_ONLY_VALID', node._status_reason
            else:
                assert node.image_sub.sub.qos_profile.depth == 1
                assert node.cloud_sub.sub.qos_profile.depth == 1
                assert node.sync.queue_size == 1
                maximum = math.ceil(duration * 5) + 1
                assert 3 <= counts['cloud_received'] <= maximum, counts
                assert counts['cloud_received'] == executor.cloud_takes
                assert 3 <= counts['pairs_accepted'] <= counts['cloud_received'], counts
                assert counts['rgb_received'] <= maximum, counts
                assert all(abs(rgb - cloud) <= .05 for rgb, cloud in pairs), pairs
                assert all(a[0] < b[0] and a[1] < b[1]
                           for a, b in zip(pairs, pairs[1:])), pairs
                assert published[-1] - pairs[-1][0] < .3, 'reader drained old data'
                assert node._status_reason == 'VALID', node._status_reason
                assert node._valid_fusion_count == 0
            assert node._counts['errors'] == 0, node._counts
            print(f'bbox_only={bbox_only} published={len(published)} callbacks={counts}')
        finally:
            node.destroy_node()
            node._worker.join(timeout=2)
            camera.destroy_node()
            executor.shutdown(timeout_sec=2)
            rclpy.shutdown()
    return 0


class RosInputSamplingTests(unittest.TestCase):
    def probe(self, mode):
        env = os.environ.copy()
        # Keep this synthetic camera isolated from a running robot/discovery server.
        env['ROS_DOMAIN_ID'] = str(180 + os.getpid() % 40)
        env.pop('ROS_DISCOVERY_SERVER', None)
        env['FASTDDS_BUILTIN_TRANSPORTS'] = 'UDPv4'
        package = str(Path(__file__).resolve().parents[1])
        env['PYTHONPATH'] = package + os.pathsep + env.get('PYTHONPATH', '')
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), '--probe', mode],
            capture_output=True, text=True, env=env, timeout=20)
        if result.returncode == 77:
            self.skipTest(result.stdout.strip())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_real_rgbd_takes_are_sampled_and_pairs_are_fresh_unique(self):
        self.probe('rgbd')

    def test_real_bbox_only_subscription_remains_unsampled(self):
        self.probe('bbox')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--probe':
        sys.exit(run_ros_probe(sys.argv[2] == 'bbox'))
    unittest.main()
