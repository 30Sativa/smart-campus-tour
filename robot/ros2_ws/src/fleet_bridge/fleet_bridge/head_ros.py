"""ROS side of Fleet Head v1: turns the Operator's commands into the stm32_bridge head interface.

Imported only when `head_enabled` is true, so the telemetry-only bridge needs no bus_interfaces.
  STEP  -> topic head/step (HeadStep)        JOG  -> topic head/jog (HeadJog), republished at 10 Hz until its TTL
  STOP  -> service head/stop (Trigger)       ANGLE -> action head/set (SetHead, mode angle), fire and forget
  SWEEP -> service head/sweep (HeadSweep): automatic left -> right -> back, run by stm32_bridge; sweepDeg -> amplitude_deg
Feedback: topic head/state (HeadState) is sent back on the next poll.

POI head (poi_head.py): subscribes to `<nav_action>/_action/status` (action_msgs/GoalStatusArray) and turns the head
with the same actuator: front when a goal starts, the POI's camera preset when a goal succeeds near a POI.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Optional

from action_msgs.msg import GoalStatusArray
from bus_interfaces.action import SetHead
from bus_interfaces.msg import HeadJog, HeadState, HeadStep
from bus_interfaces.srv import HeadSweep
from rclpy.action import ActionClient
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_srvs.srv import Trigger

from .head import HeadCommandApplier, head_state_report
from .poi_head import PoiHeadDirector

STATE_STALE_SEC = 2.0


class RosHeadActuator:
    def __init__(self, node):
        self._node = node
        self._step_pub = node.create_publisher(HeadStep, 'head/step', 10)
        self._jog_pub = node.create_publisher(HeadJog, 'head/jog', 10)
        self._stop_client = node.create_client(Trigger, 'head/stop')
        self._sweep_client = node.create_client(HeadSweep, 'head/sweep')
        self._log = node.get_logger()
        self._set_client = ActionClient(node, SetHead, 'head/set')

    def step(self, pan_steps: int, tilt_steps: int) -> None:
        self._step_pub.publish(HeadStep(pan_steps=int(pan_steps), tilt_steps=int(tilt_steps)))

    def jog(self, pan_dir: int, tilt_dir: int) -> None:
        self._jog_pub.publish(HeadJog(pan=int(pan_dir), tilt=int(tilt_dir)))

    def stop(self) -> None:
        if not self._stop_client.service_is_ready():
            raise RuntimeError('head/stop unavailable')
        self._stop_client.call_async(Trigger.Request())

    def sweep(self, amplitude_deg: float) -> None:
        if not self._sweep_client.service_is_ready():
            raise RuntimeError('head/sweep unavailable')
        request = HeadSweep.Request()
        request.amplitude_deg = float(amplitude_deg)
        future = self._sweep_client.call_async(request)
        future.add_done_callback(self._log_sweep)

    def _log_sweep(self, future) -> None:
        try:
            result = future.result()
        except Exception as error:  # noqa: BLE001 - a failed call must not raise inside the executor
            self._log.warning(f'Head sweep call failed ({type(error).__name__}).')
            return
        if result is not None and not result.success:
            self._log.warning(f'Head sweep refused by stm32_bridge: {result.message}')

    def angle(self, pan_deg: float, tilt_deg: float) -> None:
        if not self._set_client.server_is_ready():
            raise RuntimeError('head/set unavailable')
        goal = SetHead.Goal()
        goal.mode = SetHead.Goal.MODE_ANGLE
        goal.pan_deg = float(pan_deg)
        goal.tilt_deg = float(tilt_deg)
        self._set_client.send_goal_async(goal)


class RosHeadState:
    """Latest head/state as the wire `head` object, or None when stale or never received."""

    def __init__(self, node):
        self._lock = threading.Lock()
        self._report: Optional[dict] = None
        self._received = 0.0
        node.create_subscription(HeadState, 'head/state', self._on_state, 10)

    def _on_state(self, msg) -> None:
        observed = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        with self._lock:
            self._report = head_state_report(msg.state, msg.referenced, msg.pan_deg, msg.tilt_deg, observed)
            self._received = time.monotonic()

    def latest(self) -> Optional[dict]:
        with self._lock:
            if self._report is None or time.monotonic() - self._received > STATE_STALE_SEC:
                return None
            return dict(self._report)


def create_ros_head(node, on_log) -> tuple[HeadCommandApplier, RosHeadState, RosHeadActuator]:
    actuator = RosHeadActuator(node)
    applier = HeadCommandApplier(actuator, on_log=on_log)
    state = RosHeadState(node)
    node.create_timer(0.1, lambda: applier.tick(time.monotonic()))
    return applier, state, actuator


def subscribe_poi_head(node, director: PoiHeadDirector, nav_action: str, pose_provider) -> None:
    """pose_provider() -> (x, y) in the map frame, or None while the TF pose is stale."""
    # Nav2 publishes goal status latched (transient local); the first message is the backlog the director ignores.
    latched = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL)

    def on_status(msg) -> None:
        statuses = [(bytes(item.goal_info.goal_id.uuid), int(item.status)) for item in msg.status_list]
        director.on_goal_status(statuses, pose_provider())

    node.create_subscription(GoalStatusArray, f'{nav_action}/_action/status', on_status, latched)
