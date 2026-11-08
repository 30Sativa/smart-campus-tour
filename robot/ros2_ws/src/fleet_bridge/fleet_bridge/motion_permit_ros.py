"""Publishes the motion permit from an executor timer. Imported only when commands_enabled is true."""

from __future__ import annotations

from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_msgs.msg import Bool


class MotionPermitPublisher:
    def __init__(self, node, permit, period_sec: float):
        self._permit = permit
        # VOLATILE on purpose: a late joiner must never receive an old true.
        qos = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.VOLATILE)
        self._publisher = node.create_publisher(Bool, 'motion_permit', qos)
        self._timer = node.create_timer(period_sec, self._publish)

    def _publish(self) -> None:
        self._publisher.publish(Bool(data=self._permit.evaluate()))
