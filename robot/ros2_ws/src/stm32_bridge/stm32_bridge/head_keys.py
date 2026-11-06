"""Logic phim cho head_teleop (khong import rclpy, test bang pytest thuong).

Mo phong dung hanh vi nut tren FE:
  - nhan 1 lan        -> HEAD STEP 1 buoc (PAN 0,6 do, TILT 1,8 do)
  - giu phim          -> JOG lien tuc theo huong do
  - nha phim          -> JOG 0,0

Terminal khong bao "nha phim". Ta dua vao tu lap phim cua he dieu hanh:
lan lap dau den sau ~0,25-0,8 s, sau do ~25-35 lan/giay. Mot lan lap trong
`repeat_window` => dang giu; im lang qua `release_gap` khi dang giu => da nha.
"""
from typing import List, Optional, Tuple

# (pan_dir, tilt_dir). PAN duong = quay trai, TILT duong = ngoc len.
DIRECTIONS = {
    'left': (1, 0),
    'right': (-1, 0),
    'up': (0, 1),
    'down': (0, -1),
}

_ESCAPES = {'\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
            '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left'}
_LETTERS = {'a': 'left', 'd': 'right', 'w': 'up', 's': 'down'}

Action = Tuple[str, Tuple[int, int]]      # ('step'|'jog', (pan, tilt))


def parse_keys(buf: str) -> Tuple[List[str], str]:
    """Tach chuoi byte doc tu terminal thanh ten phim; tra (phim, phan du).

    Mui ten -> 'left'/'right'/'up'/'down'; WASD cung vay; ky tu khac giu nguyen
    (chu thuong). Chuoi escape chua du thi giu lai trong phan du."""
    keys: List[str] = []
    i = 0
    while i < len(buf):
        if buf[i] == '\x1b':
            seq = buf[i:i + 3]
            if len(seq) < 3:
                if seq in ('\x1b', '\x1b[', '\x1bO'):
                    return keys, buf[i:]
            if seq in _ESCAPES:
                keys.append(_ESCAPES[seq])
                i += 3
                continue
            keys.append('esc')
            i += 1
            continue
        ch = buf[i].lower()
        keys.append(_LETTERS.get(ch, ch))
        i += 1
    return keys, ''


class HoldDetector:
    def __init__(self, repeat_window: float = 0.8, release_gap: float = 0.15,
                 keepalive_period: float = 0.1):
        self.repeat_window = repeat_window
        self.release_gap = release_gap
        self.keepalive_period = keepalive_period
        self._key: Optional[str] = None
        self._last_key_t = 0.0
        self._last_jog_t = 0.0
        self.jogging = False

    def on_key(self, key: str, now: float) -> List[Action]:
        if key not in DIRECTIONS:
            return []
        out: List[Action] = []
        if key != self._key:
            if self.jogging:
                out.append(('jog', (0, 0)))
                self.jogging = False
            self._key, self._last_key_t = key, now
            out.append(('step', DIRECTIONS[key]))
            return out
        gap = now - self._last_key_t
        self._last_key_t = now
        if self.jogging:
            return out                          # keepalive do tick() lo
        if gap <= self.repeat_window:
            self.jogging = True
            self._last_jog_t = now
            out.append(('jog', DIRECTIONS[key]))
        else:
            out.append(('step', DIRECTIONS[key]))   # nhan moi, khong phai giu
        return out

    def tick(self, now: float) -> List[Action]:
        if self.jogging:
            if now - self._last_key_t > self.release_gap:
                self.jogging = False
                self._key = None
                return [('jog', (0, 0))]
            if now - self._last_jog_t >= self.keepalive_period:
                self._last_jog_t = now
                return [('jog', DIRECTIONS[self._key])]
        elif self._key is not None and now - self._last_key_t > self.repeat_window:
            self._key = None
        return []

    def release(self) -> List[Action]:
        """Dung ngay (vd. thoat chuong trinh, nhan Space)."""
        was = self.jogging
        self.jogging, self._key = False, None
        return [('jog', (0, 0))] if was else []
