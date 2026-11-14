"""Per-map pose_bootstrap settings and the saved last pose. Pure Python (yaml, json, hashlib).

A map's settings live next to the map: <map_stem>.pose_bootstrap.yaml (map2.yaml ->
map2.pose_bootstrap.yaml). The map YAML itself is never edited: fleet_bridge compares its bytes
with the uploaded map package.

    map_yaml: map2.yaml                   # must name the map this file belongs to
    frame_id: map
    homes:                                # places the robot is usually parked; looked at first
      - poi_file: poi_start.yaml          # path relative to this file; pose read from the POI file
      - name: DOCK                        # or an inline pose
        pose: {x: 1.0, y: 2.0, yaw: 0.0}
    saved_pose: true                      # also look at the last pose saved on this map
    global_search:
      enabled: true                       # search the regions when no candidate matches
      regions: [[-3.0, -3.0, 12.0, 10.0]] # xmin, ymin, xmax, ymax (map frame)
    search:                               # optional SearchConfig overrides (angles in degrees)
      min_score: 0.55
      ambiguity_margin: 0.08

The saved pose is a hint only: it is keyed by the map's content hash and is always checked
against the live scan before use.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import tempfile
from dataclasses import replace

import yaml

from .pose_bootstrap_core import Pose2D, SearchConfig

ANGLE_KEYS = {'local_yaw', 'local_yaw_step', 'global_yaw_step', 'fine_yaw', 'fine_yaw_step', 'distinct_yaw'}
TOP_KEYS = {'map_yaml', 'frame_id', 'homes', 'saved_pose', 'global_search', 'search'}


class ConfigError(ValueError):
    pass


def default_config_path(map_yaml: str) -> str:
    stem, _ = os.path.splitext(map_yaml)
    return stem + '.pose_bootstrap.yaml'


def map_key(map_yaml: str) -> str:
    """sha256 over the map YAML and its image: a saved pose never crosses to another map."""
    h = hashlib.sha256()
    with open(map_yaml, 'rb') as f:
        data = f.read()
    h.update(data)
    image = (yaml.safe_load(data) or {}).get('image')
    if image:
        path = image if os.path.isabs(image) else os.path.join(os.path.dirname(map_yaml), image)
        with open(path, 'rb') as f:
            h.update(f.read())
    return h.hexdigest()


def _pose(d, where):
    try:
        return Pose2D(float(d['x']), float(d['y']), float(d['yaw']))
    except (KeyError, TypeError, ValueError):
        raise ConfigError(f'{where}: pose needs numeric x, y, yaw') from None


def load_config(path: str, map_yaml: str, frame_id: str = 'map'):
    """Return (homes [(name, Pose2D)], use_saved, use_global, SearchConfig). Raises ConfigError."""
    try:
        with open(path) as f:
            raw = yaml.safe_load(f) or {}
    except OSError as e:
        raise ConfigError(f'cannot read {path}: {e}') from None
    if not isinstance(raw, dict):
        raise ConfigError(f'{path}: expected a mapping')
    unknown = set(raw) - TOP_KEYS
    if unknown:
        raise ConfigError(f'{path}: unknown keys {sorted(unknown)}')
    if os.path.basename(str(raw.get('map_yaml', ''))) != os.path.basename(map_yaml):
        raise ConfigError(f'{path} is for map {raw.get("map_yaml")!r}, the loaded map is {os.path.basename(map_yaml)!r}')
    if raw.get('frame_id', 'map') != frame_id:
        raise ConfigError(f'{path}: frame_id {raw.get("frame_id")!r} is not {frame_id!r}')
    base = os.path.dirname(os.path.abspath(path))
    homes = []
    for i, h in enumerate(raw.get('homes') or []):
        if not isinstance(h, dict):
            raise ConfigError(f'{path}: homes[{i}] must be a mapping')
        if 'poi_file' in h:
            poi_path = h['poi_file'] if os.path.isabs(h['poi_file']) else os.path.join(base, h['poi_file'])
            try:
                with open(poi_path) as f:
                    poi = yaml.safe_load(f) or {}
            except OSError as e:
                raise ConfigError(f'{path}: homes[{i}]: {e}') from None
            if os.path.basename(str(poi.get('map_yaml', ''))) != os.path.basename(map_yaml):
                raise ConfigError(f'{poi_path} belongs to map {poi.get("map_yaml")!r}')
            if poi.get('frame_id', 'map') != frame_id:
                raise ConfigError(f'{poi_path}: frame_id {poi.get("frame_id")!r} is not {frame_id!r}')
            homes.append((str(h.get('name') or poi.get('id') or os.path.basename(poi_path)),
                          _pose(poi.get('pose') or {}, poi_path)))
        else:
            homes.append((str(h.get('name', f'home{i}')), _pose(h.get('pose') or {}, f'{path}: homes[{i}]')))
    gs = raw.get('global_search') or {}
    regions = []
    for r in gs.get('regions') or []:
        if not (isinstance(r, (list, tuple)) and len(r) == 4):
            raise ConfigError(f'{path}: each region is [xmin, ymin, xmax, ymax]')
        x0, y0, x1, y1 = (float(v) for v in r)
        if x1 <= x0 or y1 <= y0:
            raise ConfigError(f'{path}: empty region {r}')
        regions.append((x0, y0, x1, y1))
    cfg = SearchConfig(regions=tuple(regions))
    over = raw.get('search') or {}
    fields = set(SearchConfig.__dataclass_fields__) - {'regions'}
    bad = set(over) - fields
    if bad:
        raise ConfigError(f'{path}: unknown search keys {sorted(bad)}')
    cfg = replace(cfg, **{k: (math.radians(float(v)) if k in ANGLE_KEYS else type(getattr(cfg, k))(v))
                          for k, v in over.items()})
    use_global = bool(gs.get('enabled', False))
    if use_global and not regions:
        raise ConfigError(f'{path}: global_search needs regions (a whole building map has look-alike places)')
    if not homes and not raw.get('saved_pose', True) and not use_global:
        raise ConfigError(f'{path}: nothing to search (no homes, saved_pose off, global search off)')
    return homes, bool(raw.get('saved_pose', True)), use_global, cfg


def saved_pose_path(state_dir: str, key: str) -> str:
    return os.path.join(state_dir, f'last_pose_{key[:16]}.json')


def read_saved_pose(state_dir: str, key: str):
    """(Pose2D, saved_at) or None. Anything malformed or for another map reads as None."""
    try:
        with open(saved_pose_path(state_dir, key)) as f:
            d = json.load(f)
        if d.get('map_key') != key:
            return None
        p = Pose2D(float(d['x']), float(d['y']), float(d['yaw']))
        if not all(math.isfinite(v) for v in (p.x, p.y, p.yaw)):
            return None
        return p, float(d.get('saved_at', 0.0))
    except (OSError, ValueError, KeyError, TypeError):
        return None


def write_saved_pose(state_dir: str, key: str, pose: Pose2D, saved_at: float, map_yaml: str) -> None:
    """Atomic write (temp file + rename): a power cut leaves the old file or the new one."""
    os.makedirs(state_dir, exist_ok=True)
    data = json.dumps({'map_key': key, 'map_yaml': os.path.abspath(map_yaml), 'x': pose.x, 'y': pose.y,
                       'yaw': pose.yaw, 'saved_at': saved_at})
    fd, tmp = tempfile.mkstemp(dir=state_dir, prefix='.last_pose_')
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, saved_pose_path(state_dir, key))
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
