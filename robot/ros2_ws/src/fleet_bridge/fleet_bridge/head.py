"""Fleet Head v1 (docs/contracts/fleet-head/v1, ADR-0045): pure logic, no ROS or network.

The backend queues the Operator's head buttons; this module parses a poll response and applies each command once, in
seq order, to an actuator (ROS topics/services of stm32_bridge in production, a fake in tests). A JOG keeps the head
turning only until this robot's own receipt time plus `ttlMs`: losing the backend, the network or the Operator's tab
therefore stops the head without any message.
"""

from __future__ import annotations

import math
import threading
import uuid
from dataclasses import dataclass
from typing import Optional, Protocol

KINDS = frozenset({'STEP', 'JOG', 'STOP', 'ANGLE'})
DEFAULT_JOG_TTL_SEC = 0.6
MAX_STEPS = 20

# stm32_bridge HeadState.state -> wire head.state
STATE_NAMES = {0: 'OFF', 1: 'IDLE', 2: 'MOVING', 3: 'HOMING', 4: 'NO_REFERENCE'}


@dataclass(frozen=True)
class HeadCommand:
    seq: int
    kind: str
    pan_steps: int = 0
    tilt_steps: int = 0
    pan_dir: int = 0
    tilt_dir: int = 0
    pan_deg: float = 0.0
    tilt_deg: float = 0.0
    ttl_sec: float = DEFAULT_JOG_TTL_SEC


class HeadActuator(Protocol):
    def step(self, pan_steps: int, tilt_steps: int) -> None: ...
    def jog(self, pan_dir: int, tilt_dir: int) -> None: ...
    def stop(self) -> None: ...
    def angle(self, pan_deg: float, tilt_deg: float) -> None: ...


def _int(value, low: int, high: int, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ValueError(f'{name} must be an integer {low}..{high}')
    return value


def _float(value, limit: float, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > limit:
        raise ValueError(f'{name} must be a finite number within ±{limit}')
    return float(value)


def parse_head_command(raw: object) -> HeadCommand:
    if not isinstance(raw, dict):
        raise ValueError('command must be an object')
    seq = _int(raw.get('seq'), 1, 2 ** 53, 'seq')
    kind = raw.get('kind')
    if kind not in KINDS:
        raise ValueError('unknown kind')
    if kind == 'STEP':
        return HeadCommand(seq, kind, pan_steps=_int(raw.get('panSteps', 0), -MAX_STEPS, MAX_STEPS, 'panSteps'),
                           tilt_steps=_int(raw.get('tiltSteps', 0), -MAX_STEPS, MAX_STEPS, 'tiltSteps'))
    if kind == 'JOG':
        ttl_ms = raw.get('ttlMs', int(DEFAULT_JOG_TTL_SEC * 1000))
        return HeadCommand(seq, kind, pan_dir=_int(raw.get('panDir', 0), -1, 1, 'panDir'),
                           tilt_dir=_int(raw.get('tiltDir', 0), -1, 1, 'tiltDir'),
                           ttl_sec=_int(ttl_ms, 1, 10_000, 'ttlMs') / 1000.0)
    if kind == 'ANGLE':
        return HeadCommand(seq, kind, pan_deg=_float(raw.get('panDeg'), 180.0, 'panDeg'),
                           tilt_deg=_float(raw.get('tiltDeg'), 90.0, 'tiltDeg'))
    return HeadCommand(seq, kind)


def parse_head_poll_response(body: object) -> tuple[str, list[HeadCommand]]:
    """(epoch, commands in seq order). Raises ValueError on a body that does not follow the contract."""
    data = body.get('data') if isinstance(body, dict) else None
    if not isinstance(data, dict):
        raise ValueError('missing data')
    epoch = data.get('epoch')
    try:
        epoch = str(uuid.UUID(str(epoch)))
    except ValueError:
        raise ValueError('invalid epoch') from None
    raw_commands = data.get('commands')
    if not isinstance(raw_commands, list):
        raise ValueError('commands must be a list')
    commands = sorted((parse_head_command(item) for item in raw_commands), key=lambda c: c.seq)
    return epoch, commands


def head_state_report(state: int, referenced: bool, pan_deg: float, tilt_deg: float, observed_at: Optional[str]) -> dict:
    report = {
        'state': STATE_NAMES.get(int(state), 'UNKNOWN'),
        'referenced': bool(referenced),
        'panDeg': round(float(pan_deg), 2) if math.isfinite(pan_deg) else None,
        'tiltDeg': round(float(tilt_deg), 2) if math.isfinite(tilt_deg) else None,
    }
    if observed_at:
        report['observedAt'] = observed_at
    return report


class HeadCommandApplier:
    """Applies each command once, in seq order, and owns the local JOG deadline. Thread-safe."""

    def __init__(self, actuator: HeadActuator, on_log=None):
        self._actuator = actuator
        self._on_log = on_log or (lambda message: None)
        self._lock = threading.Lock()
        self.epoch: Optional[str] = None
        self.last_seq = 0
        self._jog: Optional[tuple[int, int]] = None
        self._jog_deadline = 0.0

    def cursor(self) -> tuple[Optional[str], int]:
        with self._lock:
            return self.epoch, self.last_seq

    def apply(self, epoch: str, commands: list[HeadCommand], now: float) -> int:
        """Returns how many commands were executed. A new epoch means a new backend process: start counting again."""
        executed = 0
        with self._lock:
            if epoch != self.epoch:
                self.epoch = epoch
                self.last_seq = 0
            for command in commands:
                if command.seq <= self.last_seq:
                    continue
                self.last_seq = command.seq
                try:
                    self._execute(command, now)
                    executed += 1
                except Exception as error:  # noqa: BLE001 - one failed ROS call must not stop later commands
                    self._on_log(f'Head command {command.kind} seq {command.seq} failed ({type(error).__name__}).')
        return executed

    def _execute(self, command: HeadCommand, now: float) -> None:
        if command.kind == 'STEP':
            if command.pan_steps or command.tilt_steps:
                self._actuator.step(command.pan_steps, command.tilt_steps)
        elif command.kind == 'JOG':
            direction = (command.pan_dir, command.tilt_dir)
            if direction == (0, 0):
                self._release()
            else:
                self._jog = direction
                self._jog_deadline = now + command.ttl_sec
                self._actuator.jog(*direction)
        elif command.kind == 'STOP':
            self._release()
            self._actuator.stop()
        elif command.kind == 'ANGLE':
            self._release()
            self._actuator.angle(command.pan_deg, command.tilt_deg)

    def _release(self) -> None:
        if self._jog is not None:
            self._jog = None
            self._actuator.jog(0, 0)

    def tick(self, now: float) -> None:
        """Call at ~10 Hz: keeps a live JOG published (stm32_bridge needs >= 5 Hz) and releases it at its deadline."""
        with self._lock:
            if self._jog is None:
                return
            if now >= self._jog_deadline:
                self._release()
                return
            self._actuator.jog(*self._jog)

    def release(self) -> None:
        with self._lock:
            self._release()

    @property
    def jogging(self) -> bool:
        with self._lock:
            return self._jog is not None
