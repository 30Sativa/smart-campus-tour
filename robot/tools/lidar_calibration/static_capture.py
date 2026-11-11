#!/usr/bin/env python3
"""Record N LaserScans and the base_link->lidar_link TF to an npz. Read-only subscriber.

    static_capture.py out.npz [--topic /robot_01/scan_raw] [--scans 150] [--timeout 40]

Output: ranges[n_scans, n_beams], meta (json: angle_min, inc, frame, tf_lidar_yaw, stamp).
"""
import argparse
import json
import math
import sys
import time

import numpy as np


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--topic', default='/robot_01/scan_raw')
    ap.add_argument('--scans', type=int, default=150)
    ap.add_argument('--timeout', type=float, default=40.0)
    a = ap.parse_args(argv)
    import rclpy
    from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
    from sensor_msgs.msg import LaserScan
    from tf2_msgs.msg import TFMessage

    rclpy.init()
    n = rclpy.create_node('static_capture_ro')
    rows, meta = [], {}

    def on_scan(m):
        if len(rows) < a.scans:
            rows.append(np.asarray(m.ranges, np.float32))
            meta.update(angle_min=m.angle_min, inc=m.angle_increment, frame=m.header.frame_id,
                        stamp=m.header.stamp.sec + m.header.stamp.nanosec * 1e-9)

    def on_static(m):
        for t in m.transforms:
            if t.child_frame_id == 'lidar_link':
                q = t.transform.rotation
                meta['tf_lidar_yaw'] = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))

    n.create_subscription(LaserScan, a.topic, on_scan, qos_profile_sensor_data)
    n.create_subscription(TFMessage, '/tf_static', on_static,
                          QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL))
    t0 = time.monotonic()
    while len(rows) < a.scans and time.monotonic() - t0 < a.timeout:
        rclpy.spin_once(n, timeout_sec=0.1)
    end = time.monotonic() + 2.0
    while 'tf_lidar_yaw' not in meta and time.monotonic() < end:
        rclpy.spin_once(n, timeout_sec=0.1)
    n.destroy_node()
    rclpy.shutdown()
    if len(rows) < a.scans or len({r.size for r in rows}) != 1:
        print(f'FAIL: got {len(rows)} scans (need {a.scans}, all the same size) on {a.topic}')
        return 1
    np.savez_compressed(a.out, ranges=np.stack(rows), meta=json.dumps(meta))
    print(f"saved {len(rows)} scans x {rows[0].size} beams to {a.out}; TF lidar yaw {meta.get('tf_lidar_yaw')}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
