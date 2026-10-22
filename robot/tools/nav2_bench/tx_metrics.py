#!/usr/bin/env python3
"""tx_metrics.py BRIDGE_LOG BT_LOG [label] : motion metrics WITHOUT a rosbag (read-only).

The stm32_bridge logs every change of the wheel command it sends ("TX: CMD,seq,left,right" in mm/s,
after pair-scaling) and the sequence number runs at the 20 Hz send rate. Forward-filling by seq
rebuilds the exact 20 Hz wheel command stream the STM32 executed (open-loop steppers), i.e. the
commanded motion after velocity_smoother + mode_manager + bridge. Legs come from bt_navigator.
Same filters/definitions as metrics.py where possible. No pose: no tracking error,
no goal accuracy, no clearance (those need a bag).
"""
import re, sys, time
import numpy as np

WB = 0.4714; DT = 0.05


def movavg(x, n):
    k = np.ones(n) / n
    return np.convolve(np.pad(x, (n // 2, n - 1 - n // 2), mode='edge'), k, mode='valid')


def p95(x):
    return float(np.percentile(np.abs(x), 95)) if len(x) else float('nan')


def load_tx(path):
    rows = []
    for l in open(path, errors='ignore'):
        m = re.search(r'\[(\d{10}\.\d+)\].*TX: (CMD|STOP),(\d+)(?:,(-?\d+),(-?\d+))?', l)
        if m:
            t, kind, seq = float(m.group(1)), m.group(2), int(m.group(3))
            lw, rw = (int(m.group(4)), int(m.group(5))) if kind == 'CMD' else (0, 0)
            rows.append((seq, t, lw, rw))
    rows.sort()
    seqs = np.array([r[0] for r in rows]); ts = np.array([r[1] for r in rows])
    # seq -> time: robust linear fit (20 Hz nominal)
    a, b = np.polyfit(seqs, ts, 1)
    full = np.arange(seqs[0], seqs[-1] + 1)
    idx = np.searchsorted(seqs, full, 'right') - 1
    L = np.array([r[2] for r in rows])[idx] / 1000.0; R = np.array([r[3] for r in rows])[idx] / 1000.0
    t = a * full + b
    # both wheels inverted in the bridge (invert_left/right): forward = negative mm/s
    v = -(L + R) / 2.0; w = (L - R) / WB
    return t, v, w, a


def legs_from_bt(path):
    ev = []
    for l in open(path, errors='ignore'):
        m = re.search(r'\[(\d{10}\.\d+)\].*(Begin navigating from current location \(([-\d.]+), ([-\d.]+)\) to \(([-\d.]+), ([-\d.]+)\)|Goal succeeded|Goal failed|canceled)', l)
        if m:
            ev.append((float(m.group(1)), m.group(2)))
    legs = []
    for (t0, a), (t1, b) in zip(ev, ev[1:]):
        if a.startswith('Begin') and not b.startswith('Begin'):
            to = re.search(r'to \(([-\d.]+), ([-\d.]+)\)', a).groups()
            legs.append(dict(t0=t0, t1=t1, status='OK' if 'succeeded' in b else 'FAIL', to=to))
    return legs


def leg_metrics(t, v, w, t0, t1):
    k = (t >= t0) & (t <= t1 + 2.0); tt, vv, ww = t[k], v[k], w[k]
    inleg = tt <= t1
    wf = movavg(ww, 5); M = {}
    acc = np.gradient(wf, DT); jerk = np.gradient(np.gradient(movavg(ww, 9), DT), DT)
    mv = np.abs(vv) > 0.03
    M['time'] = t1 - t0
    M['dist'] = float(np.sum(np.abs(vv[inleg])) * DT)
    M['acc_w_p95'] = p95(acc[inleg & mv]); M['jerk_w_p95'] = p95(jerk[inleg & mv])
    M['acc_w_p95_all'] = p95(acc[inleg]); M['jerk_w_p95_all'] = p95(jerk[inleg])
    dr = vv > 0.10
    M['ang_jitter_rms'] = float(np.sqrt(np.mean((ww - movavg(ww, 21))[dr & inleg] ** 2))) if (dr & inleg).any() else float('nan')
    ok = (vv > 0.05) & (np.abs(ww) > 0.03) & inleg; idx = np.where(ok)[0]; sg = np.sign(ww)
    M['w_flips_per_m'] = (int(np.sum(sg[idx[1:]] * sg[idx[:-1]] < 0)) if len(idx) > 1 else 0) / max(M['dist'], 1e-6)
    cr = (vv > 0.10) & (np.abs(ww) < 0.15) & inleg
    M['v_cruise_cv'] = float(np.std(vv[cr]) / np.mean(vv[cr])) if cr.sum() > 20 else float('nan')
    # in-place rotations: |v|<0.03, |w|>0.08 for >= 0.5 s; peak decel within +-0.6 s of each end
    rot = (np.abs(vv) < 0.03) & (np.abs(ww) > 0.08)
    eps, s = [], None
    for i, r in enumerate(rot):
        if r and s is None: s = i
        if (not r or i == len(rot) - 1) and s is not None:
            e = i if not r else i + 1
            if (e - s) * DT >= 0.5: eps.append((s, e))
            s = None
    ends = [float(np.max(np.abs(acc[max(0, e - 12):e + 12]))) for s_, e in eps]
    M['rot_n'] = len(eps); M['rot_deg'] = float(np.degrees(sum(np.sum(np.abs(ww[s_:e])) * DT for s_, e in eps)))
    M['rot_end_decel_max'] = max(ends) if ends else float('nan')
    M['rot_end_decel_med'] = float(np.median(ends)) if ends else float('nan')
    # raw step change of the angular command between consecutive 20 Hz sends (no filter)
    M['dw_step_p99'] = float(np.percentile(np.abs(np.diff(ww[inleg])), 99))
    return M


def main():
    tx, bt = sys.argv[1], sys.argv[2]; label = sys.argv[3] if len(sys.argv) > 3 else ''
    t, v, w, a = load_tx(tx)
    print(f'# {label} TX rate {1 / a:.2f} Hz (seq fit)')
    out = []
    for i, L in enumerate(legs_from_bt(bt)):
        M = leg_metrics(t, v, w, L['t0'], L['t1'])
        M.update(label=label, leg=i + 1, start=time.strftime('%H:%M:%S', time.localtime(L['t0'])), status=L['status'], to=L['to'])
        out.append(M)
        print(f"{label:10s} leg{i+1} {M['start']} {L['status']} to {L['to']}  t {M['time']:5.1f}  jerk_w {M['jerk_w_p95']:.2f}  acc_w {M['acc_w_p95']:.3f}  "
              f"jit {M['ang_jitter_rms']:.4f}  flips/m {M['w_flips_per_m']:.2f}  vCV {M['v_cruise_cv']:.3f}  rot {M['rot_n']}x{M['rot_deg']:.0f}deg  "
              f"rotEnd max {M['rot_end_decel_max']:.2f} med {M['rot_end_decel_med']:.2f}  dw99 {M['dw_step_p99']:.3f}")
    import json
    print('JSON ' + json.dumps(out))


if __name__ == '__main__':
    main()
