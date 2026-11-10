"""Synthetic checks for wall_yaw.py: a wall seen by a LiDAR with a known mount must give that mount back."""
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def scene(mount_deg, side, wall_cm, skew_deg, noise=0.01, n=60):
    """Robot at the origin; the wall is a line at signed distance wall_cm, turned skew_deg in the base frame."""
    mount, skew = math.radians(mount_deg), math.radians(skew_deg)
    s = 1.0 if side == 'left' else -1.0
    nb = skew + s * math.pi / 2                         # wall normal in the base frame
    inc = math.radians(0.2)
    a = -math.pi + np.arange(1800) * inc
    g = np.random.default_rng(0)
    out = []
    for _ in range(n):
        rays = a + mount                                # beam direction in the base frame
        cosang = np.cos(rays - nb)
        r = np.where(cosang > 0.05, (wall_cm / 100.0) / np.maximum(cosang, 1e-6), np.inf)
        r = r + g.normal(0, noise, r.size)
        r[(r > 8) | (r < 0.15)] = np.inf
        out.append(r)
    f = tempfile.NamedTemporaryFile(suffix='.npz', delete=False)
    np.savez_compressed(f.name, ranges=np.array(out), meta=json.dumps(dict(angle_min=-math.pi, inc=inc)))
    # front/rear tape distances 0.5 m apart along x
    L = 0.5
    front = wall_cm + s * 100 * (L / 2) * math.sin(skew)   # distance from (x, 0) to the wall
    rear = wall_cm - s * 100 * (L / 2) * math.sin(skew)
    return f.name, front, rear, L


def run(path, side, front, rear, L, prior=-181.0):
    out = subprocess.run([sys.executable, os.path.join(HERE, 'wall_yaw.py'), path, '--side', side, '--front-cm', str(front),
                          '--rear-cm', str(rear), '--baseline-m', str(L), '--prior-deg', str(prior)],
                         capture_output=True, text=True, check=True).stdout
    line = next(x for x in out.splitlines() if x.startswith('MOUNT YAW'))
    return float(line.split()[2])


def check(mount, side, skew):
    p, f, r, L = scene(mount, side, 120, skew)
    got = run(p, side, f, r, L, prior=mount + 4.0)     # prior only places the window
    err = (got - mount + 180) % 360 - 180
    assert abs(err) < 0.3, (mount, side, skew, got)
    os.unlink(p)


def test_recovers_mount_near_180_right_wall_square():
    check(-181.0, 'right', 0.0)


def test_recovers_mount_near_180_left_wall_skewed():
    check(-181.0, 'left', 2.0)


def test_recovers_small_mount_right_wall_skewed():
    check(-4.8, 'right', -3.0)


def test_sign_of_tape_skew_matters():
    p, f, r, L = scene(-181.0, 'right', 120, 2.0)
    got = run(p, 'right', r, f, L)                      # front/rear swapped -> off by about 2 x skew
    assert abs(((got + 181.0 + 180) % 360 - 180)) > 3.0
    os.unlink(p)
