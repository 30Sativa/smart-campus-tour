"""ROS-free safety tests for the velocity mode manager."""

import os
import sys
import types
from types import SimpleNamespace


def _install_ros_stubs():
    def stub(name):
        module = types.ModuleType(name)
        sys.modules[name] = module
        return module

    action_msgs = stub('action_msgs')
    action_msgs_srv = stub('action_msgs.srv')
    action_msgs.srv = action_msgs_srv
    action_msgs_srv.CancelGoal = type('CancelGoal', (), {})
    action_msgs_msg = stub('action_msgs.msg')
    action_msgs.msg = action_msgs_msg
    action_msgs_msg.GoalStatusArray = type('GoalStatusArray', (), {})

    geometry_msgs = stub('geometry_msgs')
    geometry_msgs_msg = stub('geometry_msgs.msg')
    geometry_msgs.msg = geometry_msgs_msg

    class Twist:
        def __init__(self):
            self.linear = SimpleNamespace(x=0.0, y=0.0, z=0.0)
            self.angular = SimpleNamespace(x=0.0, y=0.0, z=0.0)

    geometry_msgs_msg.Twist = Twist

    rclpy = stub('rclpy')
    rclpy_node = stub('rclpy.node')
    rclpy.node = rclpy_node
    rclpy_node.Node = type('Node', (), {})
    rclpy_qos = stub('rclpy.qos')
    rclpy.qos = rclpy_qos
    rclpy_qos.DurabilityPolicy = type('DurabilityPolicy', (), {})
    rclpy_qos.QoSProfile = type('QoSProfile', (), {})
    rclpy_qos.ReliabilityPolicy = type('ReliabilityPolicy', (), {})

    std_msgs = stub('std_msgs')
    std_msgs_msg = stub('std_msgs.msg')
    std_msgs.msg = std_msgs_msg
    std_msgs_msg.Bool = type('Bool', (), {})
    std_msgs_msg.String = type('String', (), {})

    std_srvs = stub('std_srvs')
    std_srvs_srv = stub('std_srvs.srv')
    std_srvs.srv = std_srvs_srv
    std_srvs_srv.SetBool = type('SetBool', (), {})
    std_srvs_srv.Trigger = type('Trigger', (), {})


_install_ros_stubs()

_PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from robot_control.mode_manager_node import (  # noqa: E402
    EXPLORE_MODE,
    MANUAL_MODE,
    ModeManagerNode,
)
from robot_control.motion_gate import MotionGate  # noqa: E402


def _twist(linear_x=0.0, angular_z=0.0):
    return SimpleNamespace(
        linear=SimpleNamespace(x=linear_x, y=0.0, z=0.0),
        angular=SimpleNamespace(x=0.0, y=0.0, z=angular_z),
    )


def test_command_freshness_rejects_clock_rollback():
    assert ModeManagerNode._is_recent(10.0, 0.5, 10.4)
    assert not ModeManagerNode._is_recent(10.0, 0.5, 10.6)
    assert not ModeManagerNode._is_recent(10.0, 0.5, 9.9)
    assert not ModeManagerNode._is_recent(None, 0.5, 10.0)


def test_non_finite_twist_is_rejected():
    assert ModeManagerNode._is_finite_twist(_twist(0.2, -0.1))
    assert not ModeManagerNode._is_finite_twist(_twist(float('nan'), 0.0))
    assert not ModeManagerNode._is_finite_twist(_twist(0.0, float('-inf')))


class _Publisher:
    def __init__(self):
        self.sent = []

    def publish(self, message):
        self.sent.append(message)


class _Harness:
    """A real ModeManagerNode control path with ROS replaced by fakes."""

    def __init__(self, required=True, mode=EXPLORE_MODE, link_required=False):
        node = ModeManagerNode.__new__(ModeManagerNode)
        self.node = node
        self.now = 100.0
        logger = SimpleNamespace(info=lambda *_: None, warn=lambda *_: None,
                                 error=lambda *_: None)
        node.get_logger = lambda: logger
        node._now = lambda: self.now
        node.count_publishers = lambda _topic: self.status_publishers
        self.status_publishers = 1
        node._nav2_status_sub = SimpleNamespace(topic_name='status')
        node._nav2_active_goals = None
        node.mode = mode
        node.manual_timeout = 0.5
        node.nav_timeout = 0.5
        node.manual_priority_in_explore = True
        node._motion_gate = MotionGate(required, 0.6)
        node._link_gate = MotionGate(link_required, 0.6, start_latched=False)
        node._last_link_cancel_time = 0.0
        self.cancels = 0
        node._request_nav2_cancel = self._cancel
        node._last_gate_state = ''
        node._manual_cmd = None
        node._nav_cmd = None
        node._last_manual_time = None
        node._last_nav_time = None
        node._emergency_stop = False
        node._last_source = ''
        node._cmd_pub = _Publisher()
        node._gate_state_pub = _Publisher()
        self.nav_cmd = _twist(0.2)
        self.manual_cmd = _twist(0.1)

    def _cancel(self):
        self.cancels += 1

    def link(self, value=True):
        self.node._stm32_link_callback(SimpleNamespace(data=value))

    def permit(self, value=True):
        self.node._motion_permit_callback(SimpleNamespace(data=value))

    def nav(self):
        self.node._nav_callback(self.nav_cmd)

    def manual(self):
        self.node._manual_callback(self.manual_cmd)

    def tick(self, advance=0.05):
        self.now += advance
        self.node._timer_callback()
        return self.node._cmd_pub.sent[-1]

    def is_motion(self, sent, source=None):
        return sent.linear.x == (source or self.nav_cmd).linear.x

    def reset(self):
        response = SimpleNamespace(success=None, message=None)
        self.node._motion_inhibit_reset_callback(None, response)
        return response

    def state(self):
        return self.node._gate_state_pub.sent[-1].data

    def open(self):
        """Take a booted gate to OPEN the way a person does."""
        self.permit()
        assert self.reset().success
        self.tick()


def test_gate_disabled_forwards_nav_without_a_permit():
    h = _Harness(required=False)
    h.nav()
    assert h.is_motion(h.tick())
    assert h.state() == 'DISABLED'


def test_gate_disabled_has_no_latch_on_estop_and_cannot_be_reset():
    h = _Harness(required=False)
    h.node._emergency_stop = True
    h.tick()
    h.node._emergency_stop = False
    h.nav()
    assert h.is_motion(h.tick())
    assert not h.reset().success


def test_gate_starts_latched_and_a_permit_alone_does_not_open_it():
    h = _Harness()
    h.permit()
    h.nav()
    assert not h.is_motion(h.tick())
    assert h.state() == 'LATCHED:BOOT'


def test_reset_opens_the_gate_and_nav_passes():
    h = _Harness()
    h.open()
    h.permit()
    h.nav()
    assert h.is_motion(h.tick())
    assert h.state() == 'OPEN'


def test_permit_expiry_during_nav_latches_and_zeroes():
    h = _Harness()
    h.open()
    h.permit()
    h.nav()
    assert h.is_motion(h.tick())
    h.now += 0.6
    h.nav()
    assert not h.is_motion(h.tick())
    assert h.state() == 'LATCHED:PERMIT_LOST'
    assert h.node._nav_cmd is None


def test_explicit_false_permit_during_nav_latches():
    h = _Harness()
    h.open()
    h.permit(False)
    h.nav()
    assert not h.is_motion(h.tick())
    assert h.state() == 'LATCHED:PERMIT_LOST'


def test_returning_permit_never_clears_the_latch():
    h = _Harness()
    h.open()
    h.permit(False)
    h.nav()
    h.tick()
    for _ in range(40):
        h.permit()
        h.nav()
        assert not h.is_motion(h.tick())
    assert h.state() == 'LATCHED:PERMIT_LOST'


def test_zero_twist_counts_as_nav_activity():
    h = _Harness()
    h.open()
    h.nav_cmd = _twist(0.0)
    h.permit(False)
    h.nav()
    h.tick()
    assert h.state() == 'LATCHED:PERMIT_LOST'


def test_permit_loss_while_nav_is_silent_blocks_without_latching():
    h = _Harness()
    h.open()
    h.permit(False)
    h.tick(1.0)
    assert h.state() == 'BLOCKED'
    h.permit()
    h.nav()
    assert h.is_motion(h.tick())
    assert h.state() == 'OPEN'


def test_teleop_is_live_while_latched():
    h = _Harness(mode=MANUAL_MODE)
    h.manual()
    assert h.is_motion(h.tick(), h.manual_cmd)
    assert h.state() == 'LATCHED:BOOT'


def test_manual_override_in_explore_is_live_while_latched():
    h = _Harness()
    h.manual()
    assert h.is_motion(h.tick(), h.manual_cmd)
    assert h.node._last_source == 'manual_override'


def test_estop_still_blocks_teleop_and_latches():
    h = _Harness(mode=MANUAL_MODE)
    h.open()
    h.node._emergency_stop = True
    h.manual()
    assert not h.is_motion(h.tick(), h.manual_cmd)
    assert h.state() == 'LATCHED:ESTOP'


def test_estop_release_leaves_the_latch_until_reset():
    h = _Harness()
    h.open()
    h.node._emergency_stop = True
    h.tick()
    h.node._emergency_stop = False
    h.permit()
    h.nav()
    assert not h.is_motion(h.tick())
    assert h.state() == 'LATCHED:ESTOP'


def test_reset_refused_while_a_goal_is_active():
    h = _Harness()
    h.permit()
    h.node._nav2_status_callback(SimpleNamespace(
        status_list=[SimpleNamespace(status=2)]))
    response = h.reset()
    assert not response.success
    assert 'active' in response.message
    assert h.state() == 'LATCHED:BOOT'


def test_reset_allowed_when_goals_are_terminal():
    h = _Harness()
    h.permit()
    h.node._nav2_status_callback(SimpleNamespace(
        status_list=[SimpleNamespace(status=4), SimpleNamespace(status=6)]))
    assert h.reset().success


def test_reset_allowed_when_a_live_nav2_has_never_had_a_goal():
    h = _Harness()
    h.permit()
    assert h.node._nav2_active_goals is None
    assert h.reset().success


def test_reset_refused_when_nav2_status_has_no_publisher():
    h = _Harness()
    h.permit()
    h.status_publishers = 0
    assert not h.reset().success


def test_reset_refused_without_a_fresh_permit():
    h = _Harness()
    assert not h.reset().success
    h.permit()
    h.now += 0.7
    assert not h.reset().success


def test_reset_refused_during_emergency_stop():
    h = _Harness()
    h.permit()
    h.node._emergency_stop = True
    assert not h.reset().success


def test_reset_drops_a_stored_nav_command():
    h = _Harness()
    h.permit()
    h.nav()
    assert h.reset().success
    assert h.node._nav_cmd is None
    assert h.node._last_nav_time is None


def _run_all():
    tests = [value for name, value in sorted(globals().items())
             if name.startswith('test_')]
    failures = 0
    for test in tests:
        try:
            test()
            print(f'PASS  {test.__name__}')
        except AssertionError as exc:
            failures += 1
            print(f'FAIL  {test.__name__}: {exc}')
    print(f'\n{len(tests) - failures}/{len(tests)} passed')
    return failures


if __name__ == '__main__':
    sys.exit(1 if _run_all() else 0)


# ---- STM32 link latch -------------------------------------------------------
def _link_harness():
    h = _Harness(required=False, link_required=True)
    h.link()
    return h


def _driving(h):
    h.nav()
    h.link()
    return h.tick()


def test_link_gate_off_changes_nothing():
    h = _Harness(required=False)
    h.nav()
    assert h.is_motion(h.tick())
    assert h.cancels == 0


def test_nav_passes_while_the_link_is_ok():
    h = _link_harness()
    assert h.is_motion(_driving(h))
    assert h.cancels == 0


def test_link_false_while_driving_zeroes_and_cancels():
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    assert not h.is_motion(h.tick())
    assert h.node._link_gate.latch_reason is not None
    assert h.cancels == 1


def test_stale_link_topic_latches_like_a_bridge_crash():
    h = _link_harness()
    _driving(h)
    for _ in range(14):                     # 0.7 s of nav with no link topic
        h.nav()
        last = h.tick()
    assert not h.is_motion(last)
    assert h.node._link_gate.latch_reason is not None


def test_returning_link_does_not_release_while_the_goal_is_active():
    """The core rule: a zero from Nav2 or a healthy link is not a new goal."""
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    h.tick()
    h.node._nav2_active_goals = 1
    for _ in range(40):
        h.nav()
        h.link()
        assert not h.is_motion(h.tick())
    assert h.node._link_gate.latch_reason is not None


def test_silent_nav_with_an_active_goal_stays_latched():
    h = _link_harness()
    _driving(h)
    h.link(False)
    h.nav()
    h.tick()
    h.node._nav2_active_goals = 1
    for _ in range(30):
        h.link()
        h.tick()
    assert h.node._link_gate.latch_reason is not None


def test_cancel_is_retried_while_the_goal_stays_active():
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    h.tick()
    h.node._nav2_active_goals = 1
    for _ in range(41):                     # 2 s
        h.link(False)
        h.tick()
    assert 2 <= h.cancels <= 4


def test_latch_clears_only_after_goal_end_link_ok_and_nav_silence():
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    h.tick()
    h.node._nav2_active_goals = 0
    h.tick()
    assert h.node._link_gate.latch_reason is not None       # link still down
    for _ in range(12):
        h.link()
        h.tick()
    assert h.node._link_gate.latch_reason is None


def test_recent_nav_blocks_the_release_even_with_no_goal_reported():
    """A status topic that never arrived must not look like an idle Nav2."""
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    h.tick()
    assert h.node._nav2_active_goals is None
    h.nav()
    h.link()
    h.tick()
    assert h.node._link_gate.latch_reason is not None


def test_new_goal_after_release_drives():
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    h.tick()
    h.node._nav2_active_goals = 0
    for _ in range(12):
        h.link()
        h.tick()
    assert h.is_motion(_driving(h))


def test_no_stale_nav_command_survives_the_latch():
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    h.tick()
    assert h.node._nav_cmd is None


def test_link_loss_while_parked_does_not_latch_or_cancel():
    h = _link_harness()
    for _ in range(20):
        h.link(False)
        h.tick()
    assert h.node._link_gate.latch_reason is None
    assert h.cancels == 0


def test_goal_before_the_link_is_up_latches():
    h = _Harness(required=False, link_required=True)
    h.nav()
    assert not h.is_motion(h.tick())
    assert h.node._link_gate.latch_reason is not None


def test_teleop_is_live_while_link_latched():
    h = _link_harness()
    _driving(h)
    h.nav()
    h.link(False)
    h.tick()
    h.manual()
    assert h.is_motion(h.tick(), h.manual_cmd)


def test_fleet_latch_is_not_cleared_by_the_link_gate():
    h = _Harness(required=True, link_required=True)
    h.open()
    h.link()
    h.nav()
    h.permit()
    assert h.is_motion(h.tick())
    for _ in range(14):                             # permit expires: fleet latch
        h.nav()
        h.link()
        last = h.tick()
    assert not h.is_motion(last)
    assert h.node._motion_gate.latch_reason is not None
    h.link()
    h.permit()
    h.node._nav2_active_goals = 0
    for _ in range(12):
        h.link()
        h.permit()
        h.tick()
    assert h.node._motion_gate.latch_reason is not None

