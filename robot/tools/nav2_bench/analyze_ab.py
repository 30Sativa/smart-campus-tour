#!/usr/bin/env python3
"""analyze_ab.py [--ref V1] [--cand V2] SESSION_DIR... : hardware A/B evaluation (read-only).

Each SESSION_DIR is a rec_start.sh session whose name ends in _<REF> or _<CAND> (e.g. _V1, _V2)
and contains bag/ with metadata.yaml (the recorder must be closed). Uses the same metrics code as
the offline benchmark (metrics.py next to this file). Prints per-leg metrics, per-config medians
and the PASS/FAIL verdict of the acceptance criteria (ACCEPTANCE below; robot/docs/nav2-baseline-v2.md),
and writes AB_RESULT.md + AB_RESULT.json into the FIRST session directory.

Run ABBA (REF, CAND, CAND, REF) in one sitting: the two REF rounds give the run-to-run
variation that an improvement must exceed.
"""
import argparse, json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import metrics as MX  # noqa: E402

GOALS = {'POI_01': (7.76, 7.75, -1.370), 'START': (-0.319, -0.535, 0.077),
         'POI_03': (42.460, -23.038, -1.613), 'POI_01_file': (8.164, 7.965, -1.370)}
KEYS = ['time', 'act_jerk_ang_p95', 'act_acc_ang_p95', 'cmd_jerk_ang_p95', 'ang_jitter_rms', 'w_flips_per_m',
        'rot_end_wdot_max', 'rot_goal_deg', 'xtrack_p95', 'xtrack_med', 'goal_err_believed', 'goal_yaw_err_believed',
        'clear_min_believed', 'v_cruise_cv', 'mid_stops']
REF_SPLIT = {}   # reference legs grouped by session -> run-to-run variation


def known_goal(x, y):
    name, g = min(GOALS.items(), key=lambda kv: math.hypot(kv[1][0] - x, kv[1][1] - y))
    return (name, g) if math.hypot(g[0] - x, g[1] - y) < 0.5 else (None, None)


def analyze(session):
    bag = os.path.join(session, 'bag', 'bag_0.db3')
    if not os.path.exists(os.path.join(session, 'bag', 'metadata.yaml')):
        sys.exit(f'{session}: bag not closed (no metadata.yaml) - stop the recorder first')
    tr, legs = MX.load_bag(bag)
    field = MX.clearance_field([])
    rows = []
    for i, l in enumerate(legs):
        name, g = known_goal(l['goal'][0], l['goal'][1])
        if g:
            l = dict(l, goal=g)
        M = MX.leg_metrics(tr, l)
        cl = MX.clearance(dict(tr, true=tr['pose']), l['t0'], l['t1'], field)   # believed (AMCL) pose vs map
        mv = [c for c, v in cl if v > 0.05]
        M['clear_min_believed'] = float(min(mv)) if mv else float('nan')
        rows.append(dict(leg=i + 1, goal=name, status=l['status'], **{k: M.get(k) for k in KEYS}))
    return rows


def med(rows, k, f=np.median):
    v = [r[k] for r in rows if r.get(k) is not None and np.isfinite(r[k])]
    return float(f(v)) if v else float('nan')


def selfvar(k):
    g = [med(rows, k) for rows in REF_SPLIT.values()]
    return float(abs(g[0] - g[-1])) if len(g) >= 2 else float('nan')


def rel(a, b, k, fac):
    va, vb = med(a, k), med(b, k); sv = selfvar(k)
    ok = vb <= fac * va and (not np.isfinite(sv) or (va - vb) > sv)
    return ok, f'cand {vb:.3f} vs ref {va:.3f} ({(vb / va - 1) * 100:+.0f} %); ref self-variation {sv:.3f} (gain must exceed it)'


def add(a, b, k, d):
    va, vb = med(a, k), med(b, k); sv = selfvar(k)
    lim = va + max(d, sv if np.isfinite(sv) else 0.0)
    return vb <= lim, f'cand {vb:.3f} vs ref {va:.3f}; allowed {lim:.3f} (max of +{d} and ref self-variation {sv:.3f})'


ACCEPTANCE = [  # (description, fn(ref_rows, cand_rows) -> (ok, detail)); thresholds: nav2-baseline-v2.md
    ('all candidate legs SUCCEEDED', lambda a, b: (all(r['status'] == 4 for r in b), f"{sum(r['status'] == 4 for r in b)}/{len(b)}")),
    ('act jerk_w p95: cand <= 0.8 x ref and gain > ref self-variation', lambda a, b: rel(a, b, 'act_jerk_ang_p95', 0.8)),
    ('w flips/m: cand <= 0.8 x ref and gain > ref self-variation', lambda a, b: rel(a, b, 'w_flips_per_m', 0.8)),
    ('rotation-end decel (max per leg, median): cand <= 1.3 rad/s^2', lambda a, b: (med(b, 'rot_end_wdot_max') <= 1.3, f"cand {med(b, 'rot_end_wdot_max'):.2f}")),
    ('xtrack p95: cand <= ref + max(0.015 m, ref self-variation)', lambda a, b: add(a, b, 'xtrack_p95', 0.015)),
    ('believed goal error: every candidate leg <= 0.15 m', lambda a, b: (all((r['goal_err_believed'] or 9) <= 0.15 for r in b),
                                                                        str([round(r['goal_err_believed'], 2) for r in b]))),
    ('goal yaw error: every candidate leg <= 17 deg', lambda a, b: (all((r['goal_yaw_err_believed'] or 99) <= 17.2 for r in b),
                                                                    str([round(r['goal_yaw_err_believed'], 1) for r in b]))),
    ('min clearance (believed pose vs map): cand >= ref - 0.05 m', lambda a, b: (med(b, 'clear_min_believed', min) >= med(a, 'clear_min_believed', min) - 0.05,
                                                                                 f"cand {med(b, 'clear_min_believed', min):.2f} vs ref {med(a, 'clear_min_believed', min):.2f}")),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--ref', default='V1'); ap.add_argument('--cand', default='V2'); ap.add_argument('sessions', nargs='+')
    a = ap.parse_args()
    sess = [s.rstrip('/') for s in a.sessions]
    by = {a.ref: [], a.cand: []}; lines = []
    for s in sess:
        cfg = next((c for c in (a.ref, a.cand) if s.endswith('_' + c)), None)
        if cfg is None:
            sys.exit(f'{s}: session name must end with _{a.ref} or _{a.cand}')
        for r in analyze(s):
            r['session'] = os.path.basename(s); by[cfg].append(r)
            lines.append(f"| {os.path.basename(s)} | {cfg} | {r['leg']} {r['goal']} | {r['status']} | " +
                         ' | '.join('-' if r[k] is None or not np.isfinite(r[k]) else f'{r[k]:.3f}' for k in KEYS) + ' |')
    for r in by[a.ref]:
        REF_SPLIT.setdefault(r['session'], []).append(r)
    if len(REF_SPLIT) < 2:
        print(f'NOTE: only one {a.ref} session - no self-variation estimate; run ABBA (2 x {a.ref})', file=sys.stderr)
    if not by[a.ref] or not by[a.cand]:
        sys.exit(f'need at least one _{a.ref} and one _{a.cand} session')
    out = [f'# Hardware A/B: {a.ref} (ref) vs {a.cand} (candidate)', '',
           '| session | cfg | leg | st | ' + ' | '.join(KEYS) + ' |', '|' + '---|' * (4 + len(KEYS))] + lines
    out += ['', '## Medians', '', f'| metric | {a.ref} | {a.cand} |', '|---|---|---|']
    out += [f'| {k} | {med(by[a.ref], k):.3f} | {med(by[a.cand], k):.3f} |' for k in KEYS]
    out += ['', '## Acceptance', '']
    allok = True
    for desc, fn in ACCEPTANCE:
        ok, det = fn(by[a.ref], by[a.cand]); allok &= bool(ok)
        out.append(f"- {'PASS' if ok else 'FAIL'}  {desc}: {det}")
    out += ['', f"**VERDICT: {a.cand + ' PASSES the hardware A/B' if allok else a.cand + ' does NOT pass - keep ' + a.ref}**",
            '', 'Also check by hand: recoveries / collision-ahead in the Nav2 logs (not caused by people), session_meta.txt',
            '(params, external load) and the supervisor notes (visible jerk, overshoot at goals, wall approach).']
    txt = '\n'.join(out)
    print(txt)
    open(os.path.join(sess[0], 'AB_RESULT.md'), 'w').write(txt + '\n')
    json.dump(by, open(os.path.join(sess[0], 'AB_RESULT.json'), 'w'), indent=1, default=float)


if __name__ == '__main__':
    main()
