"""Dau quay PAN/TILT va contactor: phan logic thuan cua stm32_bridge.

Khong import rclpy de test duoc bang pytest thuong (test/test_head_link.py).
Contract serial: robot/docs/PROTOCOL_FB.md (lenh HEAD/CONTACTOR, FB truong
19-23). Node ROS (stm32_bridge_node.py) chi noi day cac ham nay voi topic,
service va action.
"""
import math
from dataclasses import dataclass
from typing import Optional, Tuple

UINT32_MODULO = 2 ** 32
UINT32_HALF = 2 ** 31

# head_state trong FB (firmware head_core.h, HeadState.msg).
STATE_OFF = 0
STATE_IDLE = 1
STATE_MOVING = 2
STATE_HOMING = 3
STATE_NO_REF = 4
STATE_NAMES = {
    STATE_OFF: 'off',
    STATE_IDLE: 'idle',
    STATE_MOVING: 'moving',
    STATE_HOMING: 'homing',
    STATE_NO_REF: 'no_reference',
}

# Vi tri trong khung FB (parts[0] = 'FB').
FB_HEAD_SEQ_INDEX = 19
FB_CONTACTOR_INDEX = 23
FB_MIN_PARTS_WITH_HEAD = 23      # FB + 22 truong (ban nhap chua co contactor)

HEAD_ERRORS = ('ERR,head_not_zeroed', 'ERR,head_limit', 'ERR,head_busy')


@dataclass(frozen=True)
class HeadFeedback:
    fb_seq: int              # truong 1: seq lenh cuoi firmware da xu ly (moi loai)
    head_seq: int            # truong 19
    pan_cdeg: int
    tilt_cdeg: int
    state: int
    contactor: Optional[bool]

    @property
    def referenced(self) -> bool:
        return self.state in (STATE_IDLE, STATE_MOVING)

    @property
    def pan_deg(self) -> float:
        return self.pan_cdeg / 100.0

    @property
    def tilt_deg(self) -> float:
        return self.tilt_cdeg / 100.0


def parse_head_feedback(line: str) -> Optional[HeadFeedback]:
    """Truong dau quay/contactor cua mot dong FB, None neu firmware cu.

    Doc theo vi tri voi so truong toi thieu, bo qua truong la o cuoi
    (quy tac tien hoa cua PROTOCOL_FB.md)."""
    parts = [p.strip() for p in line.split(',')]
    if len(parts) < FB_MIN_PARTS_WITH_HEAD or parts[0] != 'FB':
        return None
    try:
        contactor = None
        if len(parts) > FB_CONTACTOR_INDEX:
            contactor = int(parts[FB_CONTACTOR_INDEX]) != 0
        return HeadFeedback(
            fb_seq=int(parts[1]),
            head_seq=int(parts[FB_HEAD_SEQ_INDEX]),
            pan_cdeg=int(parts[FB_HEAD_SEQ_INDEX + 1]),
            tilt_cdeg=int(parts[FB_HEAD_SEQ_INDEX + 2]),
            state=int(parts[FB_HEAD_SEQ_INDEX + 3]),
            contactor=contactor,
        )
    except ValueError:
        return None


def head_error_kind(line: str) -> Optional[str]:
    """'head_limit' / 'head_busy' / 'head_not_zeroed' cho dong ERR cua dau quay."""
    line = line.strip()
    if line in HEAD_ERRORS:
        return line.split(',', 1)[1]
    return None


def seq_at_or_after(a: int, b: int) -> bool:
    """a >= b theo so hoc vong uint32 (seq tu tran)."""
    return ((a - b) % UINT32_MODULO) < UINT32_HALF


def next_seq(seq: int) -> int:
    """Seq ke tiep trong 1..2^32-1: bo qua 0 vi FB head_seq=0 la 'chua co lenh'."""
    return (seq % (UINT32_MODULO - 1)) + 1


def deg_to_cdeg(deg: float) -> int:
    return int(round(deg * 100.0))


# ---- Dinh dang lenh (khong co \r\n o day; node them khi gui) ----------------
def cmd_head_angle(seq: int, pan_deg: float, tilt_deg: float) -> str:
    return f'HEAD,{seq},{deg_to_cdeg(pan_deg)},{deg_to_cdeg(tilt_deg)}'


def cmd_head_word(seq: int, word: str) -> str:
    if word not in ('HOME', 'ZERO', 'OFF', 'STOP'):
        raise ValueError(word)
    return f'HEAD,{seq},{word}'


def cmd_head_step(seq: int, pan_steps: int, tilt_steps: int) -> str:
    return f'HEAD,{seq},STEP,{int(pan_steps)},{int(tilt_steps)}'


def clamp_dir(value: int) -> int:
    return 1 if value > 0 else (-1 if value < 0 else 0)


def cmd_head_jog(seq: int, pan_dir: int, tilt_dir: int) -> str:
    return f'HEAD,{seq},JOG,{clamp_dir(pan_dir)},{clamp_dir(tilt_dir)}'


def cmd_contactor(seq: int, on: bool) -> str:
    return f'CONTACTOR,{seq},{"ON" if on else "OFF"}'


# ---- Xoay quet tu dong (head/sweep) -----------------------------------------
def sweep_plan(start_deg: float, amplitude_deg: float, deg_per_step: float,
               limit_deg: float) -> Tuple[int, int]:
    """(so buoc sang trai, so buoc sang phai) cho mot luot quet tu start_deg.

    Moi ben toi da amplitude_deg, nhung khong vuot gioi han mem +/-limit_deg
    (firmware chan STEP o gioi han, khi do tong buoc khong con bang 0 va dau
    khong ve dung cho cu). Chuoi lenh: STEP +trai, STEP -(trai+phai),
    STEP +phai -> tong = 0, ve dung vi tri bat dau."""
    if deg_per_step <= 0.0 or amplitude_deg <= 0.0 or limit_deg <= 0.0:
        return 0, 0
    wanted = int(round(amplitude_deg / deg_per_step))
    room_left = int(math.floor((limit_deg - start_deg) / deg_per_step + 1e-6))
    room_right = int(math.floor((limit_deg + start_deg) / deg_per_step + 1e-6))
    return max(0, min(wanted, room_left)), max(0, min(wanted, room_right))


# ---- Theo doi ket qua mot lenh HEAD theo seq --------------------------------
PENDING = 'pending'
DONE = 'done'
REJECTED = 'rejected'        # firmware xu ly seq nay nhung khong chap nhan
SUPERSEDED = 'superseded'    # lenh HEAD khac (moi hon) da duoc chap nhan sau no
ABORTED = 'aborted'          # duoc chap nhan nhung ket thuc khong co moc (OFF, HOME bi dung)


def command_outcome(cmd_seq: int, fb: HeadFeedback) -> str:
    """Ket qua cua lenh HEAD seq=cmd_seq nhin tu mot khung FB.

    - head_seq == cmd_seq: lenh da duoc chap nhan. IDLE -> DONE; OFF/NO_REF ->
      ABORTED; MOVING/HOMING -> con chay.
    - head_seq moi hon cmd_seq: lenh khac da thay the.
    - fb_seq da toi cmd_seq ma head_seq cu hon: firmware tu choi (dong ERR
      tuong ung den gan cung luc, khong mang seq).
    - con lai: firmware chua xu ly toi seq nay.

    head_seq = 0 nghia la firmware chua chap nhan lenh HEAD nao tu luc boot,
    vi vay bridge khong bao gio gui lenh voi seq 0 (xem next_seq)."""
    if fb.head_seq == 0:
        return REJECTED if seq_at_or_after(fb.fb_seq, cmd_seq) else PENDING
    if fb.head_seq == cmd_seq:
        if fb.state == STATE_IDLE:
            return DONE
        if fb.state in (STATE_OFF, STATE_NO_REF):
            return ABORTED
        return PENDING
    if seq_at_or_after(fb.head_seq, cmd_seq):
        return SUPERSEDED
    if seq_at_or_after(fb.fb_seq, cmd_seq):
        return REJECTED
    return PENDING


# ---- Giu nut: chuyen tiep JOG voi deadman -----------------------------------
class JogRelay:
    """Chuyen topic head/jog thanh lenh JOG serial.

    - Doi huong: gui ngay.
    - Dang giu va nguon con publish (moi hon `timeout`): bridge tu gui lai
      moi `keepalive_period` de deadman 300 ms cua firmware khong bao gio het
      han vi nguon publish cham.
    - Nguon im lang qua `timeout`: gui JOG,0,0 mot lan (deadman phia bridge).
    """

    def __init__(self, timeout: float = 0.25, keepalive_period: float = 0.1):
        self.timeout = timeout
        self.keepalive_period = keepalive_period
        self._dir: Tuple[int, int] = (0, 0)
        self._last_rx: Optional[float] = None
        self._last_sent: Optional[float] = None

    @property
    def active(self) -> bool:
        return self._dir != (0, 0)

    def on_jog(self, pan: int, tilt: int, now: float) -> Optional[Tuple[int, int]]:
        new = (clamp_dir(pan), clamp_dir(tilt))
        self._last_rx = now
        if new != self._dir or new != (0, 0) and self._due(now):
            self._dir = new
            self._last_sent = now
            return new
        return None

    def tick(self, now: float) -> Optional[Tuple[int, int]]:
        if not self.active:
            return None
        if self._last_rx is None or (now - self._last_rx) > self.timeout:
            self._dir = (0, 0)
            self._last_sent = now
            return (0, 0)
        if self._due(now):
            self._last_sent = now
            return self._dir
        return None

    def reset(self) -> None:
        self._dir = (0, 0)
        self._last_rx = None
        self._last_sent = None

    def _due(self, now: float) -> bool:
        return self._last_sent is None or (now - self._last_sent) >= self.keepalive_period
