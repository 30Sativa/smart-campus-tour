"""Laptop-only dynamic TF relay for remote RViz over lossy links."""

import rclpy
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy
from tf2_msgs.msg import TFMessage


class TfRvizRelay(Node):
    def __init__(self):
        super().__init__('tf_rviz_relay')
        # Match Humble's dynamic TF history depth; only reliability changes.
        input_qos = QoSProfile(
            history=HistoryPolicy.KEEP_LAST, depth=100,
            reliability=ReliabilityPolicy.BEST_EFFORT,
            durability=DurabilityPolicy.VOLATILE,
        )
        output_qos = QoSProfile(
            history=HistoryPolicy.KEEP_LAST, depth=100,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.VOLATILE,
        )
        self.publisher = self.create_publisher(TFMessage, 'tf_rviz', output_qos)
        # TF stays global even when robot sensor topics are namespaced.
        # Forward the complete message, including its original timestamps.
        self.subscription = self.create_subscription(
            TFMessage, '/tf', self.publisher.publish, input_qos,
        )


def main(args=None):
    rclpy.init(args=args)
    node = TfRvizRelay()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
