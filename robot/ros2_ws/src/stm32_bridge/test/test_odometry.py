"""Unit tests for stm32_bridge odometry math.

These tests do not require a ROS environment. The ROS-specific modules
(``rclpy``, ``geometry_msgs``, ``nav_msgs``, ``tf2_ros``, ``serial``) are stubbed
out before importing the node so the pure-Python helpers can be exercised
directly.

Run with::

    python3 -m pytest ros2_ws/src/stm32_bridge/test/test_odometry.py
    # or simply:
    python3 ros2_ws/src/stm32_bridge/test/test_odometry.py
"""

import math
import os
import sys
import types
from types import SimpleNamespace


# ---------------------------------------------------------------------------
# Stub the ROS / serial modules so the node module imports without a ROS env.
# ---------------------------------------------------------------------------
def _install_ros_stubs():
    def _stub_module(name):
        mod = types.ModuleType(name)
        sys.modules[name] = mod
        return mod

    # geometry_msgs.msg with the message classes the node imports.
    geometry_msgs = _stub_module('geometry_msgs')
    geometry_msgs_msg = _stub_module('geometry_msgs.msg')
    geometry_msgs.msg = geometry_msgs_msg
    geometry_msgs_msg.TransformStamped = type('TransformStamped', (), {})
    geometry_msgs_msg.Twist = type('Twist', (), {})

    nav_msgs = _stub_module('nav_msgs')
    nav_msgs_msg = _stub_module('nav_msgs.msg')
    nav_msgs.msg = nav_msgs_msg
    nav_msgs_msg.Odometry = type('Odometry', (), {})

    sensor_msgs = _stub_module('sensor_msgs')
    sensor_msgs_msg = _stub_module('sensor_msgs.msg')
    sensor_msgs.msg = sensor_msgs_msg
    sensor_msgs_msg.Range = type('Range', (), {'ULTRASOUND': 0})

    class Imu:
        def __init__(self):
            self.header = SimpleNamespace(stamp=None, frame_id='')
            self.orientation = SimpleNamespace(x=0.0, y=0.0, z=0.0, w=0.0)
            self.orientation_covariance = [0.0] * 9
            self.angular_velocity_covariance = [0.0] * 9
            self.linear_acceleration_covariance = [0.0] * 9

    sensor_msgs_msg.Imu = Imu

    rclpy = _stub_module('rclpy')
    rclpy_node = _stub_module('rclpy.node')
    rclpy.node = rclpy_node
    rclpy_node.Node = type('Node', (), {})

    tf2_ros = _stub_module('tf2_ros')
    tf2_ros.TransformBroadcaster = type('TransformBroadcaster', (), {})

    # pyserial: the node tolerates a missing serial module, but provide a stub
    # with the exception types so the import branch is deterministic.
    serial = _stub_module('serial')

    class SerialException(Exception):
        pass

    class SerialTimeoutException(SerialException):
        pass

    serial.SerialException = SerialException
    serial.SerialTimeoutException = SerialTimeoutException
    serial.Serial = type('Serial', (), {})


_install_ros_stubs()

# Make the package importable from this test file location.
_PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from stm32_bridge.stm32_bridge_node import (  # noqa: E402
    DEFAULT_IMU_YAW_VARIANCE,
    DEFAULT_TWIST_COVARIANCE_DIAGONAL,
    Stm32BridgeNode,
    imu_yaw_variance,
    yaw_to_quaternion_z,
)


# ---------------------------------------------------------------------------
# Lightweight ROS-free harness for the production odometry method.
# ---------------------------------------------------------------------------
class OdometryModel:
    def __init__(self, wheel_radius=0.09725, wheel_base=0.4325,
                 steps_per_rev=200.0, microstep=8.0, gear_ratio=10.0):
        circ = 2.0 * math.pi * wheel_radius
        self.steps_per_meter = steps_per_rev * microstep * gear_ratio / circ
        self.wheel_base = wheel_base
        self.x = 0.0
        self.y = 0.0
        self.theta = 0.0
        self.last_left = None
        self.last_right = None

    def get_logger(self):
        return SimpleNamespace(debug=lambda *args, **kwargs: None)

    _update_odometry = Stm32BridgeNode._update_odometry
    _normalize_angle = staticmethod(Stm32BridgeNode._normalize_angle)

    def feed(self, left_count, right_count, dt):
        """Integrate one cumulative feedback sample. Returns (lin_v, ang_v)."""
        if self.last_left is None:
            # First sample establishes the baseline (reset_odom_on_start).
            self.last_left = left_count
            self.last_right = right_count
            return 0.0, 0.0

        dl = Stm32BridgeNode._diff_signed_32(left_count, self.last_left)
        dr = Stm32BridgeNode._diff_signed_32(right_count, self.last_right)
        self.last_left = left_count
        self.last_right = right_count

        self._x = self.x
        self._y = self.y
        self._theta = self.theta
        velocities = self._update_odometry(dl, dr, dt)
        self.x = self._x
        self.y = self._y
        self.theta = self._theta
        return velocities


# ---------------------------------------------------------------------------
# Tiny assertion helpers (avoid a hard pytest dependency).
# ---------------------------------------------------------------------------
def approx(a, b, tol=1e-6):
    assert math.isclose(a, b, rel_tol=0.0, abs_tol=tol), f'{a} != {b}'


# ---------------------------------------------------------------------------
# Tests.
# ---------------------------------------------------------------------------
def test_steps_per_meter_matches_firmware():
    """1600 driver pulses/rev * 10 gear / (pi * 0.1945 m)."""
    m = OdometryModel()
    approx(m.steps_per_meter, 16000.0 / (math.pi * 0.1945), tol=1e-3)
    approx(m.steps_per_meter, 26184.875, tol=1.0)


def test_first_sample_is_baseline_no_motion():
    m = OdometryModel()
    lin, ang = m.feed(1000, 1000, 0.02)
    approx(lin, 0.0)
    approx(ang, 0.0)
    approx(m.x, 0.0)
    approx(m.theta, 0.0)


def test_straight_line_forward():
    m = OdometryModel()
    m.feed(0, 0, 0.02)  # baseline
    # Drive forward 1 meter on both wheels.
    steps = int(round(m.steps_per_meter))
    lin, ang = m.feed(steps, steps, 1.0)
    approx(m.x, 1.0, tol=1e-3)
    approx(m.y, 0.0, tol=1e-6)
    approx(m.theta, 0.0, tol=1e-9)
    approx(lin, 1.0, tol=1e-3)
    approx(ang, 0.0, tol=1e-9)


def test_pure_rotation_in_place():
    m = OdometryModel()
    m.feed(0, 0, 0.02)  # baseline
    # Right wheel forward, left wheel backward by equal amounts -> spin in place.
    d = int(round(m.steps_per_meter * 0.1))  # 0.1 m of arc each wheel
    lin, ang = m.feed(-d, d, 1.0)
    approx(m.x, 0.0, tol=1e-3)
    approx(m.y, 0.0, tol=1e-3)
    expected_theta = (2 * (d / m.steps_per_meter)) / m.wheel_base
    approx(m.theta, expected_theta, tol=1e-3)
    approx(lin, 0.0, tol=1e-3)
    approx(ang, expected_theta / 1.0, tol=1e-3)


def test_wheel_odometry_is_independent_of_imu_yaw():
    first = OdometryModel()
    second = OdometryModel()
    first.feed(0, 0, 0.02)
    second.feed(0, 0, 0.02)

    # A stale attribute models two different BNO085 readings. Production
    # wheel integration must depend only on STEP-count deltas.
    first._imu_yaw = -1.5
    second._imu_yaw = 2.2
    first.feed(-1000, 1000, 0.02)
    second.feed(-1000, 1000, 0.02)

    approx(first.theta, second.theta, tol=1e-12)
    approx(first.theta, 2000 / first.steps_per_meter / first.wheel_base,
           tol=1e-12)


def test_int32_wrap_is_handled():
    """Cumulative count wraps around INT32_MAX -> delta must stay small."""
    m = OdometryModel()
    near_max = 2 ** 31 - 5
    m.feed(near_max, near_max, 0.02)  # baseline
    # Each wheel advances by 10 counts, wrapping past 2**31 into negatives.
    after = near_max + 10 - 2 ** 32
    lin, ang = m.feed(after, after, 0.02)
    expected_dist = 10 / m.steps_per_meter
    approx(m.x, expected_dist, tol=1e-9)
    approx(ang, 0.0, tol=1e-9)


def test_theta_normalized_to_pi_range():
    m = OdometryModel()
    m.feed(0, 0, 0.02)  # baseline
    # Spin far enough to exceed +pi and confirm wrap to (-pi, pi].
    d = int(round(m.steps_per_meter * 2.0))
    m.feed(-d, d, 1.0)
    assert -math.pi <= m.theta <= math.pi, m.theta


def test_parse_feedback_six_field():
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode, 'FB,42,1200,1195,20,OK')
    assert parsed is not None
    seq, left, right, dt_ms, status, yaw_rad, yaw_acc = parsed
    assert seq == 42
    assert left == 1200
    assert right == 1195
    approx(dt_ms, 20.0)
    assert status == 'OK'
    assert yaw_rad is None


def test_parse_feedback_five_field_fallback():
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode, 'FB,1200,1195,50,STOP')
    assert parsed is not None
    seq, left, right, dt_ms, status, yaw_rad, yaw_acc = parsed
    assert seq is None
    assert left == 1200
    assert right == 1195
    approx(dt_ms, 50.0)
    assert status == 'STOP'
    assert yaw_rad is None


def test_parse_feedback_eight_field_with_yaw():
    # FB,seq,left,right,dt,status,yaw_cdeg,yaw_valid  (yaw_cdeg = yaw*100 do)
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode, 'FB,7,100,110,20,OK,9000,1')
    assert parsed is not None
    seq, left, right, dt_ms, status, yaw_rad, yaw_acc = parsed
    assert seq == 7
    assert left == 100
    assert right == 110
    approx(dt_ms, 20.0)
    assert status == 'OK'
    # 9000 centi-do = 90 do = pi/2 rad
    approx(yaw_rad, math.pi / 2, tol=1e-6)


def test_parse_feedback_eight_field_yaw_invalid():
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode, 'FB,7,100,110,20,OK,9000,0')
    assert parsed is not None
    _, _, _, _, _, yaw_rad, _ = parsed
    assert yaw_rad is None


def test_parse_feedback_twelve_field_with_two_sonars():
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode,
        'FB,8,100,110,20,OK,9000,1,1234,1,0,0',
        include_sonar=True,
    )
    assert parsed is not None
    (seq, left, right, dt_ms, status, yaw_rad, yaw_acc,
     sonar1, sonar2, sonar3, sonar4) = parsed
    assert seq == 8
    assert left == 100
    assert right == 110
    approx(dt_ms, 20.0)
    assert status == 'OK'
    approx(yaw_rad, math.pi / 2, tol=1e-6)
    assert sonar1 == (1234, True)
    assert sonar2 == (0, False)
    assert sonar3 is None
    assert sonar4 is None


def test_parse_feedback_sixteen_field_with_four_sonars():
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode,
        'FB,9,100,110,20,OK,9000,1,1234,1,0,0,2000,1,500,0',
        include_sonar=True,
    )
    assert parsed is not None
    (seq, left, right, dt_ms, status, yaw_rad, yaw_acc,
     sonar1, sonar2, sonar3, sonar4) = parsed
    assert seq == 9
    assert left == 100
    assert right == 110
    approx(dt_ms, 20.0)
    assert status == 'OK'
    approx(yaw_rad, math.pi / 2, tol=1e-6)
    assert sonar1 == (1234, True)
    assert sonar2 == (0, False)
    assert sonar3 == (2000, True)
    assert sonar4 == (500, False)


def test_parse_feedback_seventeen_field_with_accuracy():
    # Dinh dang hien tai: 16 truong cu + <yaw_acc> o cuoi.
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode,
        'FB,9,100,110,20,OK,9000,1,1234,1,0,0,2000,1,500,0,3',
        include_sonar=True,
    )
    assert parsed is not None
    (seq, left, right, dt_ms, status, yaw_rad, yaw_acc,
     sonar1, sonar2, sonar3, sonar4) = parsed
    assert seq == 9
    approx(yaw_rad, math.pi / 2, tol=1e-6)
    assert yaw_acc == 3
    assert sonar1 == (1234, True)
    assert sonar4 == (500, False)


def test_parse_feedback_sixteen_field_has_no_accuracy():
    # Firmware cu: khong co yaw_acc -> None, KHONG duoc mac dinh thanh 0
    # (0 co nghia la "khong tin duoc" va se chan het heading IMU).
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode,
        'FB,9,100,110,20,OK,9000,1,1234,1,0,0,2000,1,500,0',
        include_sonar=True,
    )
    assert parsed is not None
    assert parsed[6] is None


def test_parse_feedback_ignores_unknown_trailing_fields():
    # Bao ve chinh cai loi da xay ra: firmware them truong o cuoi thi node
    # PHAI van parse duoc, khong duoc tra None.
    parsed = Stm32BridgeNode._parse_feedback_line(
        Stm32BridgeNode,
        'FB,9,100,110,20,OK,9000,1,1234,1,0,0,2000,1,500,0,2,777,888',
        include_sonar=True,
    )
    assert parsed is not None
    assert parsed[6] == 2                 # yaw_acc van doc dung
    assert parsed[7] == (1234, True)      # sonar khong bi xe dich


def test_parse_feedback_accuracy_is_clamped():
    for raw, want in (('-1', 0), ('0', 0), ('3', 3), ('9', 3)):
        parsed = Stm32BridgeNode._parse_feedback_line(
            Stm32BridgeNode,
            f'FB,1,0,0,20,OK,0,1,0,0,0,0,0,0,0,0,{raw}',
        )
        assert parsed is not None
        assert parsed[6] == want, raw


def test_imu_yaw_variance_mapping():
    # Accuracy cang thap thi variance cang lon -> EKF tu ha trong so.
    assert imu_yaw_variance(3) < imu_yaw_variance(2) < imu_yaw_variance(1)
    assert imu_yaw_variance(1) < imu_yaw_variance(0)
    # Firmware cu khong gui accuracy: khong duoc tin nhu acc=3.
    assert imu_yaw_variance(None) == DEFAULT_IMU_YAW_VARIANCE
    assert imu_yaw_variance(None) > imu_yaw_variance(3)
    assert imu_yaw_variance(99) == DEFAULT_IMU_YAW_VARIANCE


def test_yaw_to_quaternion_z_roundtrip():
    for yaw in (0.0, 0.5, -1.2, math.pi / 2, -math.pi / 2):
        qz, qw = yaw_to_quaternion_z(yaw)
        recovered = math.atan2(2.0 * qw * qz, 1.0 - 2.0 * qz * qz)
        approx(recovered, yaw, tol=1e-9)


class _ImuPublishHarness:
    def __init__(self):
        self.messages = []
        self._imu_pub = SimpleNamespace(publish=self.messages.append)
        self.imu_frame = 'imu_link'
        self._last_imu_measurement = None

    _publish_imu = Stm32BridgeNode._publish_imu


def test_imu_message_publishes_yaw_and_accuracy_covariance():
    harness = _ImuPublishHarness()
    stamp = SimpleNamespace(to_msg=lambda: 'stamp')
    harness._publish_imu(stamp, math.pi / 2.0, 2)

    assert len(harness.messages) == 1
    msg = harness.messages[0]
    assert msg.header.stamp == 'stamp'
    assert msg.header.frame_id == 'imu_link'
    approx(msg.orientation.z, math.sqrt(0.5), tol=1e-9)
    approx(msg.orientation.w, math.sqrt(0.5), tol=1e-9)
    assert msg.orientation_covariance[8] == imu_yaw_variance(2)
    assert msg.angular_velocity_covariance[0] == -1.0
    assert msg.linear_acceleration_covariance[0] == -1.0


def test_cached_imu_measurement_is_not_republished():
    harness = _ImuPublishHarness()
    stamp = SimpleNamespace(to_msg=lambda: 'stamp')

    harness._publish_imu(stamp, 0.25, 3)
    harness._publish_imu(stamp, 0.25, 3)
    assert len(harness.messages) == 1

    # Accuracy is part of the key because it changes EKF covariance weighting.
    harness._publish_imu(stamp, 0.25, 2)
    assert len(harness.messages) == 2

    harness._publish_imu(stamp, 0.30, 2)
    assert len(harness.messages) == 3


class _FeedbackHarness:
    def __init__(self):
        model = OdometryModel()
        self.steps_per_meter = model.steps_per_meter
        self.wheel_base = model.wheel_base
        self._x = 0.0
        self._y = 0.0
        self._theta = 0.0
        self.max_steps_per_sec = 12000.0
        self.send_rate_hz = 20.0
        self._last_count_jump_warn_time = 0.0
        self.feedback_counts_are_cumulative = True
        self.reset_odom_on_start = True
        self._last_left_count = None
        self._last_right_count = None
        self._last_feedback_ros_sec = None
        self._last_feedback_mono = None
        self._last_feedback_seq = None
        self._last_feedback_status = ''
        self._last_invalid_dt_warn_time = 0.0
        self._feedback_warn_period = 0.5
        self.odom_invert_left = False
        self.odom_invert_right = False
        self.published_odometry = []

    def get_logger(self):
        return SimpleNamespace(
            debug=lambda *args, **kwargs: None,
            warn=lambda *args, **kwargs: None,
        )

    _compute_count_delta = Stm32BridgeNode._compute_count_delta
    _resolve_feedback_dt = Stm32BridgeNode._resolve_feedback_dt
    _diff_signed_32 = staticmethod(Stm32BridgeNode._diff_signed_32)
    _warn_if_count_jump = Stm32BridgeNode._warn_if_count_jump
    _update_odometry = Stm32BridgeNode._update_odometry
    _normalize_angle = staticmethod(Stm32BridgeNode._normalize_angle)


def test_invalid_wheel_samples_do_not_publish_fake_zero_twist():
    harness = _FeedbackHarness()
    harness._publish_odometry = lambda stamp, linear, angular: (
        harness.published_odometry.append((linear, angular)))
    harness._publish_imu = lambda *args: None
    harness._publish_sonar_range = lambda *args: None
    samples = iter([
        (1, 100, 100, 0.0, 'OK', None, None,
         None, None, None, None),
        (2, 110, 110, 0.0, 'OK', None, None,
         None, None, None, None),
        (3, 120, 120, 20.0, 'OK', None, None,
         None, None, None, None),
    ])
    harness._parse_feedback_line = lambda *args, **kwargs: next(samples)
    harness.get_clock = lambda: SimpleNamespace(now=lambda: SimpleNamespace(
        nanoseconds=0,
    ))

    Stm32BridgeNode._handle_feedback_line(harness, 'ignored')

    # The first cumulative sample only establishes the count baseline.
    assert harness.published_odometry == []
    assert harness._x == 0.0
    assert harness._y == 0.0
    assert harness._theta == 0.0

    Stm32BridgeNode._handle_feedback_line(harness, 'ignored')

    # The STEP delta is still valid, so it must be integrated into pose even
    # though this sample has no valid firmware or ROS time delta.
    assert harness.published_odometry == []
    expected_ten_steps = 10.0 / harness.steps_per_meter
    approx(harness._x, expected_ten_steps, tol=1e-12)
    approx(harness._y, 0.0, tol=1e-12)
    approx(harness._theta, 0.0, tol=1e-12)

    Stm32BridgeNode._handle_feedback_line(harness, 'ignored')

    # A later valid sample publishes normally and retains the prior 10 STEP
    # pose increment, for a total of 20 STEP from the baseline.
    expected_twenty_steps = 20.0 / harness.steps_per_meter
    approx(harness._x, expected_twenty_steps, tol=1e-12)
    approx(harness._y, 0.0, tol=1e-12)
    approx(harness._theta, 0.0, tol=1e-12)
    assert len(harness.published_odometry) == 1


def test_diff_drive_vy_constraint_variance():
    assert DEFAULT_TWIST_COVARIANCE_DIAGONAL[1] == 0.0025
    covariance = Stm32BridgeNode._diagonal_to_covariance(
        DEFAULT_TWIST_COVARIANCE_DIAGONAL)
    assert covariance[7] == 0.0025

    node_path = os.path.join(_PKG_ROOT, 'stm32_bridge',
                             'stm32_bridge_node.py')
    with open(node_path, encoding='utf-8') as source:
        assert 'odom.twist.twist.linear.y = 0.0' in source.read()


def test_parse_feedback_garbage_returns_none():
    # _parse_feedback_line calls self.get_logger(); give it a no-op logger.
    class _FakeNode:
        @staticmethod
        def get_logger():
            class _L:
                def warn(self, *a, **k):
                    pass
            return _L()

    fake = _FakeNode()
    fake._parse_feedback_line = Stm32BridgeNode._parse_feedback_line
    assert fake._parse_feedback_line(fake, 'FB,not,a,number,OK') is None
    assert fake._parse_feedback_line(fake, 'FB,1,2') is None


def test_yaw_quaternion_roundtrip():
    for yaw in (0.0, 0.5, -1.2, math.pi / 2):
        qx, qy, qz, qw = Stm32BridgeNode._yaw_to_quaternion(yaw)
        recovered = math.atan2(2.0 * qw * qz, 1.0 - 2.0 * qz * qz)
        approx(recovered, yaw, tol=1e-9)


def test_non_finite_twist_is_rejected():
    def twist(linear_x=0.0, angular_z=0.0):
        return SimpleNamespace(
            linear=SimpleNamespace(x=linear_x, y=0.0, z=0.0),
            angular=SimpleNamespace(x=0.0, y=0.0, z=angular_z),
        )

    assert Stm32BridgeNode._is_finite_twist(twist(0.2, -0.1))
    assert not Stm32BridgeNode._is_finite_twist(twist(float('nan'), 0.0))
    assert not Stm32BridgeNode._is_finite_twist(twist(0.0, float('inf')))


def _command_harness(max_wheel_speed_mm_s=250.0):
    node = Stm32BridgeNode.__new__(Stm32BridgeNode)
    node.wheel_base = 0.4325
    node.speed_scale = 1.0
    node.invert_left = False
    node.invert_right = False
    node.max_wheel_speed_mm_s = max_wheel_speed_mm_s
    node._left_mm_s = 0
    node._right_mm_s = 0
    node._command_is_stop = True
    node._last_cmd_time = None
    node._timed_out = True
    node._warnings = []
    node.get_logger = lambda: SimpleNamespace(
        warn=node._warnings.append,
        error=node._warnings.append,
    )
    return node


def _send_command(node, linear_x, angular_z):
    node._cmd_vel_callback(SimpleNamespace(
        linear=SimpleNamespace(x=linear_x, y=0.0, z=0.0),
        angular=SimpleNamespace(x=0.0, y=0.0, z=angular_z),
    ))


def test_wheel_pair_below_limit_is_unchanged():
    node = _command_harness()
    _send_command(node, linear_x=0.2, angular_z=0.0)

    assert (node._left_mm_s, node._right_mm_s) == (200, 200)
    assert node._warnings == []


def test_straight_wheel_pair_above_limit_scales_equally():
    node = _command_harness()
    _send_command(node, linear_x=0.4, angular_z=0.0)

    assert (node._left_mm_s, node._right_mm_s) == (250, 250)
    assert len(node._warnings) == 1
    assert 'Wheel command pair scaled' in node._warnings[0]


def test_in_place_rotation_preserves_symmetric_opposite_wheels():
    node = _command_harness()
    _send_command(node, linear_x=0.0, angular_z=2.0)

    assert (node._left_mm_s, node._right_mm_s) == (-250, 250)


def test_mixed_command_scales_both_wheels_when_one_exceeds_limit():
    node = _command_harness()
    # Before scaling this produces (80, 400) mm/s.
    angular_z = 320.0 / (node.wheel_base * 1000.0)
    _send_command(node, linear_x=0.24, angular_z=angular_z)

    assert (node._left_mm_s, node._right_mm_s) == (50, 250)


def test_pair_scaling_preserves_ratio_and_sign():
    node = _command_harness()
    # Before scaling this produces (-400, 80) mm/s.
    angular_z = 480.0 / (node.wheel_base * 1000.0)
    _send_command(node, linear_x=-0.16, angular_z=angular_z)

    assert (node._left_mm_s, node._right_mm_s) == (-250, 50)
    assert node._left_mm_s / node._right_mm_s == -5.0


def test_forward_twist_is_inverted_for_installed_drive():
    """The installed motor wiring needs both command signs flipped."""
    node = Stm32BridgeNode.__new__(Stm32BridgeNode)
    node.wheel_base = 0.4325
    node.speed_scale = 1.0
    node.invert_left = True
    node.invert_right = True
    node.max_wheel_speed_mm_s = 250.0
    node._left_mm_s = 0
    node._right_mm_s = 0
    node._command_is_stop = True
    node._last_cmd_time = None
    node._timed_out = True

    node._cmd_vel_callback(SimpleNamespace(
        linear=SimpleNamespace(x=0.2, y=0.0, z=0.0),
        angular=SimpleNamespace(x=0.0, y=0.0, z=0.0),
    ))

    assert node._left_mm_s == -200
    assert node._right_mm_s == -200
    assert not node._command_is_stop


def _run_all():
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    failures = 0
    for fn in tests:
        try:
            fn()
            print(f'PASS  {fn.__name__}')
        except AssertionError as exc:
            failures += 1
            print(f'FAIL  {fn.__name__}: {exc}')
    print(f'\n{len(tests) - failures}/{len(tests)} passed')
    return failures


if __name__ == '__main__':
    sys.exit(1 if _run_all() else 0)
