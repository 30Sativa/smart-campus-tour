"""Pure wire conversion. Ground truth stays explicitly distinct from localization."""
from datetime import datetime, timezone
import math


def pose_payload(pose, robot_id, world_id, stream_id, seq):
    p, q = pose.position, pose.orientation
    values = (p.x, p.y, p.z, q.x, q.y, q.z, q.w)
    if not all(math.isfinite(value) for value in values):
        raise ValueError('Non-finite Gazebo pose')
    norm = math.sqrt(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w)
    if norm < 1e-9:
        raise ValueError('Invalid Gazebo quaternion')
    x, y, z, w = (value / norm for value in (q.x, q.y, q.z, q.w))
    return {
        'robotId': robot_id, 'source': 'gazebo', 'worldId': world_id,
        'frameId': 'gazebo_world', 'streamId': stream_id, 'seq': seq,
        'capturedAt': datetime.now(timezone.utc).isoformat(),
        'x': p.x, 'y': p.y, 'z': p.z,
        'yaw': math.atan2(2*(w*z + x*y), 1 - 2*(y*y + z*z)),
    }


# ── Real robot: AMCL pose in the ROS `map` frame ────────────────────────────
# Contract: docs/architecture.md, "Robot pose telemetry" (POST /api/robots/telemetry).

SOURCES = ('physical', 'gazebo', 'emulator')


def yaw_from_quaternion(x, y, z, w):
    """Heading about +Z in radians, (-pi, pi]. Raises on a degenerate quaternion."""
    norm = math.sqrt(x*x + y*y + z*z + w*w)
    if not math.isfinite(norm) or norm < 1e-9:
        raise ValueError('Invalid quaternion')
    x, y, z, w = (value / norm for value in (x, y, z, w))
    return math.atan2(2*(w*z + x*y), 1 - 2*(y*y + z*z))


def localization_quality(covariance, max_cov_xy):
    """(localized, cov_xy) from a 6x6 row-major pose covariance (AMCL /amcl_pose).

    cov_xy is the larger of the x and y position variances in m^2. The robot
    counts as localized only when both are finite and within `max_cov_xy`.
    """
    if covariance is None or len(covariance) < 8:
        return False, None
    cov_x, cov_y = float(covariance[0]), float(covariance[7])
    if not (math.isfinite(cov_x) and math.isfinite(cov_y)) or cov_x < 0 or cov_y < 0:
        return False, None
    cov_xy = max(cov_x, cov_y)
    return cov_xy <= max_cov_xy, cov_xy


def map_pose_payload(robot_code, source, map_key, frame_id, stream_id, seq,
                     x, y, yaw, localized, cov_xy, captured_at):
    """JSON body for POST /api/robots/telemetry. Rejects values the backend would refuse."""
    if source not in SOURCES:
        raise ValueError(f'source must be one of {SOURCES}')
    if not robot_code or not map_key or not frame_id:
        raise ValueError('robot_code, map_key and frame_id are required')
    if seq < 1:
        raise ValueError('seq starts at 1')
    for value in (x, y, yaw):
        if not math.isfinite(value) or abs(value) > 10000:
            raise ValueError('Non-finite or out-of-range pose')
    if abs(yaw) > math.pi:
        raise ValueError('yaw must be within [-pi, pi]')
    if cov_xy is not None and (not math.isfinite(cov_xy) or cov_xy < 0):
        cov_xy = None
    if captured_at.tzinfo is None:
        raise ValueError('captured_at must be timezone-aware (UTC)')
    return {
        'robotCode': robot_code, 'source': source, 'mapKey': map_key,
        'frameId': frame_id, 'streamId': stream_id, 'seq': seq,
        'capturedAt': captured_at.astimezone(timezone.utc).isoformat(),
        'x': round(x, 4), 'y': round(y, 4), 'yaw': round(yaw, 6),
        'localized': bool(localized), 'covXY': None if cov_xy is None else round(cov_xy, 5),
    }


def robot_authorization(robot_code, secret):
    """Header value for the device credential. The secret never goes into a parameter file."""
    if not secret or ':' in robot_code:
        raise ValueError('A secret is required and robot_code must not contain ":"')
    return f'Robot {robot_code}:{secret}'
