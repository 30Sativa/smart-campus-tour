#!/usr/bin/env python3
"""Offline check of pose_bootstrap on a recorded nav bag (read-only).

The bag's live AMCL pose is the reference (not ground truth). For scans along the run:
  global   global search alone: VERIFIED near AMCL / AMBIGUOUS / NO_MATCH / VERIFIED FAR (the
           dangerous case: confident and wrong).
  start    at the first scans (robot parked at START): candidates = configured homes.
  moved    same scans, but the only candidate is START shifted by --moved m (robot pushed while off).
Run inside the robot ROS environment:  python3 pose_bootstrap_eval.py BAG [--every 5]
"""
import argparse, bisect, math, os, sqlite3, sys, time
import numpy as np
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'ros2_ws', 'src', 'robot_navigation'))
from robot_navigation.pose_bootstrap_core import (LikelihoodField, Pose2D, SearchConfig, beams_in_base,  # noqa: E402
                                                  locate)

yawq = lambda q: math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
st = lambda h: h.stamp.sec + h.stamp.nanosec * 1e-9


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('bag'); ap.add_argument('--every', type=float, default=5.0)
    ap.add_argument('--moved', type=float, default=2.0)
    ap.add_argument('--home', action='append', default=[], help='name=x,y,yaw (map frame)')
    ap.add_argument('--region', action='append', default=[], help='xmin,ymin,xmax,ymax')
    a = ap.parse_args()
    con = sqlite3.connect(a.bag); top = {r[1]: (r[0], r[2]) for r in con.execute('select id,name,type from topics')}

    def rows(name):
        tid, typ = top[name]; cls = get_message(typ)
        return [(ts / 1e9, deserialize_message(d, cls)) for ts, d in con.execute('select timestamp,data from messages where topic_id=? order by timestamp', (tid,))]
    mp = rows('/robot_01/map')[0][1]
    grid = np.array(mp.data, np.int16).reshape(mp.info.height, mp.info.width)
    cfg = SearchConfig(regions=tuple(tuple(map(float, r.split(','))) for r in a.region))
    t0 = time.monotonic(); field = LikelihoodField(grid, mp.info.resolution, mp.info.origin.position.x, mp.info.origin.position.y, cfg)
    print(f'likelihood field {grid.shape} built in {time.monotonic() - t0:.1f} s; free cells with clearance: {int(field.free_clear.sum())}')
    st_ = {}
    for _, m in rows('/tf_static'):
        for t in m.transforms: st_[t.child_frame_id] = t.transform
    bl, ll = st_['base_link'], st_['lidar_link']
    by0 = yawq(bl.rotation)
    laser = (bl.translation.x + math.cos(by0) * ll.translation.x - math.sin(by0) * ll.translation.y,
             bl.translation.y + math.sin(by0) * ll.translation.x + math.cos(by0) * ll.translation.y, by0 + yawq(ll.rotation))
    amcl = [(st(m.header), Pose2D(m.pose.pose.position.x, m.pose.pose.position.y, yawq(m.pose.pose.orientation))) for _, m in rows('/robot_01/amcl_pose')]
    at = [x[0] for x in amcl]
    scans = rows('/robot_01/scan')
    homes = [(h.split('=')[0], Pose2D(*map(float, h.split('=')[1].split(',')))) for h in a.home]

    def scan_pts(s):
        return beams_in_base(s.ranges, s.angle_min, s.angle_increment, s.range_min, s.range_max, laser)

    def ref(t):
        i = bisect.bisect_right(at, t) - 1
        return amcl[i][1] if i >= 0 and t - at[i] < 3.0 else None

    def show(tag, res, r):
        far = res.pose and r and (res.pose.dist(r) > 0.3 or res.pose.dyaw(r) > math.radians(5))
        where = f'({res.pose.x:.2f},{res.pose.y:.2f},{math.degrees(res.pose.yaw):.0f}°)' if res.pose else '-'
        err = f' err {res.pose.dist(r):.2f} m {math.degrees(res.pose.dyaw(r)):.1f}°' if res.pose and r else ''
        print(f'  {tag}: {res.status}{" FAR" if far and res.status == "VERIFIED" else ""} {where} score {res.score:.2f} vs {res.runner_up:.2f} [{res.source}]{err}')
        return far

    # robot parked at START: first 3 scans
    first = [scan_pts(s) for _, s in scans[:3]]; r0 = ref(st(scans[0][1].header)) or amcl[0][1]
    print(f'reference at start (AMCL): ({r0.x:.2f},{r0.y:.2f},{math.degrees(r0.yaw):.0f}°)')
    if homes:
        t1 = time.monotonic(); res = locate(field, first, homes, cfg, use_global=False); show(f'start, homes only ({time.monotonic() - t1:.1f} s)', res, r0)
    for name, h in homes[:1]:
        moved = [(f'{name}+{a.moved}m', Pose2D(h.x + a.moved, h.y, h.yaw))]
        t1 = time.monotonic(); res = locate(field, first, moved, cfg, use_global=False); show(f'moved {a.moved} m, no global ({time.monotonic() - t1:.1f} s)', res, r0)
        t1 = time.monotonic(); res = locate(field, first, moved, cfg, use_global=True); show(f'moved {a.moved} m, global   ({time.monotonic() - t1:.1f} s)', res, r0)
    # global search along the run (moving robot: single scan, conservative)
    counts = dict(ok=0, far=0, amb=0, nomatch=0); last = -1e9; times = []
    print('global search along the run:')
    for ts, s in scans:
        t = st(s.header)
        if t - last < a.every: continue
        last = t; r = ref(t)
        if r is None: continue
        t1 = time.monotonic(); res = locate(field, [scan_pts(s)], [], cfg, use_global=True); times.append(time.monotonic() - t1)
        far = show(f't+{t - st(scans[0][1].header):5.1f}s ref ({r.x:.1f},{r.y:.1f})', res, r)
        if res.status == 'VERIFIED': counts['far' if far else 'ok'] += 1
        elif res.status == 'AMBIGUOUS': counts['amb'] += 1
        else: counts['nomatch'] += 1
    n = sum(counts.values())
    print(f'SUMMARY n={n}: verified-near {counts["ok"]}, VERIFIED-FAR {counts["far"]}, ambiguous {counts["amb"]}, no-match {counts["nomatch"]}; '
          f'global search time median {np.median(times):.1f} s max {max(times):.1f} s')


if __name__ == '__main__':
    main()
