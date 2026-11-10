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
  srv     head/sweep      std_srvs/srv/Trigger           (xoay tu dong: trai -> phai -> ve cho cu)

Contactor nam rieng o contactor_ros.py (khong phu thuoc bus_interfaces).
Dau quay KHONG phu thuoc trang thai contactor: lenh HEAD gui di bat ke
contactor dang bat hay tat.

Tu dong (tham so):
  head_auto_home        STM32 vua khoi dong (FB: head_state=OFF, head_seq=0)
                        -> gui HEAD,HOME: PAN quay phai tim vat can roi ve 0,
                        TILT cui tim vat can roi ve thang. Lap lai sau moi lan
                        STM32 reset; khong chay lai sau head/off cua nguoi dung.
  head_park_on_shutdown tat bridge khi dau dang co moc -> dua ve 0/0 truoc
                        va cho toi khi ve xong (toi da head_park_timeout), de
                        lan HOME sau bat dau gan phia truoc.
  head_pan_memory_file  ghi goc PAN cuoi cung (khi co moc) ra file. Sau khi STM32
                        reset/mat dien ma dau dang lech trai qua
                        head_home_safe_left_deg, HOME tu dong lay tam moc tai goc
                        da ghi (ZERO), quay ve 0 roi moi HOME.

HOME chi dung khi dau o trong [174 do phai .. 16 do trai]: PAN chi quay phai
190 do de tim vat chan (firmware head_core.h). Vi vay moi lan HOME (tu dong hay
head/set MODE_HOME) ma dau dang lech trai qua head_home_safe_left_deg deu quay
ve 0 truoc.

Xoay tu dong (head/sweep, chi PAN, TILT giu nguyen): tu vi tri hien tai quay
trai head_sweep_deg, roi phai 2*head_sweep_deg, roi trai head_sweep_deg ve dung
cho cu. Dung lenh STEP nen chay o toc do nut bam cua firmware
(HEAD_JOG_SPEED_DPS, 30 do/s), cho IDLE sau moi doan. Moi ben duoc thu nho de
khong cham gioi han mem. Lenh tay (head/jog khac 0, head/step, head/set,
head/stop|off|zero) luon thang: no huy luot quet, luot quet khong gui them lenh
nao sau do. STEP/JOG chi doi dich cua truc duoc nhan nen bridge gui STOP truoc
chung khi dang quet, de dau dung lai chu khong chay het doan quet.

Logic thuan (dinh dang lenh, doc FB, ket qua theo seq, deadman JOG) nam o
head_link.py va duoc test khong can ROS.
"""
import json
import math
import os
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
# Ghi goc PAN ra file: chi khi doi it nhat chung nay va khong qua 5 lan/giay.
PAN_MEMORY_MIN_CHANGE_DEG = 0.5
PAN_MEMORY_MIN_PERIOD_S = 0.2


class HeadInterface:
    def __init__(self, node, send_seq_command: Callable[[Callable[[int], str]], Optional[int]]):
        """send_seq_command(build) cap seq, gui build(seq) + CRLF, tra seq hoac None."""
        self._node = node
        self._send_raw = send_seq_command
        # seq cua lenh HEAD gui gan nhat: head/sweep cho FB theo kip no truoc khi lay vi tri bat dau.
        self._last_head_sent: Optional[int] = None

        node.declare_parameter('head_jog_timeout', 0.25)
        node.declare_parameter('head_state_rate_hz', 10.0)
        node.declare_parameter('head_move_timeout', 20.0)
        node.declare_parameter('head_home_timeout', 45.0)
        node.declare_parameter('head_command_timeout', 1.0)
        node.declare_parameter('head_auto_home', True)
        node.declare_parameter('head_park_on_shutdown', True)
        # 170 do o 60 do/s ~ 3 s; duoi 5 s de ros2 launch (SIGINT -> SIGTERM sau 5 s) khong giet node giua chung.
        node.declare_parameter('head_park_timeout', 4.0)
        node.declare_parameter('head_pan_memory_file', '~/.ros/stm32_bridge/head_pan.json')
        # Firmware HOME dung khi dau lech trai toi 16 do; chua 6 do du phong.
        node.declare_parameter('head_home_safe_left_deg', 10.0)
        # head/sweep. pan_deg_per_step va pan_limit_deg PHAI khop firmware head_core.h
        # (buoc du qua hop so 3:1 = 0.6 do; HEAD_PAN_LIMIT_CDEG = 17000). sweep_speed_dps chi de tinh timeout.
        node.declare_parameter('head_sweep_deg', 135.0)
        node.declare_parameter('head_sweep_pan_deg_per_step', 0.6)
        node.declare_parameter('head_sweep_pan_limit_deg', 170.0)
        node.declare_parameter('head_sweep_speed_dps', 30.0)
        self._move_timeout = float(node.get_parameter('head_move_timeout').value)
        self._home_timeout = float(node.get_parameter('head_home_timeout').value)
        self._cmd_timeout = float(node.get_parameter('head_command_timeout').value)
        self._auto_home = bool(node.get_parameter('head_auto_home').value)
        self._park_on_shutdown = bool(node.get_parameter('head_park_on_shutdown').value)
        self._park_timeout = float(node.get_parameter('head_park_timeout').value)
        memory = str(node.get_parameter('head_pan_memory_file').value).strip()
        self._pan_memory_file = os.path.expanduser(memory) if memory else ''
        self._home_safe_left = float(node.get_parameter('head_home_safe_left_deg').value)
        self._pan_memory_last: Optional[dict] = None
        self._pan_memory_written_at = 0.0
        self._pan_memory_error_logged = False
        # Goc that = goc firmware + offset: khac 0 chi khi HOME tu dong vua lay tam moc bang ZERO.
        self._pan_offset = 0.0
        self._auto_home_thread: Optional[threading.Thread] = None
        self._auto_home_last_try: Optional[float] = None
        self._sweep_deg = float(node.get_parameter('head_sweep_deg').value)
        self._sweep_deg_per_step = float(node.get_parameter('head_sweep_pan_deg_per_step').value)
        self._sweep_limit_deg = float(node.get_parameter('head_sweep_pan_limit_deg').value)
        self._sweep_speed_dps = float(node.get_parameter('head_sweep_speed_dps').value)
        if self._sweep_deg < 0.0 or min(self._sweep_deg_per_step, self._sweep_limit_deg, self._sweep_speed_dps) <= 0.0:
            raise ValueError('head_sweep_* parameters must be positive (head_sweep_deg may be 0).')
        # Khoa nay xep thu tu "kiem tra huy + gui STEP" cua luot quet voi "dat co huy" cua lenh tay:
        # sau khi lenh tay dat co, luot quet khong bao gio gui them lenh.
        self._sweep_lock = threading.Lock()
        self._sweep_cancel: Optional[threading.Event] = None
        self._sweep_thread: Optional[threading.Thread] = None
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
        node.create_service(Trigger, 'head/sweep', self._srv_sweep, callback_group=cb)
        self._action = ActionServer(
            node, SetHead, 'head/set',
            execute_callback=self._execute,
            goal_callback=lambda _goal: GoalResponse.ACCEPT,
            cancel_callback=lambda _goal: CancelResponse.ACCEPT,
            callback_group=cb)

    def _send(self, build: Callable[[int], str]) -> Optional[int]:
        seq = self._send_raw(build)
        if seq is not None:
            with self._cond:
                self._last_head_sent = seq
        return seq

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
        self._remember_pan(fb, now)
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

    def shutdown(self, pump: Optional[Callable[[], None]] = None) -> None:
        """pump(): doc serial mot lan (executor da dung nen timer khong con doc FB)."""
        self._preempt_sweep()
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
            seq = self._send(lambda seq: hl.cmd_head_angle(seq, 0.0, 0.0))
            if seq is not None and pump is not None and self._park_timeout > 0.0:
                self._wait_parked(seq, pump)
        elif jogging:
            self._send(lambda seq: hl.cmd_head_jog(seq, 0, 0))

    def _wait_parked(self, seq: int, pump: Callable[[], None]) -> None:
        """Cho lenh ve 0/0 xong: cat dien ngay sau khi tat bridge ma dau con lech trai thi lan HOME sau sai moc."""
        deadline = time.monotonic() + self._park_timeout
        outcome = hl.PENDING
        while time.monotonic() < deadline:
            pump()
            with self._cond:
                fb = self._fb
            if fb is not None:
                outcome = hl.command_outcome(seq, fb)
                if outcome != hl.PENDING:
                    break
            time.sleep(0.02)
        log = self._node.get_logger()
        if outcome == hl.DONE:
            log.info('Head park done: 0/0')
        else:
            log.warn(f'Head park not confirmed ({outcome}): head may still be turned')

    # ---- nho goc PAN qua mat dien ----------------------------------------------
    def _remember_pan(self, fb: hl.HeadFeedback, now: float) -> None:
        if not self._pan_memory_file:
            return
        if fb.referenced:
            record = {'referenced': True, 'pan_deg': round(fb.pan_deg + self._pan_offset, 2)}
        elif fb.head_seq != 0 and fb.state in (hl.STATE_OFF, hl.STATE_NO_REF):
            # head/off hoac HOME bi huy: dau co the bi xoay tay, khong con biet goc.
            record = {'referenced': False}
        else:
            # Dang HOME, hoac STM32 vua reset (head_seq = 0): giu ban ghi cu cho HOME tu dong dung.
            return
        last = self._pan_memory_last
        if last is not None and last['referenced'] == record['referenced']:
            if not record['referenced'] or abs(last['pan_deg'] - record['pan_deg']) < PAN_MEMORY_MIN_CHANGE_DEG:
                return
            if now - self._pan_memory_written_at < PAN_MEMORY_MIN_PERIOD_S:
                return
        try:
            os.makedirs(os.path.dirname(self._pan_memory_file) or '.', exist_ok=True)
            tmp = self._pan_memory_file + '.tmp'
            with open(tmp, 'w', encoding='ascii') as f:
                json.dump(record, f)
            os.replace(tmp, self._pan_memory_file)
        except OSError as exc:
            if not self._pan_memory_error_logged:
                self._pan_memory_error_logged = True
                self._node.get_logger().warn(f'Head pan memory not written ({exc}); auto-home after a power loss '
                                             'cannot correct a head left of the safe range.')
            return
        self._pan_memory_last = record
        self._pan_memory_written_at = now

    def _load_pan_memory(self) -> Optional[float]:
        """Goc PAN that cuoi cung khi con moc, None neu khong biet."""
        if not self._pan_memory_file:
            return None
        try:
            with open(self._pan_memory_file, encoding='ascii') as f:
                record = json.load(f)
            pan = float(record['pan_deg']) if record.get('referenced') is True else None
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            return None
        return pan if pan is not None and math.isfinite(pan) else None

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
        self._preempt_sweep()
        log = self._node.get_logger()
        log.info('Head auto-home: HEAD,HOME (PAN right to the stop then back to 0, '
                 'TILT down to the stop then up to level)')
        with self._jog_lock:
            self._jog.reset()
        last_pan = self._load_pan_memory()
        if last_pan is not None and last_pan > self._home_safe_left:
            if not self._turn_back_from_remembered_pan(last_pan):
                return
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'HOME'), self._home_timeout)
        if outcome == hl.DONE:
            log.info('Head auto-home done: referenced at 0/0')
            return
        if outcome == 'timeout':
            self._send(lambda seq: hl.cmd_head_word(seq, 'STOP'))
        log.warn('Head auto-home failed: ' + self._describe(outcome, fb, detail))

    def _turn_back_from_remembered_pan(self, last_pan: float) -> bool:
        """Dau dang lech trai last_pan do (theo file): HOME ngay se khong cham vat chan va dat moc sai.
        Lay tam moc tai cho (ZERO), quay phai last_pan do ve gan 0, roi moi HOME."""
        log = self._node.get_logger()
        log.warn(f'Head auto-home: head was {last_pan:.1f} deg left when the STM32 lost power; '
                 'turning it back to the front before HOME')
        self._pan_offset = last_pan
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'ZERO'), self._cmd_timeout)
        if outcome != hl.DONE:
            self._pan_offset = 0.0
            log.warn('Head auto-home stopped (ZERO failed): ' + self._describe(outcome, fb, detail))
            return False
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_angle(seq, -last_pan, 0.0), self._move_timeout)
        if outcome != hl.DONE:
            if outcome == 'timeout':
                self._send(lambda seq: hl.cmd_head_word(seq, 'STOP'))
            log.warn('Head auto-home stopped (turning back failed): ' + self._describe(outcome, fb, detail))
            return False
        # Tu day toi HOME xong file khong duoc ghi (dang HOMING), roi goc firmware la goc that.
        self._pan_offset = 0.0
        return True

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
            # Nha nut khi khong co JOG nao dang chay thi khong phai lenh tay: khong huy luot quet
            # (fleet_bridge nha JOG ngay truoc khi goi head/sweep).
            if int(msg.pan) != 0 or int(msg.tilt) != 0 or self._jog.active:
                if self._preempt_sweep():
                    # JOG chi doi dich cua truc duoc nhan: dung doan quet dang chay truoc.
                    self._send(lambda seq: hl.cmd_head_word(seq, 'STOP'))
            d = self._jog.on_jog(int(msg.pan), int(msg.tilt), now)
            if d is not None:
                self._send(lambda seq: hl.cmd_head_jog(seq, d[0], d[1]))

    def _on_step(self, msg) -> None:
        if not self._fw_has_head:
            return
        if msg.pan_steps == 0 and msg.tilt_steps == 0:
            return
        if self._preempt_sweep():
            # STEP cong vao DICH cua doan quet dang chay: neu khong dung truoc, dau van quay het doan do.
            self._send(lambda seq: hl.cmd_head_word(seq, 'STOP'))
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
        self._preempt_sweep()
        with self._jog_lock:
            self._jog.reset()
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'STOP'), self._move_timeout)
        # Dung xong: IDLE (con moc) hoac NO_REF (vua huy HOME) deu la da dung.
        resp.success = outcome in (hl.DONE, hl.ABORTED)
        resp.message = self._describe(outcome, fb, detail)
        return resp

    def _srv_off(self, _req, resp):
        self._preempt_sweep()
        with self._jog_lock:
            self._jog.reset()
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'OFF'), self._cmd_timeout)
        resp.success = outcome == hl.ABORTED and fb is not None and fb.state == hl.STATE_OFF
        resp.message = 'off' if resp.success else self._describe(outcome, fb, detail)
        return resp

    def _srv_zero(self, _req, resp):
        self._preempt_sweep()
        outcome, fb, detail = self._send_and_wait(
            lambda seq: hl.cmd_head_word(seq, 'ZERO'), self._cmd_timeout)
        resp.success = outcome == hl.DONE
        resp.message = 'zeroed' if resp.success else self._describe(outcome, fb, detail)
        return resp

    def _srv_sweep(self, _req, resp):
        if self._fw_has_head is False:
            resp.success, resp.message = False, 'firmware_without_head'
            return resp
        # Cho khung FB phan anh moi lenh dau quay da gui (vd nut tay vua bam): neu khong, "vi tri bat dau"
        # co the la vi tri cu trong khi firmware sap quay toi dich cua lenh do.
        deadline = time.monotonic() + self._cmd_timeout
        with self._cond:
            while True:
                fb, fb_mono, last = self._fb, self._fb_mono, self._last_head_sent
                caught_up = fb is not None and (last is None or hl.seq_at_or_after(fb.fb_seq, last))
                remaining = deadline - time.monotonic()
                if caught_up or remaining <= 0.0:
                    break
                self._cond.wait(remaining)
        if fb is None or fb_mono is None or time.monotonic() - fb_mono > FEEDBACK_STALE_S:
            resp.success, resp.message = False, 'no_feedback'
            return resp
        if not caught_up:
            resp.success, resp.message = False, 'not_ready:command_pending'
            return resp
        if fb.state != hl.STATE_IDLE:
            # Can co moc va dang dung yen: chua HOME, dang HOME hay dang quay thi khong quet.
            resp.success = False
            resp.message = 'not_ready:' + hl.STATE_NAMES.get(fb.state, str(fb.state))
            return resp
        with self._sweep_lock:
            if self._sweep_thread is not None and self._sweep_thread.is_alive():
                resp.success, resp.message = False, 'already_sweeping'
                return resp
            cancel = threading.Event()
            self._sweep_cancel = cancel
            self._sweep_thread = threading.Thread(
                target=self._run_sweep, args=(fb, cancel), name='head_sweep', daemon=True)
            self._sweep_thread.start()
        resp.success, resp.message = True, 'started'
        return resp

    def _preempt_sweep(self) -> bool:
        """Lenh tay thang: huy luot quet dang chay (neu co). True neu vua huy mot luot con dang chay."""
        with self._sweep_lock:
            running = self._sweep_thread is not None and self._sweep_thread.is_alive() and \
                self._sweep_cancel is not None and not self._sweep_cancel.is_set()
            if self._sweep_cancel is not None:
                self._sweep_cancel.set()
            return running

    def _sweep_send(self, cancel: threading.Event, build: Callable[[int], str]) -> Optional[int]:
        with self._sweep_lock:
            if cancel.is_set():
                return None
            return self._send(build)

    def _sweep_timeout(self, steps: int) -> float:
        return max(self._move_timeout, abs(steps) * self._sweep_deg_per_step / self._sweep_speed_dps * 2.0 + 5.0)

    def _run_sweep(self, start: hl.HeadFeedback, cancel: threading.Event) -> None:
        log = self._node.get_logger()
        left, right = hl.sweep_plan(start.pan_deg, self._sweep_deg, self._sweep_deg_per_step, self._sweep_limit_deg)
        log.info(f'Head sweep from pan {start.pan_deg:.1f} deg: left {left} steps, right {right} steps, back')
        for steps in (left, -(left + right), right):
            if steps == 0:
                continue
            seq = self._sweep_send(cancel, lambda s, n=steps: hl.cmd_head_step(s, n, 0))
            if seq is None:
                log.info('Head sweep stopped: ' + ('manual command' if cancel.is_set() else 'serial_unavailable'))
                return
            outcome, fb, detail = self._wait_outcome(seq, self._sweep_timeout(steps), cancel_requested=cancel.is_set)
            if outcome != hl.DONE:
                if outcome == 'timeout' and not cancel.is_set():
                    self._sweep_send(cancel, lambda s: hl.cmd_head_word(s, 'STOP'))
                log.info('Head sweep stopped: ' + ('manual command' if cancel.is_set() or outcome == hl.SUPERSEDED
                                                   else self._describe(outcome, fb, detail)))
                return
        with self._cond:
            fb = self._fb
        # STEP cong tru deu nhau nen da ve dung cho cu; neu lech hon nua buoc (vd gioi han thay doi) thi sua bang goc.
        if fb is not None and abs(fb.pan_deg - start.pan_deg) > self._sweep_deg_per_step / 2.0:
            seq = self._sweep_send(cancel, lambda s: hl.cmd_head_angle(s, start.pan_deg, start.tilt_deg))
            if seq is not None:
                self._wait_outcome(seq, self._move_timeout, cancel_requested=cancel.is_set)
        log.info('Head sweep done')

    # ---- action --------------------------------------------------------------
    def _execute(self, goal_handle):
        goal = goal_handle.request
        home = goal.mode == SetHead.Goal.MODE_HOME
        self._preempt_sweep()
        with self._jog_lock:
            self._jog.reset()
        if home:
            build = (lambda seq: hl.cmd_head_word(seq, 'HOME'))
            timeout = self._home_timeout
        else:
            pan, tilt = float(goal.pan_deg), float(goal.tilt_deg)
            if not (math.isfinite(pan) and math.isfinite(tilt)):
                result = SetHead.Result()
                result.success = False
                result.message = 'rejected:invalid_angle'
                goal_handle.abort()
                return result
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

        cancel_requested = (lambda: goal_handle.is_cancel_requested)
        outcome = hl.DONE
        if home:
            outcome, fb, detail = self._turn_to_front_before_home(cancel_requested, progress)
        if outcome == hl.DONE:
            outcome, fb, detail = self._send_and_wait(
                build, timeout, cancel_requested=cancel_requested, on_progress=progress)

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

    def _turn_to_front_before_home(self, cancel_requested, progress):
        """HOME khi dau dang lech trai qua vung an toan: quay ve 0 truoc (PAN chi tim vat chan 190 do)."""
        with self._cond:
            fb = self._fb
        if fb is None or not fb.referenced or fb.pan_deg <= self._home_safe_left:
            return hl.DONE, fb, ''
        tilt = fb.tilt_deg
        return self._send_and_wait(lambda seq: hl.cmd_head_angle(seq, 0.0, tilt), self._move_timeout,
                                   cancel_requested=cancel_requested, on_progress=progress)

    @staticmethod
    def _describe(outcome: str, fb: Optional[hl.HeadFeedback], detail: str) -> str:
        if outcome == hl.REJECTED:
            return 'rejected:' + (detail or 'unknown')
        if outcome == hl.ABORTED and detail:
            return 'aborted:' + detail
        if outcome == hl.ABORTED and fb is not None:
            return 'aborted:' + hl.STATE_NAMES.get(fb.state, str(fb.state))
        return outcome
