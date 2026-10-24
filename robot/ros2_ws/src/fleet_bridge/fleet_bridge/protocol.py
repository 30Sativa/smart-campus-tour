"""Pure Fleet Sync v1 payload and TF conversion helpers."""

from __future__ import annotations

import json
import math
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

MAX_SAFE_SEQUENCE = 9_007_199_254_740_991
ROBOT_CODE_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$')
ALLOWED_STATUSES = {'IDLE', 'NAVIGATING', 'ARRIVED', 'FAILED', 'UNKNOWN'}


@dataclass(frozen=True)
class PoseObservation:
    pose: dict[str, float | str] | None
    age_sec: float | None
    stale: bool
    reason: str


def utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError('timestamp must include a timezone')
    return value.astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def pose_from_transform(
    transform: object | None,
    now: datetime,
    map_frame: str,
    base_frame: str,
    stale_after_sec: float,
) -> PoseObservation:
    """Convert a latest map->base transform without refreshing its source stamp."""
    if transform is None:
        return PoseObservation(None, None, True, 'tf_unavailable')

    try:
        header = transform.header
        child_frame = transform.child_frame_id
        stamp = header.stamp
        seconds = int(stamp.sec) + int(stamp.nanosec) / 1_000_000_000
        position = transform.transform.translation
        rotation = transform.transform.rotation
        x, y = float(position.x), float(position.y)
        qx, qy, qz, qw = (float(rotation.x), float(rotation.y),
                          float(rotation.z), float(rotation.w))
    except (AttributeError, TypeError, ValueError, OverflowError):
        return PoseObservation(None, None, True, 'tf_invalid')

    if header.frame_id != map_frame or child_frame != base_frame:
        return PoseObservation(None, None, True, 'tf_frame_mismatch')
    values = (x, y, qx, qy, qz, qw, seconds)
    if not all(math.isfinite(value) for value in values) or seconds <= 0:
        return PoseObservation(None, None, True, 'tf_invalid')
    if abs(x) > 10_000 or abs(y) > 10_000:
        return PoseObservation(None, None, True, 'tf_invalid')

    quaternion_norm = math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw)
    if not math.isfinite(quaternion_norm) or quaternion_norm < 1e-12:
        return PoseObservation(None, None, True, 'tf_invalid')
    qx, qy, qz, qw = (value / quaternion_norm for value in (qx, qy, qz, qw))
    yaw = math.atan2(2.0 * (qw * qz + qx * qy),
                     1.0 - 2.0 * (qy * qy + qz * qz))

    try:
        captured_at = datetime.fromtimestamp(seconds, timezone.utc)
    except (OverflowError, OSError, ValueError):
        return PoseObservation(None, None, True, 'tf_invalid')
    age_sec = (now.astimezone(timezone.utc) - captured_at).total_seconds()
    if age_sec < 0:
        return PoseObservation(None, age_sec, True, 'tf_from_future')

    return PoseObservation(
        {
            'x': x,
            'y': y,
            'yaw': yaw,
            'capturedAt': utc_iso(captured_at),
        },
        age_sec,
        age_sec > stale_after_sec,
        'pose_stale' if age_sec > stale_after_sec else 'pose_fresh',
    )


def build_report(
    robot_code: str,
    stream_id: str,
    seq: int,
    reported_at: datetime,
    map_key: str,
    frame_id: str,
    pose: dict[str, float | str] | None,
    status: str,
) -> dict[str, object]:
    if not ROBOT_CODE_PATTERN.fullmatch(robot_code):
        raise ValueError('robot code is not valid for Fleet Sync v1')
    try:
        canonical_stream = str(uuid.UUID(stream_id))
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError('streamId must be a UUID') from error
    if seq < 1 or seq > MAX_SAFE_SEQUENCE:
        raise ValueError('seq must be a positive browser-safe integer')
    if not map_key or len(map_key) > 100 or not frame_id or len(frame_id) > 100:
        raise ValueError('mapKey and frameId must be configured')
    if status not in ALLOWED_STATUSES:
        raise ValueError('status is not allowed by Fleet Sync v1')
    if status in {'NAVIGATING', 'ARRIVED', 'FAILED'}:
        raise ValueError('legId is required for leg-specific execution statuses')

    return {
        'robotId': robot_code,
        'streamId': canonical_stream,
        'seq': seq,
        'reportedAt': utc_iso(reported_at),
        'mapKey': map_key,
        'frameId': frame_id,
        'pose': pose,
        'status': status,
        'legId': None,
        'localized': None,
        'motionReady': None,
        'faultCode': None,
        'batteryPercent': None,
    }


def serialize_report(report: dict[str, object]) -> str:
    return json.dumps(report, ensure_ascii=True, allow_nan=False, separators=(',', ':'))
