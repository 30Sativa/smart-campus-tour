"""LiDAR mount yaw from one straight wall while the robot stands still. No motion, no map.

The robot is placed beside a straight wall and two tape distances are taken from the wall to
the robot, at the front and rear wheel hubs (or any two points on a line parallel to the
base x axis, `--baseline-m` apart). That gives the wall direction in the base frame; the scan
gives it in the LiDAR frame; the difference is the mount yaw. The wall normal (LiDAR -> wall)
fixes the full 360 deg; --prior-deg only places the scan window.

Input is an npz from static_capture.py (ranges[n_scans, n_beams] + meta json).

usage: wall_yaw.py capture.npz --side left|right --front-cm F --rear-cm R --baseline-m L
                   [--prior-deg -181 | --bearing-deg B] [--width-deg 50 --rmax 4]
"""
import argparse
import json
import math

import numpy as np


def fit_wall(ranges, angle_min, inc, bearing, width, rmax):
    r = np.nanmedian(np.where(np.isfinite(ranges) & (ranges > 0.15), ranges, np.nan), axis=0)
    a = angle_min + np.arange(r.size) * inc
    d = (a - bearing + math.pi) % (2 * math.pi) - math.pi
    ok = np.isfinite(r) & (r < rmax) & (np.abs(d) < width / 2)
    p = np.c_[r[ok] * np.cos(a[ok]), r[ok] * np.sin(a[ok])]
    if len(p) < 20:
        raise SystemExit(f'only {len(p)} wall points in the window: check --bearing-deg / --width-deg')
    keep = np.ones(len(p), bool)
    for _ in range(5):                                   # PCA line, drop points > 3 cm off it
        c = p[keep].mean(0)
        _, v = np.linalg.eigh(np.cov((p[keep] - c).T))
        n = v[:, 0]
        res = (p - c) @ n
        keep = np.abs(res) < 0.03
    if (c @ n) < 0:
        n = -n                                           # normal points from the LiDAR to the wall
    return math.atan2(n[1], n[0]), float(c @ n), float(np.std(res[keep])), int(keep.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('npz')
    ap.add_argument('--side', choices=('left', 'right'), required=True)
    ap.add_argument('--front-cm', type=float, required=True)
    ap.add_argument('--rear-cm', type=float, required=True)
    ap.add_argument('--baseline-m', type=float, required=True)
    ap.add_argument('--prior-deg', type=float, default=-181.0, help='rough mount yaw, only used to place the scan window')
    ap.add_argument('--bearing-deg', type=float, help='bearing of the wall in the LiDAR frame (overrides --prior-deg)')
    ap.add_argument('--width-deg', type=float, default=50.0)
    ap.add_argument('--rmax', type=float, default=4.0)
    ap.add_argument('--tape-err-cm', type=float, default=0.5)
    a = ap.parse_args()
    z = np.load(a.npz)
    m = json.loads(str(z['meta']))
    side = 1.0 if a.side == 'left' else -1.0
    # Wall direction in the base frame, then its normal from the robot towards the wall.
    phi_b = math.atan2(side * (a.front_cm - a.rear_cm) / 100.0, a.baseline_m)
    normal_b = phi_b + side * math.pi / 2
    bearing = math.radians(a.bearing_deg) if a.bearing_deg is not None else normal_b - math.radians(a.prior_deg)
    rng = np.asarray(z['ranges'], float)
    nl, dist, rms, n = fit_wall(rng, m['angle_min'], m['inc'], bearing, math.radians(a.width_deg), a.rmax)
    mount = (normal_b - nl + math.pi) % (2 * math.pi) - math.pi
    boots = []
    g = np.random.default_rng(1)
    for _ in range(100):
        boots.append(fit_wall(rng[g.integers(0, len(rng), len(rng))], m['angle_min'], m['inc'], bearing, math.radians(a.width_deg), a.rmax)[0])
    scan_sd = math.degrees(float(np.std(np.unwrap(boots))))
    tape_sd = math.degrees(math.hypot(a.tape_err_cm, a.tape_err_cm) / 100.0 / a.baseline_m)
    print(f'scans {len(rng)}  wall points {n}  line rms {1000 * rms:.1f} mm  LiDAR->wall {dist:.3f} m')
    print(f'wall in base frame {math.degrees(phi_b):+.2f} deg (tape)   wall normal in LiDAR frame {math.degrees(nl):+.2f} deg')
    print(f'MOUNT YAW {math.degrees(mount):+.2f} deg = {mount:+.4f} rad   (scan +-{scan_sd:.2f}, tape +-{tape_sd:.2f} deg, 1 sigma)')
    mean_tape = (a.front_cm + a.rear_cm) / 200.0
    print(f'consistency: LiDAR->wall {dist:.3f} m vs mean tape {mean_tape:.3f} m (differ by the LiDAR lateral offset, ~0 in URDF)')


if __name__ == '__main__':
    main()
