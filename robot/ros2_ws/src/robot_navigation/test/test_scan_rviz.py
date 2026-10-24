"""Projection and immediate-drop behavior with real Humble messages and TF."""

import copy
import math
import os
from pathlib import Path
import sys
import time
from unittest import mock

import pytest


rclpy = pytest.importorskip('rclpy')
pytest.importorskip('tf2_ros')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from geometry_msgs.msg import TransformStamped  # noqa: E402
from rclpy.context import Context  # noqa: E402
from rclpy.executors import SingleThreadedExecutor  # noqa: E402
from rclpy.node import Node  # noqa: E402
from rclpy.parameter import Parameter  # noqa: E402
from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy  # noqa: E402
from rclpy.time import Time  # noqa: E402
from sensor_msgs.msg import LaserScan, PointCloud2, PointField  # noqa: E402
from sensor_msgs_py.point_cloud2 import read_points  # noqa: E402
from tf2_msgs.msg import TFMessage  # noqa: E402
from robot_navigation.scan_projection import scan_to_cloud  # noqa: E402
from robot_navigation.scan_rviz import ScanRviz  # noqa: E402


def scan(seconds=11, nanos=250_000_000):
    message = LaserScan()
    message.header.frame_id = 'lidar_link'
    message.header.stamp.sec = seconds
    message.header.stamp.nanosec = nanos
    message.angle_increment = math.pi / 2
    message.range_min, message.range_max = 0.2, 3.0
    message.ranges = [1.0, 2.0, float('inf'), float('nan'), 0.1, 20.0]
    return message


def transform(seconds=10, x=1.0):
    message = TransformStamped()
    message.header.frame_id = 'map'
    message.child_frame_id = 'lidar_link'
    message.header.stamp.sec = seconds
    message.transform.translation.x = x
    message.transform.rotation.w = 1.0
    return message


@pytest.fixture
def adapter(monkeypatch):
    for setting in ('ROS_DISCOVERY_SERVER', 'FASTDDS_DEFAULT_PROFILES_FILE',
                    'FASTRTPS_DEFAULT_PROFILES_FILE'):
        monkeypatch.delenv(setting, raising=False)
    monkeypatch.setenv('ROS_LOCALHOST_ONLY', '1')
    context = Context()
    context.init(args=['--ros-args', '-r', '/tf:=tf_rviz'], domain_id=80 + os.getpid() % 20)
    nodes = []

    def create(namespace=''):
        node = ScanRviz(context=context, namespace=namespace,
                        parameter_overrides=[Parameter('target_frame', value='map')])
        nodes.append(node)
        return node

    yield create
    for node in nodes:
        node.destroy_node()
    context.shutdown()


@pytest.mark.parametrize('namespace', ['', 'robot_01'])
def test_topics_qos_and_static_tf(adapter, namespace):
    node = adapter(namespace)
    prefix = '/' + namespace if namespace else ''
    assert node.subscription.topic_name == prefix + '/scan'
    assert node.publisher.topic_name == prefix + '/scan_rviz'
    assert node.listener.tf_sub.topic_name == prefix + '/tf_rviz'
    assert node.listener.tf_sub.qos_profile.reliability == ReliabilityPolicy.RELIABLE
    assert node.listener.tf_static_sub.topic_name == '/tf_static'
    assert node.listener.tf_static_sub.qos_profile.durability == DurabilityPolicy.TRANSIENT_LOCAL
    for endpoint in (node.subscription, node.publisher):
        qos = endpoint.qos_profile
        assert qos.history == HistoryPolicy.KEEP_LAST and qos.depth == 1
        assert qos.reliability == ReliabilityPolicy.BEST_EFFORT
        assert qos.durability == DurabilityPolicy.VOLATILE
    assert {pub.topic_name for pub in node.publishers}.isdisjoint(
        {prefix + '/scan', '/tf', prefix + '/tf_rviz', '/tf_static'})


def test_projection_rotation_translation_and_invalid_ranges():
    message = scan()
    original = copy.deepcopy(message)
    pose = transform()
    pose.transform.translation.y, pose.transform.translation.z = 2.0, 3.0
    pose.transform.rotation.z = pose.transform.rotation.w = math.sqrt(0.5)
    cloud = scan_to_cloud(message, pose)
    assert cloud.header.frame_id == 'map'
    assert cloud.header.stamp == message.header.stamp
    assert [(field.name, field.offset, field.datatype, field.count) for field in cloud.fields] == [
        ('x', 0, PointField.FLOAT32, 1), ('y', 4, PointField.FLOAT32, 1),
        ('z', 8, PointField.FLOAT32, 1)]
    assert cloud.height == 1 and cloud.width == 2
    assert cloud.point_step == 12 and cloud.row_step == 24 and len(cloud.data) == 24
    assert not cloud.is_bigendian
    points = [tuple(point) for point in read_points(cloud)]
    assert points[0] == pytest.approx((1, 3, 3))
    assert points[1] == pytest.approx((-1, 2, 3), abs=1e-6)
    # Compare bytes as NaN does not compare equal to itself.
    assert message.header == original.header and message.ranges.tobytes() == original.ranges.tobytes()


def test_projection_out_of_plane_rotation_and_empty_cloud():
    message = scan()
    message.ranges = [1.0]
    pose = transform(x=0.0)
    pose.transform.rotation.y = pose.transform.rotation.w = math.sqrt(0.5)
    assert tuple(next(iter(read_points(scan_to_cloud(message, pose))))) == pytest.approx((0, 0, -1))
    message.ranges = [float('inf')]
    cloud = scan_to_cloud(message, pose)
    assert cloud.width == cloud.row_step == len(cloud.data) == 0
    assert cloud.header.frame_id == 'map'


def test_lookup_at_scan_timestamp_with_zero_timeout(adapter):
    node = adapter()
    node.buffer.set_transform(transform(10, 1.0), 'test')
    node.buffer.set_transform(transform(12, 5.0), 'test')
    message = scan()
    with mock.patch.object(node.buffer, 'lookup_transform', wraps=node.buffer.lookup_transform) as lookup, \
            mock.patch.object(node.publisher, 'publish') as publish:
        node.on_scan(message)
    args, kwargs = lookup.call_args
    assert args[:2] == ('map', 'lidar_link')
    assert args[2].nanoseconds == 11_250_000_000
    assert kwargs['timeout'].nanoseconds == 0
    [cloud] = publish.call_args.args
    # Interpolated translation at 11.25 s is 3.5, not the latest value of 5.
    assert tuple(next(iter(read_points(cloud)))) == pytest.approx((4.5, 0, 0))
    assert cloud.header.stamp == message.header.stamp


@pytest.mark.parametrize('failure', ['missing', 'future', 'past', 'disconnected'])
def test_unavailable_tf_drops_without_wait_retry_or_latest_fallback(adapter, failure):
    node = adapter()
    message = scan()
    if failure != 'missing':
        pose = transform(10 if failure == 'future' else 12)
        if failure == 'disconnected':
            pose.child_frame_id = 'other_lidar'
        node.buffer.set_transform(pose, 'test')
    with mock.patch.object(node.buffer, 'lookup_transform', wraps=node.buffer.lookup_transform) as lookup, \
            mock.patch.object(node.publisher, 'publish') as publish:
        started = time.monotonic()
        node.on_scan(message)
        assert time.monotonic() - started < 0.2
        assert lookup.call_count == 1
        assert lookup.call_args.kwargs['timeout'].nanoseconds == 0
        assert lookup.call_args.args[2].nanoseconds == 11_250_000_000
        publish.assert_not_called()
        # TF arriving later must not trigger publication of the dropped scan.
        pose = transform(11)
        pose.header.stamp.nanosec = 250_000_000
        node.buffer.set_transform(pose, 'test')
        publish.assert_not_called()
        assert not node.buffer._new_data_callbacks


@pytest.mark.parametrize('invalid', ['zero_stamp', 'empty_frame', 'nan_angle'])
def test_invalid_scan_is_not_published(adapter, invalid):
    node = adapter()
    pose = transform(11)
    pose.header.stamp.nanosec = 250_000_000
    node.buffer.set_transform(pose, 'test')
    message = scan()
    if invalid == 'zero_stamp':
        message.header.stamp.sec = message.header.stamp.nanosec = 0
    elif invalid == 'empty_frame':
        message.header.frame_id = ''
    else:
        message.angle_min = float('nan')
    with mock.patch.object(node.buffer, 'lookup_transform', wraps=node.buffer.lookup_transform) as lookup, \
            mock.patch.object(node.publisher, 'publish') as publish:
        node.on_scan(message)
        publish.assert_not_called()
        if invalid != 'nan_angle':
            lookup.assert_not_called()


def test_dds_scan_with_relay_tf_and_latched_static_chain(adapter):
    node = adapter('robot_01')
    peer = Node('scan_test_peer', namespace='robot_01', context=node.context)
    executor = SingleThreadedExecutor(context=node.context)
    executor.add_node(node)
    executor.add_node(peer)
    qos = QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT)
    received = []
    peer.create_subscription(PointCloud2, 'scan_rviz', received.append, qos)
    scan_pub = peer.create_publisher(LaserScan, 'scan', qos)
    tf_pub = peer.create_publisher(TFMessage, 'tf_rviz', 100)
    static_pub = peer.create_publisher(
        TFMessage, '/tf_static', QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL))

    def spin_until(predicate):
        deadline = time.monotonic() + 5
        while not predicate() and time.monotonic() < deadline:
            executor.spin_once(timeout_sec=0.02)
        assert predicate(), 'DDS discovery or delivery timed out'

    try:
        spin_until(lambda: scan_pub.get_subscription_count() == 1
                   and node.publisher.get_subscription_count() == 1
                   and tf_pub.get_subscription_count() == 1
                   and static_pub.get_subscription_count() == 1)
        message = scan()
        with mock.patch.object(node.buffer, 'lookup_transform',
                               wraps=node.buffer.lookup_transform) as lookup:
            scan_pub.publish(message)
            spin_until(lambda: lookup.call_count == 1)
        assert not received
        static = transform(x=0.25)
        static.header.frame_id = 'base_link'
        static_pub.publish(TFMessage(transforms=[static]))
        transforms = [transform(10, 1.0), transform(12, 5.0)]
        for pose in transforms:
            pose.child_frame_id = 'base_link'
        tf_pub.publish(TFMessage(transforms=transforms))
        spin_until(lambda: node.buffer.can_transform('map', 'lidar_link',
                                                    Time.from_msg(message.header.stamp)))
        # A scan dropped before TF arrived is not queued for later publication.
        assert not received
        scan_pub.publish(message)
        spin_until(lambda: len(received) == 1)
        assert received[0].header.frame_id == 'map'
        assert received[0].header.stamp == message.header.stamp
        assert tuple(next(iter(read_points(received[0])))) == pytest.approx((4.75, 0, 0))
    finally:
        executor.shutdown()
        peer.destroy_node()
