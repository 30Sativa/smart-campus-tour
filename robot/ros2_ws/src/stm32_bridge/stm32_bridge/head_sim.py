"""head_sim: dau quay PAN/TILT gia lap, thay cho phan head/* cua stm32_bridge khi chay Gazebo.

CHI DUNG TRONG MO PHONG. Khong bao gio chay cung stm32_bridge (trung ten topic/service/action) va khong
chay tren robot that.

Cung giao dien nhu stm32_bridge (robot/ros2_ws/src/stm32_bridge/HEAD_CONTROL.md), nen fleet_bridge, head_teleop
va nut tren web dung y nhu voi robot that:
  action  head/set   (SetHead: goc tuyet doi hoac HOME)      service head/sweep (HeadSweep)
  service head/stop, head/off, head/zero (Trigger)           topic   head/step (HeadStep), head/jog (HeadJog)
  topic   head/state (HeadState, 10 Hz)
Them cho mo phong: topic head/markers (MarkerArray) ve huong dau va vung camera nhin tren than robot trong RViz.

Mo hinh chuyen dong: head_sim_model.py (gioi han, vat can, toc do, buoc du nhu firmware 14/11/2026).
"""

from __future__ import annotations

import math
import threading
import time

import rclpy
from bus_interfaces.action import SetHead
from bus_interfaces.msg import HeadJog, HeadState, HeadStep
from bus_interfaces.srv import HeadSweep
from geometry_msgs.msg import Point
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from std_srvs.srv import Trigger
from visualization_msgs.msg import Marker, MarkerArray

from .head_sim_model import STATE_IDLE, STATE_NAMES, HeadSimModel, describe

TICK_HZ = 50.0
# Quest 3 tren robot that: truc TILT cao 0.969 m, mat kinh cach truc ~0.27 m (CAD campus-amr-explode.glb).
TILT_AXIS_Z = 0.969
LENS_FROM_AXIS = 0.27
VIEW_LENGTH = 1.2
VIEW_HALF_DEG = 28.0


class HeadSimNode(Node):
    def __init__(self):
        super().__init__('head_sim')
        self.declare_parameter('head_auto_home', True)
        self.declare_parameter('head_frame', 'base_link')
        self.declare_parameter('head_move_timeout', 20.0)
        self.declare_parameter('head_home_timeout', 45.0)
        self.declare_parameter('head_sweep_deg', 135.0)
        self._frame = str(self.get_parameter('head_frame').value)
        self._move_timeout = float(self.get_parameter('head_move_timeout').value)
        self._home_timeout = float(self.get_parameter('head_home_timeout').value)
        self._sweep_deg = float(self.get_parameter('head_sweep_deg').value)

        self._lock = threading.Lock()
        self._model = HeadSimModel()
        self._last_tick = time.monotonic()
        self._last_logged = ''

        cb = ReentrantCallbackGroup()
        self._state_pub = self.create_publisher(HeadState, 'head/state', 10)
        self._marker_pub = self.create_publisher(MarkerArray, 'head/markers', 10)
        self.create_subscription(HeadJog, 'head/jog', self._on_jog, 10, callback_group=cb)
        self.create_subscription(HeadStep, 'head/step', self._on_step, 10, callback_group=cb)
        for name, command in (('head/stop', 'stop'), ('head/off', 'off'), ('head/zero', 'zero')):
            self.create_service(Trigger, name, lambda req, resp, command=command: self._trigger(resp, command),
                                callback_group=cb)
        self.create_service(HeadSweep, 'head/sweep', self._srv_sweep, callback_group=cb)
        ActionServer(self, SetHead, 'head/set', execute_callback=self._execute,
                     goal_callback=lambda _goal: GoalResponse.ACCEPT,
                     cancel_callback=lambda _goal: CancelResponse.ACCEPT, callback_group=cb)
        self.create_timer(1.0 / TICK_HZ, self._tick, callback_group=cb)
        self.create_timer(0.1, self._publish, callback_group=cb)

        self.get_logger().warning('head_sim: DAU QUAY GIA LAP cho Gazebo. Khong chay cung stm32_bridge, '
                                  'khong dung tren robot that.')
        if bool(self.get_parameter('head_auto_home').value):
            with self._lock:
                self._model.home()
            self.get_logger().info('head_sim: tu HOME khi khoi dong (nhu stm32_bridge head_auto_home).')

    # ---- ROS callbacks ----------------------------------------------------------------------------------------
    def _trigger(self, resp, command: str):
        with self._lock:
            resp.success, resp.message = getattr(self._model, command)()
        return resp

    def _on_jog(self, msg: HeadJog) -> None:
        with self._lock:
            self._model.jog(msg.pan, msg.tilt, time.monotonic())

    def _on_step(self, msg: HeadStep) -> None:
        with self._lock:
            ok, message = self._model.step(int(msg.pan_steps), int(msg.tilt_steps))
        if not ok:
            self.get_logger().warning(f'head_sim: head/step {message}')

    def _srv_sweep(self, req, resp):
        amplitude = float(getattr(req, 'amplitude_deg', 0.0) or 0.0) or self._sweep_deg
        with self._lock:
            resp.success, resp.message = self._model.sweep(amplitude)
        self.get_logger().info(f'head_sim: head/sweep {amplitude:.0f} do -> {resp.message}')
        return resp

    def _execute(self, goal_handle):
        goal = goal_handle.request
        home = goal.mode == SetHead.Goal.MODE_HOME
        with self._lock:
            ok, message = self._model.home() if home else self._model.angle(goal.pan_deg, goal.tilt_deg)
            seq = self._model.seq
        what = 'HOME' if home else f'goc PAN {goal.pan_deg:.1f}, TILT {goal.tilt_deg:.1f}'
        self.get_logger().info(f'head_sim: head/set {what} -> {message}')
        result = SetHead.Result()
        if not ok:
            goal_handle.abort()
            result.success, result.message = False, message
            return self._fill(result)
        deadline = time.monotonic() + (self._home_timeout if home else self._move_timeout)
        while rclpy.ok():
            if goal_handle.is_cancel_requested:
                with self._lock:
                    self._model.stop()
                goal_handle.canceled()
                result.success, result.message = False, 'canceled'
                return self._fill(result)
            with self._lock:
                superseded = self._model.seq != seq
                done = self._model.at_rest()
                referenced = self._model.referenced
                feedback = SetHead.Feedback()
                feedback.state = self._model.state
                feedback.pan_deg, feedback.tilt_deg = self._model.pan, self._model.tilt
            goal_handle.publish_feedback(feedback)
            if superseded:
                goal_handle.abort()
                result.success, result.message = False, 'superseded'
                return self._fill(result)
            if done:
                goal_handle.succeed()
                result.success = referenced
                result.message = 'homed' if home else 'reached'
                return self._fill(result)
            if time.monotonic() > deadline:
                goal_handle.abort()
                result.success, result.message = False, 'timeout'
                return self._fill(result)
            time.sleep(0.05)
        goal_handle.abort()
        result.success, result.message = False, 'shutdown'
        return self._fill(result)

    def _fill(self, result):
        with self._lock:
            result.pan_deg, result.tilt_deg = self._model.pan, self._model.tilt
        return result

    # ---- timers -----------------------------------------------------------------------------------------------
    def _tick(self) -> None:
        now = time.monotonic()
        with self._lock:
            self._model.tick(now - self._last_tick, now)
            text = describe(self._model)
            state = self._model.state
        self._last_tick = now
        # Log khi dung yen o mot vi tri moi, de nhin terminal cung biet dau dang o dau.
        if state == STATE_IDLE and text != self._last_logged:
            self._last_logged = text
            self.get_logger().info(f'head_sim: {text}')

    def _publish(self) -> None:
        with self._lock:
            model = self._model
            state = HeadState()
            state.header.stamp = self.get_clock().now().to_msg()
            state.header.frame_id = self._frame
            state.state, state.referenced = model.state, model.referenced
            state.pan_deg, state.tilt_deg, state.last_head_seq = model.pan, model.tilt, model.seq
            text = describe(model)
            pan, tilt, name = model.pan, model.tilt, STATE_NAMES[model.state]
        self._state_pub.publish(state)
        self._marker_pub.publish(self._markers(pan, tilt, text, name))

    def _markers(self, pan: float, tilt: float, text: str, state: str) -> MarkerArray:
        """Huong camera (mui ten), vung nhin (hai canh) va nhan trang thai, tren truc TILT cua robot."""
        stamp = self.get_clock().now().to_msg()
        p, t = math.radians(pan), math.radians(tilt)

        def direction(extra_pan: float = 0.0, extra_tilt: float = 0.0):
            yaw, pitch = p + extra_pan, t + extra_tilt
            return math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)

        def point(x: float, y: float, z: float) -> Point:
            out = Point()
            out.x, out.y, out.z = x, y, z
            return out

        dx, dy, dz = direction()
        lens = point(LENS_FROM_AXIS * 0.55 * dx, LENS_FROM_AXIS * 0.55 * dy,
                     TILT_AXIS_Z + 0.22 + LENS_FROM_AXIS * 0.2 * dz)
        colour = (0.18, 0.44, 0.62) if state == 'IDLE' else (0.96, 0.62, 0.04)

        def marker(marker_id: int, kind: int) -> Marker:
            m = Marker()
            m.header.frame_id, m.header.stamp = self._frame, stamp
            m.ns, m.id, m.type, m.action = 'head_sim', marker_id, kind, Marker.ADD
            m.pose.orientation.w = 1.0
            m.color.r, m.color.g, m.color.b, m.color.a = colour[0], colour[1], colour[2], 0.95
            return m

        head = marker(0, Marker.SPHERE)
        head.pose.position = point(0.0, 0.0, TILT_AXIS_Z + 0.18)
        head.scale.x = head.scale.y = head.scale.z = 0.2
        head.color.r = head.color.g = head.color.b = 0.92

        arrow = marker(1, Marker.ARROW)
        arrow.points = [lens, point(lens.x + VIEW_LENGTH * dx, lens.y + VIEW_LENGTH * dy, lens.z + VIEW_LENGTH * dz)]
        arrow.scale.x, arrow.scale.y, arrow.scale.z = 0.03, 0.07, 0.1

        edges = marker(2, Marker.LINE_LIST)
        edges.scale.x = 0.012
        for extra in (-VIEW_HALF_DEG, VIEW_HALF_DEG):
            ex, ey, ez = direction(math.radians(extra))
            edges.points += [lens,
                             point(lens.x + VIEW_LENGTH * ex, lens.y + VIEW_LENGTH * ey, lens.z + VIEW_LENGTH * ez)]
        edges.color.a = 0.6

        label = marker(3, Marker.TEXT_VIEW_FACING)
        label.pose.position = point(0.0, 0.0, TILT_AXIS_Z + 0.55)
        label.scale.z = 0.12
        label.text = text
        label.color.r = label.color.g = label.color.b = 0.1
        out = MarkerArray()
        out.markers = [head, arrow, edges, label]
        return out


def main(args=None):
    rclpy.init(args=args)
    node = HeadSimNode()
    executor = MultiThreadedExecutor(num_threads=4)
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
