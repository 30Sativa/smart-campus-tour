import math
from typing import Optional

from action_msgs.msg import GoalStatusArray
from action_msgs.srv import CancelGoal
from geometry_msgs.msg import Twist
import rclpy
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_msgs.msg import Bool, String
from std_srvs.srv import SetBool, Trigger

from robot_control.motion_gate import MotionGate


MANUAL_MODE = 'manual'
EXPLORE_MODE = 'explore'
VALID_MODES = {MANUAL_MODE, EXPLORE_MODE}
# action_msgs/GoalStatus: ACCEPTED, EXECUTING, CANCELING.
ACTIVE_GOAL_STATUSES = {1, 2, 3}


class ModeManagerNode(Node):
    """Select the safe velocity source and publish the final cmd_vel."""

    def __init__(self):
        super().__init__('mode_manager_node')

        self.declare_parameter('initial_mode', MANUAL_MODE)
        self.declare_parameter('manual_timeout', 0.5)
        self.declare_parameter('nav_timeout', 0.5)
        self.declare_parameter('output_rate_hz', 20.0)
        self.declare_parameter('manual_priority_in_explore', True)
        self.declare_parameter('cancel_nav2_on_manual', True)
        self.declare_parameter(
            'nav2_cancel_service', 'navigate_to_pose/_action/cancel_goal')
        self.declare_parameter('require_motion_permit', False)
        self.declare_parameter('motion_permit_timeout', 0.6)
        self.declare_parameter(
            'nav2_status_topic', 'navigate_to_pose/_action/status')

        initial_mode = self._normalize_mode(
            str(self.get_parameter('initial_mode').value))
        if initial_mode is None:
            self.get_logger().warn(
                'initial_mode must be "manual" or "explore". '
                'Falling back to manual.')
            initial_mode = MANUAL_MODE
        self.mode = initial_mode
        self.manual_timeout = self._positive_float_parameter(
            'manual_timeout', 0.5)
        self.nav_timeout = self._positive_float_parameter('nav_timeout', 0.5)
        output_rate_hz = self._positive_float_parameter(
            'output_rate_hz', 20.0)
        self.manual_priority_in_explore = bool(
            self.get_parameter('manual_priority_in_explore').value)
        self.cancel_nav2_on_manual = bool(
            self.get_parameter('cancel_nav2_on_manual').value)
        self.nav2_cancel_service = str(
            self.get_parameter('nav2_cancel_service').value)
        self._motion_gate = MotionGate(
            bool(self.get_parameter('require_motion_permit').value),
            self._positive_float_parameter('motion_permit_timeout', 0.6))
        self._last_gate_state = ''
        self._nav2_active_goals: Optional[int] = None
        self._nav2_status_sub = None

        self._manual_cmd: Optional[Twist] = None
        self._nav_cmd: Optional[Twist] = None
        self._last_manual_time: Optional[float] = None
        self._last_nav_time: Optional[float] = None
        self._emergency_stop = False
        self._last_source = ''
        self._last_cancel_warn_time = 0.0

        state_qos = QoSProfile(
            depth=1,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.TRANSIENT_LOCAL,
        )
        # VOLATILE on purpose: a late joiner must never receive an old permit or gate state.
        motion_gate_qos = QoSProfile(
            depth=1,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.VOLATILE,
        )

        self._cmd_pub = self.create_publisher(Twist, 'cmd_vel', 10)
        self._mode_state_pub = self.create_publisher(
            String, 'robot_mode_state', state_qos)
        self._estop_state_pub = self.create_publisher(
            Bool, 'emergency_stop_state', state_qos)

        self.create_subscription(
            Twist, 'cmd_vel_manual', self._manual_callback, 10)
        self.create_subscription(Twist, 'cmd_vel_nav', self._nav_callback, 10)
        self.create_subscription(String, 'robot_mode',
                                 self._mode_topic_callback, 10)
        self.create_service(SetBool, 'emergency_stop',
                            self._emergency_stop_callback)
        self._cancel_client = self.create_client(
            CancelGoal, self.nav2_cancel_service)

        self._gate_state_pub = self.create_publisher(
            String, 'motion_gate_state', motion_gate_qos)
        self.create_service(Trigger, 'motion_inhibit_reset',
                            self._motion_inhibit_reset_callback)
        if self._motion_gate.required:
            self.create_subscription(
                Bool, 'motion_permit', self._motion_permit_callback,
                motion_gate_qos)
            self._nav2_status_sub = self.create_subscription(
                GoalStatusArray,
                str(self.get_parameter('nav2_status_topic').value),
                self._nav2_status_callback, state_qos)

        self._timer = self.create_timer(
            1.0 / output_rate_hz, self._timer_callback)
        self._gate_state_timer = self.create_timer(
            0.5, self._publish_gate_state)

        self.get_logger().info(
            'Starting mode manager: '
            f'mode={self.mode}, manual_timeout={self.manual_timeout:.3f}s, '
            f'nav_timeout={self.nav_timeout:.3f}s, '
            f'output_rate_hz={output_rate_hz:.1f}, '
            f'manual_priority_in_explore={self.manual_priority_in_explore}, '
            f'require_motion_permit={self._motion_gate.required}')
        self._publish_state()
        self._publish_zero('startup')

    def _manual_callback(self, msg: Twist):
        if not self._is_finite_twist(msg):
            self._manual_cmd = None
            self._last_manual_time = None
            self.get_logger().error('Rejected non-finite manual velocity command.')
            return
        self._manual_cmd = self._copy_twist(msg)
        self._last_manual_time = self._now()

    def _nav_callback(self, msg: Twist):
        if not self._is_finite_twist(msg):
            self._nav_cmd = None
            self._last_nav_time = None
            self.get_logger().error('Rejected non-finite Nav2 velocity command.')
            return
        self._nav_cmd = self._copy_twist(msg)
        self._last_nav_time = self._now()

    def _mode_topic_callback(self, msg: String):
        requested = self._normalize_mode(msg.data)
        if requested is None:
            self.get_logger().warn(
                f'Ignoring invalid robot mode "{msg.data}". '
                'Use "manual" or "explore".')
            return
        self._set_mode(requested)

    def _emergency_stop_callback(self, request, response):
        requested = bool(request.data)
        if requested == self._emergency_stop:
            state = 'engaged' if self._emergency_stop else 'released'
            response.success = True
            response.message = f'Emergency stop already {state}.'
            return response

        self._emergency_stop = requested
        if self._emergency_stop:
            self._publish_zero('emergency_stop')
            self._request_nav2_cancel()
            self.get_logger().error(
                'Emergency stop engaged. /cmd_vel forced to zero until reset.')
            response.message = 'Emergency stop engaged.'
        else:
            self._clear_commands()
            self._publish_zero('emergency_stop_reset')
            self.get_logger().warn('Emergency stop released.')
            response.message = 'Emergency stop released.'

        self._publish_state()
        response.success = True
        return response

    def _motion_permit_callback(self, msg: Bool):
        self._motion_gate.on_permit(msg.data, self._now())

    def _nav2_status_callback(self, msg: GoalStatusArray):
        self._nav2_active_goals = sum(
            1 for item in msg.status_list
            if item.status in ACTIVE_GOAL_STATUSES)

    def _motion_inhibit_reset_callback(self, request, response):
        # A crashed action server leaves its last status latched, so also require a live publisher.
        status_alive = (self._nav2_status_sub is not None and self.count_publishers(
            self._nav2_status_sub.topic_name) > 0)
        was_latched = self._motion_gate.latch_reason is not None
        response.success, response.message = self._motion_gate.reset(
            self._now(), self._emergency_stop, status_alive,
            self._nav2_active_goals)
        if response.success and was_latched:
            self._nav_cmd = None
            self._last_nav_time = None
        self.get_logger().warn(f'motion_inhibit_reset: {response.message}')
        self._publish_gate_state()
        return response

    def _update_motion_gate(self, now: float, nav_recent: bool) -> bool:
        was_latched = self._motion_gate.latch_reason is not None
        nav_allowed = self._motion_gate.update(
            now, nav_recent, self._emergency_stop)
        if not was_latched and self._motion_gate.latch_reason is not None:
            self._nav_cmd = None
            self._last_nav_time = None
            self.get_logger().error(
                f'Motion gate latched: {self._motion_gate.latch_reason}. '
                'Nav2 velocity stays zero until a local reset.')
        if self._motion_gate.state(now) != self._last_gate_state:
            self._publish_gate_state()
        return nav_allowed

    def _publish_gate_state(self):
        msg = String()
        msg.data = self._motion_gate.state(self._now())
        self._gate_state_pub.publish(msg)
        self._last_gate_state = msg.data

    def _timer_callback(self):
        now = self._now()
        nav_recent = self._is_recent(self._last_nav_time, self.nav_timeout, now)
        nav_allowed = self._update_motion_gate(now, nav_recent)

        if self._emergency_stop:
            self._publish_zero('emergency_stop')
            return

        source = ''
        cmd = None

        manual_recent = self._is_recent(self._last_manual_time,
                                        self.manual_timeout, now)

        if self.mode == MANUAL_MODE:
            if manual_recent:
                source = 'manual'
                cmd = self._manual_cmd
        elif self.mode == EXPLORE_MODE:
            if self.manual_priority_in_explore and manual_recent:
                source = 'manual_override'
                cmd = self._manual_cmd
            elif nav_recent and nav_allowed:
                source = 'nav'
                cmd = self._nav_cmd

        if cmd is None:
            self._publish_zero(
                f'{self.mode}_timeout' if nav_allowed else 'motion_gate')
            return

        self._cmd_pub.publish(cmd)
        self._log_source_change(source)

    def _set_mode(self, new_mode: str):
        if new_mode == self.mode:
            self.get_logger().info(f'Robot mode already {new_mode}.')
            self._publish_state()
            return

        old_mode = self.mode
        self.mode = new_mode

        if old_mode == EXPLORE_MODE and new_mode == MANUAL_MODE:
            self._nav_cmd = None
            self._last_nav_time = None
            self._publish_zero('mode_manual')
            if self.cancel_nav2_on_manual:
                self._request_nav2_cancel()

        if old_mode == MANUAL_MODE and new_mode == EXPLORE_MODE:
            self._manual_cmd = None
            self._last_manual_time = None
            self._publish_zero('mode_explore')

        self.get_logger().warn(f'Robot mode changed: {old_mode} -> {new_mode}')
        self._publish_state()

    def _request_nav2_cancel(self):
        now = self._now()
        if not self._cancel_client.service_is_ready():
            if not self._cancel_client.wait_for_service(timeout_sec=0.05):
                if now - self._last_cancel_warn_time > 2.0:
                    self.get_logger().warn(
                        f'Nav2 cancel service not ready: '
                        f'{self.nav2_cancel_service}')
                    self._last_cancel_warn_time = now
                return

        request = CancelGoal.Request()
        future = self._cancel_client.call_async(request)
        future.add_done_callback(self._cancel_done_callback)
        self.get_logger().info('Requested Nav2 goal cancellation.')

    def _cancel_done_callback(self, future):
        try:
            response = future.result()
        except Exception as exc:  # pragma: no cover - depends on ROS graph
            self.get_logger().warn(f'Nav2 cancel request failed: {exc}')
            return

        self.get_logger().info(
            'Nav2 cancel response: '
            f'return_code={response.return_code}, '
            f'goals_canceling={len(response.goals_canceling)}')

    def _clear_commands(self):
        self._manual_cmd = None
        self._nav_cmd = None
        self._last_manual_time = None
        self._last_nav_time = None

    def _publish_zero(self, reason: str):
        self._cmd_pub.publish(Twist())
        self._log_source_change(f'zero:{reason}')

    def _publish_state(self):
        mode_msg = String()
        mode_msg.data = self.mode
        self._mode_state_pub.publish(mode_msg)

        estop_msg = Bool()
        estop_msg.data = self._emergency_stop
        self._estop_state_pub.publish(estop_msg)

    def _log_source_change(self, source: str):
        if source == self._last_source:
            return
        self._last_source = source
        self.get_logger().info(f'/cmd_vel source: {source}')

    def _positive_float_parameter(self, name: str, fallback: float) -> float:
        value = float(self.get_parameter(name).value)
        if not math.isfinite(value) or value <= 0.0:
            self.get_logger().warn(
                f'{name} must be > 0. Falling back to {fallback}.')
            return fallback
        return value

    def _normalize_mode(self, value: str) -> Optional[str]:
        normalized = value.strip().lower()
        if normalized in ('auto', 'auto_explore', 'exploration'):
            normalized = EXPLORE_MODE
        if normalized not in VALID_MODES:
            return None
        return normalized

    def _now(self) -> float:
        return self.get_clock().now().nanoseconds / 1e9

    @staticmethod
    def _is_recent(stamp: Optional[float], timeout: float, now: float) -> bool:
        if stamp is None:
            return False
        age = now - stamp
        return 0.0 <= age <= timeout

    @staticmethod
    def _is_finite_twist(msg: Twist) -> bool:
        return all(math.isfinite(value) for value in (
            msg.linear.x,
            msg.linear.y,
            msg.linear.z,
            msg.angular.x,
            msg.angular.y,
            msg.angular.z,
        ))

    @staticmethod
    def _copy_twist(msg: Twist) -> Twist:
        copied = Twist()
        copied.linear.x = msg.linear.x
        copied.linear.y = msg.linear.y
        copied.linear.z = msg.linear.z
        copied.angular.x = msg.angular.x
        copied.angular.y = msg.angular.y
        copied.angular.z = msg.angular.z
        return copied


def main(args=None):
    rclpy.init(args=args)
    node = ModeManagerNode()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node._publish_zero('shutdown')
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
