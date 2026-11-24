"""Mo hinh dau quay PAN/TILT gia lap cho Gazebo (head_sim). Khong ROS, khong serial: test duoc bang pytest.

CHI DUNG TRONG MO PHONG. Bat chuoc nhung gi firmware head_core.h + stm32_bridge head/* lam ma mot phan mem
ben ngoai thay duoc: gioi han mem PAN +/-170, TILT +/-18; vat can PAN 174 ben phai, TILT 20 cui; HOME tim vat
can roi ve 0; toc do 60 do/s (goc), 30 do/s (giu nut, quet), 20 do/s (tim vat can); 1 buoc du PAN 0.45 do
(hop so 4:1), TILT 0.1125 do (hop so 16:1). Khong mo phong mat buoc, gia toc hay luc giu.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

STATE_OFF, STATE_IDLE, STATE_MOVING, STATE_HOMING, STATE_NO_REF = 0, 1, 2, 3, 4
STATE_NAMES = {STATE_OFF: 'OFF', STATE_IDLE: 'IDLE', STATE_MOVING: 'MOVING', STATE_HOMING: 'HOMING',
               STATE_NO_REF: 'NO_REFERENCE'}

PAN_LIMIT_DEG = 170.0
TILT_LIMIT_DEG = 18.0
PAN_STOP_DEG = -174.0          # vat can PAN ben phai
TILT_STOP_DEG = -20.0          # vat can TILT phia cui
ANGLE_DPS = 60.0
JOG_DPS = 30.0
SWEEP_DPS = 30.0
HOME_DPS = 20.0
PAN_DEG_PER_STEP = 1.8 / 4.0
TILT_DEG_PER_STEP = 1.8 / 16.0
JOG_DEADMAN_S = 0.3            # firmware: deadman 300 ms neu nut khong duoc gui lai


def _approach(value: float, target: float, max_delta: float) -> float:
    if abs(target - value) <= max_delta:
        return target
    return value + math.copysign(max_delta, target - value)


@dataclass
class HeadSimModel:
    pan: float = 0.0
    tilt: float = 0.0
    state: int = STATE_OFF
    referenced: bool = False
    seq: int = 0                                  # tang moi lan nhan mot lenh (nhu last_head_seq)
    _legs: list = field(default_factory=list)     # [(pan, tilt, dps), ...] con phai di
    _jog: tuple = (0, 0)
    _jog_until: float = 0.0
    _homing: bool = False

    # ---- lenh ------------------------------------------------------------------------------------------------
    def home(self) -> tuple[bool, str]:
        """Tim vat can PAN (phai) va TILT (cui), roi ve 0/0; xong thi co moc."""
        self._accept()
        self.referenced = False
        self._homing = True
        self.state = STATE_HOMING
        self._legs = [(PAN_STOP_DEG, TILT_STOP_DEG, HOME_DPS), (0.0, 0.0, ANGLE_DPS)]
        return True, 'homing'

    def angle(self, pan: float, tilt: float) -> tuple[bool, str]:
        if not (math.isfinite(pan) and math.isfinite(tilt)):
            return False, 'rejected:invalid'
        if not self.referenced:
            return False, 'rejected:head_not_zeroed'
        if self._homing:
            return False, 'rejected:head_busy'
        if abs(pan) > PAN_LIMIT_DEG or abs(tilt) > TILT_LIMIT_DEG:
            return False, 'rejected:head_limit'
        self._accept()
        self._go([(pan, tilt, ANGLE_DPS)])
        return True, 'moving'

    def step(self, pan_steps: int, tilt_steps: int) -> tuple[bool, str]:
        if not self.referenced or self._homing:
            return False, 'rejected:head_not_zeroed' if not self.referenced else 'rejected:head_busy'
        end_pan, end_tilt = self.target()
        self._accept()
        self._go([(self._clamp_pan(end_pan + pan_steps * PAN_DEG_PER_STEP),
                   self._clamp_tilt(end_tilt + tilt_steps * TILT_DEG_PER_STEP), ANGLE_DPS)])
        return True, 'moving'

    def jog(self, pan_dir: int, tilt_dir: int, now: float) -> tuple[bool, str]:
        if not self.referenced or self._homing:
            return False, 'rejected:head_not_zeroed' if not self.referenced else 'rejected:head_busy'
        pan_dir, tilt_dir = max(-1, min(1, int(pan_dir))), max(-1, min(1, int(tilt_dir)))
        if self._jog != (pan_dir, tilt_dir):
            self._accept()
        self._legs = []
        self._jog = (pan_dir, tilt_dir)
        self._jog_until = now + JOG_DEADMAN_S
        self.state = STATE_MOVING if (pan_dir or tilt_dir) else STATE_IDLE
        return True, 'jogging'

    def sweep(self, amplitude: float) -> tuple[bool, str]:
        """Trai `amplitude`, roi phai 2*`amplitude`, roi ve cho cu; moi ben tu thu nho trong gioi han mem."""
        if not math.isfinite(amplitude) or amplitude <= 0.0:
            return False, 'rejected:invalid_amplitude'
        if self.state != STATE_IDLE:
            return False, 'not_ready:' + STATE_NAMES[self.state]
        start = self.pan
        left = self._clamp_pan(start + amplitude)
        right = self._clamp_pan(start - amplitude)
        self._accept()
        self._go([(left, self.tilt, SWEEP_DPS), (right, self.tilt, SWEEP_DPS), (start, self.tilt, SWEEP_DPS)])
        return True, 'started'

    def stop(self) -> tuple[bool, str]:
        self._accept()
        self._legs = []
        self._jog = (0, 0)
        if self._homing:            # HOME bi dung giua chung: con giu luc nhung mat moc
            self._homing = False
            self.state = STATE_NO_REF
        elif self.state != STATE_OFF:
            self.state = STATE_IDLE if self.referenced else STATE_NO_REF
        return True, 'stopped'

    def off(self) -> tuple[bool, str]:
        self._accept()
        self._legs, self._jog, self._homing = [], (0, 0), False
        self.referenced = False
        self.state = STATE_OFF
        return True, 'off'

    def zero(self) -> tuple[bool, str]:
        """Lay vi tri hien tai lam moc 0 (khi canh tay)."""
        self._accept()
        self._legs, self._jog, self._homing = [], (0, 0), False
        self.pan = self.tilt = 0.0
        self.referenced = True
        self.state = STATE_IDLE
        return True, 'zeroed'

    # ---- thoi gian ---------------------------------------------------------------------------------------------
    def tick(self, dt: float, now: float) -> None:
        if dt <= 0.0 or self.state == STATE_OFF:
            return
        if self._jog != (0, 0):
            if now > self._jog_until:
                self._jog = (0, 0)
                self.state = STATE_IDLE
            else:
                self.pan = self._clamp_pan(self.pan + self._jog[0] * JOG_DPS * dt)
                self.tilt = self._clamp_tilt(self.tilt + self._jog[1] * JOG_DPS * dt)
            return
        while self._legs and dt > 0.0:
            pan, tilt, dps = self._legs[0]
            need = max(abs(pan - self.pan), abs(tilt - self.tilt)) / dps
            used = min(dt, need)
            self.pan = _approach(self.pan, pan, dps * used)
            self.tilt = _approach(self.tilt, tilt, dps * used)
            dt -= used
            if self.pan == pan and self.tilt == tilt:
                self._legs.pop(0)
        if not self._legs and self.state in (STATE_MOVING, STATE_HOMING):
            if self._homing:
                self._homing = False
                self.referenced = True
            self.state = STATE_IDLE

    # ---- doc ----------------------------------------------------------------------------------------------------
    def target(self) -> tuple[float, float]:
        if self._legs:
            return self._legs[-1][0], self._legs[-1][1]
        return self.pan, self.tilt

    def at_rest(self) -> bool:
        return self.state == STATE_IDLE and not self._legs and self._jog == (0, 0)

    # ---- noi bo -------------------------------------------------------------------------------------------------
    def _accept(self) -> None:
        self.seq = (self.seq % 65535) + 1

    def _go(self, legs: list) -> None:
        self._jog = (0, 0)
        self._legs = list(legs)
        self.state = STATE_MOVING

    @staticmethod
    def _clamp_pan(value: float) -> float:
        return max(-PAN_LIMIT_DEG, min(PAN_LIMIT_DEG, value))

    @staticmethod
    def _clamp_tilt(value: float) -> float:
        return max(-TILT_LIMIT_DEG, min(TILT_LIMIT_DEG, value))


def describe(model: HeadSimModel) -> str:
    """'PAN 45 trai, TILT 10 ngua, IDLE' cho log va marker RViz."""
    def side(value: float, positive: str, negative: str) -> str:
        rounded = round(value)
        return '0' if rounded == 0 else f'{abs(rounded)} {positive if value > 0 else negative}'
    return (f'PAN {side(model.pan, "trai", "phai")}, TILT {side(model.tilt, "ngua", "cui")}, '
            f'{STATE_NAMES[model.state]}')


def plan_seconds(model: HeadSimModel) -> Optional[float]:
    """Thoi gian con lai toi khi het cac doan dang chay (None neu dang giu nut)."""
    if model._jog != (0, 0):
        return None
    pan, tilt, total = model.pan, model.tilt, 0.0
    for leg_pan, leg_tilt, dps in model._legs:
        total += max(abs(leg_pan - pan), abs(leg_tilt - tilt)) / dps
        pan, tilt = leg_pan, leg_tilt
    return total
