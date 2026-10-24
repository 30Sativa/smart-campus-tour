"""Rigid scan projection at the first-ray timestamp, for visualization only."""

import math

from sensor_msgs_py.point_cloud2 import create_cloud_xyz32
from std_msgs.msg import Header


def scan_to_cloud(scan, transform):
    """Project finite in-range rays using one source-to-target transform.

    This intentionally does not deskew individual rays during robot motion.
    The caller must look up this transform at scan.header.stamp.
    """
    if (not all(math.isfinite(value) for value in
                (scan.angle_min, scan.angle_increment, scan.range_min, scan.range_max))
            or scan.range_min < 0 or scan.range_max < scan.range_min):
        raise ValueError('Invalid scan geometry')

    translation = transform.transform.translation
    rotation = transform.transform.rotation
    values = (translation.x, translation.y, translation.z,
              rotation.x, rotation.y, rotation.z, rotation.w)
    if not all(math.isfinite(value) for value in values):
        raise ValueError('Invalid transform')
    norm = math.sqrt(sum(value * value for value in values[3:]))
    if norm == 0:
        raise ValueError('Invalid transform rotation')
    qx, qy, qz, qw = (value / norm for value in values[3:])
    # Only the first two rotation columns are needed: scan rays have z = 0.
    xx, xy = 1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw)
    yx, yy = 2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz)
    zx, zy = 2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw)
    points = []
    for index, distance in enumerate(scan.ranges):
        if not math.isfinite(distance) or not scan.range_min <= distance <= scan.range_max:
            continue
        angle = scan.angle_min + index * scan.angle_increment
        x, y = distance * math.cos(angle), distance * math.sin(angle)
        points.append((
            xx * x + xy * y + translation.x,
            yx * x + yy * y + translation.y,
            zx * x + zy * y + translation.z,
        ))
    header = Header(stamp=scan.header.stamp, frame_id=transform.header.frame_id)
    return create_cloud_xyz32(header, points)
