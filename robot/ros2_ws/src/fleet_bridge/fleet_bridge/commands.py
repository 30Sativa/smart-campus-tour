"""Fleet Commands v1 wire format and the rclpy-free command state machine.

Rules from ADR-0008 and ADR-0042: a repeated commandId never creates a second goal, a different
leg while busy is rejected, a wrong map is rejected, and terminal results are kept until the
backend acknowledges them. Nothing here remembers anything across a process restart.
"""

from __future__ import annotations

import json
import math
import re
import threading
import uuid
from collections import OrderedDict, deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from .protocol import utc_iso

MAX_RESULTS = 32
MAX_REMEMBERED_COMMANDS = 256
_TIMESTAMP = re.compile(r'^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$')


@dataclass(frozen=True)
class GoToCommand:
    command_id: str
    leg_id: str
    map_key: str
    frame_id: str
    x: float
    y: float
    yaw: float
    accept_by: datetime


@dataclass(frozen=True)
class CancelCommand:
    command_id: str
    leg_id: str


@dataclass(frozen=True)
class CommandResult:
    """The exact bytes are kept: a retry must repeat them for the backend to see a duplicate."""

    command_id: str
    phase: str
    body: str

    @property
    def is_terminal(self) -> bool:
        return self.phase == 'TERMINAL'


class Navigator(Protocol):
    """Sends one goal. Callbacks may arrive on any thread."""

    def send_goal(self, x: float, y: float, yaw: float, frame_id: str,
                  on_response: Callable[[bool, str | None], None],
                  on_result: Callable[[str], None]) -> None: ...

    def cancel(self) -> None: ...


def parse_timestamp(value: object) -> datetime:
    """Accept any fraction width; Python 3.10 fromisoformat takes only three or six digits."""
    match = _TIMESTAMP.match(value) if isinstance(value, str) else None
    if match is None:
        raise ValueError('timestamp is not ISO 8601 with an offset')
    fraction = (match.group(2) or '').ljust(6, '0')[:6]
    offset = '+00:00' if match.group(3) == 'Z' else match.group(3)
    return datetime.fromisoformat(f'{match.group(1)}.{fraction}{offset}')


def parse_poll_response(body: object) -> GoToCommand | CancelCommand | None:
    """Raise ValueError for a body that does not follow the contract; such a command is never run."""
    if not isinstance(body, dict) or not isinstance(body.get('data'), dict) or 'command' not in body['data']:
        raise ValueError('poll response has no data.command')
    command = body['data']['command']
    if command is None:
        return None
    if not isinstance(command, dict):
        raise ValueError('data.command is not an object')
    command_id = _uuid(command.get('commandId'))
    leg_id = _uuid(command.get('legId'))
    kind = command.get('kind')
    if kind == 'Cancel':
        return CancelCommand(command_id, leg_id)
    if kind != 'GoTo':
        raise ValueError('command kind is not GoTo or Cancel')
    map_key, frame_id = command.get('mapKey'), command.get('frameId')
    if not isinstance(map_key, str) or not map_key or not isinstance(frame_id, str) or not frame_id:
        raise ValueError('GoTo needs mapKey and frameId')
    return GoToCommand(command_id, leg_id, map_key, frame_id, _finite(command.get('x')),
                       _finite(command.get('y')), _finite(command.get('yaw')),
                       parse_timestamp(command.get('acceptBy')))


def build_result(command_id: str, leg_id: str, stream_id: str, reported_at: datetime, phase: str,
                 outcome: str | None = None, reason: str | None = None) -> CommandResult:
    body = {
        'commandId': command_id, 'legId': leg_id, 'streamId': stream_id,
        'reportedAt': utc_iso(reported_at), 'phase': phase, 'outcome': outcome, 'reason': reason,
    }
    return CommandResult(command_id, phase, json.dumps(body, ensure_ascii=True, allow_nan=False, separators=(',', ':')))


def outcome_from_nav2(status: str, cancel_requested: bool) -> tuple[str, str | None]:
    """The actual Nav2 end: arrival beats a Cancel, and only a requested cancel is CANCELLED."""
    if status == 'SUCCEEDED':
        return 'ARRIVED', None
    if status == 'CANCELED':
        return ('CANCELLED', None) if cancel_requested else ('FAILED', 'NAV2_CANCELED')
    if status == 'ABORTED':
        return 'FAILED', 'NAV2_ABORTED'
    return 'FAILED', 'NAV2_RESULT_UNKNOWN'


@dataclass
class _ActiveLeg:
    command: GoToCommand
    stream_id: str
    cancel_requested: bool = False


class CommandExecutor:
    def __init__(self, map_key: str, frame_id: str, navigator: Navigator, wall_clock=None, on_log=None,
                 max_results: int = MAX_RESULTS):
        self._map_key = map_key
        self._frame_id = frame_id
        self._navigator = navigator
        self._now = wall_clock or (lambda: datetime.now(timezone.utc))
        self._log = on_log or (lambda message: None)
        self._max_results = max_results
        self._lock = threading.RLock()
        self._active: _ActiveLeg | None = None
        self._seen: OrderedDict[str, None] = OrderedDict()
        self._results: deque[CommandResult] = deque()

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            if self._active is None:
                return {'status': 'IDLE', 'leg_id': None}
            return {'status': 'NAVIGATING', 'leg_id': self._active.command.leg_id}

    def handle(self, command: GoToCommand | CancelCommand, stream_id: str) -> None:
        with self._lock:
            if command.command_id in self._seen:
                return
            self._remember(command.command_id)
            if isinstance(command, CancelCommand):
                self._handle_cancel(command, stream_id)
            else:
                self._handle_goto(command, stream_id)

    def next_result(self) -> CommandResult | None:
        with self._lock:
            return self._results[0] if self._results else None

    def acknowledge(self, result: CommandResult) -> None:
        """The backend gave a definitive answer; only then does the result leave the buffer."""
        with self._lock:
            if self._results and self._results[0] is result:
                self._results.popleft()

    def _handle_goto(self, command: GoToCommand, stream_id: str) -> None:
        if self._now() > command.accept_by:
            self._reject(command, stream_id, 'EXPIRED')
        elif command.map_key != self._map_key or command.frame_id != self._frame_id:
            self._reject(command, stream_id, 'MAP_MISMATCH')
        elif self._active is not None or len(self._results) >= self._max_results:
            # A full buffer means the backend has not heard earlier results: taking more work would risk losing them.
            self._reject(command, stream_id, 'BUSY')
        else:
            self._active = _ActiveLeg(command, stream_id)
            leg = command.leg_id
            self._navigator.send_goal(command.x, command.y, command.yaw, command.frame_id,
                                      lambda accepted, reason=None: self._on_response(leg, accepted, reason),
                                      lambda status: self._on_result(leg, status))

    def _handle_cancel(self, command: CancelCommand, stream_id: str) -> None:
        active = self._active
        if active is None or active.command.leg_id != command.leg_id:
            self._add(build_result(command.command_id, command.leg_id, stream_id, self._now(), 'REJECTED', None, 'UNKNOWN_LEG'))
            return
        active.cancel_requested = True
        self._add(build_result(command.command_id, command.leg_id, stream_id, self._now(), 'ACCEPTED'))
        self._navigator.cancel()

    def _on_response(self, leg_id: str, accepted: bool, reason: str | None) -> None:
        with self._lock:
            active = self._active
            if active is None or active.command.leg_id != leg_id:
                return
            if accepted:
                self._add(build_result(active.command.command_id, leg_id, active.stream_id, self._now(), 'ACCEPTED'))
            else:
                self._active = None
                self._reject(active.command, active.stream_id, reason or 'NAV2_REJECTED')

    def _on_result(self, leg_id: str, status: str) -> None:
        with self._lock:
            active = self._active
            if active is None or active.command.leg_id != leg_id:
                return
            self._active = None
            outcome, reason = outcome_from_nav2(status, active.cancel_requested)
            self._add(build_result(active.command.command_id, leg_id, active.stream_id, self._now(), 'TERMINAL', outcome, reason))

    def _reject(self, command: GoToCommand, stream_id: str, reason: str) -> None:
        self._log(f'GoTo {command.command_id} rejected: {reason}')
        self._add(build_result(command.command_id, command.leg_id, stream_id, self._now(), 'REJECTED', None, reason))

    def _add(self, result: CommandResult) -> None:
        self._results.append(result)
        while len(self._results) > self._max_results:
            # Never a terminal result: only an ACCEPTED, which a later TERMINAL makes redundant, may go.
            droppable = next((item for item in self._results if item.phase == 'ACCEPTED'), None)
            if droppable is None:
                self._log('Result buffer is over its limit and holds only results that must be kept.')
                return
            self._results.remove(droppable)
            self._log(f'Result buffer full: dropped ACCEPTED of {droppable.command_id}.')

    def _remember(self, command_id: str) -> None:
        self._seen[command_id] = None
        while len(self._seen) > MAX_REMEMBERED_COMMANDS:
            self._seen.popitem(last=False)


def _uuid(value: object) -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError('id is not a UUID') from error


def _finite(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('coordinate is not a finite number')
    return float(value)
