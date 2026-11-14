"""Scan-to-map pose search for pose_bootstrap. Pure numpy; no rclpy, no scipy.

A pose is accepted only when the robot's own LiDAR scan agrees with the map there. A saved pose
or a configured home (START, dock) is a place to look first, never an answer by itself: the robot
may have been pushed while it was off.

Score: likelihood field, the same model AMCL uses. Each beam end point scores
exp(-d^2 / (2 sigma^2)), d = distance to the nearest occupied map cell (capped); the pose score is
the mean over beams, 0..1. A pose is accepted when
  - its score is at least min_score, and
  - no clearly different pose (farther than distinct_xy, or turned more than distinct_yaw) scores
    within ambiguity_margin of it. Long featureless corridors fail this test on purpose.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np


@dataclass(frozen=True)
class SearchConfig:
    sigma: float = 0.10                 # m, likelihood field width
    min_beams: int = 60                 # valid beams per scan, or the scan is not used
    max_dist: float = 0.50              # m, distance cap of the field
    min_clearance: float = 0.25         # m, global search only visits cells this far from walls
    min_score: float = 0.55
    ambiguity_margin: float = 0.08
    distinct_xy: float = 1.0            # m
    distinct_yaw: float = math.radians(30)
    # inside one search window: a pose this far from the best that scores within the margin
    # means the scan does not pin the pose down (e.g. along a featureless corridor)
    flat_xy: float = 0.30
    flat_yaw: float = math.radians(8)
    # local search around a candidate (a saved pose or a configured home)
    local_xy: float = 0.6
    local_xy_step: float = 0.1
    local_yaw: float = math.radians(25)
    local_yaw_step: float = math.radians(2.5)
    # global search over the whole free space
    global_xy_step: float = 0.30
    global_yaw_step: float = math.radians(5)
    global_beams: int = 72
    global_top: int = 40
    # global search only inside these boxes ((xmin, ymin, xmax, ymax), map frame): where the robot
    # can plausibly be switched on. Empty = whole map (a building map has look-alike corridors).
    regions: tuple = ()
    # final refinement
    fine_xy: float = 0.15
    fine_xy_step: float = 0.05          # AMCL refines further with no-motion updates
    fine_yaw: float = math.radians(4)
    fine_yaw_step: float = math.radians(1.0)


@dataclass
class Pose2D:
    x: float
    y: float
    yaw: float

    def dist(self, o: 'Pose2D') -> float:
        return math.hypot(self.x - o.x, self.y - o.y)

    def dyaw(self, o: 'Pose2D') -> float:
        return abs(math.atan2(math.sin(self.yaw - o.yaw), math.cos(self.yaw - o.yaw)))


@dataclass
class Result:
    status: str                         # VERIFIED | AMBIGUOUS | NO_MATCH
    pose: Pose2D | None
    score: float
    runner_up: float                    # best score of a clearly different pose (0 if none)
    source: str                         # which candidate (or 'global') produced the pose
    detail: str = ''
    tried: list = field(default_factory=list)


class LikelihoodField:
    """Built once per map. grid: int array (H, W) of OccupancyGrid values, row 0 = origin row."""

    def __init__(self, grid, resolution: float, origin_x: float, origin_y: float, cfg: SearchConfig,
                 occupied_threshold: int = 65):
        self.res, self.ox, self.oy, self.cfg = resolution, origin_x, origin_y, cfg
        grid = np.asarray(grid, dtype=np.int16)
        self.h, self.w = grid.shape
        occ = grid >= occupied_threshold
        ncap = max(1, int(math.ceil(cfg.max_dist / resolution)))
        # Chamfer-free distance in cells: city-block rings by repeated dilation, capped at ncap.
        dist = np.full(grid.shape, ncap, dtype=np.int16)
        ring = occ.copy()
        dist[ring] = 0
        for k in range(1, ncap):
            grown = ring.copy()
            grown[1:] |= ring[:-1]; grown[:-1] |= ring[1:]
            grown[:, 1:] |= ring[:, :-1]; grown[:, :-1] |= ring[:, 1:]
            dist[grown & ~ring] = k
            ring = grown
        d_m = dist.astype(np.float32) * resolution
        self.score = np.exp(-(d_m ** 2) / (2 * cfg.sigma ** 2)).astype(np.float32)
        self.score[dist >= ncap] = 0.0
        self.score[grid < 0] = 0.0      # unknown space explains nothing
        free = (grid >= 0) & (grid < 25)
        clear = max(1, int(round(cfg.min_clearance / resolution)))
        self.free_clear = free & (dist >= min(clear, ncap - 1))

    def world_to_cell(self, x, y):
        return ((np.asarray(x) - self.ox) / self.res), ((np.asarray(y) - self.oy) / self.res)

    def score_poses(self, px, py, pyaw, bx, by):
        """Mean likelihood of beam end points (bx, by in the robot base frame) for every pose.
        px, py, pyaw: 1-D arrays (same length). Returns an array of scores."""
        px, py, pyaw = (np.atleast_1d(np.asarray(a, dtype=np.float64)) for a in (px, py, pyaw))
        c, s = np.cos(pyaw)[:, None], np.sin(pyaw)[:, None]
        wx = px[:, None] + c * bx[None, :] - s * by[None, :]
        wy = py[:, None] + s * bx[None, :] + c * by[None, :]
        i = np.floor((wx - self.ox) / self.res).astype(np.int64)
        j = np.floor((wy - self.oy) / self.res).astype(np.int64)
        ok = (i >= 0) & (i < self.w) & (j >= 0) & (j < self.h)
        val = np.zeros(i.shape, dtype=np.float32)
        val[ok] = self.score[j[ok], i[ok]]
        return val.mean(axis=1)


def beams_in_base(ranges, angle_min, angle_increment, range_min, range_max, laser_pose,
                  max_range=12.0, max_beams=360):
    """Valid beam end points in the base frame. laser_pose: (x, y, yaw) of the laser in base."""
    r = np.asarray(ranges, dtype=np.float64)
    a = angle_min + np.arange(len(r)) * angle_increment
    ok = np.isfinite(r) & (r > max(range_min, 0.05)) & (r < min(range_max, max_range))
    r, a = r[ok], a[ok]
    if len(r) > max_beams:
        idx = np.linspace(0, len(r) - 1, max_beams).round().astype(int)
        r, a = r[idx], a[idx]
    lx, ly, lyaw = laser_pose
    return lx + r * np.cos(lyaw + a), ly + r * np.sin(lyaw + a)


def _grid(center: Pose2D, xy, xy_step, yaw, yaw_step):
    d = np.arange(-xy, xy + 1e-9, xy_step)
    t = np.arange(-yaw, yaw + 1e-9, yaw_step) if yaw > 0 else np.zeros(1)
    gx, gy, gt = np.meshgrid(center.x + d, center.y + d, center.yaw + t, indexing='ij')
    return gx.ravel(), gy.ravel(), gt.ravel()


def _best(field_, scans, px, py, pyaw, chunk=20000):
    total = np.zeros(len(px))
    for bx, by in scans:
        for k in range(0, len(px), chunk):
            total[k:k + chunk] += field_.score_poses(px[k:k + chunk], py[k:k + chunk], pyaw[k:k + chunk], bx, by)
    total /= len(scans)
    return total


def _flat_runner(px, py, pyaw, s, k, cfg):
    """Best score in the window among poses clearly apart from the best one (index k)."""
    d = np.hypot(px - px[k], py - py[k])
    dy = np.abs(np.arctan2(np.sin(pyaw - pyaw[k]), np.cos(pyaw - pyaw[k])))
    apart = (d > cfg.flat_xy) | (dy > cfg.flat_yaw)
    return float(s[apart].max()) if apart.any() else 0.0


def refine(field_, scans, start: Pose2D, cfg: SearchConfig, coarse=True) -> tuple[Pose2D, float, float]:
    """Best pose near start, its score, and the best score of a clearly different pose in the
    same window (high = the scan does not pin the pose down there)."""
    pose, flat = start, 0.0
    px, py, pyaw = (_grid(pose, cfg.local_xy, cfg.local_xy_step, cfg.local_yaw, cfg.local_yaw_step) if coarse
                    else _grid(pose, 2 * cfg.flat_xy, cfg.local_xy_step, 2 * cfg.flat_yaw, cfg.local_yaw_step))
    s = _best(field_, scans, px, py, pyaw); k = int(s.argmax())
    flat = _flat_runner(px, py, pyaw, s, k, cfg)
    pose = Pose2D(px[k], py[k], pyaw[k])
    px, py, pyaw = _grid(pose, cfg.fine_xy, cfg.fine_xy_step, cfg.fine_yaw, cfg.fine_yaw_step)
    s = _best(field_, scans, px, py, pyaw); k = int(s.argmax())
    return (Pose2D(float(px[k]), float(py[k]), float(math.atan2(math.sin(pyaw[k]), math.cos(pyaw[k])))),
            float(s[k]), flat)


def global_candidates(field_, scans, cfg: SearchConfig) -> list[tuple[Pose2D, float]]:
    """Coarse search over every free cell with clearance; returns distinct top poses, best first."""
    step = max(1, int(round(cfg.global_xy_step / field_.res)))
    jj, ii = np.nonzero(field_.free_clear[::step, ::step])
    px = field_.ox + (ii * step + 0.5) * field_.res
    py = field_.oy + (jj * step + 0.5) * field_.res
    if cfg.regions:
        keep = np.zeros(len(px), dtype=bool)
        for x0, y0, x1, y1 in cfg.regions:
            keep |= (px >= x0) & (px <= x1) & (py >= y0) & (py <= y1)
        px, py = px[keep], py[keep]
    if len(px) == 0:
        return []
    yaws = np.arange(-math.pi, math.pi, cfg.global_yaw_step)
    sub = [(bx[np.linspace(0, len(bx) - 1, min(cfg.global_beams, len(bx))).round().astype(int)],
            by[np.linspace(0, len(by) - 1, min(cfg.global_beams, len(by))).round().astype(int)])
           for bx, by in scans[:2]]
    best_s = np.full(len(px), -1.0); best_t = np.zeros(len(px))
    for t in yaws:
        s = _best(field_, sub, px, py, np.full(len(px), t))
        better = s > best_s
        best_s[better] = s[better]; best_t[better] = t
    order = np.argsort(-best_s)
    picked: list[tuple[Pose2D, float]] = []
    for k in order:
        p = Pose2D(float(px[k]), float(py[k]), float(best_t[k]))
        if all(p.dist(q) > cfg.distinct_xy or p.dyaw(q) > cfg.distinct_yaw for q, _ in picked):
            picked.append((p, float(best_s[k])))
        if len(picked) >= cfg.global_top:
            break
    return picked


def decide(scored: list, cfg: SearchConfig, tried) -> Result:
    """scored: refined (pose, score, source[, flat]). Picks the best and checks it is unique:
    against the other places (distinct_xy/yaw) and inside its own search window (flat)."""
    if not scored:
        return Result('NO_MATCH', None, 0.0, 0.0, '', 'nothing to score', tried)
    scored = sorted(scored, key=lambda e: -e[1])
    best, score, source = scored[0][:3]
    flat = scored[0][3] if len(scored[0]) > 3 else 0.0
    others = [e[1] for e in scored[1:] if e[0].dist(best) > cfg.distinct_xy or e[0].dyaw(best) > cfg.distinct_yaw]
    runner = max(others + [flat])
    if score < cfg.min_score:
        return Result('NO_MATCH', best, score, runner, source,
                      f'best scan match {score:.2f} < min_score {cfg.min_score:.2f}', tried)
    if score - runner < cfg.ambiguity_margin:
        return Result('AMBIGUOUS', best, score, runner, source,
                      f'another pose matches almost as well ({runner:.2f} vs {score:.2f})', tried)
    return Result('VERIFIED', best, score, runner, source,
                  f'scan match {score:.2f}, next distinct pose {runner:.2f}', tried)


def locate(field_, scans, candidates: list[tuple[str, Pose2D]], cfg: SearchConfig,
           use_global: bool) -> Result:
    """candidates: [(name, pose)] (saved pose, homes) refined first. With use_global the regions are
    ALWAYS searched too, and every refined pose competes in the uniqueness check: a candidate that
    matches a look-alike place next to it must not win while the true pose was never scored
    (robot pushed 1.5-3 m while off; virtual sweep on map2, 13/11/2026)."""
    scans = [sc for sc in scans if len(sc[0]) >= cfg.min_beams]
    if not scans:
        return Result('NO_MATCH', None, 0.0, 0.0, '', f'no scan with {cfg.min_beams}+ valid beams', [])
    tried, scored = [], []
    for name, c in candidates:
        p, s, flat = refine(field_, scans, c, cfg)
        scored.append((p, s, name, flat)); tried.append((name, round(s, 3)))
    if not use_global:
        res = decide(scored, cfg, tried)
        if res.status != 'VERIFIED':
            res.detail += '; global search disabled'
        return res
    found = global_candidates(field_, scans, cfg)[:12]
    for p, _ in found:
        rp, s, flat = refine(field_, scans, p, cfg, coarse=False)
        scored.append((rp, s, 'global', flat))
    tried.append(('global', round(max([e[1] for e in scored if e[2] == 'global'], default=0.0), 3)))
    res = decide(scored, cfg, tried)
    # The same place found from a candidate and by the search: credit the candidate.
    if res.status == 'VERIFIED' and res.source == 'global':
        for p, s, name, _ in scored:
            if name != 'global' and p.dist(res.pose) <= cfg.flat_xy and p.dyaw(res.pose) <= cfg.flat_yaw \
                    and res.score - s < 0.02:
                res.source = name
                break
    return res
