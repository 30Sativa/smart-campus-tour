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
