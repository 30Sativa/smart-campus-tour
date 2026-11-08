"""Nav2 NavigateToPose adapter. Imported only when commands_enabled is true.

Every rclpy action call happens on the executor thread: the poll worker only queues work here.
The action name is relative, so it resolves inside the node's namespace like the rest of the
robot's Nav2 clients. No velocity is published, and nothing is cancelled at startup (ADR-0008).
"""

from __future__ import annotations

import math
import queue
import uuid

from action_msgs.msg import GoalStatus
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient
from unique_identifier_msgs.msg import UUID


class Nav2Navigator:
    def __init__(self, node, drain_period_sec: float = 0.05, on_goal_id=None):
        self._node = node
        self._on_goal_id = on_goal_id or (lambda goal_id: None)
        self._client = ActionClient(node, NavigateToPose, 'navigate_to_pose')
        self._work: queue.SimpleQueue = queue.SimpleQueue()
        self._handle = None
        self._cancel_pending = False
        self._timer = node.create_timer(drain_period_sec, self._drain)

    def send_goal(self, x, y, yaw, frame_id, on_response, on_result) -> None:
        self._work.put(lambda: self._send(x, y, yaw, frame_id, on_response, on_result))

    def cancel(self) -> None:
        self._work.put(self._cancel)

    def server_ready(self) -> bool:
        return self._client.server_is_ready()

    def _drain(self) -> None:
        while True:
            try:
                work = self._work.get_nowait()
            except queue.Empty:
                return
            work()

    def _send(self, x, y, yaw, frame_id, on_response, on_result) -> None:
        self._handle = None
        self._cancel_pending = False
        if not self._client.server_is_ready():
            on_response(False, 'NAV2_UNAVAILABLE')
            return
        goal = NavigateToPose.Goal()
        goal.pose = PoseStamped()
        goal.pose.header.frame_id = frame_id
        goal.pose.header.stamp = self._node.get_clock().now().to_msg()
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        goal.pose.pose.orientation.z = math.sin(yaw / 2.0)
        goal.pose.pose.orientation.w = math.cos(yaw / 2.0)
        # The id is chosen here so the status of this goal is never mistaken for a foreign one.
        goal_id = uuid.uuid4().bytes
        self._on_goal_id(goal_id)
        future = self._client.send_goal_async(goal, goal_uuid=UUID(uuid=list(goal_id)))
        future.add_done_callback(lambda done: self._on_goal(done, on_response, on_result))

    def _on_goal(self, future, on_response, on_result) -> None:
        try:
            handle = future.result()
        except Exception:
            on_response(False, 'NAV2_SEND_FAILED')
            return
        if handle is None or not handle.accepted:
            on_response(False, 'NAV2_REJECTED')
            return
        self._handle = handle
        on_response(True, None)
        handle.get_result_async().add_done_callback(lambda done: self._on_result(done, on_result))
        if self._cancel_pending:
            handle.cancel_goal_async()

    def _on_result(self, future, on_result) -> None:
        try:
            status = future.result().status
        except Exception:
            # The handle stays: the goal may still be running, so a Cancel must still reach it.
            on_result('UNKNOWN')
            return
        result = {GoalStatus.STATUS_SUCCEEDED: 'SUCCEEDED', GoalStatus.STATUS_CANCELED: 'CANCELED',
                  GoalStatus.STATUS_ABORTED: 'ABORTED'}.get(status, 'UNKNOWN')
        if result != 'UNKNOWN':
            self._handle = None
        on_result(result)

    def _cancel(self) -> None:
        # A Cancel can arrive before Nav2 answers the goal; it is applied as soon as the goal has a handle.
        if self._handle is None:
            self._cancel_pending = True
        else:
            self._handle.cancel_goal_async()
