"""Giao dien ROS 2 cho contactor (PA10 cua STM32), trong stm32_bridge.

Tach rieng khoi dau quay (head_ros.py): chi can std_msgs/std_srvs, khong can
bus_interfaces, nen van chay khi giao dien dau quay tat hoac loi.

  srv     contactor/set    std_srvs/srv/SetBool   data=true: ON, false: OFF
  topic   contactor/state  std_msgs/msg/Bool      publish khi doi va 1 Hz

Contactor BAT khi khoi dong: firmware bat PA10 luc boot (CONTACTOR_ON_AT_BOOT),
va bridge (contactor_on_at_startup) gui CONTACTOR,ON mot lan neu khung FB dau
tien bao dang tat (firmware cu, hoac ai do da tat truoc khi bridge khoi dong
lai). Sau do chi bat/tat theo contactor/set.

Serial: CONTACTOR,<seq>,ON|OFF; trang thai lay tu truong 23 cua FB
(robot/docs/PROTOCOL_FB.md). Day la trang thai LENH cua PA10, khong phai
phan hoi tu tiep diem contactor.
"""
import threading
import time
from typing import Callable, Optional

from rclpy.callback_groups import ReentrantCallbackGroup
from std_msgs.msg import Bool
from std_srvs.srv import SetBool

from stm32_bridge import head_link as hl


class ContactorInterface:
    def __init__(self, node, send_seq_command: Callable[[Callable[[int], str]], Optional[int]]):
        self._node = node
        self._send = send_seq_command
        node.declare_parameter('contactor_command_timeout', 1.0)
        node.declare_parameter('contactor_on_at_startup', True)
        self._timeout = float(node.get_parameter('contactor_command_timeout').value)
        self._startup_pending = bool(node.get_parameter('contactor_on_at_startup').value)

        self._cond = threading.Condition()
        self._fb_seq: Optional[int] = None
        self._state: Optional[bool] = None       # None = firmware khong gui truong contactor
        self._has_field: Optional[bool] = None

        self._last_published: Optional[bool] = None
        self._last_pub_mono = 0.0

        self._pub = node.create_publisher(Bool, 'contactor/state', 10)
        # Callback group rieng (reentrant): service cho xac nhan trong khi timer
        # (group mac dinh) van doc FB.
        node.create_service(SetBool, 'contactor/set', self._srv_set,
                            callback_group=ReentrantCallbackGroup())

    # ---- duoc stm32_bridge_node goi (thread timer) -------------------------
    def on_feedback_line(self, line: str) -> None:
        fb = hl.parse_head_feedback(line)
        now = time.monotonic()
        with self._cond:
            if fb is None or fb.contactor is None:
                self._has_field = False
                return
            self._has_field = True
            self._fb_seq = fb.fb_seq
            self._state = fb.contactor
            self._cond.notify_all()
            startup_on = self._startup_pending and not fb.contactor
            self._startup_pending = False
        if startup_on:
            self._node.get_logger().info('Contactor ON at startup')
            self._send(lambda s: hl.cmd_contactor(s, True))
        if fb.contactor != self._last_published or (now - self._last_pub_mono) >= 1.0:
            self._pub.publish(Bool(data=fb.contactor))
            self._last_published = fb.contactor
            self._last_pub_mono = now

    # ---- service -------------------------------------------------------------
    def _srv_set(self, req, resp):
        want = bool(req.data)
        seq = self._send(lambda s: hl.cmd_contactor(s, want))
        if seq is None:
            resp.success, resp.message = False, 'serial_unavailable'
            return resp
        deadline = time.monotonic() + self._timeout
        while time.monotonic() < deadline:
            with self._cond:
                self._cond.wait(timeout=0.1)
                fb_seq, state = self._fb_seq, self._state
            # Chi tin trang thai cua khung FB sinh ra SAU khi firmware xu ly lenh nay.
            if fb_seq is not None and state is not None and \
                    hl.seq_at_or_after(fb_seq, seq) and state == want:
                resp.success = True
                resp.message = 'on' if want else 'off'
                return resp
        resp.success = False
        with self._cond:
            has_field = self._has_field
            state = self._state
        if has_field is False:
            resp.message = 'sent_but_firmware_has_no_contactor_feedback'
        elif has_field is None:
            resp.message = 'no_feedback'
        else:
            resp.message = 'not_confirmed:state_is_' + ('on' if state else 'off')
        return resp
