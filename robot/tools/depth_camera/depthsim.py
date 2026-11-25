#!/usr/bin/env python3
"""Depth camera stand-in for the offline Nav2 sim (robot/tools/depth_camera/avoid_sim.sh).

Publishes /robot_01/camera/depth/points like the Astra driver (optical frame, 160x120 density is not
modelled: surfaces sampled every 2 cm) for obstacles the LiDAR does not see, from the TRUE robot pose
(fakebot2 publishes odom -> base_footprint = true pose). The camera is where the CAD mount puts it
(0.394 m ahead of the centre, 0.273 m above the floor), 58 x 45 degree field of view, nothing with a
depth (distance along the optical axis) under 0.6 m. No occlusion model.

Env: DEPTHSIM_BOX "x0,y0,x1,y1,h" (a low box, world coordinates); DEPTHSIM_POSTS "x,y,r;..." (the
NAVSIM_OBST posts the LiDAR sees, drawn 1.0 m tall so the depth rays can clear cells in front of them);
DEPTHSIM_REMOVE_AFTER s: remove the box once the robot has stood still that long within
DEPTHSIM_REMOVE_WITHIN m (default 2.5) of it;
DEPTHSIM_OUT: JSON summary (closest footprint-box gap, stops, removal), rewritten every second.
"""
import json, math, os, time
import numpy as np
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import TransformStamped
from sensor_msgs.msg import PointCloud2, PointField
from tf2_ros import Buffer, StaticTransformBroadcaster, TransformListener

CAM = (0.394, 0.0, 0.2728)
FP = (0.4011, 0.2814)                  # footprint half length / half width
HFOV, VFOV, RMIN, RMAX = math.radians(29), math.radians(22.5), 0.6, 8.0


def surface_box(x0, y0, x1, y1, h, s=0.02):
    pts = []
    for x in np.arange(x0, x1 + 1e-9, s):
        for z in np.arange(0.0, h + 1e-9, s):
            pts += [(x, y0, z), (x, y1, z)]
    for y in np.arange(y0, y1 + 1e-9, s):
        for z in np.arange(0.0, h + 1e-9, s):
            pts += [(x0, y, z), (x1, y, z)]
        for x in np.arange(x0, x1 + 1e-9, s):
            pts.append((x, y, h))
    return np.array(pts)


def surface_post(cx, cy, r, h=1.0, s=0.03):
    a = np.arange(0, 2 * math.pi, s / r)
    z = np.arange(0.0, h + 1e-9, s)
    A, Z = np.meshgrid(a, z)
    return np.stack([cx + r * np.cos(A).ravel(), cy + r * np.sin(A).ravel(), Z.ravel()], axis=1)


def box_gap(pose, box):
    """Smallest distance between the footprint rectangle and the box rectangle (0 = touching)."""
    x, y, th = pose
    c, s = math.cos(th), math.sin(th)
    fp = [(x + c * dx - s * dy, y + s * dx + c * dy) for dx, dy in
          ((FP[0], FP[1]), (-FP[0], FP[1]), (-FP[0], -FP[1]), (FP[0], -FP[1]))]
    x0, y0, x1, y1 = box[:4]
    bx = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    def seg_d(p, a, b):
        ax, ay = a; vx, vy = b[0] - ax, b[1] - ay
        u = max(0.0, min(1.0, ((p[0] - ax) * vx + (p[1] - ay) * vy) / (vx * vx + vy * vy)))
        return math.hypot(p[0] - ax - u * vx, p[1] - ay - u * vy)

    def inside(p, poly):
        sign = None
        for a, b in zip(poly, poly[1:] + poly[:1]):
            cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
            if sign is None:
                sign = cr > 0
            elif (cr > 0) != sign:
                return False
        return True

    if any(inside(p, bx) for p in fp) or any(inside(p, fp) for p in bx):
        return 0.0
    return min(min(seg_d(p, a, b) for p in fp for a, b in zip(bx, bx[1:] + bx[:1])),
               min(seg_d(p, a, b) for p in bx for a, b in zip(fp, fp[1:] + fp[:1])))


class DepthSim(Node):
    def __init__(self):
        super().__init__('depthsim')
        spec = os.environ.get('DEPTHSIM_BOX', '')
        self.box = [float(v) for v in spec.split(',')] if spec else None
        self.posts = [tuple(float(v) for v in p.split(',')) for p in filter(None, os.environ.get('DEPTHSIM_POSTS', '').split(';'))]
        self.remove_after = float(os.environ.get('DEPTHSIM_REMOVE_AFTER', '0') or 0)
        self.remove_within = float(os.environ.get('DEPTHSIM_REMOVE_WITHIN', '2.5'))
        self.out = os.environ.get('DEPTHSIM_OUT')
        self.box_pts = surface_box(*self.box) if self.box else np.zeros((0, 3))
        self.post_pts = np.concatenate([surface_post(*p) for p in self.posts]) if self.posts else np.zeros((0, 3))
        self.tfb = Buffer(); TransformListener(self.tfb, self)
        t = TransformStamped(); t.header.frame_id, t.child_frame_id = 'base_footprint', 'sim_camera_optical'
        t.transform.translation.x, t.transform.translation.y, t.transform.translation.z = CAM
        t.transform.rotation.x, t.transform.rotation.y, t.transform.rotation.z, t.transform.rotation.w = -0.5, 0.5, -0.5, 0.5
        self.stb = StaticTransformBroadcaster(self); self.stb.sendTransform(t)
        self.pub = self.create_publisher(PointCloud2, '/robot_01/camera/depth/points', 5)
        self.S = dict(min_gap=None, min_gap_pose=None, removed_at=None, stops=[], moving=True,
                      still_since=None, t0=time.time(), last_pose=None, path=[])
        self.create_timer(1 / 15, self.tick)
        self.create_timer(1.0, self.dump)

    def pose(self):
        try:
            t = self.tfb.lookup_transform('odom', 'base_footprint', rclpy.time.Time())
        except Exception:
            return None
        q = t.transform.rotation
        return (t.transform.translation.x, t.transform.translation.y,
                math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)))

    def tick(self):
        p = self.pose()
        if p is None:
            return
        now = time.time() - self.S['t0']
        if self.box:
            gap = box_gap(p, self.box)
            if self.S['min_gap'] is None or gap < self.S['min_gap']:
                self.S['min_gap'], self.S['min_gap_pose'] = round(gap, 3), [round(v, 3) for v in p]
            lp = self.S['last_pose']
            v = math.hypot(p[0] - lp[0], p[1] - lp[1]) * 15 if lp else 0.0
            if v < 0.01:
                if self.S['still_since'] is None:
                    self.S['still_since'] = now
                    if gap < self.remove_within:
                        self.S['stops'].append({'t': round(now, 1), 'gap': round(gap, 3)})
                if self.remove_after and gap < self.remove_within and now - self.S['still_since'] >= self.remove_after:
                    self.get_logger().info(f'removing the box at t={now:.1f} s, gap {gap:.2f} m')
                    self.S['removed_at'] = round(now, 1); self.box = None; self.box_pts = np.zeros((0, 3))
            else:
                self.S['still_since'] = None
        self.S['last_pose'] = p
        if not self.S['path'] or math.hypot(p[0] - self.S['path'][-1][0], p[1] - self.S['path'][-1][1]) > 0.05:
            self.S['path'].append([round(v, 3) for v in p])
        pts = np.concatenate([self.box_pts, self.post_pts]) if len(self.box_pts) or len(self.post_pts) else None
        cloud = PointCloud2(); cloud.header.stamp = self.get_clock().now().to_msg(); cloud.header.frame_id = 'sim_camera_optical'
        cloud.height = 1; cloud.fields = [PointField(name=k, offset=4 * i, datatype=7, count=1) for i, k in enumerate('xyz')]
        cloud.point_step, cloud.is_dense = 12, True
        data = b''
        if pts is not None:
            c, s = math.cos(p[2]), math.sin(p[2])
            cx, cy = p[0] + c * CAM[0], p[1] + s * CAM[0]
            dx, dy, dz = pts[:, 0] - cx, pts[:, 1] - cy, pts[:, 2] - CAM[2]
            fx, fy = c * dx + s * dy, -s * dx + c * dy          # camera body frame: x ahead, y left, z up
            rng = np.sqrt(fx * fx + fy * fy + dz * dz)
            # the Astra's 0.6 m is depth along the optical axis, not the 3D distance: a low box 0.55 m
            # ahead returns nothing even though its top is farther than 0.6 m from the lens
            ok = (fx >= RMIN) & (np.abs(np.arctan2(fy, fx)) <= HFOV) & (np.abs(np.arctan2(dz, fx)) <= VFOV) & (rng <= RMAX)
            sel = np.stack([-fy[ok], -dz[ok], fx[ok]], axis=1).astype('<f4')   # optical: x right, y down, z ahead
            data = sel.tobytes()
        cloud.width = len(data) // 12; cloud.row_step = len(data); cloud.data = data
        self.pub.publish(cloud)

    def dump(self):
        if self.out:
            keep = {k: v for k, v in self.S.items() if k not in ('last_pose', 'still_since', 't0', 'moving')}
            json.dump(keep, open(self.out, 'w'))


def main():
    rclpy.init(); n = DepthSim()
    try:
        rclpy.spin(n)
    except KeyboardInterrupt:
        pass
    finally:
        n.dump()


if __name__ == '__main__':
    main()
