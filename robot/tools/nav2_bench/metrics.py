#!/usr/bin/env python3
"""Motion-quality metrics shared by real bags and the offline Nav2 sim (read-only).

Three layers, kept separate on purpose:
  geometry  - the global plan itself (/plan): curvature, curvature rate, kinks, replan jitter
  tracking  - how far the robot (believed pose; sim also true pose) is from the active plan
  velocity  - commanded profile after the velocity smoother (cmd_vel_nav), RPP raw output
              (cmd_vel_ctrl) and executed motion (wheel/odom twist or sim applied twist):
              accel / jerk, angular wobble, speed steadiness, in-place rotations, stops

Usage:
  metrics.py bag BAG.db3 [--name N]          # legs from navigate_to_pose status
  metrics.py sim RUN_DIR [...]               # runs produced by run.sh
"""
import json, math, os, sqlite3, sys
import numpy as np

DT = 0.05     # resample step (20 Hz)


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


# ---------------------------------------------------------------- helpers
def resample(t, v, t0, t1, hold=True):
    tt = np.arange(t0, t1, DT)
    if len(t) == 0:
        return tt, np.zeros_like(tt)
    if hold:   # zero-order hold (commands)
        i = np.clip(np.searchsorted(t, tt, 'right') - 1, 0, len(t) - 1)
        out = np.asarray(v)[i]
        out[tt < t[0]] = 0.0
        return tt, out
    return tt, np.interp(tt, t, v)


def movavg(x, n):
    if n <= 1:
        return x
    k = np.ones(n) / n
    return np.convolve(np.pad(x, (n // 2, n - 1 - n // 2), mode='edge'), k, mode='valid')


def deriv(x):
    return np.gradient(x, DT)


def p95(x):
    x = np.asarray(x)
    return float(np.percentile(np.abs(x), 95)) if len(x) else float('nan')


def path_resample(P, step=0.05):
    P = np.asarray(P, float)
    if len(P) < 2:
        return P
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    if d[-1] < step:
        return P
    s = np.arange(0, d[-1], step)
    return np.c_[np.interp(s, d, P[:, 0]), np.interp(s, d, P[:, 1])]


def geometry(P):
    """Curvature from headings over a 0.3 m chord on a 0.05 m resampled path."""
    R = path_resample(P)
    n = len(R)
    if n < 12:
        return dict(len=float(np.sum(np.hypot(*np.diff(P, axis=0).T))) if len(P) > 1 else 0.0)
    L = (n - 1) * 0.05
    k = 3                                         # 0.15 m each side
    h = np.arctan2(R[2 * k:, 1] - R[:-2 * k, 1], R[2 * k:, 0] - R[:-2 * k, 0])  # chord heading at i+k
    dh = wrap(np.diff(h))                          # per 0.05 m
    kappa = movavg(dh / 0.05, 3)
    kdot = np.diff(kappa) / 0.05
    # kinks: heading change > 30 deg within 0.5 m
    hw = np.unwrap(h); win = 10
    turn05 = np.abs(hw[win:] - hw[:-win]) if len(hw) > win else np.zeros(1)
    kinks = int(np.sum((turn05[1:-1] > math.radians(30)) & (turn05[1:-1] >= turn05[:-2]) & (turn05[1:-1] > turn05[2:])))
    return dict(len=L, turn_deg_per_m=float(np.degrees(np.sum(np.abs(dh))) / L),
                kappa_p95=p95(kappa), kappa_max=float(np.max(np.abs(kappa))),
                kdot_p95=p95(kdot), kinks=kinks)


def dist_to_path(px, py, P):
    """Distance of point to polyline P (Nx2)."""
    if len(P) < 2:
        return float('nan')
    A = P[:-1]; B = P[1:]; AB = B - A; L2 = np.maximum((AB ** 2).sum(1), 1e-12)
    t = np.clip(((px - A[:, 0]) * AB[:, 0] + (py - A[:, 1]) * AB[:, 1]) / L2, 0, 1)
    cx = A[:, 0] + t * AB[:, 0]; cy = A[:, 1] + t * AB[:, 1]
    return float(np.min(np.hypot(px - cx, py - cy)))


def episodes(mask, tt, min_s):
    out = []; start = None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        if (not m or i == len(mask) - 1) and start is not None:
            end = i if not m else i + 1
            if tt[end - 1] - tt[start] + DT >= min_s:
                out.append((start, end))
            start = None
    return out


# ---------------------------------------------------------------- per leg
def leg_metrics(tr, leg):
    t0, t1 = leg['t0'], leg['t1']
    gx, gy, gyaw = leg['goal']
    tt, nv = resample(*tr['nav'][:2], t0, t1); _, nw = resample(tr['nav'][0], tr['nav'][2], t0, t1)
    _, av = resample(tr['act'][0], tr['act'][1], t0, t1, hold=False); _, aw = resample(tr['act'][0], tr['act'][2], t0, t1, hold=False)
    pt = tr['pose'][0]
    k = (pt >= t0) & (pt <= t1 + 0.5)
    pxs, pys, pths = tr['pose'][1][k], tr['pose'][2][k], tr['pose'][3][k]; pts = pt[k]
    bx = np.interp(tt, pts, pxs); by = np.interp(tt, pts, pys)
    dgoal = np.hypot(bx - gx, by - gy)
    M = {}
    M['time'] = t1 - t0
    M['dist'] = float(np.sum(np.abs(av)) * DT)
    # --- velocity: commanded (after smoother)
    M['cmd_acc_lin_p95'] = p95(deriv(nv)); M['cmd_jerk_lin_p95'] = p95(deriv(deriv(nv)))
    M['cmd_acc_ang_p95'] = p95(deriv(nw)); M['cmd_jerk_ang_p95'] = p95(deriv(deriv(nw)))
    # executed (0.25 s moving average: stepper/odom quantisation)
    avf, awf = movavg(av, 5), movavg(aw, 5)
    M['act_acc_lin_p95'] = p95(deriv(avf)); M['act_acc_ang_p95'] = p95(deriv(awf))
    M['act_jerk_ang_p95'] = p95(deriv(deriv(movavg(aw, 9))))
    # RPP raw output chatter (before the smoother), 10 Hz messages
    ct, cv, cw = tr['ctrl']; kc = (ct >= t0) & (ct <= t1)
    M['ctrl_dw_p95'] = p95(np.diff(cw[kc])) if kc.sum() > 2 else float('nan')
    M['ctrl_dv_p95'] = p95(np.diff(cv[kc])) if kc.sum() > 2 else float('nan')
    # wobble: angular jitter around a 1 s trend while driving
    mv = nv > 0.10
    M['ang_jitter_rms'] = float(np.sqrt(np.mean((nw - movavg(nw, 21))[mv] ** 2))) if mv.any() else float('nan')
    sgn = np.sign(nw); ok = (nv > 0.05) & (np.abs(nw) > 0.03)
    idx = np.where(ok)[0]
    flips = int(np.sum(sgn[idx[1:]] * sgn[idx[:-1]] < 0)) if len(idx) > 1 else 0
    M['w_flips_per_m'] = flips / max(M['dist'], 1e-6)
    # speed steadiness while cruising straight-ish, far from goal
    cr = (nv > 0.10) & (np.abs(nw) < 0.15) & (dgoal > 1.0)
    M['v_cruise_cv'] = float(np.std(nv[cr]) / np.mean(nv[cr])) if cr.sum() > 20 else float('nan')
    dips = 0; high = False
    for i in np.where(dgoal > 1.0)[0]:
        if nv[i] > 0.17 and abs(nw[i]) < 0.15:
            high = True
        elif high and nv[i] < 0.12 and abs(nw[i]) < 0.15:
            dips += 1; high = False
    M['v_dips'] = dips
    # in-place rotations (executed): start (first 8 s), mid, goal (< 0.8 m)
    rot = (np.abs(av) < 0.03) & (np.abs(aw) > 0.08)
    ep = episodes(rot, tt, 0.5); rs = rm = rg = 0; ds = dm = dg = 0.0
    for a, b in ep:
        deg = float(np.degrees(np.sum(np.abs(aw[a:b])) * DT))
        if tt[a] - t0 < 8:
            rs += 1; ds += deg
        elif dgoal[a] < 0.8:
            rg += 1; dg += deg
        else:
            rm += 1; dm += deg
    M.update(rot_start_n=rs, rot_start_deg=ds, rot_mid_n=rm, rot_mid_deg=dm, rot_goal_n=rg, rot_goal_deg=dg)
    stop = (np.abs(av) < 0.01) & (np.abs(aw) < 0.02) & (dgoal > 0.6) & (tt > t0 + 3)
    M['mid_stops'] = len(episodes(stop, tt, 0.5))
    M['last06_s'] = float(t1 - tt[np.where(dgoal >= 0.6)[0][-1]]) if (dgoal >= 0.6).any() else float('nan')
    # --- geometry and tracking
    plans = [(tp, P) for tp, P in tr['plans'] if t0 - 0.5 <= tp <= t1]
    if plans:
        g = geometry(plans[0][1]); M.update({f'plan_{a}': b for a, b in g.items()})
        allk = [geometry(P).get('kappa_p95', np.nan) for _, P in plans[::max(1, len(plans) // 10)]]
        M['plan_kappa_p95_med_all'] = float(np.nanmedian(allk))
        # replan jitter: lateral shift of the new plan 0.5-3 m ahead vs previous plan
        sh = []
        for (ta, A), (tb, B) in zip(plans[:-1], plans[1:]):
            x0 = np.interp(tb, pts, pxs); y0 = np.interp(tb, pts, pys)
            Rb = path_resample(B, 0.1)
            if len(Rb) < 5 or len(A) < 2:
                continue
            d0 = np.hypot(Rb[:, 0] - x0, Rb[:, 1] - y0)
            s = np.r_[0, np.cumsum(np.hypot(*np.diff(Rb, axis=0).T))]
            i0 = int(np.argmin(d0)); sel = (s > s[i0] + 0.5) & (s < s[i0] + 3.0)
            if sel.sum() < 3:
                continue
            sh.append(np.mean([dist_to_path(px, py, np.asarray(A)) for px, py in Rb[sel][::3]]))
        M['replan_shift_med'] = float(np.median(sh)) if sh else float('nan')
        M['replan_shift_p95'] = float(np.percentile(sh, 95)) if sh else float('nan')
        ptimes = np.array([p[0] for p in plans])
        ct_err = []
        for i in range(0, len(tt), 4):
            if nv[i] < 0.08:
                continue
            j = np.searchsorted(ptimes, tt[i], 'right') - 1
            if j < 0:
                continue
            ct_err.append(dist_to_path(bx[i], by[i], np.asarray(plans[j][1])))
        M['xtrack_med'] = float(np.median(ct_err)) if ct_err else float('nan')
        M['xtrack_p95'] = float(np.percentile(ct_err, 95)) if ct_err else float('nan')
        M['n_plans'] = len(plans)
    if tr.get('smoothed'):
        sm = [(tp, P) for tp, P in tr['smoothed'] if t0 - 0.5 <= tp <= t1]
        if sm and plans:
            ptimes2 = np.array([p[0] for p in plans]); ks, shifts, dk = [], [], []
            for tp, S in sm[::max(1, len(sm) // 15)]:
                j = int(np.argmin(np.abs(ptimes2 - tp))); P0 = np.asarray(plans[j][1])
                gs, g0 = geometry(S), geometry(P0)
                if 'kappa_max' in gs and 'kappa_max' in g0:
                    ks.append(gs['kappa_max']); dk.append(gs['kappa_max'] - g0['kappa_max'])
                shifts.append(max(dist_to_path(x, y, P0) for x, y in path_resample(S, 0.2)))
            M['smooth_kmax_med'] = float(np.median(ks)) if ks else float('nan')
            M['smooth_dkmax_med'] = float(np.median(dk)) if dk else float('nan')
            M['smooth_shift_max'] = float(np.max(shifts)) if shifts else float('nan')
    if tr.get('recv'):
        rk = [(tp, P) for tp, P in tr['recv'] if t0 <= tp <= t1]
        ks, kd = [], []
        last = -1e9
        for tp, P in rk:
            if tp - last < 1.0:
                continue
            last = tp
            g = geometry(P)
            if 'kappa_p95' in g:
                ks.append(g['kappa_max']); kd.append(g['kdot_p95'])
        M['trk_kappa_max_p95'] = float(np.percentile(ks, 95)) if ks else float('nan')
        M['trk_kdot_p95_med'] = float(np.median(kd)) if kd else float('nan')
    # end of in-place rotations: peak executed angular decel within +-0.6 s of the episode end
    tt2, av2 = resample(tr['act'][0], tr['act'][1], t0, t1 + 2.0, hold=False)
    _, aw2 = resample(tr['act'][0], tr['act'][2], t0, t1 + 2.0, hold=False)
    wd = np.abs(deriv(movavg(aw2, 5))); ends = []
    ep2 = episodes((np.abs(av2) < 0.03) & (np.abs(aw2) > 0.08), tt2, 0.5)
    for a, b in ep2:
        lo, hi = max(0, b - 12), min(len(wd), b + 12)
        ends.append(float(np.max(wd[lo:hi])))
    M['rot_end_wdot_max'] = float(np.max(ends)) if ends else float('nan')
    M['rot_end_wdot_med'] = float(np.median(ends)) if ends else float('nan')
    if tr.get('field') is not None:
        cl = clearance(tr, t0, t1, tr['field'])
        if cl:
            a = np.array(cl)
            M['clear_min'] = float(a[:, 0].min()); M['clear_p05'] = float(np.percentile(a[:, 0], 5))
            mv_ = a[:, 1] > 0.05
            M['clear_min_moving'] = float(a[mv_, 0].min()) if mv_.any() else float('nan')
    if 'sat' in tr:
        st_, sv_ = tr['sat']; ks = (st_ >= t0) & (st_ <= t1)
        mvk = np.abs(np.interp(st_[ks], tr['act'][0], tr['act'][1])) > 0.03
        M['wheel_cap_pct'] = float(100 * np.mean(sv_[ks][mvk] < 0.999)) if mvk.any() else 0.0
    # goal accuracy (believed; sim also true)
    ie = np.searchsorted(pts, t1) - 1
    M['goal_err_believed'] = float(math.hypot(pxs[ie] - gx, pys[ie] - gy))
    M['goal_yaw_err_believed'] = abs(math.degrees(wrap(pths[ie] - gyaw)))
    if 'true' in tr:
        T = tr['true']; it = np.searchsorted(T[0], t1) - 1
        M['goal_err_true'] = float(math.hypot(T[1][it] - gx, T[2][it] - gy))
        M['goal_yaw_err_true'] = abs(math.degrees(wrap(T[3][it] - gyaw)))
    return M


# ---------------------------------------------------------------- clearance (sim: true pose vs map + injected obstacles)
_DT = None
FP_PTS = [(x, y) for x in np.linspace(-0.401, 0.401, 17) for y in np.linspace(-0.2814, 0.2814, 13)
          if abs(abs(x) - 0.401) < 1e-6 or abs(abs(y) - 0.2814) < 1e-6]


def clearance_field(obst):
    import yaml, cv2
    from PIL import Image
    mp = os.path.expanduser(os.environ.get('NAV2_BENCH_MAP', '~/smart-campus-tour/robot/robot_maps/map2.yaml')); meta = yaml.safe_load(open(mp))
    img = np.array(Image.open(os.path.join(os.path.dirname(mp), meta['image'])).convert('L'), dtype=float)
    occ = ((255.0 - img) / 255.0 > meta['occupied_thresh'])[::-1]
    res = meta['resolution']; org = meta['origin']
    if obst:
        yy, xx = np.mgrid[0:occ.shape[0], 0:occ.shape[1]]
        for ox, oy, r in obst:
            occ = occ | (np.hypot(org[0] + (xx + .5) * res - ox, org[1] + (yy + .5) * res - oy) <= r)
    dt = cv2.distanceTransform((~occ).astype(np.uint8), cv2.DIST_L2, 5) * res
    return dt, res, org


def clearance(tr, t0, t1, field):
    dt, res, org = field
    T = tr['true']; k = (T[0] >= t0) & (T[0] <= t1)
    v = np.interp(T[0][k], tr['act'][0], np.abs(tr['act'][1]))
    out = []
    for x, y, th, vv in list(zip(T[1][k], T[2][k], T[3][k], v))[::10]:
        c, s_ = math.cos(th), math.sin(th)
        d = []
        for fx, fy in FP_PTS:
            px, py = x + c * fx - s_ * fy, y + s_ * fx + c * fy
            i = int((py - org[1]) / res); j = int((px - org[0]) / res)
            d.append(dt[i, j] if 0 <= i < dt.shape[0] and 0 <= j < dt.shape[1] else 9.0)
        out.append((min(d), vv))
    return out


# ---------------------------------------------------------------- bag loader
def load_bag(bag):
    from rclpy.serialization import deserialize_message
    from rosidl_runtime_py.utilities import get_message
    c = sqlite3.connect(f'file:{bag}?mode=ro&immutable=1', uri=True)
    tid = {n: (i, ty) for i, n, ty in c.execute('select id,name,type from topics')}

    def rows(name):
        if name not in tid:
            return []
        i, ty = tid[name]; M = get_message(ty)
        return [(ts / 1e9, deserialize_message(d, M)) for ts, d in c.execute('select timestamp,data from messages where topic_id=? order by timestamp', (i,))]

    def tw(name):
        r = rows(name)
        return (np.array([a for a, _ in r]), np.array([m.linear.x for _, m in r]), np.array([m.angular.z for _, m in r]))
    yq = lambda q: math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
    tr = {'ctrl': tw('/robot_01/cmd_vel_ctrl'), 'nav': tw('/robot_01/cmd_vel_nav')}
    wo = rows('/robot_01/wheel/odom')
    tr['act'] = (np.array([a for a, _ in wo]), np.array([m.twist.twist.linear.x for _, m in wo]), np.array([m.twist.twist.angular.z for _, m in wo]))
    od = rows('/robot_01/odom')
    ot = np.array([a for a, _ in od]); ox = np.array([m.pose.pose.position.x for _, m in od]); oy = np.array([m.pose.pose.position.y for _, m in od])
    oth = np.unwrap([yq(m.pose.pose.orientation) for _, m in od])
    mo = []
    for ts, m in rows('/tf'):
        for x in m.transforms:
            if x.header.frame_id == 'map' and x.child_frame_id == 'odom':
                mo.append((ts, x.transform.translation.x, x.transform.translation.y, yq(x.transform.rotation)))
    mo = np.array(mo)
    j = np.clip(np.searchsorted(mo[:, 0], ot) - 1, 0, len(mo) - 1)
    c_, s_ = np.cos(mo[j, 3]), np.sin(mo[j, 3])
    tr['pose'] = (ot, mo[j, 1] + c_ * ox - s_ * oy, mo[j, 2] + s_ * ox + c_ * oy, oth + mo[j, 3])
    tr['plans'] = [(ts, np.array([[p.pose.position.x, p.pose.position.y] for p in m.poses])) for ts, m in rows('/robot_01/plan') if len(m.poses) > 1]
    # legs from action status
    st = {}
    for ts, m in rows('/robot_01/navigate_to_pose/_action/status'):
        for s in m.status_list:
            gid = bytes(s.goal_info.goal_id.uuid).hex()
            e = st.setdefault(gid, {'t0': s.goal_info.stamp.sec + s.goal_info.stamp.nanosec * 1e-9})
            if s.status in (4, 5, 6):
                e.setdefault('t1', ts); e.setdefault('status', int(s.status))
    legs = []
    for e in sorted(st.values(), key=lambda e: e['t0']):
        if 't1' not in e or e['t1'] - e['t0'] < 5:
            continue
        pl = [P for tp, P in tr['plans'] if e['t0'] <= tp <= e['t1']]
        if not pl:
            continue
        # goal yaw unknown from status: use final heading of the robot at leg end
        ie = np.searchsorted(tr['pose'][0], e['t1']) - 1
        legs.append(dict(t0=e['t0'], t1=e['t1'], status=e['status'], goal=(pl[-1][-1, 0], pl[-1][-1, 1], float(tr['pose'][3][ie]))))
    return tr, legs


# ---------------------------------------------------------------- sim loader
def load_sim(run):
    L = np.load(os.path.join(run, 'bot.npy'))      # t x y th bx by bth v w sc navv navw ctrlv ctrlw
    G = json.load(open(os.path.join(run, 'goals.json')))
    P = np.load(os.path.join(run, 'plans.npz'), allow_pickle=True)
    sat_t, sat_v = L[:, 0], L[:, 9]
    tr = {'sat': (sat_t, sat_v), 'act': (L[:, 0], L[:, 7], L[:, 8]), 'nav': (L[:, 0], L[:, 10], L[:, 11]), 'ctrl': (L[:, 0], L[:, 12], L[:, 13]),
          'pose': (L[:, 0], L[:, 4], L[:, 5], np.unwrap(L[:, 6])), 'true': (L[:, 0], L[:, 1], L[:, 2], np.unwrap(L[:, 3])),
          'plans': list(zip(P['t'], P['paths']))}
    sp = os.path.join(run, 'plans_smoothed.npz')
    if os.path.exists(sp):
        S = np.load(sp, allow_pickle=True)
        if len(S['t']): tr['smoothed'] = list(zip(S['t'], S['paths']))
    rp = os.path.join(run, 'plans_received.npz')
    if os.path.exists(rp):
        R = np.load(rp, allow_pickle=True); tr['recv'] = list(zip(R['t'], R['paths']))
    # ctrl in the sim log is sampled at 50 Hz (held): keep only changes for the 10 Hz chatter metric
    ct, cv, cw = tr['ctrl']; ch = np.r_[True, (np.diff(cv) != 0) | (np.diff(cw) != 0)]
    tr['ctrl'] = (ct[ch], cv[ch], cw[ch])
    obst = []
    of = os.path.join(run, 'obst.txt')
    spec = open(of).read().strip() if os.path.exists(of) else ('7.0,2.7,0.25' if run.rstrip('/').endswith('_obst') else '')
    for sp in filter(None, spec.split(';')):
        obst.append(tuple(float(v) for v in sp.split(',')))
    tr['field'] = clearance_field(obst)
    legs = [dict(t0=g['t0'], t1=g['t1'], status=g['status'], goal=tuple(g['goal'])) for g in G if 't1' in g]
    return tr, legs, G


def main():
    if sys.argv[1] == 'bag':
        tr, legs = load_bag(sys.argv[2])
        out = [dict(leg=i + 1, status=l['status'], **leg_metrics(tr, l)) for i, l in enumerate(legs)]
        print(json.dumps(out, indent=1))
    else:
        for run in sys.argv[2:]:
            tr, legs, G = load_sim(run)
            out = [dict(leg=i + 1, status=l['status'], **leg_metrics(tr, l)) for i, l in enumerate(legs)]
            json.dump(out, open(os.path.join(run, 'metrics.json'), 'w'), indent=1)
            print(run, 'legs', len(out))


if __name__ == '__main__':
    main()
