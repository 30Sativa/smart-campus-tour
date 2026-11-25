#!/usr/bin/env python3
"""What the sonar guard did, or would have done, in a recorded session (read only).

  python3 robot/tools/sonar/sonar_shadow_report.py <bag_dir> [--ns /robot_01] [--min-scale 0.95]

Pairs each collision_monitor output (cmd_vel_sonar_shadow in shadow mode, cmd_vel_sonar
in enforce mode) with the controller command it came from (cmd_vel_ctrl, the latest
one before it) and lists the episodes where the output was slower than --min-scale of
the input: start time, duration, smallest scale, whether it reached a full stop, and
the sonar readings at that moment. Also: Nav2 goal results in the bag, and per-sonar
valid share and new measurements per second. robot/docs/sonar-perception.md section 8.
Read a bag only after its recorder has closed (record_session.sh stop).
"""
import argparse
import math
import sys


def scale_of(cin, cout):
    """Guard output / input for one command pair, or None when the input is ~zero."""
    vin, win = cin
    vout, wout = cout
    ref = max(abs(vin), abs(win))
    if ref < 0.01:
        return None
    if abs(vin) >= abs(win):
        return abs(vout) / abs(vin)
    return abs(wout) / abs(win)


def episodes(pairs, min_scale=0.95, gap=0.5):
    """pairs: [(t, (v,w) in, (v,w) out)] -> [{'t0','t1','min_scale','stopped'}] (pure, tested)."""
    out, cur = [], None
    for t, cin, cout in pairs:
        s = scale_of(cin, cout)
        if s is not None and s < min_scale:
            if cur is not None and t - cur['t1'] <= gap:
                cur['t1'] = t
                cur['min_scale'] = min(cur['min_scale'], s)
            else:
                cur = {'t0': t, 't1': t, 'min_scale': s}
                out.append(cur)
    for e in out:
        e['stopped'] = e['min_scale'] < 0.02
    return out


def read_bag(path, ns):
    import rosbag2_py
    from rclpy.serialization import deserialize_message
    from rosidl_runtime_py.utilities import get_message
    reader = rosbag2_py.SequentialReader()
    reader.open(rosbag2_py.StorageOptions(uri=path, storage_id='sqlite3'),
                rosbag2_py.ConverterOptions('cdr', 'cdr'))
    types = {t.name: t.type for t in reader.get_all_topics_and_types()}
    wanted = {f'{ns}/cmd_vel_ctrl', f'{ns}/cmd_vel_sonar', f'{ns}/cmd_vel_sonar_shadow',
              f'{ns}/navigate_to_pose/_action/status'} | {f'{ns}/ultrasonic/sonar{i}/range' for i in range(1, 5)}
    data = {k: [] for k in wanted}
    while reader.has_next():
        topic, raw, t = reader.read_next()
        if topic in wanted and topic in types:
            data[topic].append((t * 1e-9, deserialize_message(raw, get_message(types[topic]))))
    return data


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('bag')
    ap.add_argument('--ns', default='/robot_01')
    ap.add_argument('--min-scale', type=float, default=0.95)
    a = ap.parse_args()
    ns = a.ns.rstrip('/')
    d = read_bag(a.bag, ns)
    out_topic = f'{ns}/cmd_vel_sonar' if d[f'{ns}/cmd_vel_sonar'] else f'{ns}/cmd_vel_sonar_shadow'
    ctrl = [(t, (m.linear.x, m.angular.z)) for t, m in d[f'{ns}/cmd_vel_ctrl']]
    guard = [(t, (m.linear.x, m.angular.z)) for t, m in d[out_topic]]
    if not guard:
        print('no collision_monitor output in the bag (sonar_mode off, or topics not recorded)')
        return 1
    t_first = min(t for t, _ in ctrl + guard)
    pairs, i = [], 0
    for t, cout in guard:
        while i + 1 < len(ctrl) and ctrl[i + 1][0] <= t:
            i += 1
        if ctrl and ctrl[i][0] <= t:
            pairs.append((t, ctrl[i][1], cout))
    sonar = {i: [(t, m.range) for t, m in d[f'{ns}/ultrasonic/sonar{i}/range']] for i in range(1, 5)}

    def reading_at(i, t):
        best = None
        for ts, r in sonar[i]:
            if ts > t:
                break
            best = r
        return best

    eps = episodes(pairs, a.min_scale)
    print(f'{out_topic}: {len(guard)} commands, {len(eps)} episodes below {a.min_scale:.2f} of the input')
    for e in eps:
        rs = ', '.join(f's{i}=' + ('-' if (r := reading_at(i, e['t0'])) is None or not math.isfinite(r) else f'{r:.2f}')
                       for i in range(1, 5))
        print(f'  t+{e["t0"] - t_first:7.1f} s  {e["t1"] - e["t0"]:5.1f} s  min scale {e["min_scale"]:.2f}'
              f'{"  STOP" if e["stopped"] else ""}   [{rs}]')
    names = {4: 'SUCCEEDED', 5: 'CANCELED', 6: 'ABORTED'}
    ends = {}
    for t, m in d[f'{ns}/navigate_to_pose/_action/status']:
        for s in m.status_list:
            if s.status in names:
                ends[bytes(s.goal_info.goal_id.uuid).hex()[:8]] = (t - t_first, names[s.status])
    for gid, (t, st) in sorted(ends.items(), key=lambda kv: kv[1][0]):
        print(f'  goal {gid}: {st} at t+{t:.1f} s')
    for i in range(1, 5):
        v = [r for _, r in sonar[i]]
        if v:
            span = sonar[i][-1][0] - sonar[i][0][0] or 1.0
            new = sum(1 for a_, b in zip(v, v[1:]) if (math.isfinite(a_), round(a_, 3) if math.isfinite(a_) else 0)
                      != (math.isfinite(b), round(b, 3) if math.isfinite(b) else 0))
            print(f'  sonar{i}: {sum(map(math.isfinite, v)) / len(v):.0%} valid, {new / span:.2f} new/s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
