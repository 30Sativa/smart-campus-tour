"""Blind-zone memory for the sonar guard (pure Python, no ROS).

Why it exists (robot/docs/sonar-perception.md section 4): an SR04T on a chassis corner
is blind closer than 0.20 m, and the firmware reports that exactly like "no echo". A
guard that only reads the latest echo (collision_monitor's Range source) therefore
loses an object in the last 0.2 m before the corner reaches it and lets the robot
drive on. Holding the last echo in the sensor frame does not help: that obstacle moves
with the robot and is never reached (offline sim 23/11: 0.09 m/s into the object).

So, per sonar: when a confirmed near echo (closer than ``hold_trigger``) is followed
by "no echo" while that echo's spot is still in front of the sonar (it got too close,
it did not leave the beam because the robot turned away), the arc of that last near
echo is HELD in the odom frame, where it stays put while the robot moves. Released only
on evidence:
- the same sonar, pointing at the held arc again (some held point within the same
  fov/2 + ``beam_margin`` window as when it was held; a single centre point is too
  touchy at 0.1 m, where a few cm sideways is 30 deg), reports a valid echo at least
  ``blind_clear_range`` long. An SR04T reports the first echo after its blanking time,
  so a long clean echo is taken as "nothing in front of it". That is an ASSUMPTION
  about the sensor, to be measured on the robot (sonar-perception.md section 8); 0
  disables it. A long echo seen while pointing elsewhere proves nothing (offline sim
  23/11: released during a recovery Spin, the robot then drove into the object);
- another sonar's valid echo passes through held points at a longer range, outside
  its own blind zone (those points only);
- the robot moved ``forget_radius`` away, a held point lies inside the real footprint
  (the body cannot share space with an object: localisation error), or the optional
  ``max_age`` (0 = never).
"No echo" never releases anything: it may be an object in the blind zone.

A near echo is confirmed when two measurements agree within ``confirm_range``
(single spurious echoes are not held). Repeated values are not new measurements:
stm32_bridge republishes each sonar with every FB frame (~40 Hz) while the firmware
re-measures it every 0.29-0.42 s, with no counter on the wire. A value is new when it
changes; a value unchanged for ``repeat_confirm`` (over one firmware cycle) has been
measured twice.
"""

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import yaml

Point = Tuple[float, float]
Pose = Tuple[float, float, float]   # x, y, yaw of the sensor (or robot) in odom


@dataclass
class MemoryConfig:
    hold_trigger: float = 0.40       # a confirmed echo closer than this arms the hold
    confirm_range: float = 0.10      # two near echoes this close in range confirm
    confirm_window: float = 1.0      # ... and this close in time (s)
    blind_clear_range: float = 0.60  # the sonar's own echo this long releases its hold
    clear_margin: float = 0.05       # another beam clears points this much short of its echo
    beam_margin: float = math.radians(10.0)   # "still in front": within fov/2 + this
    arc_step: float = math.radians(2.0)
    repeat_confirm: float = 0.45
    forget_radius: float = 1.5
    max_age: float = 0.0             # 0 = never
    half_length: float = 0.4010999755
    half_width: float = 0.2814


@dataclass
class _Near:
    rng: float
    pose: Pose
    fov: float
    t: float
    confirmed: bool = False


@dataclass
class _Sensor:
    key: int = -2
    t_first: float = 0.0
    repeat_seen: bool = False
    near: Optional[_Near] = None
    held: List[Point] = field(default_factory=list)
    held_center: Optional[Point] = None
    held_since: float = 0.0


@dataclass
class SonarMemory:
    config: MemoryConfig = field(default_factory=MemoryConfig)

    def __post_init__(self):
        self._s: Dict[str, _Sensor] = {}
        self.holds = 0
        self.releases = 0

    # -- input ---------------------------------------------------------------
    def needs_pose(self, sensor: str, rng: float, min_range: float) -> bool:
        """Is this a new value, i.e. will observe() use the sensor pose?"""
        valid = math.isfinite(rng) and min_range <= rng
        s = self._s.get(sensor)
        return s is None or s.key != (int(round(rng * 1000)) if valid else -1)

    def observe(self, sensor: str, t: float, rng: float, min_range: float,
                fov: float, pose: Optional[Pose]) -> Optional[str]:
        """One Range message; returns a log line when a hold starts or ends."""
        c = self.config
        s = self._s.setdefault(sensor, _Sensor())
        valid = math.isfinite(rng) and min_range <= rng
        key = int(round(rng * 1000)) if valid else -1
        if key == s.key:
            if (valid and not s.repeat_seen and t - s.t_first >= c.repeat_confirm
                    and s.near is not None):
                s.repeat_seen = True
                s.near.confirmed = True
            return None
        s.key, s.t_first, s.repeat_seen = key, t, False
        if not valid:
            n = s.near
            s.near = None
            if n is None or not n.confirmed or t - n.t > c.confirm_window or s.held:
                return None
            center = self._arc(n.pose, n.rng, 0.0)[0]
            if pose is not None:
                d, bearing = _polar(pose, center)
                if abs(bearing) > n.fov / 2 + c.beam_margin or d > n.rng + c.clear_margin:
                    return None          # it left the beam (turn, or moving away), not too close
            s.held, s.held_center, s.held_since = self._arc(n.pose, n.rng, n.fov), center, t
            self.holds += 1
            return f'{sensor}: echo lost {n.rng:.2f} m out, holding that arc in odom (blind zone)'
        if pose is None:
            return None
        event = None
        self._see_through(sensor, pose, rng, min_range, fov)
        if (s.held and c.blind_clear_range > 0.0 and rng >= c.blind_clear_range
                and any(abs(_polar(pose, p)[1]) <= fov / 2 + c.beam_margin for p in s.held)):
            s.held, s.held_center = [], None
            self.releases += 1
            event = f'{sensor}: hold released (clear echo at {rng:.2f} m)'
        if rng < c.hold_trigger:
            prev = s.near
            recent = prev is not None and t - prev.t <= c.confirm_window
            agrees = recent and abs(prev.rng - rng) <= c.confirm_range
            s.near = _Near(rng, pose, fov, t, agrees or (recent and prev.confirmed))
        else:
            s.near = None
        return event

    def _see_through(self, sensor: str, pose: Pose, rng: float, min_range: float, fov: float):
        """A valid echo at rng: held points of OTHER sonars that it passes are gone."""
        sx, sy, syaw = pose
        for name, other in self._s.items():
            if name == sensor or not other.held:
                continue
            keep = []
            for x, y in other.held:
                d, bearing = _polar(pose, (x, y))
                if abs(bearing) <= fov / 2 and min_range <= d <= rng - self.config.clear_margin:
                    continue
                keep.append((x, y))
            if not keep:
                self.releases += 1
                other.held_center = None
            other.held = keep

    def _arc(self, pose: Pose, rng: float, fov: float) -> List[Point]:
        sx, sy, syaw = pose
        n = max(1, int(round(fov / self.config.arc_step)))
        return [(sx + rng * math.cos(syaw - fov / 2 + fov * k / n),
                 sy + rng * math.sin(syaw - fov / 2 + fov * k / n)) for k in range(n + 1)]

    # -- output --------------------------------------------------------------
    def points(self, t: float, robot: Optional[Pose]) -> List[Point]:
        c = self.config
        out: List[Point] = []
        for s in self._s.values():
            if not s.held:
                continue
            if c.max_age > 0.0 and t - s.held_since > c.max_age:
                s.held, s.held_center = [], None
                continue
            keep = []
            for x, y in s.held:
                if robot is not None:
                    dx, dy = x - robot[0], y - robot[1]
                    if math.hypot(dx, dy) > c.forget_radius:
                        continue
                    co, si = math.cos(robot[2]), math.sin(robot[2])
                    if (abs(co * dx + si * dy) < c.half_length
                            and abs(-si * dx + co * dy) < c.half_width):
                        continue
                keep.append((x, y))
            s.held = keep
            if not keep:
                s.held_center = None
            out += keep
        return out

    def held_sensors(self) -> List[str]:
        return sorted(name for name, s in self._s.items() if s.held)


def _wrap(a: float) -> float:
    return math.atan2(math.sin(a), math.cos(a))


def _polar(pose: Pose, point: Point) -> Tuple[float, float]:
    """(distance, bearing) of point as seen from pose (x, y, yaw)."""
    dx, dy = point[0] - pose[0], point[1] - pose[1]
    return math.hypot(dx, dy), _wrap(math.atan2(dy, dx) - pose[2])


# -- poses ----------------------------------------------------------------------

def compose(a, b):
    """Pose a * pose b, both (x, y, yaw)."""
    c, s = math.cos(a[2]), math.sin(a[2])
    return a[0] + c * b[0] - s * b[1], a[1] + s * b[0] + c * b[1], a[2] + b[2]


def mount_in_base(static, frame, base):
    """(x, y, yaw) of frame in base through the static tree {child: (parent, pose)}, or None."""
    pose, seen = (0.0, 0.0, 0.0), set()
    while frame != base:
        if frame not in static or frame in seen:
            return None
        seen.add(frame)
        parent, p = static[frame]
        pose = compose(p, pose)
        frame = parent
    return pose


def pose_at(history, t, max_gap=0.25):
    """The odom pose closest to time t from [(t, x, y, yaw)], if one is within max_gap."""
    best = min(history, key=lambda h: abs(h[0] - t), default=None)
    return best[1:] if best is not None and abs(best[0] - t) <= max_gap else None


# -- padded footprint for collision_monitor's approach polygon -----------------

def parse_footprint(text: str) -> List[Point]:
    """'[[x, y], ...]' (the Nav2 footprint string) -> [(x, y), ...]; >= 3 points."""
    pts = yaml.safe_load(text)
    if (not isinstance(pts, list) or len(pts) < 3
            or any(not isinstance(p, list) or len(p) != 2 for p in pts)):
        raise ValueError(f'not a footprint polygon: {text!r}')
    out = [(float(x), float(y)) for x, y in pts]
    if any(not (math.isfinite(x) and math.isfinite(y)) for x, y in out):
        raise ValueError(f'footprint has a non-finite point: {text!r}')
    return out


def pad_footprint(points: Sequence[Point], padding: float) -> List[Point]:
    """nav2_costmap_2d::padFootprint: every vertex moves |padding| out on each axis."""
    def sign0(v: float) -> float:
        return 1.0 if v > 0.0 else (-1.0 if v < 0.0 else 0.0)
    return [(x + sign0(x) * padding, y + sign0(y) * padding) for x, y in points]


def half_extents(points: Sequence[Point]) -> Tuple[float, float]:
    """Half length / width of the footprint's bounding box (the body test above)."""
    return max(abs(x) for x, _ in points), max(abs(y) for _, y in points)
