#!/usr/bin/env python3
"""aggregate.py cfg... : per config and scenario, median (min-max) of key metrics over legs,
plus CPU per Nav2 server and failure/recovery counts from the run logs."""
import csv, glob, json, os, re, sys
import numpy as np

B = os.path.expanduser(os.environ.get('NAV2_BENCH_OUT', '~/amr_logs/nav2_bench'))
KEYS = [  # (label, key, fmt, lower_is_better)
    ('time s', 'time', '.1f'), ('cmd acc_w p95', 'cmd_acc_ang_p95', '.3f'), ('cmd jerk_w p95', 'cmd_jerk_ang_p95', '.2f'),
    ('act acc_w p95', 'act_acc_ang_p95', '.3f'), ('act jerk_w p95', 'act_jerk_ang_p95', '.2f'),
    ('cmd acc_v p95', 'cmd_acc_lin_p95', '.3f'), ('cmd jerk_v p95', 'cmd_jerk_lin_p95', '.2f'),
    ('RPP dw p95', 'ctrl_dw_p95', '.3f'), ('ang jitter rms', 'ang_jitter_rms', '.4f'), ('w flips/m', 'w_flips_per_m', '.2f'),
    ('v cruise CV', 'v_cruise_cv', '.3f'), ('v dips', 'v_dips', '.0f'),
    ('rot start deg', 'rot_start_deg', '.0f'), ('rot mid deg', 'rot_mid_deg', '.0f'), ('rot goal deg', 'rot_goal_deg', '.0f'),
    ('rot-end wdot', 'rot_end_wdot_med', '.2f'), ('mid stops', 'mid_stops', '.0f'), ('last 0.6 m s', 'last06_s', '.1f'),
    ('plan kmax', 'plan_kappa_max', '.2f'), ('tracked kmax p95', 'trk_kappa_max_p95', '.2f'), ('tracked kdot', 'trk_kdot_p95_med', '.2f'),
    ('smooth shift max', 'smooth_shift_max', '.3f'), ('replan shift', 'replan_shift_med', '.3f'),
    ('wheel cap %', 'wheel_cap_pct', '.1f'), ('clear min m', 'clear_min_moving', '.3f'), ('clear p05 m', 'clear_p05', '.3f'), ('xtrack med', 'xtrack_med', '.3f'), ('xtrack p95', 'xtrack_p95', '.3f'),
    ('goal err true', 'goal_err_true', '.3f'), ('goal yaw true', 'goal_yaw_err_true', '.1f')]
PAT = {'spin': r'Running spin', 'wait': r'Running wait', 'progress_fail': r'Failed to make progress',
       'collision_ahead': r'detected collision ahead', 'patience': r'Controller patience exceeded',
       'ctrl_rate_miss': r'Control loop missed', 'plan_rate_miss': r'Planner loop missed',
       'smooth_fail': r'(?i)smoother.*(fail|collision|timed out)|SmoothPath.*fail', 'bridge_scale': r'NOT_A_PATTERN'}


def clearance_of(run):
    sys.path.insert(0, os.path.expanduser('~/.cache/armtc/navsim'))
    return None


def scen(tag):
    m = re.match(r'(.+)_(R\d[A-Za-z]*)_s(\d+)(_obst)?$', tag)
    return m.group(1), m.group(2) + ('obst' if m.group(4) else ''), int(m.group(3))


def main():
    cfgs = sys.argv[1:]
    rows = {}
    for run in sorted(glob.glob(os.path.join(B, 'runs', '*'))):
        tag = os.path.basename(run); cfg, sc, seed = scen(tag)
        if cfgs and cfg not in cfgs:
            continue
        mp = os.path.join(run, 'metrics.json')
        if not os.path.exists(mp):
            continue
        cpu_rows = list(csv.DictReader(open(os.path.join(run, 'cpu.csv'))))
        if any(r.get('ext_load') for r in cpu_rows):
            print(f'EXCLUDED (external load during run): {tag}', file=sys.stderr); continue
        M = json.load(open(mp)); G = json.load(open(os.path.join(run, 'goals.json')))
        log = open(os.path.join(run, 'nav.log'), errors='ignore').read()
        cnt = {k: len(re.findall(p, log)) for k, p in PAT.items()}
        cpu = list(csv.DictReader(open(os.path.join(run, 'cpu.csv'))))
        busy = [r for r in cpu if float(r['controller_server']) > 0]
        c = {k: float(np.mean([float(r[k]) for r in busy])) for k in ('controller_server', 'planner_server', 'smoother_server', 'bt_navigator', 'velocity_smoother')} if busy else {}
        c95 = {k: float(np.percentile([float(r[k]) for r in busy], 95)) for k in ('controller_server', 'planner_server', 'smoother_server')} if busy else {}
        d = rows.setdefault((cfg, sc), {'legs': [], 'runs': 0, 'ok': 0, 'goals': 0, 'cnt': {k: 0 for k in PAT}, 'cpu': [], 'cpu95': []})
        d['legs'] += M; d['runs'] += 1; d['goals'] += len(G); d['ok'] += sum(1 for g in G if g['status'] == 4)
        for k in PAT:
            d['cnt'][k] += cnt[k]
        d['cpu'].append(c); d['cpu95'].append(c95)
    out = {}
    for (cfg, sc), d in sorted(rows.items(), key=lambda x: (x[0][1], cfgs.index(x[0][0]) if x[0][0] in cfgs else 99)):
        r = {'cfg': cfg, 'scenario': sc, 'runs': d['runs'], 'goals_ok': f"{d['ok']}/{d['goals']}", 'events': d['cnt']}
        for lab, k, fm in KEYS:
            v = np.array([l.get(k, np.nan) for l in d['legs']], float); v = v[np.isfinite(v)]
            r[k] = (float(np.median(v)), float(v.min()), float(v.max())) if len(v) else None
        for k in ('controller_server', 'planner_server', 'smoother_server', 'bt_navigator', 'velocity_smoother'):
            vals = [c.get(k) for c in d['cpu'] if c]
            r['cpu_' + k] = float(np.mean(vals)) if vals else None
        for k in ('controller_server', 'planner_server', 'smoother_server'):
            vals = [c.get(k) for c in d['cpu95'] if c]
            r['cpu95_' + k] = float(np.max(vals)) if vals else None
        out[f'{cfg}|{sc}'] = r
    json.dump(out, open(os.path.join(B, 'aggregate.json'), 'w'), indent=1)
    # print a table per scenario
    for scn in sorted({k.split('|')[1] for k in out}):
        cs = [k for k in out if k.endswith('|' + scn)]
        print(f'\n=== {scn}  (median over legs; [min-max])')
        print(f'{"metric":20s}' + ''.join(f'{out[k]["cfg"]:>22s}' for k in cs))
        print(f'{"goals ok":20s}' + ''.join(f'{out[k]["goals_ok"]:>22s}' for k in cs))
        for lab, k, fm in KEYS:
            cells = []
            for c in cs:
                v = out[c].get(k)
                cells.append(f'{"-":>22s}' if v is None else f'{format(v[0], fm)} [{format(v[1], fm)}-{format(v[2], fm)}]'.rjust(22))
            print(f'{lab:20s}' + ''.join(cells))
        for ev in ('spin', 'wait', 'progress_fail', 'collision_ahead', 'ctrl_rate_miss', 'plan_rate_miss', 'smooth_fail'):
            print(f'{ev:20s}' + ''.join(f'{out[c]["events"][ev]:>22d}' for c in cs))
        for k in ('controller_server', 'planner_server', 'smoother_server', 'bt_navigator'):
            print(f'{"cpu% " + k[:14]:20s}' + ''.join(f'{(out[c]["cpu_" + k] or 0):>22.1f}' for c in cs))
        for k in ('controller_server', 'planner_server', 'smoother_server'):
            print(f'{"cpu%p95 " + k[:11]:20s}' + ''.join(f'{(out[c]["cpu95_" + k] or 0):>22.1f}' for c in cs))


if __name__ == '__main__':
    main()
