"""Bridge behaviour across link faults, MCU reboots and a stalled serial port.

Runs the production timer, feedback and write paths on real file descriptors
(pipes, a pty) with no ROS and no device. Every scenario here started as a way
the robot could be driven blind or have its odometry corrupted.
"""

import fcntl
import math
import os
import pty
import threading
import time
from types import SimpleNamespace

import test_odometry  # noqa: F401  (installs the ROS stubs, imports the node)

from stm32_bridge import stm32_bridge_node as node_module
from stm32_bridge.imu_health import ImuHealth
from stm32_bridge.link_supervisor import (
    DISCONNECTED,
    FEEDBACK_LOST,
    LinkSupervisor,
    ONLINE,
    RECOVERING,
    WAITING_FEEDBACK,
)

Stm32BridgeNode = node_module.Stm32BridgeNode
_REAL_TIME, _REAL_SERIAL = node_module.time, node_module.serial
_REAL_DESTROY = getattr(node_module.Node, 'destroy_node', None)

TICK = 0.05
STEPS_PER_M = 26184.875
F_SETPIPE_SZ = 1031


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class PipePort:
    """Serial port stand-in: writes go to a real non-blocking pipe."""

    def __init__(self):
        self.read_fd, self.write_fd = os.pipe()
        os.set_blocking(self.read_fd, False)
        os.set_blocking(self.write_fd, False)
        self.is_open = True
        self.inbound = b''
        self.read_error = None
        self.close_gate = None
        self.closed = threading.Event()

    def fileno(self):
        return self.write_fd

    @property
    def in_waiting(self):
        if self.read_error is not None:
            raise self.read_error
        return len(self.inbound)

    def read(self, size):
        data, self.inbound = self.inbound[:size], self.inbound[size:]
        return data

    def close(self):
        if self.close_gate is not None:
            self.close_gate.wait(10.0)
        self.is_open = False
        self.closed.set()

    def fill(self):
        fcntl.fcntl(self.write_fd, F_SETPIPE_SZ, 4096)
        try:
            while True:
                os.write(self.write_fd, b'x' * 512)
        except BlockingIOError:
            pass

    def lines(self):
        chunks = []
        try:
            while True:
                chunk = os.read(self.read_fd, 65536)
                if not chunk:
                    break
                chunks.append(chunk)
        except BlockingIOError:
            pass
        return [line for line in b''.join(chunks).decode().split('\r\n') if line]


def teardown_function(_function):
    node_module.time, node_module.serial = _REAL_TIME, _REAL_SERIAL
    node_module.Node.destroy_node = _REAL_DESTROY


def twist(linear_x=0.0, angular_z=0.0):
    return SimpleNamespace(
        linear=SimpleNamespace(x=linear_x, y=0.0, z=0.0),
        angular=SimpleNamespace(x=0.0, y=0.0, z=angular_z))


class Bridge:
    """A Stm32BridgeNode built without __init__, on a fake monotonic clock."""

    def __init__(self, port=None, connect=True, **overrides):
        self.clock = Clock()
        node_module.time = SimpleNamespace(monotonic=self.clock)
        node = Stm32BridgeNode.__new__(Stm32BridgeNode)
        self.node = node
        self.logs = []
        node.get_logger = lambda: SimpleNamespace(
            debug=lambda *_a, **_k: None,
            info=lambda m: self.logs.append(('info', m)),
            warn=lambda m: self.logs.append(('warn', m)),
            error=lambda m: self.logs.append(('error', m)))
        node.get_clock = lambda: SimpleNamespace(now=lambda: SimpleNamespace(
            nanoseconds=int(self.clock.t * 1e9), to_msg=lambda: self.clock.t))

        node._serial = None
        node._serial_closer = None
        node._serial_opener = None
        self.link_ok = []
        node._link_ok_pub = SimpleNamespace(publish=self.link_ok.append)
        node._bool_msg = lambda data: data
        node._filter_switch = None
        node._serial_lock = threading.RLock()
        node._tx_pending = b''
        node._write_stall_since = None
        node._next_reconnect_time = 0.0
        node._reconnect_period = 1.0
        node.port = 'pipe'
        node.baudrate = 115200
        node._head = None
        node._contactor = None
        node._seq = 1
        node._left_mm_s = 0
        node._right_mm_s = 0
        node._command_is_stop = True
        node._last_cmd_time = None
        node._timed_out = False
        node._last_tx_log_time = 0.0
        node._last_tx_log_payload = None
        node._rx_buffer = ''
        node.wheel_base = 0.4714
        node.wheel_radius = 0.09725
        node.speed_scale = 1.0
        node.max_wheel_speed_mm_s = 250.0
        node.invert_left = node.invert_right = True
        node.odom_invert_left = node.odom_invert_right = True
        node.odom_linear_scale = 1.0
        node.cmd_timeout = 0.5
        node.feedback_timeout = 1.0
        node.feedback_recovery_time = 0.5
        node.serial_write_stall_timeout = 1.0
        node.send_rate_hz = 20.0
        node.steps_per_meter = STEPS_PER_M
        node.max_steps_per_sec = 12000.0
        node.feedback_counts_are_cumulative = True
        node.reset_odom_on_start = True
        node._feedback_warn_period = 0.5
        node._x = node._y = node._theta = 0.0
        node._left_wheel_position = node._right_wheel_position = 0.0
        node._last_left_count = node._last_right_count = None
        node._last_feedback_mono = None
        node._last_feedback_ros_sec = None
        node._last_feedback_seq = None
        node._last_feedback_status = ''
        node._last_feedback_timeout_warn_time = 0.0
        node._last_motion_held_warn_time = 0.0
        node._last_invalid_dt_warn_time = 0.0
        node._force_count_baseline = False
        node._imu_heading_offset = 0.0
        node._last_imu_heading = None
        node._theta_at_last_imu = 0.0
        node._imu_health = ImuHealth(start=self.clock.t)
        node._link = LinkSupervisor(1.0, 0.5, start=self.clock.t)
        node._joint_state_pub = SimpleNamespace(publish=lambda _m: None)
        node._last_imu_measurement = None
        for key, value in overrides.items():
            setattr(node, key, value)

        self.odom = []
        self.imu = []
        node._publish_odometry = lambda _s, v, w: self.odom.append((v, w))
        node._publish_imu = lambda _s, yaw, _a: self.imu.append(yaw)
        node._publish_sonar_range = lambda *_a: None

        self.port = port or PipePort()
        self.next_ports = []

        def open_port(**_kwargs):
            if not self.next_ports:
                raise OSError(2, 'No such file or directory')
            return self.next_ports.pop(0)

        fake_serial = SimpleNamespace(Serial=open_port)
        node_module.serial = fake_serial
        self.left = self.right = 0
        self.fb_seq = 0
        if connect:
            self.next_ports.append(self.port)
            node._open_serial()

    # -- simulated outside world ------------------------------------------
    def frame(self, dt_ms=20, yaw_cdeg=None):
        self.fb_seq += 1
        yaw = '' if yaw_cdeg is None else f',{yaw_cdeg},1'
        return (f'FB,{self.fb_seq},{self.left},{self.right},{dt_ms},OK{yaw}\r\n'
                ).encode()

    def tick(self, fb=True, cmd=None, **frame_args):
        """One 50 ms timer period: FB frame in, /cmd_vel in, timer runs."""
        self.clock.t += TICK
        if fb and self.node._serial is not None:
            self.node._serial.inbound += self.frame(**frame_args)
        if cmd is not None:
            self.node._cmd_vel_callback(cmd)
        self.node._timer_callback()

    def run(self, seconds, **kwargs):
        for _ in range(round(seconds / TICK)):
            self.tick(**kwargs)

    def online(self):
        self.run(0.75, cmd=twist())
        assert self.node._link.motion_permitted
        self.port.lines()

    def wire(self):
        return [line.split(',')[0] for line in self.port.lines()]

    def wait_closer(self):
        self.node._serial_closer.join(5.0)
        assert not self.node._serial_closer.is_alive()

    def warnings(self):
        return ' | '.join(m for lvl, m in self.logs if lvl != 'info')


GO = twist(0.2)
STOP_CMD = twist()


# ---- feedback loss --------------------------------------------------------
def test_no_cmd_is_sent_while_feedback_is_missing_and_cmd_vel_streams():
    """Regression: 36 of 44 frames were CMD before the fix."""
    b = Bridge()
    b.online()
    b.run(1.0, fb=False, cmd=GO)        # first second: still inside the timeout
    b.port.lines()
    b.run(2.0, fb=False, cmd=GO)
    frames = b.wire()
    assert b.node._link.state == FEEDBACK_LOST
    assert len(frames) == 40 and set(frames) == {'STOP'}


def test_cmd_flows_normally_while_feedback_is_healthy():
    b = Bridge()
    b.online()
    b.run(1.0, cmd=GO)
    assert set(b.wire()) == {'CMD'}


def test_running_stream_cannot_restart_wheels_after_feedback_returns():
    b = Bridge()
    b.online()
    b.run(1.5, fb=False, cmd=GO)
    b.port.lines()
    b.run(2.0, cmd=GO)
    assert set(b.wire()) == {'STOP'}
    assert b.node._link.state == ONLINE and not b.node._link.motion_permitted
    b.tick(cmd=STOP_CMD)
    b.port.lines()
    b.tick(cmd=GO)
    assert b.wire() == ['CMD']


def test_short_feedback_gap_is_ridden_through():
    b = Bridge()
    b.online()
    b.run(0.5, cmd=GO)
    b.port.lines()
    b.run(0.9, fb=False, cmd=GO)        # inside the 1 s timeout of this harness
    b.run(0.5, cmd=GO)
    assert set(b.wire()) == {'CMD'}
    assert b.node._link.faults == 0


def test_link_ok_topic_is_a_level_following_the_gate():
    b = Bridge()
    b.online()
    b.link_ok.clear()
    b.run(0.2, cmd=GO)
    assert set(b.link_ok) == {True}
    b.run(1.5, fb=False, cmd=GO)
    assert b.link_ok[-1] is False
    b.run(1.0, cmd=GO)
    assert b.link_ok[-1] is False       # still waiting for idle
    b.tick(cmd=STOP_CMD)
    assert b.link_ok[-1] is True


def test_ekf_is_paused_only_while_feedback_is_missing():
    calls = []
    b = Bridge()
    b.node._filter_switch = SimpleNamespace(update=lambda on, _now: calls.append(on))
    b.online()
    assert calls[-1] is True
    b.run(1.5, fb=False)
    assert calls[-1] is False
    b.tick()
    assert calls[-1] is True


def test_never_commands_wheels_without_any_feedback():
    b = Bridge()
    b.run(5.0, fb=False, cmd=GO)
    assert set(b.wire()) == {'STOP'}
    assert b.node._link.state == WAITING_FEEDBACK


def test_warning_rate_does_not_change_the_gate():
    b = Bridge(_feedback_warn_period=1000.0)
    b.online()
    b.run(1.5, fb=False, cmd=GO)
    b.port.lines()
    b.run(1.0, fb=False, cmd=GO)
    assert set(b.wire()) == {'STOP'}


def test_stale_command_is_not_replayed_after_feedback_returns():
    b = Bridge()
    b.online()
    b.tick(cmd=GO)
    b.run(1.5, fb=False)
    b.port.lines()
    b.run(1.0)
    assert set(b.wire()) == {'STOP'}


def test_held_motion_is_explained_in_the_log():
    b = Bridge()
    b.run(1.0, cmd=GO)
    assert 'Ignoring /cmd_vel' in b.warnings()


# ---- MCU reboot seen inside the stream ------------------------------------
def counts_to(b, metres):
    b.left = b.right = -round(metres * STEPS_PER_M)


def drive_some(b, metres=19.0):
    b.online()
    b.tick(fb=True, cmd=GO)
    counts_to(b, metres)
    b.node._last_left_count = b.left
    b.node._last_right_count = b.right
    b.tick(cmd=GO)
    assert b.node._link.motion_permitted
    return b.node._x


def test_count_reset_does_not_move_the_pose_or_publish_twist():
    """Regression: x jumped by -19.1 m and vx hit -955 m/s."""
    b = Bridge()
    x_before = drive_some(b)
    b.odom.clear()
    b.left = b.right = 0
    b.tick(cmd=GO)
    assert b.node._x == x_before
    assert b.odom == []
    assert b.node._link.state == RECOVERING
    assert 'impossible feedback count jump' in b.warnings()


def test_next_frames_after_a_count_reset_integrate_from_the_new_baseline():
    b = Bridge()
    x_before = drive_some(b)
    b.left = b.right = 0
    b.tick(cmd=GO)
    b.left = b.right = -131
    b.tick(cmd=GO)
    assert math.isclose(b.node._x, x_before + 131 / STEPS_PER_M, abs_tol=1e-9)


def test_count_reset_holds_wheels_until_the_command_goes_idle():
    b = Bridge()
    drive_some(b)
    b.left = b.right = 0
    b.tick(cmd=GO)
    b.port.lines()
    b.run(1.5, cmd=GO)
    assert set(b.wire()) == {'STOP'}
    assert b.node._link.state == ONLINE and not b.node._link.motion_permitted
    b.tick(cmd=STOP_CMD)
    assert b.node._link.motion_permitted
    b.port.lines()
    b.tick(cmd=GO)
    assert b.wire() == ['CMD']


def test_silent_command_source_also_rearms():
    b = Bridge()
    drive_some(b)
    b.left = b.right = 0
    b.tick(cmd=GO)
    b.run(1.2)                          # publisher gone: stale after cmd_timeout
    assert b.node._link.motion_permitted


def test_boot_frame_dt_cannot_excuse_a_count_reset():
    """The first FB after boot reports dt_ms of several seconds."""
    b = Bridge()
    x_before = drive_some(b, metres=2.0)
    b.left = b.right = 0
    b.tick(cmd=GO, dt_ms=7500)
    assert b.node._x == x_before
    assert b.node._link.state == RECOVERING


def test_int32_wrap_is_not_a_jump():
    b = Bridge()
    b.online()
    b.left = b.right = 2 ** 31 - 10
    b.node._last_left_count = b.left
    b.node._last_right_count = b.right
    b.tick(cmd=GO)
    b.left = b.right = -(2 ** 31) + 10
    b.tick(cmd=GO)
    assert b.node._link.motion_permitted
    assert 'count jump' not in b.warnings()


def test_full_speed_motion_is_never_flagged():
    b = Bridge()
    b.online()
    for _ in range(100):
        b.left += round(12000 * TICK)
        b.right -= round(12000 * TICK)
        b.tick(cmd=GO)
    assert 'count jump' not in b.warnings()
    assert b.node._link.motion_permitted


def test_real_motion_across_a_feedback_gap_is_kept_and_twist_is_averaged():
    b = Bridge()
    b.online()
    b.run(1.2, fb=False)
    b.odom.clear()
    steps = 6546                        # one second at the 250 mm/s wheel limit
    b.left -= steps
    b.right -= steps
    x_before = b.node._x
    b.tick(dt_ms=20)
    assert math.isclose(b.node._x, x_before + steps / STEPS_PER_M, abs_tol=1e-9)
    assert b.odom[-1][0] < 0.25         # not steps / 20 ms = 12.5 m/s
    assert 'count jump' not in b.warnings()


# ---- port loss and reconnect ----------------------------------------------
def lose_port(b, error=OSError(5, 'Input/output error')):
    b.node._serial.read_error = error
    b.clock.t += TICK
    b.node._timer_callback()
    assert b.node._serial is None
    b.wait_closer()


def reconnect(b, port=None):
    b.port = port or PipePort()
    b.next_ports.append(b.port)
    b.clock.t += 1.1
    b.node._timer_callback()
    b.node._serial_opener.join(5.0)
    assert b.node._serial is b.port


def test_read_error_closes_port_and_holds_wheels():
    b = Bridge()
    b.online()
    b.tick(cmd=GO)
    lose_port(b)
    assert b.node._link.state == DISCONNECTED
    assert b.node._link.rearm_reason == 'serial_read_failed'
    assert b.node._left_mm_s == 0 and b.node._command_is_stop


def test_mcu_reboot_through_usb_reconnect_keeps_pose_and_needs_idle():
    b = Bridge()
    x_before = drive_some(b)
    lose_port(b)
    reconnect(b)
    b.left = b.right = 0
    b.run(0.2, cmd=GO, dt_ms=7500)
    assert b.node._x == x_before
    b.port.lines()
    b.run(2.0, cmd=GO)
    assert set(b.wire()) == {'STOP'}
    assert b.node._link.state == ONLINE and not b.node._link.motion_permitted
    assert 'count jump' not in b.warnings()
    b.run(0.1, cmd=STOP_CMD)
    b.port.lines()
    b.tick(cmd=GO)
    assert b.wire() == ['CMD']


def test_usb_reconnect_without_reboot_also_takes_a_fresh_baseline():
    b = Bridge()
    x_before = drive_some(b)
    lose_port(b)
    reconnect(b)
    b.run(0.1)                          # counts unchanged: MCU did not reboot
    assert b.node._x == x_before


def test_reset_odom_false_only_affects_the_very_first_frame():
    b = Bridge(reset_odom_on_start=False)
    b.left = b.right = -2618
    b.tick()
    assert math.isclose(b.node._x, 2618 / STEPS_PER_M, abs_tol=1e-9)
    b.run(0.7, cmd=STOP_CMD)
    x_before = b.node._x
    lose_port(b)
    reconnect(b)
    b.left = b.right = -5000
    b.tick()
    assert b.node._x == x_before


def test_reconnect_waits_for_a_slow_close():
    """close() can sleep 30 s on a wedged tty: never on the timer thread."""
    b = Bridge()
    b.online()
    b.port.close_gate = threading.Event()
    b.node._serial.read_error = OSError(5, 'gone')
    b.clock.t += TICK
    started = time.perf_counter()
    b.node._timer_callback()
    assert time.perf_counter() - started < 0.5
    assert b.node._serial is None and b.node._serial_closer.is_alive()

    b.next_ports.append(PipePort())
    b.clock.t += 5.0
    b.node._timer_callback()
    assert b.node._serial is None           # old fd still closing
    assert b.node._serial_opener is None
    b.port.close_gate.set()
    b.wait_closer()
    b.clock.t += 5.0
    b.node._timer_callback()
    b.node._serial_opener.join(5.0)
    assert b.node._serial is not None


def test_a_slow_open_never_blocks_the_timer():
    b = Bridge()
    b.online()
    lose_port(b)
    gate = threading.Event()
    real = node_module.serial.Serial

    def slow(**kwargs):
        gate.wait(10.0)
        return real(**kwargs)

    node_module.serial = SimpleNamespace(Serial=slow)
    b.next_ports.append(PipePort())
    b.clock.t += 1.1
    started = time.perf_counter()
    b.node._timer_callback()
    assert time.perf_counter() - started < 0.5
    assert b.node._serial is None and b.node._serial_opener.is_alive()
    b.clock.t += 5.0
    b.node._timer_callback()                # no second opener while one runs
    gate.set()
    b.node._serial_opener.join(5.0)
    assert b.node._serial is not None


def test_nothing_is_sent_to_complete_a_line_cut_by_the_old_port():
    """A bare newline could turn a truncated CMD left in the firmware's line
    buffer into a valid one; a normal line makes it a bad_command instead."""
    b = Bridge()
    b.online()
    lose_port(b)
    reconnect(b)
    b.tick()
    raw = b.port.lines()
    assert raw[0].startswith('STOP,')


def test_stale_partial_line_is_dropped_on_reconnect():
    b = Bridge()
    b.online()
    b.node._rx_buffer = 'FB,1,2'
    b.node._tx_pending = b',-250\r\n'
    lose_port(b)
    reconnect(b)
    assert b.node._rx_buffer == '' and b.node._tx_pending == b''


# ---- IMU reference across a reboot ----------------------------------------
def test_yaw_is_passed_through_untouched_without_a_fault():
    b = Bridge()
    b.run(0.2, yaw_cdeg=1234)
    assert all(yaw == math.radians(12.34) for yaw in b.imu)


def test_yaw_stays_continuous_across_an_mcu_reboot():
    b = Bridge()
    b.run(0.2, yaw_cdeg=9000)
    lose_port(b)
    reconnect(b)
    b.imu.clear()
    b.run(0.1, yaw_cdeg=-1000)          # BNO085 restarted from its own zero
    assert all(math.isclose(y, math.pi / 2, abs_tol=1e-9) for y in b.imu)
    b.imu.clear()
    b.tick(yaw_cdeg=-500)               # later rotation is tracked normally
    assert math.isclose(b.imu[-1], math.radians(95.0), abs_tol=1e-9)


def test_yaw_rebase_wraps_at_pi():
    b = Bridge()
    b.run(0.1, yaw_cdeg=17900)
    lose_port(b)
    reconnect(b)
    b.run(0.05, yaw_cdeg=0)
    b.imu.clear()
    b.tick(yaw_cdeg=300)                # 179 + 3 degrees wraps to -178
    assert math.isclose(b.imu[-1], math.radians(-178.0), abs_tol=1e-9)


def test_yaw_rebase_waits_for_the_first_valid_sample():
    b = Bridge()
    b.run(0.1, yaw_cdeg=4500)
    lose_port(b)
    reconnect(b)
    b.run(0.2)                          # yaw_valid=0 while the BNO085 boots
    b.imu.clear()
    b.tick(yaw_cdeg=2000)
    assert math.isclose(b.imu[-1], math.radians(45.0), abs_tol=1e-9)


def test_small_yaw_differences_are_left_to_the_ekf():
    b = Bridge()
    b.run(0.1, yaw_cdeg=1000)
    b.imu.clear()
    b.tick(yaw_cdeg=1800)               # 8 degrees: below the step threshold
    assert math.isclose(b.imu[-1], math.radians(18.0), abs_tol=1e-9)
    assert b.node._imu_heading_offset == 0.0


def turn(b, degrees):
    """Wheel counts for an in-place turn of this many degrees (ROS sense)."""
    ticks = 6                           # spread over frames: inside the step limit
    arc = math.radians(degrees) * b.node.wheel_base / 2.0 / ticks
    for _ in range(ticks):
        b.left += round(arc * STEPS_PER_M)
        b.right -= round(arc * STEPS_PER_M)
        b.tick()


def test_fast_turn_explained_by_the_wheels_is_not_a_step():
    b = Bridge()
    b.run(0.1, yaw_cdeg=0)
    turn(b, 25.0)
    b.imu.clear()
    b.tick(yaw_cdeg=2500)
    assert math.isclose(b.imu[-1], math.radians(25.0), abs_tol=1e-2)
    assert b.node._imu_heading_offset == 0.0


def test_chip_reset_while_turning_keeps_the_turn():
    """BNO085 restart alone: no port event, no count event, wheels turning."""
    b = Bridge()
    b.run(0.1, yaw_cdeg=9000)
    turn(b, 30.0)                       # yaw_valid=0 during the restart
    b.imu.clear()
    b.tick(yaw_cdeg=500)                # new zero, wheels turned 30 degrees
    assert math.isclose(b.imu[-1], math.radians(120.0), abs_tol=1e-2)


def test_yaw_invalid_period_does_not_lose_the_reference():
    b = Bridge()
    b.run(0.1, yaw_cdeg=2000)
    b.run(1.0)                          # IMU silent
    b.imu.clear()
    b.tick(yaw_cdeg=9000)
    assert math.isclose(b.imu[-1], math.radians(20.0), abs_tol=1e-9)


def test_first_yaw_ever_is_not_rebased_after_an_early_reconnect():
    b = Bridge()
    b.run(0.1)
    lose_port(b)
    reconnect(b)
    b.tick(yaw_cdeg=2000)
    assert math.isclose(b.imu[-1], math.radians(20.0), abs_tol=1e-9)
    assert b.node._imu_heading_offset == 0.0


def test_count_jump_also_rebases_yaw():
    b = Bridge()
    drive_some(b)
    b.run(0.05, yaw_cdeg=3000, cmd=GO)
    b.left = b.right = 0
    b.imu.clear()
    b.tick(yaw_cdeg=0, cmd=GO)
    assert math.isclose(b.imu[-1], math.radians(30.0), abs_tol=1e-9)


# ---- serial output never blocks -------------------------------------------
def test_write_to_a_full_kernel_buffer_returns_immediately():
    b = Bridge()
    b.online()
    b.port.fill()
    started = time.perf_counter()
    for _ in range(50):
        b.clock.t += 0.01
        b.node._write_serial('STOP,1\r\n')
    assert time.perf_counter() - started < 0.5


def test_timer_keeps_running_and_reading_while_output_is_stalled():
    b = Bridge()
    b.online()
    b.port.fill()
    fed = []
    b.node._link.on_feedback = (lambda orig: (
        lambda now: fed.append(now) or orig(now)))(b.node._link.on_feedback)
    b.run(0.5, cmd=GO)
    assert len(fed) == 10


def test_sustained_stall_closes_the_port_and_needs_idle():
    b = Bridge()
    b.online()
    b.port.fill()
    b.run(1.2, cmd=GO)
    assert b.node._serial is None
    assert b.node._link.state == DISCONNECTED
    assert b.node._link.rearm_reason == 'serial_write_stalled'
    b.wait_closer()


def test_short_stall_recovers_and_does_not_close_the_port():
    b = Bridge()
    b.online()
    b.port.fill()
    b.run(0.5, cmd=GO)
    b.port.lines()                      # the far end starts draining again
    b.run(0.5, cmd=GO)
    assert b.node._serial is b.port
    assert b.node._write_stall_since is None
    assert b.node._link.motion_permitted


def test_partial_line_is_finished_before_anything_else():
    b = Bridge()
    b.online()
    scripted = iter([9, 0, 7, 8])

    def partly(fd, data):
        return os.write(fd, data[:next(scripted)])

    b.node._write_nonblocking = partly
    assert b.node._write_serial('CMD,7,-250,-250\r\n') is True
    assert b.node._tx_pending == b'0,-250\r\n'
    assert b.node._write_serial('STOP,8\r\n') is False    # kernel took nothing
    assert b.node._tx_pending == b'0,-250\r\n'
    assert b.node._write_serial('STOP,9\r\n') is False    # tail not finished yet
    assert b.node._tx_pending == b'\n'


def test_tail_completes_then_the_next_line_goes_out_intact():
    b = Bridge()
    b.online()
    pieces = iter([5, None, None])

    def partly(fd, data):
        size = next(pieces)
        return os.write(fd, data if size is None else data[:size])

    b.node._write_nonblocking = partly
    assert b.node._write_serial('CMD,7,-250,-250\r\n') is True
    assert b.node._write_serial('STOP,8\r\n') is True
    assert b.port.lines() == ['CMD,7,-250,-250', 'STOP,8']
    assert b.node._tx_pending == b'' and b.node._write_stall_since is None


def test_a_dropped_line_does_not_consume_a_sequence_number():
    b = Bridge()
    b.online()
    b.port.fill()
    seq = b.node._seq
    assert b.node.send_seq_command(lambda s: f'STOP,{s}') is None
    assert b.node._seq == seq


def test_write_error_closes_port_and_holds_wheels():
    b = Bridge()
    b.online()
    b.tick(cmd=GO)

    def broken(_fd, _data):
        raise OSError(5, 'Input/output error')

    b.node._write_nonblocking = broken
    assert b.node._write_serial('STOP,1\r\n') is False
    assert b.node._serial is None
    assert b.node._link.rearm_reason == 'serial_write_failed'
    assert b.node._command_is_stop
    b.wait_closer()


def test_a_real_tty_with_no_reader_never_blocks_the_writer():
    master, slave = pty.openpty()
    try:
        os.set_blocking(slave, False)
        port = SimpleNamespace(is_open=True, fileno=lambda: slave, close=lambda: None)
        b = Bridge(port=port, connect=False)
        b.node._serial = port
        started = time.perf_counter()
        results = []
        for _ in range(2000):
            b.clock.t += 0.0001
            results.append(b.node._write_serial('CMD,1,-250,-250\r\n'))
            if b.node._serial is None:
                break
        assert time.perf_counter() - started < 2.0
        assert False in results
    finally:
        os.close(master)
        os.close(slave)


def test_concurrent_writers_never_interleave_lines():
    """Timer and head callback threads share the port."""
    b = Bridge()
    b.online()
    b.port.lines()

    def writer(tag):
        for index in range(200):
            b.node.send_seq_command(lambda s: f'{tag},{s},{index}')

    threads = [threading.Thread(target=writer, args=(t,)) for t in ('HEAD', 'CMD')]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    lines = b.port.lines()
    assert len(lines) == 400
    assert all(len(line.split(',')) == 3 for line in lines)
    assert [int(line.split(',')[1]) for line in lines] == sorted(
        int(line.split(',')[1]) for line in lines)


def test_read_is_safe_when_another_thread_closed_the_port():
    b = Bridge()
    b.online()
    b.node._close_serial('serial_write_failed')
    b.node._read_feedback()
    b.wait_closer()


def test_shutdown_sends_stop_and_closes():
    b = Bridge()
    b.online()
    b.port.lines()
    node_module.Node.destroy_node = lambda self: None
    b.node.destroy_node()
    assert b.wire() == ['STOP']
    assert b.port.closed.is_set()


def test_shutdown_is_not_hung_by_a_wedged_close():
    b = Bridge()
    b.online()
    b.port.close_gate = threading.Event()
    node_module.Node.destroy_node = lambda self: None
    node_module.time = SimpleNamespace(monotonic=time.monotonic)
    started = time.perf_counter()
    b.node.destroy_node()
    assert time.perf_counter() - started < 2.0
    b.port.close_gate.set()
