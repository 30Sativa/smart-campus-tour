#!/usr/bin/env python3
"""Hardware acceptance: how the robot stopped for obstacles in a recorded nav run (read-only).
robot/docs/depth-camera.md section 7. Needs a closed bag from robot record / run_route.sh.

For every stop (the controller's cmd_vel_ctrl drops from > 0.05 m/s to all-zero: the controller
publishes zero while RPP reports a collision; rotate-to-heading and goal arrivals are skipped) with an obstacle in the corridor ahead (robot frame x 0.40-1.60 m,
|y| <= 0.35 m; else beside the front, |y| <= 0.65 m, labelled "side") it prints:
  obstacle  depth-only or LiDAR (a lethal cell within 8 cm of a scan return of the last 1 s = LiDAR)
  marked    first costmap snapshot with that obstacle: time and gap (footprint front -> cell)
  zero      the stop command: latency after "marked", gap
  still     |odom v| < 0.01: latency after "zero", final gap (must stay >= 0.6 m for depth-only)
  held      seconds from the stop command until the controller drives again (v > 0.05) or the bag ends
plus the collision / patience / costmap-clear / BT-timeout lines from /rosout in that window.

  stop_check.py BAG.db3 [--ns /robot_01]
"""
import argparse, bisect, math, sqlite3, sys
import numpy as np

FRONT, X1, YW, YSIDE = 0.4011, 1.60, 0.35, 0.65


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bag')
    ap.add_argument('--ns', default='/robot_01')
    a = ap.parse_args()
    from rclpy.serialization import deserialize_message
    from rosidl_runtime_py.utilities import get_message
    con = sqlite3.connect(a.bag)
    top = {r[1]: (r[0], r[2]) for r in con.execute('select id,name,type from topics')}

    def rows(name):
        if name not in top: return []
        tid, typ = top[name]; cls = get_message(typ)
        return [(ts / 1e9, deserialize_message(d, cls)) for ts, d in
                con.execute('select timestamp,data from messages where topic_id=? order by timestamp', (tid,))]
    yawq = lambda q: math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
    st = lambda h: h.stamp.sec + h.stamp.nanosec * 1e-9
    comp = lambda A, B: (A[0] + math.cos(A[2]) * B[0] - math.sin(A[2]) * B[1], A[1] + math.sin(A[2]) * B[0] + math.cos(A[2]) * B[1], A[2] + B[2])
    ob = sorted((st(t.header), t.transform.translation.x, t.transform.translation.y, yawq(t.transform.rotation))
                for _, m in rows('/tf') for t in m.transforms
                if t.header.frame_id.endswith('odom') and t.child_frame_id.endswith('base_footprint'))
    obt = [v[0] for v in ob]
    pose = lambda t: ob[max(0, bisect.bisect_right(obt, t) - 1)][1:]
    static = {t.child_frame_id: (t.header.frame_id, t.transform) for _, m in rows('/tf_static') for t in m.transforms}
    lid, child = (0.0, 0.0, 0.0), 'lidar_link'
    chain = []
    while child in static:
        p, tr = static[child]; chain.append((tr.translation.x, tr.translation.y, yawq(tr.rotation))); child = p
    for s in reversed(chain): lid = comp(lid, s)
    scans = rows(a.ns + '/scan'); sct = [st(s.header) for _, s in scans]
    cm = rows(a.ns + '/local_costmap/costmap'); cmt = [t for t, _ in cm]
    cmd = rows(a.ns + '/cmd_vel_ctrl'); odo = rows(a.ns + '/odom'); odt = [t for t, _ in odo]
    logs = rows('/rosout')
    if not (ob and cm and cmd and odo):
        print('bag lacks tf / local_costmap / cmd_vel_ctrl / odom'); return 2

    def lidar_pts(t0, t1):
        out = []
        for i in range(bisect.bisect_left(sct, t0), bisect.bisect_right(sct, t1)):
            s = scans[i][1]; L = comp(pose(st(s.header)), lid)
            r = np.array(s.ranges); ang = s.angle_min + np.arange(len(r)) * s.angle_increment
            k = np.isfinite(r) & (r > 0.12) & (r < 12)
            out.append(np.stack([L[0] + r[k] * np.cos(L[2] + ang[k]), L[1] + r[k] * np.sin(L[2] + ang[k])], 1))
        return np.concatenate(out) if out else np.zeros((0, 2))

    def ahead(k, t_pose, yw=YW):
        """Lethal cells of snapshot k in the corridor ahead of the robot pose at t_pose: (gap, x, y, lidar?)."""
        g = cm[k][1]; d = np.array(g.data).reshape(g.info.height, g.info.width); jj, ii = np.nonzero(d == 100)
        X = g.info.origin.position.x + (ii + 0.5) * g.info.resolution; Y = g.info.origin.position.y + (jj + 0.5) * g.info.resolution
        px, py, th = pose(t_pose); c, s = math.cos(th), math.sin(th)
        fx, fy = c * (X - px) + s * (Y - py), -s * (X - px) + c * (Y - py)
        sel = (fx > FRONT - 0.05) & (fx < X1) & (np.abs(fy) <= yw)
        P = lidar_pts(cm[k][0] - 1.0, cm[k][0] + 0.1)
        out = []
        for x, y, f in zip(X[sel], Y[sel], fx[sel]):
            out.append((f - FRONT, x, y, bool(len(P)) and np.hypot(P[:, 0] - x, P[:, 1] - y).min() < 0.08))
        return sorted(out)

    t_bag = cmt[0]; n = 0
    for i in range(1, len(cmd)):
        t, m = cmd[i]
        if not (cmd[i - 1][1].linear.x > 0.05 and abs(m.linear.x) <= 0.01 and abs(m.angular.z) <= 0.02): continue
        if any(abs(tt - t) < 1.5 and 'Reached the goal' in m2.msg for tt, m2 in logs): continue
        k = max(0, bisect.bisect_right(cmt, t) - 1)
        cells, where = ahead(k, t), 'ahead'
        if not cells:
            cells, where = ahead(k, t, YSIDE), 'side'
        if not cells: continue                                    # a goal arrival, not an obstacle stop
        gap0, ox, oy, is_lidar = cells[0]
        # standstill
        j = bisect.bisect_left(odt, t)
        while j < len(odo) and abs(odo[j][1].twist.twist.linear.x) >= 0.01: j += 1
        t_still = odo[j][0] if j < len(odo) else None
        # held: until the next forward command
        nxt = next((tt for tt, mm in cmd[i + 1:] if mm.linear.x > 0.05), cmd[-1][0])
        # first snapshot (looking back up to 6 s) with a lethal cell within 0.10 m of that obstacle
        t_mark = gap_mark = None
        for kk in range(k, max(-1, k - 30), -1):
            hit = [c for c in ahead(kk, cm[kk][0], YSIDE) if math.hypot(c[1] - ox, c[2] - oy) < 0.10]
            if not hit: break
            t_mark, gap_mark = cm[kk][0], hit[0][0]
        ks = max(0, bisect.bisect_right(cmt, t_still) - 1) if t_still else k
        near = [c for c in ahead(ks, t_still or t, YSIDE) if math.hypot(c[1] - ox, c[2] - oy) < 0.10]
        gap_still = near[0][0] if near else None
        win = [m2.msg[:80] for tt, m2 in logs if t - 3 <= tt <= nxt + 1 and any(w in m2.msg for w in (
            'collision ahead', 'patience', 'clear entirely the local', 'Timed out while waiting', 'Running spin'))]
        n += 1
        print(f'stop {n} at {t - t_bag:6.1f} s  obstacle {where}, {"LiDAR" if is_lidar else "depth-only"}')
        if t_mark is not None:
            print(f'  marked  {t_mark - t_bag:6.1f} s  gap {gap_mark:.2f} m')
            print(f'  zero    +{t - t_mark:.2f} s after marked  gap {gap0:.2f} m')
        else:
            print(f'  zero    gap {gap0:.2f} m (obstacle already marked before the 6 s look-back)')
        if t_still and t_still <= nxt:
            print(f'  still   +{t_still - t:.2f} s after zero  final gap {gap_still if gap_still is None else round(gap_still, 2)} m'
                  + ('  BELOW 0.6 m: inside the camera blind zone' if gap_still is not None and gap_still < 0.6 and not is_lidar else ''))
        else:
            print('  still   not reached: the controller drove again first')
        print(f'  held    {nxt - t:.1f} s' + (' (until the end of the bag)' if nxt == cmd[-1][0] else ''))
        for w in sorted(set(win)): print(f'  log     {w} (x{win.count(w)})')
    if not n:
        print('no stop with an obstacle ahead in this bag')
    return 0


if __name__ == '__main__':
    sys.exit(main())
