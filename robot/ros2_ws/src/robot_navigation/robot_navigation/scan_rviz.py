"""Laptop-only scan adapter: publish in RViz's fixed frame or drop immediately."""

import rclpy
from rclpy.duration import Duration
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy
from rclpy.time import Time
from sensor_msgs.msg import LaserScan, PointCloud2
from tf2_ros import Buffer, TransformException, TransformListener

from robot_navigation.scan_projection import scan_to_cloud


class ScanRviz(Node):
    def __init__(self, **kwargs):
        super().__init__('scan_rviz', **kwargs)
        self.target_frame = self.declare_parameter('target_frame', '').value
        if not self.target_frame or self.target_frame.startswith('/'):
            raise ValueError('target_frame must match the RViz Fixed Frame (without a leading /)')
        self.buffer = Buffer(node=self)
        # The launch remaps only dynamic TF to the laptop relay; static TF stays global.
        # All callbacks run in the same executor, with no dedicated listener thread.
        self.listener = TransformListener(self.buffer, self, spin_thread=False)
        qos = QoSProfile(
            history=HistoryPolicy.KEEP_LAST, depth=1,
            reliability=ReliabilityPolicy.BEST_EFFORT,
            durability=DurabilityPolicy.VOLATILE,
        )
        self.publisher = self.create_publisher(PointCloud2, 'scan_rviz', qos)
        self.subscription = self.create_subscription(LaserScan, 'scan', self.on_scan, qos)

    def on_scan(self, scan):
        # TF time zero means "latest", which would violate scan timestamp semantics.
        if not scan.header.frame_id or (
                scan.header.stamp.sec == 0 and scan.header.stamp.nanosec == 0):
            return
        try:
            transform = self.buffer.lookup_transform(
                self.target_frame, scan.header.frame_id,
                Time.from_msg(scan.header.stamp), timeout=Duration())
        except TransformException:
            # No pending requests, retries, sleeps, or fallback to the latest TF.
            return
        try:
            cloud = scan_to_cloud(scan, transform)
        except ValueError:
            return
        self.publisher.publish(cloud)


def main(args=None):
    rclpy.init(args=args)
    node = ScanRviz()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
