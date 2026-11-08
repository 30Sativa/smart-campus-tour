"""ROS sources for readiness. Imported only when commands_enabled is true; subscribes and asks, never commands."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from action_msgs.msg import GoalStatusArray
from geometry_msgs.msg import PoseWithCovarianceStamped
from nav_msgs.msg import Odometry
from rcl_interfaces.srv import GetParameters
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
from std_msgs.msg import Bool, String

from .goal_monitor import MONITORED_ACTIONS, GoalMonitor
from .map_check import MapChecker
from .readiness import MAP_EVIDENCE_MISSING, Observations, Readiness, ReadinessLimits, evaluate

ACTIVE_GOAL_STATUSES = {1, 2, 3}
REFRESH_PERIOD_SEC = 0.2
MAP_CHECK_PERIOD_SEC = 2.0
MAP_RESULT_MAX_AGE_SEC = 5.0
VIEW_MAX_AGE_SEC = 1.0


@dataclass(frozen=True)
class ReadinessSources:
    odometry_topic: str = 'wheel/odom'
    map_package_path: str = ''
    map_package_sha256: str = ''
    map_server_name: str = 'map_server'


class ReadinessMonitor:
    def __init__(self, node, limits: ReadinessLimits, sources: ReadinessSources):
        self._node = node
        self._limits = limits
        self._lock = threading.Lock()
        self.goals = GoalMonitor()
        self._map_checker = MapChecker(sources.map_package_path, sources.map_package_sha256)
        self._navigator = None
        self._amcl = None
        self._estop = None
        self._mode = None
        self._gate = None
        self._gate_time = None
        self._odom_time = None
        self._tf_stamp = None
        self._tf_changed_time = None
        self._map_fault = MAP_EVIDENCE_MISSING
        self._map_time = None
        self._latest = Readiness()
        self._latest_time = None

        latched = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE,
                             durability=DurabilityPolicy.TRANSIENT_LOCAL)
        volatile = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.VOLATILE)
        node.create_subscription(PoseWithCovarianceStamped, 'amcl_pose', self._on_amcl, latched)
        node.create_subscription(Bool, 'emergency_stop_state', self._on_estop, latched)
        node.create_subscription(String, 'robot_mode_state', self._on_mode, latched)
        node.create_subscription(String, 'motion_gate_state', self._on_gate, volatile)
        node.create_subscription(Odometry, sources.odometry_topic, self._on_odom, qos_profile_sensor_data)
        self._status_subs = {
            action: node.create_subscription(
                GoalStatusArray, f'{action}/_action/status',
                lambda msg, name=action: self._on_status(name, msg), latched)
            for action in MONITORED_ACTIONS
        }
        self._map_params = node.create_client(GetParameters, f'{sources.map_server_name}/get_parameters')
        node.create_timer(MAP_CHECK_PERIOD_SEC, self._request_map_path)
        node.create_timer(REFRESH_PERIOD_SEC, self._refresh)

    def attach_navigator(self, navigator) -> None:
        self._navigator = navigator

    def view(self) -> Readiness:
        """Latest evaluation. If the executor stopped refreshing it, nothing is ready."""
        with self._lock:
            age_ok = self._latest_time is not None and time.monotonic() - self._latest_time <= VIEW_MAX_AGE_SEC
            return self._latest if age_ok else Readiness()

    def note_tf_stamp(self, stamp) -> None:
        """Freshness is when the stamp last advanced: in simulation TF stamps are on another clock than this node."""
        value = (stamp.sec, stamp.nanosec)
        if value != self._tf_stamp:
            self._tf_stamp = value
            self._tf_changed_time = time.monotonic()

    def _on_amcl(self, msg) -> None:
        covariance = msg.pose.covariance
        self._amcl = (covariance[0], covariance[7], covariance[35])

    def _on_estop(self, msg) -> None:
        self._estop = bool(msg.data)

    def _on_mode(self, msg) -> None:
        self._mode = msg.data

    def _on_gate(self, msg) -> None:
        self._gate = msg.data
        self._gate_time = time.monotonic()

    def _on_odom(self, _msg) -> None:
        self._odom_time = time.monotonic()

    def _on_status(self, action: str, msg) -> None:
        self.goals.on_status(action, (bytes(item.goal_info.goal_id.uuid) for item in msg.status_list
                                      if item.status in ACTIVE_GOAL_STATUSES))

    def _status_alive(self, action: str) -> bool:
        return self._node.count_publishers(self._status_subs[action].topic_name) > 0

    def _request_map_path(self) -> None:
        if not self._map_params.service_is_ready():
            return
        request = GetParameters.Request()
        request.names = ['yaml_filename']
        self._map_params.call_async(request).add_done_callback(self._on_map_path)

    def _on_map_path(self, future) -> None:
        try:
            values = future.result().values
        except Exception:  # noqa: BLE001 - any failure here is simply missing evidence
            values = []
        # Runs on the executor. The hash is only recomputed when a file changed.
        self._map_fault = self._map_checker.check(values[0].string_value if values else '')
        self._map_time = time.monotonic()

    def _refresh(self) -> None:
        now = time.monotonic()
        map_fresh = self._map_time is not None and now - self._map_time <= MAP_RESULT_MAX_AGE_SEC
        navigator = self._navigator
        observations = Observations(
            amcl_covariance=self._amcl,
            tf_age_sec=None if self._tf_changed_time is None else now - self._tf_changed_time,
            emergency_stop=self._estop,
            mode=self._mode,
            gate_state=self._gate,
            gate_age_sec=None if self._gate_time is None else now - self._gate_time,
            odom_age_sec=None if self._odom_time is None else now - self._odom_time,
            nav2_ready=None if navigator is None else navigator.server_ready(),
            unowned_goal=self.goals.classify(self._status_alive),
            map_fault=self._map_fault if map_fresh else MAP_EVIDENCE_MISSING,
        )
        latest = evaluate(observations, self._limits)
        with self._lock:
            self._latest = latest
            self._latest_time = now
