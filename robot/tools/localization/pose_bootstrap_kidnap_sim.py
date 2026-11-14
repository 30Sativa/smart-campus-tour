#!/usr/bin/env python3
"""Virtual kidnapped-robot sweep for pose_bootstrap on a real map (offline, no ROS).

Places a virtual robot at random free poses inside the map's global-search regions (ground truth
known), ray-casts a noisy 360-degree scan from the map with random person-sized occluders and
dropouts, plants a saved pose 1.5-3 m away (robot pushed while off) and runs the same search as the
node. Counts LOCALIZED-correct, AMBIGUOUS/NO_MATCH (asks for a manual pose: safe) and
LOCALIZED-WRONG (the dangerous outcome). The map is a perfect model of the world here, so real scans
(glass, furniture changes) are harder: treat the result as an upper bound on accuracy and a
map-geometry check of where look-alike places exist.

  pose_bootstrap_kidnap_sim.py MAP_YAML [--n 120] [--seed 1] [--people 3]
"""
import argparse, math, os, sys, time
import numpy as np
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'ros2_ws', 'src', 'robot_navigation'))
from robot_navigation.pose_bootstrap_config import default_config_path, load_config  # noqa: E402
from robot_navigation.pose_bootstrap_core import LikelihoodField, Pose2D, beams_in_base, locate  # noqa: E402


def read_pgm(path):
    b = open(path, 'rb').read(); toks, i = [], 0
    while len(toks) < 4:
        while b[i:i + 1].isspace(): i += 1
        if b[i:i + 1] == b'#':
            while b[i:i + 1] != b'\n': i += 1
            continue
        j = i
        while not b[j:j + 1].isspace(): j += 1
        toks.append(b[i:j]); i = j
    w, h = int(toks[1]), int(toks[2])
    return np.frombuffer(b[i + 1:i + 1 + w * h], np.uint8).reshape(h, w)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('map_yaml'); ap.add_argument('--n', type=int, default=120)
    ap.add_argument('--seed', type=int, default=1); ap.add_argument('--people', type=int, default=3)
    a = ap.parse_args(); rng = np.random.default_rng(a.seed)
    meta = yaml.safe_load(open(a.map_yaml)); res = float(meta['resolution']); ox, oy = meta['origin'][:2]
    img = read_pgm(os.path.join(os.path.dirname(a.map_yaml), meta['image']))[::-1]       # row 0 = origin row
    occ_t, free_t = float(meta.get('occupied_thresh', 0.65)), float(meta.get('free_thresh', 0.196))
    p = (255 - img.astype(float)) / 255.0 if not meta.get('negate', 0) else img / 255.0
    grid = np.full(img.shape, -1, np.int16); grid[p > occ_t] = 100; grid[p < free_t] = 0
    homes, use_saved, use_global, cfg = load_config(default_config_path(a.map_yaml), a.map_yaml)
    field = LikelihoodField(grid, res, ox, oy, cfg)
    occ = grid >= 65; H, W = grid.shape
    jj, ii = np.nonzero(field.free_clear)
    px, py = ox + (ii + 0.5) * res, oy + (jj + 0.5) * res
    keep = np.zeros(len(px), bool)
    for x0, y0, x1, y1 in cfg.regions: keep |= (px >= x0) & (px <= x1) & (py >= y0) & (py <= y1)
    px, py = px[keep], py[keep]
    steps = np.arange(0.05, 12.0, 0.02); angs = -math.pi + np.arange(720) * (2 * math.pi / 720)
    out = dict(correct=0, wrong=0, ambiguous=0, nomatch=0); wrongs = []; times = []
    for k in range(a.n):
        idx = rng.integers(len(px)); truth = Pose2D(float(px[idx]), float(py[idx]), float(rng.uniform(-math.pi, math.pi)))
        # occluders: people (0.4 m discs) at 0.6-3 m
        people = [(truth.x + d * math.cos(t), truth.y + d * math.sin(t)) for d, t in
                  zip(rng.uniform(0.6, 3.0, a.people), rng.uniform(-math.pi, math.pi, a.people))][:rng.integers(0, a.people + 1)]
        th = truth.yaw + angs
        X = truth.x + steps[None, :] * np.cos(th)[:, None]; Y = truth.y + steps[None, :] * np.sin(th)[:, None]
        I = ((X - ox) / res).astype(int); J = ((Y - oy) / res).astype(int)
        ok = (I >= 0) & (I < W) & (J >= 0) & (J < H)
        hit = np.zeros(X.shape, bool); hit[ok] = occ[J[ok], I[ok]]
        for qx, qy in people: hit |= (X - qx) ** 2 + (Y - qy) ** 2 < 0.2 ** 2
        first = np.where(hit.any(1), hit.argmax(1), -1)
        r = np.where(first >= 0, steps[np.clip(first, 0, None)], np.inf) + rng.normal(0, 0.02, len(angs))
        r[rng.random(len(r)) < 0.1] = np.inf                                   # dropouts
        scans = [beams_in_base(r, -math.pi, 2 * math.pi / 720, 0.15, 25.0, (0.0, 0.0, 0.0))]
        d, t = rng.uniform(1.5, 3.0), rng.uniform(-math.pi, math.pi)
        saved = Pose2D(truth.x + d * math.cos(t), truth.y + d * math.sin(t), truth.yaw + rng.normal(0, 0.3))
        t0 = time.monotonic(); res_ = locate(field, scans, [('saved', saved)] + homes, cfg, use_global); times.append(time.monotonic() - t0)
        if res_.status == 'VERIFIED':
            good = res_.pose.dist(truth) <= 0.3 and res_.pose.dyaw(truth) <= math.radians(5)
            out['correct' if good else 'wrong'] += 1
            if not good:
                wrongs.append((round(truth.x, 1), round(truth.y, 1), round(res_.pose.dist(truth), 2),
                               round(math.degrees(res_.pose.dyaw(truth)), 1), res_.source, round(res_.score, 2), round(res_.runner_up, 2)))
        else:
            out['ambiguous' if res_.status == 'AMBIGUOUS' else 'nomatch'] += 1
    n = sum(out.values())
    print(f'n={n}: LOCALIZED correct {out["correct"]} ({100*out["correct"]/n:.0f}%), LOCALIZED WRONG {out["wrong"]} '
          f'({100*out["wrong"]/n:.1f}%), ambiguous {out["ambiguous"]}, no match {out["nomatch"]}; '
          f'time median {np.median(times):.1f} s max {max(times):.1f} s')
    for w in wrongs:
        print('  WRONG at truth', w[:2], f'err {w[2]} m {w[3]} deg via {w[4]} score {w[5]} vs {w[6]}')


if __name__ == '__main__':
    main()
