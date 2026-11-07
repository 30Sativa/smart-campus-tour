"""ROS side of the Mini PC diagnostics report: sensor topic rates and the stm32_bridge IMU diagnostic.

Imported only when `diagnostics_enabled` is true. Sensor topics are subscribed raw (no deserialization)
with sensor-data QoS, so watching a LiDAR scan costs one callback per message and works with reliable or
best-effort publishers. Topic names are relative and resolve inside the bridge's robot namespace; an empty
name marks a sensor the robot does not have (NOT_EQUIPPED).
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from diagnostic_msgs.msg import DiagnosticArray
from nav_msgs.msg import Odometry
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import Imu, LaserScan, PointCloud2

from .diagnostics import ImuDiagnostic, TopicRate, imu_sensor_status, topic_sensor_status


@dataclass(frozen=True)
class SensorTopics:
    lidar: str = 'scan'
    odometry: str = 'wheel/odom'
    imu: str = 'imu/data'
    depth_camera: str = 'camera/depth/points'


@dataclass(frozen=True)
class SensorLimits:
    stale_after_sec: float = 3.0
    lidar_min_hz: float = 5.0
    odometry_min_hz: float = 10.0
    depth_min_hz: float = 2.0


class RosSensorObserver:
    def __init__(self, node, topics: SensorTopics, limits: SensorLimits, rate_window_sec: float = 5.0):
        self._limits = limits
        self._topics = topics
        self._rates: dict[str, Optional[TopicRate]] = {}
        for key, msg_type in (('lidar', LaserScan), ('odometry', Odometry), ('imu', Imu),
                              ('depth_camera', PointCloud2)):
            topic = getattr(topics, key)
            if not topic:
                self._rates[key] = None
                continue
            rate = TopicRate(rate_window_sec)
            self._rates[key] = rate
            node.create_subscription(msg_type, topic, lambda _msg, rate=rate: rate.tick(),
                                     qos_profile_sensor_data, raw=True)
        namespace = node.get_namespace().rstrip('/')
        self._imu_prefix = f'{namespace}/' if namespace else '/'
        self._imu_lock = threading.Lock()
        self._imu: Optional[ImuDiagnostic] = None
        node.create_subscription(DiagnosticArray, '/diagnostics', self._on_diagnostics, 10)

    def _on_diagnostics(self, msg) -> None:
        for status in msg.status:
            # stm32_bridge names it '<fully qualified node>: imu'; keep only this robot's namespace.
            if not status.name.endswith(': imu') or not status.name.startswith(self._imu_prefix):
                continue
            level = status.level[0] if isinstance(status.level, (bytes, bytearray)) else int(status.level)
            diagnostic = ImuDiagnostic(level, status.message, {kv.key: kv.value for kv in status.values},
                                       datetime.now(timezone.utc), time.monotonic())
            with self._imu_lock:
                self._imu = diagnostic

    def sensors(self) -> dict:
        limits = self._limits
        with self._imu_lock:
            imu = self._imu
        return {
            'lidar': topic_sensor_status(self._topics.lidar, self._rates['lidar'], limits.stale_after_sec,
                                         limits.lidar_min_hz),
            'imu': imu_sensor_status(imu, self._rates['imu'], time.monotonic(), limits.stale_after_sec),
            'odometry': topic_sensor_status(self._topics.odometry, self._rates['odometry'],
                                            limits.stale_after_sec, limits.odometry_min_hz),
            'depthCamera': topic_sensor_status(self._topics.depth_camera, self._rates['depth_camera'],
                                               limits.stale_after_sec, limits.depth_min_hz),
        }
