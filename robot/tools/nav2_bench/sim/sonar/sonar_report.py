"""Summarise one sonar sim run (or several): sonar_report.py RUN_DIR [RUN_DIR ...] [--json]

Separates the four things the scenarios are meant to tell apart:
  result     Nav2's own end of the goal (SUCCEEDED / ABORTED / CANCELED) or HUNG
  failures   FollowPath failures and their cause (RPP collision, progress, patience)
  recovery   BT recoveries that ran (costmap clears, Spin, Wait)
  guard      velocity scaled by the sonar collision_monitor (no goal change)
and the physical outcome: smallest footprint clearance to each obstacle class.
"""
import json
import os
import re
import sys

import numpy as np

EVENTS = {
    'rpp_collision': r'detected collision ahead',
    'patience': r'Controller patience exceeded',
    'no_progress': r'Failed to make progress',
    'clear_local': r'clear entirely the local_costmap|Received request to clear entirely the local',
    'spin': r'Running spin',
    'wait': r'Running wait',
    'rsl_timeout': r'No range readings received',
    'cm_approach': r'Robot to approach',
    'cm_source_stale': r'Ignoring the source',
    'memory_hold': r'holding that arc in odom',
}


def summarise(run):
    out = {'run': os.path.basename(run.rstrip('/'))}
    try:
        g = json.load(open(os.path.join(run, 'goal.json')))
        out['result'], out['t_goal'] = g.get('status'), round(g.get('t', float('nan')), 1)
    except (OSError, ValueError):
        out['result'], out['t_goal'] = 'NO_RESULT', float('nan')
    log_path = os.path.join(run, 'nav.log')
    log = open(log_path, errors='ignore').read() if os.path.exists(log_path) else ''
    for k, rx in EVENTS.items():
        out[k] = len(re.findall(rx, log))
    sp = os.path.join(run, 'sonar.npy')
    if os.path.exists(sp):
        a = np.load(sp)
        tg = a[:, 17]
        a = a[~np.isnan(tg)]
        if len(a):
            for i, k in ((4, 'clear_low'), (5, 'clear_tall'), (6, 'clear_wall')):
                v = a[:, i]
                out[k] = round(float(v.min()), 3) if np.isfinite(v).any() else None
            out['t_in_collision_low'] = round(float(np.sum(a[:, 4] < 0) * 0.05), 2)
            vc, wc, vg, wg = a[:, 11], a[:, 12], a[:, 13], a[:, 14]
            moving = (np.abs(vc) > 0.01) | (np.abs(wc) > 0.01)
            have = ~np.isnan(vg)
            scaled = moving & have & ((np.abs(vg) < 0.95 * np.abs(vc) - 1e-3) | (np.abs(wg) < 0.95 * np.abs(wc) - 1e-3))
            out['guard_scaled_s'] = round(float(scaled.sum() * 0.05), 1)
            out['guard_stop_s'] = round(float((scaled & (np.abs(vg) < 0.005) & (np.abs(wg) < 0.005)).sum() * 0.05), 1)
            d = np.hypot(np.diff(a[:, 1]), np.diff(a[:, 2]))
            out['path_m'] = round(float(d.sum()), 2)
            out['end_xy'] = [round(float(a[-1, 1]), 2), round(float(a[-1, 2]), 2)]
    return out


def main(argv):
    runs = [r for r in argv if not r.startswith('--')]
    rows = [summarise(r) for r in runs]
    if '--json' in argv:
        print(json.dumps(rows, indent=1))
        return
    keys = ['result', 't_goal', 'rpp_collision', 'patience', 'no_progress', 'clear_local', 'spin', 'wait',
            'rsl_timeout', 'cm_approach', 'cm_source_stale', 'guard_scaled_s', 'guard_stop_s', 'memory_hold',
            'clear_low', 'clear_tall',
            'clear_wall', 't_in_collision_low', 'path_m']
    for r in rows:
        print(r['run'] + ': ' + ', '.join(f'{k}={r.get(k)}' for k in keys if k in r))


if __name__ == '__main__':
    main(sys.argv[1:])
