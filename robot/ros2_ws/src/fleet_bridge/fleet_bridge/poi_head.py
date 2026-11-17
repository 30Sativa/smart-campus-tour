"""Robot-side POI head motion (ADR-0045 addendum 14/11/2026): pure logic, no ROS or network.

The robot itself decides when it is at a POI. It reads the POI list, with each POI's camera preset set by Staff in
"Camera & tư liệu", from `GET /api/fleet/head/v1/pois`, and watches the Nav2 `navigate_to_pose` goal status:

  - a new goal starts executing   -> head to the front (PAN 0, TILT 0) so the robot never drives with it turned;
  - a goal succeeds near a POI    -> do that POI's preset (FRONT, LEFT, RIGHT, ANGLE:pan,tilt, SWEEP[:deg]);
                                     NONE leaves the head alone.

It works for every goal sender (Fleet Commands, RViz, bus_manager), so it does not depend on the backend dispatching
the Tour. The backend only answers which POIs exist and whether automatic motion is on (`autoMotion`: Fleet Head
enabled and the running Tour's head mode is AUTO). An Operator button always wins: this only acts on goal events.
"""

from __future__ import annotations

import math
import re
import threading
from dataclasses import dataclass
from typing import Optional, Protocol

# Must match robot firmware head_core.h and backend PoiCameraPresets.
PAN_LIMIT_DEG = 170.0
TILT_LIMIT_DEG = 18.0
MIN_SWEEP_DEG, MAX_SWEEP_DEG = 10, 170

# action_msgs/msg/GoalStatus
STATUS_EXECUTING = 2
STATUS_SUCCEEDED = 4
TERMINAL_STATUSES = frozenset({4, 5, 6})

SOURCES = frozenset({'TOUR', 'MAP', 'NONE'})
_ANGLE = re.compile(r'^ANGLE:(-?\d{1,3}(?:\.\d)?),(-?\d{1,3}(?:\.\d)?)$')
_SWEEP = re.compile(r'^SWEEP(?::(\d{1,3}))?$')


@dataclass(frozen=True)
class HeadAction:
    kind: str                 # 'angle' or 'sweep'
    pan_deg: float = 0.0
    tilt_deg: float = 0.0
    sweep_deg: float = 0.0    # 0 = stm32_bridge default


FRONT = HeadAction('angle', 0.0, 0.0)


@dataclass(frozen=True)
class PoiTarget:
    poi_id: str
    name: str
    x: float
    y: float
    preset: str


@dataclass(frozen=True)
class PoiSnapshot:
    source: str
    auto_motion: bool
    pois: tuple[PoiTarget, ...]


EMPTY_SNAPSHOT = PoiSnapshot('NONE', False, ())


class PoiHeadActuator(Protocol):
    def angle(self, pan_deg: float, tilt_deg: float) -> None: ...
    def sweep(self, amplitude_deg: float) -> None: ...


def preset_action(preset: object) -> Optional[HeadAction]:
    """The head motion a camera preset asks for; None for NONE or anything this robot cannot do safely."""
    if not isinstance(preset, str):
        return None
    text = preset.strip().upper()
    if text == 'FRONT':
        return FRONT
    if text == 'LEFT':
        return HeadAction('angle', 90.0, 0.0)
    if text == 'RIGHT':
        return HeadAction('angle', -90.0, 0.0)
    match = _ANGLE.match(text)
    if match:
        pan, tilt = float(match.group(1)), float(match.group(2))
        if abs(pan) <= PAN_LIMIT_DEG and abs(tilt) <= TILT_LIMIT_DEG:
            return HeadAction('angle', pan, tilt)
        return None
    match = _SWEEP.match(text)
    if match:
        if match.group(1) is None:
            return HeadAction('sweep')
        deg = int(match.group(1))
        return HeadAction('sweep', sweep_deg=float(deg)) if MIN_SWEEP_DEG <= deg <= MAX_SWEEP_DEG else None
    return None


def _number(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{name} must be a finite number')
    return float(value)


def parse_pois_response(body: object) -> PoiSnapshot:
    """Raises ValueError on a body that does not follow the contract (the last good list is then kept)."""
    data = body.get('data') if isinstance(body, dict) else None
    if not isinstance(data, dict):
        raise ValueError('missing data')
    source = data.get('source')
    if source not in SOURCES:
        raise ValueError('invalid source')
    auto_motion = data.get('autoMotion')
    if not isinstance(auto_motion, bool):
        raise ValueError('autoMotion must be a boolean')
    raw = data.get('pois')
    if not isinstance(raw, list):
        raise ValueError('pois must be a list')
    pois = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError('poi must be an object')
        poi_id, name, preset = item.get('id'), item.get('name'), item.get('cameraPreset')
        if not isinstance(poi_id, str) or not isinstance(name, str) or not isinstance(preset, str):
            raise ValueError('poi id, name and cameraPreset must be strings')
        pois.append(PoiTarget(poi_id, name, _number(item.get('x'), 'x'), _number(item.get('y'), 'y'), preset))
    return PoiSnapshot(source, auto_motion, tuple(pois))


def nearest_poi(pois: tuple[PoiTarget, ...], x: float, y: float, radius_m: float) -> Optional[PoiTarget]:
    best, best_distance = None, radius_m
    for poi in pois:
        distance = math.hypot(poi.x - x, poi.y - y)
        if distance <= best_distance:
            best, best_distance = poi, distance
    return best


class PoiHeadDirector:
    """Turns Nav2 goal events into head commands. Thread-safe: status arrives on the executor, the list on a worker."""

    def __init__(self, actuator: PoiHeadActuator, radius_m: float, on_log=None):
        if radius_m <= 0:
            raise ValueError('radius_m must be positive')
        self._actuator = actuator
        self._radius_m = radius_m
        self._on_log = on_log or (lambda message: None)
        self._lock = threading.Lock()
        self._snapshot = EMPTY_SNAPSHOT
        self._seen: Optional[dict[bytes, int]] = None   # None until the first status message (the latched backlog)

    @property
    def snapshot(self) -> PoiSnapshot:
        with self._lock:
            return self._snapshot

    def set_snapshot(self, snapshot: PoiSnapshot) -> None:
        with self._lock:
            changed = (snapshot.source, snapshot.auto_motion, len(snapshot.pois)) != (
                self._snapshot.source, self._snapshot.auto_motion, len(self._snapshot.pois))
            self._snapshot = snapshot
        if changed:
            state = 'on' if snapshot.auto_motion else 'off'
            self._on_log(f'POI head: {len(snapshot.pois)} POI from {snapshot.source}, automatic motion {state}.')

    def on_goal_status(self, statuses: list[tuple[bytes, int]], pose: Optional[tuple[float, float]]) -> list[str]:
        """Feed every navigate_to_pose status message. Returns what was done, for logs and tests."""
        done: list[str] = []
        with self._lock:
            first = self._seen is None
            previous = self._seen or {}
            current = {goal_id: status for goal_id, status in statuses}
            # Goals that already succeeded before this bridge started are history, not an arrival.
            self._seen = current if first else {**previous, **current}
            if first:
                return done
            snapshot = self._snapshot
            for goal_id, status in current.items():
                before = previous.get(goal_id)
                if status == STATUS_EXECUTING and before not in (STATUS_EXECUTING, *TERMINAL_STATUSES):
                    done.append(self._departure(snapshot))
                elif status == STATUS_SUCCEEDED and before != STATUS_SUCCEEDED:
                    done.append(self._arrival(snapshot, pose))
            # Status arrays only list recent goals; forget the ones Nav2 dropped.
            self._seen = {goal_id: status for goal_id, status in self._seen.items() if goal_id in current}
        return [item for item in done if item]

    def _departure(self, snapshot: PoiSnapshot) -> str:
        if not snapshot.auto_motion:
            return ''
        return self._run(FRONT, 'new goal: head to the front')

    def _arrival(self, snapshot: PoiSnapshot, pose: Optional[tuple[float, float]]) -> str:
        if not snapshot.auto_motion:
            return ''
        if pose is None:
            self._on_log('POI head: goal reached but the robot pose is unknown; head left as it is.')
            return ''
        poi = nearest_poi(snapshot.pois, pose[0], pose[1], self._radius_m)
        if poi is None:
            return ''
        action = preset_action(poi.preset)
        if action is None:
            return f'at {poi.name}: preset {poi.preset}, head left to the Operator'
        return self._run(action, f'at {poi.name}: {poi.preset}')

    def _run(self, action: HeadAction, what: str) -> str:
        try:
            if action.kind == 'sweep':
                self._actuator.sweep(action.sweep_deg)
            else:
                self._actuator.angle(action.pan_deg, action.tilt_deg)
        except Exception as error:  # noqa: BLE001 - a missing head service must not break the status callback
            self._on_log(f'POI head: {what} failed ({type(error).__name__}).')
            return ''
        self._on_log(f'POI head: {what}.')
        return what
