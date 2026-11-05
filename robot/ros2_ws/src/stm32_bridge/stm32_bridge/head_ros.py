"""Giao dien ROS 2 cho dau quay PAN/TILT (trong stm32_bridge).

stm32_bridge giu cong /dev/ttyACM0 nen moi lenh toi STM32 phai di qua node
nay. Tat ca ten la tuong doi -> /robot_01/... khi chay co namespace.

  action  head/set        bus_interfaces/action/SetHead  (goc tuyet doi, HOME)
  topic   head/jog        bus_interfaces/msg/HeadJog     (giu nut, publish deu)
  topic   head/step       bus_interfaces/msg/HeadStep    (nhan nut)
  topic   head/state      bus_interfaces/msg/HeadState   (publish)
  srv     head/stop       std_srvs/srv/Trigger           (giam toc dung, huy HOME)
  srv     head/off        std_srvs/srv/Trigger           (tat driver, mat moc)
  srv     head/zero       std_srvs/srv/Trigger           (moc tay, du phong)

Contactor nam rieng o contactor_ros.py (khong phu thuoc bus_interfaces).
Dau quay KHONG phu thuoc trang thai contactor: lenh HEAD gui di bat ke
contactor dang bat hay tat.

Tu dong (tham so):
  head_auto_home        STM32 vua khoi dong (FB: head_state=OFF, head_seq=0)
                        -> gui HEAD,HOME: PAN quay phai tim vat can roi ve 0,
                        TILT cui tim vat can roi ve thang. Lap lai sau moi lan
                        STM32 reset; khong chay lai sau head/off cua nguoi dung.
  head_park_on_shutdown tat bridge khi dau dang co moc -> dua ve 0/0 truoc,
                        de lan HOME sau bat dau gan phia truoc (PAN chi quay
                        190 do khi HOME, xem firmware head_core.h).

Logic thuan (dinh dang lenh, doc FB, ket qua theo seq, deadman JOG) nam o
head_link.py va duoc test khong can ROS.
"""
import threading
import time
from typing import Callable, Optional, Tuple

from bus_interfaces.action import SetHead
from bus_interfaces.msg import HeadJog, HeadState, HeadStep
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from std_srvs.srv import Trigger

from stm32_bridge import head_link as hl

# Dong ERR,head_* khong mang seq: chi gan vao lenh bi tu choi neu den gan.
HEAD_ERROR_MATCH_WINDOW_S = 1.0
# Firmware gioi han ERR 1 dong / 20 ms va gui FB khi ERR con cho, nen FB bao
# tu choi co the den truoc dong ERR: cho them toi da chung nay de lay ly do.
REJECT_REASON_GRACE_S = 0.15
FEEDBACK_STALE_S = 1.0
# HOME tu dong that bai (vd mat serial) ma dau van OFF/chua co lenh: thu lai.
AUTO_HOME_RETRY_S = 5.0


class HeadInterface:
    def __init__(self, node, send_seq_command: Callable[[Callable[[int], str]], Optional[int]]):
        """send_seq_command(build) cap seq, gui build(seq) + CRLF, tra seq hoac None."""
        self._node = node
        self._send = send_seq_command

        node.declare_parameter('head_jog_timeout', 0.25)
        node.declare_parameter('head_state_rate_hz', 10.0)
        node.declare_parameter('head_move_timeout', 20.0)
        node.declare_parameter('head_home_timeout', 45.0)
        node.declare_parameter('head_command_timeout', 1.0)
        node.declare_parameter('head_auto_home', True)
        node.declare_parameter('head_park_on_shutdown', True)
        self._move_timeout = float(node.get_parameter('head_move_timeout').value)
        self._home_timeout = float(node.get_parameter('head_home_timeout').value)
        self._cmd_timeout = float(node.get_parameter('head_command_timeout').value)
        self._auto_home = bool(node.get_parameter('head_auto_home').value)
        self._park_on_shutdown = bool(node.get_parameter('head_park_on_shutdown').value)
        self._auto_home_thread: Optional[threading.Thread] = None
        self._auto_home_last_try: Optional[float] = None
        rate = float(node.get_parameter('head_state_rate_hz').value)
        self._state_period = 1.0 / rate if rate > 0.0 else 0.1

        self._cond = threading.Condition()
        self._fb: Optional[hl.HeadFeedback] = None
        self._fb_mono: Optional[float] = None
        self._fw_has_head: Optional[bool] = None
        self._last_error: Optional[Tuple[str, float]] = None

        self._jog_lock = threading.Lock()
        self._jog = hl.JogRelay(
            timeout=float(node.get_parameter('head_jog_timeout').value))

        self._last_state_pub_mono = 0.0
        self._last_state_published: Optional[int] = None

        cb = ReentrantCallbackGroup()
        self._state_pub = node.create_publisher(HeadState, 'head/state', 10)
        node.create_subscription(HeadJog, 'head/jog', self._on_jog, 10, callback_group=cb)
        node.create_subscription(HeadStep, 'head/step', self._on_step, 10, callback_group=cb)
        node.create_service(Trigger, 'head/stop', self._srv_stop, callback_group=cb)
        node.create_service(Trigger, 'head/off', self._srv_off, callback_group=cb)
        node.create_service(Trigger, 'head/zero', self._srv_zero, callback_group=cb)
        self._action = ActionServer(
            node, SetHead, 'head/set',
            execute_callback=self._execute,
            goal_callback=lambda _goal: GoalResponse.ACCEPT,
            cancel_callback=lambda _goal: CancelResponse.ACCEPT,
            callback_group=cb)

    # ---- duoc stm32_bridge_node goi (thread timer) -------------------------
    def on_feedback_line(self, line: str) -> None:
        fb = hl.parse_head_feedback(line)
        now = time.monotonic()
        with self._cond:
            if fb is None:
                if self._fw_has_head is None:
                    self._node.get_logger().warn(
                        'STM32 feedback has no head fields: firmware without '
                        'PAN/TILT support. Head commands are disabled.')
                self._fw_has_head = False
                return
            self._fw_has_head = True
            self._fb = fb
            self._fb_mono = now
            self._cond.notify_all()
        self._publish_state(fb, now)
        self._maybe_auto_home(fb, now)

    def on_error_line(self, line: str) -> None:
        kind = hl.head_error_kind(line)
        if kind is not None:
            with self._cond:
                self._last_error = (kind, time.monotonic())
                self._cond.notify_all()

    def on_timer(self, now: float) -> None:
        with self._jog_lock:
            d = self._jog.tick(now)
            if d is not None:
                self._send(lambda seq: hl.cmd_head_jog(seq, d[0], d[1]))

    def shutdown(self) -> None:
        with self._jog_lock:
            jogging = self._jog.active
            self._jog.reset()
        with self._cond:
            fb = self._fb
        if self._park_on_shutdown and fb is not None and fb.referenced and \
                (fb.pan_cdeg != 0 or fb.tilt_cdeg != 0 or fb.state == hl.STATE_MOVING):
            # Lenh goc thay the JOG dang giu; firmware tu chay ve 0 ke ca khi
            # bridge da thoat.
            self._node.get_logger().info('Head park: HEAD -> 0/0 before shutdown')
            self._send(lambda seq: hl.cmd_head_angle(seq, 0.0, 0.0))
        elif jogging:
            self._send(lambda seq: hl.cmd_head_jog(seq, 0, 0))

    # ---- HOME tu dong ----------------------------------------------------------
    def _maybe_auto_home(self, fb: hl.HeadFeedback, now: float) -> None:
        """head_seq=0 + OFF = STM32 vua khoi dong, chua nhan lenh HEAD nao."""
        if not self._auto_home:
            return
        if fb.head_seq != 0:
            # Da co lenh HEAD duoc chap nhan (HOME nay, hoac lenh nguoi dung):
            # cho lan STM32 reset ke tiep.
            self._auto_home_last_try = None
            return
        if fb.state != hl.STATE_OFF:
            return
        if self._auto_home_thread is not None and self._auto_home_thread.is_alive():
            return
        if self._auto_home_last_try is not None and \
                (now - self._auto_home_last_try) < AUTO_HOME_RETRY_S:
            return
        self._auto_home_last_try = now
        self._auto_home_thread = threading.Thread(
            target=self._run_auto_home, name='head_auto_home', daemon=True)
        self._auto_home_thread.start()

    def _run_auto_home(self) -> None:
        log = self._node.get_logger()
        log.info('Head auto-home: HEAD,HOME (PAN right to the stop then back to 0, '
                 'TILT down to the stop then up to level)')
        with self._jog_lock:
            self._jog.reset()
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'HOME'), self._home_timeout)
        if outcome == hl.DONE:
            log.info('Head auto-home done: referenced at 0/0')
            return
        if outcome == 'timeout':
            self._send(lambda seq: hl.cmd_head_word(seq, 'STOP'))
        log.warn('Head auto-home failed: ' + self._describe(outcome, fb, detail))

    # ---- publish -------------------------------------------------------------
    def _publish_state(self, fb: hl.HeadFeedback, now: float) -> None:
        changed = fb.state != self._last_state_published
        if changed or (now - self._last_state_pub_mono) >= self._state_period:
            msg = HeadState()
            msg.header.stamp = self._node.get_clock().now().to_msg()
            msg.state = fb.state
            msg.referenced = fb.referenced
            msg.pan_deg = float(fb.pan_deg)
            msg.tilt_deg = float(fb.tilt_deg)
            msg.last_head_seq = fb.head_seq
            self._state_pub.publish(msg)
            self._last_state_pub_mono = now
            self._last_state_published = fb.state

    # ---- topic ---------------------------------------------------------------
    def _on_jog(self, msg) -> None:
        if not self._fw_has_head:
            return
        now = time.monotonic()
        with self._jog_lock:
            d = self._jog.on_jog(int(msg.pan), int(msg.tilt), now)
            if d is not None:
                self._send(lambda seq: hl.cmd_head_jog(seq, d[0], d[1]))

    def _on_step(self, msg) -> None:
        if not self._fw_has_head:
            return
        if msg.pan_steps == 0 and msg.tilt_steps == 0:
            return
        self._send(lambda seq: hl.cmd_head_step(seq, int(msg.pan_steps), int(msg.tilt_steps)))

    # ---- cho ket qua theo seq -----------------------------------------------
    def _wait_outcome(self, seq: int, timeout: float,
                      cancel_requested: Callable[[], bool] = lambda: False,
                      on_progress: Optional[Callable[[hl.HeadFeedback], None]] = None
                      ) -> Tuple[str, Optional[hl.HeadFeedback], str]:
        """(outcome, fb cuoi, chi tiet). outcome: head_link.DONE/REJECTED/
        SUPERSEDED/ABORTED, hoac 'canceled' / 'timeout' / 'no_feedback'."""
        deadline = time.monotonic() + timeout
        sent_at = time.monotonic()
        rejected_at: Optional[float] = None
        while True:
            with self._cond:
                self._cond.wait(timeout=0.1)
                fb = self._fb
                fb_mono = self._fb_mono
                err = self._last_error
            now = time.monotonic()
            if cancel_requested():
                return 'canceled', fb, ''
            if fb is not None:
                outcome = hl.command_outcome(seq, fb)
                if outcome != hl.PENDING:
                    detail = ''
                    if outcome == hl.REJECTED:
                        if err is not None and err[1] >= sent_at - 0.05 and \
                                (now - err[1]) <= HEAD_ERROR_MATCH_WINDOW_S:
                            detail = err[0]
                        elif rejected_at is None:
                            rejected_at = now           # cho dong ERR them chut
                            continue
                        elif (now - rejected_at) < REJECT_REASON_GRACE_S:
                            continue
                        elif fb.head_seq == 0 and fb.state == hl.STATE_OFF:
                            # head_seq ve 0 ma khong co ERR: STM32 vua khoi dong lai.
                            return hl.ABORTED, fb, 'stm32_reset'
                    return outcome, fb, detail
                if on_progress is not None:
                    on_progress(fb)
            if fb_mono is None or (now - fb_mono) > FEEDBACK_STALE_S:
                if (now - sent_at) > FEEDBACK_STALE_S:
                    return 'no_feedback', fb, ''
            if now >= deadline:
                return 'timeout', fb, ''

    def _send_and_wait(self, build: Callable[[int], str], timeout: float, **kw):
        if self._fw_has_head is False:
            return 'firmware_without_head', None, ''
        seq = self._send(build)
        if seq is None:
            return 'serial_unavailable', None, ''
        return self._wait_outcome(seq, timeout, **kw)

    # ---- service -------------------------------------------------------------
    def _srv_stop(self, _req, resp):
        with self._jog_lock:
            self._jog.reset()
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'STOP'), self._move_timeout)
        # Dung xong: IDLE (con moc) hoac NO_REF (vua huy HOME) deu la da dung.
        resp.success = outcome in (hl.DONE, hl.ABORTED)
        resp.message = self._describe(outcome, fb, detail)
        return resp

    def _srv_off(self, _req, resp):
        with self._jog_lock:
            self._jog.reset()
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'OFF'), self._cmd_timeout)
        resp.success = outcome == hl.ABORTED and fb is not None and fb.state == hl.STATE_OFF
        resp.message = 'off' if resp.success else self._describe(outcome, fb, detail)
        return resp

    def _srv_zero(self, _req, resp):
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'ZERO'), self._cmd_timeout)
        resp.success = outcome == hl.DONE
        resp.message = 'zeroed' if resp.success else self._describe(outcome, fb, detail)
        return resp

    # ---- action --------------------------------------------------------------
    def _execute(self, goal_handle):
        goal = goal_handle.request
        home = goal.mode == SetHead.Goal.MODE_HOME
        with self._jog_lock:
            self._jog.reset()
        if home:
            build = (lambda seq: hl.cmd_head_word(seq, 'HOME'))
            timeout = self._home_timeout
        else:
            pan, tilt = float(goal.pan_deg), float(goal.tilt_deg)
            build = (lambda seq: hl.cmd_head_angle(seq, pan, tilt))
            timeout = self._move_timeout

        last_fb_sent = [0.0]

        def progress(fb):
            now = time.monotonic()
            if now - last_fb_sent[0] >= 0.2:
                feedback = SetHead.Feedback()
                feedback.state = fb.state
                feedback.pan_deg = float(fb.pan_deg)
                feedback.tilt_deg = float(fb.tilt_deg)
                goal_handle.publish_feedback(feedback)
                last_fb_sent[0] = now

        outcome, fb, detail = self._send_and_wait(
            build, timeout,
            cancel_requested=lambda: goal_handle.is_cancel_requested,
            on_progress=progress)

        result = SetHead.Result()
        if fb is not None:
            result.pan_deg = float(fb.pan_deg)
            result.tilt_deg = float(fb.tilt_deg)
        if outcome == hl.DONE:
            result.success = True
            result.message = 'homed' if home else 'reached'
            goal_handle.succeed()
            return result
        if outcome in ('canceled', 'timeout'):
            # Khong de dau quay chay tiep mot lenh khong con ai cho.
            self._send(lambda seq: hl.cmd_head_word(seq, 'STOP'))
        result.success = False
        result.message = self._describe(outcome, fb, detail)
        if outcome == 'canceled':
            goal_handle.canceled()
        else:
            goal_handle.abort()
        return result

    @staticmethod
    def _describe(outcome: str, fb: Optional[hl.HeadFeedback], detail: str) -> str:
        if outcome == hl.REJECTED:
            return 'rejected:' + (detail or 'unknown')
        if outcome == hl.ABORTED and detail:
            return 'aborted:' + detail
        if outcome == hl.ABORTED and fb is not None:
            return 'aborted:' + hl.STATE_NAMES.get(fb.state, str(fb.state))
        return outcome
