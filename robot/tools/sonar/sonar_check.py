#!/usr/bin/env python3
"""Static sonar check on the robot: what each SR04T really reports, read only.

  python3 robot/tools/sonar/sonar_check.py [--ns /robot_01] [--seconds 10]
          [--expect sonar1=0.50 ...] [--tol 0.05] [--guard]

Per sonar over --seconds: messages/s, NEW measurements/s (a value change; the bridge
republishes each reading with every FB frame, ~40 msg/s, or with the sonar guard
running only on a change + a 0.2 s heartbeat, ~5-8 msg/s), share of valid readings,
min / median / max of the valid ones, and the TF mount (x, y, yaw, pitch) of
sonarN_link in base_link.
--expect sonarN=D: PASS when the median valid reading is within --tol of D metres (a
board or box placed by tape measure in front of that sensor ONLY: this is how channel
mapping and yaw are proven, robot/docs/sonar-perception.md section 8).
--guard: also print the lifecycle state of collision_monitor (must be "active" before
any goal in sonar_mode:=enforce, or the robot will not move).
Run from an R3-sourced shell. Sends nothing, moves nothing. Exit 1 on any FAIL.
"""
import argparse
import math
import statistics
import sys
import time


def summarise(samples, seconds):
    """samples: [(t, range)] -> dict of rates and stats (pure, tested)."""
    out = {'msgs_per_s': len(samples) / seconds if seconds > 0 else 0.0}
    values, last = [], object()
    new = 0
    for _, r in samples:
        key = round(r, 3) if math.isfinite(r) else None
        if key != last:
            new += 1
            last = key
        if math.isfinite(r):
            values.append(r)
    out['new_per_s'] = new / seconds if seconds > 0 else 0.0
    out['valid_share'] = len(values) / len(samples) if samples else 0.0
    if values:
        out.update(min=min(values), median=statistics.median(values), max=max(values))
    return out


def verdict(stats, expected, tol):
    if 'median' not in stats:
        return False, 'no valid reading'
    err = stats['median'] - expected
    return abs(err) <= tol, f'median {stats["median"]:.3f} m vs {expected:.3f} m ({err:+.3f})'


def parse_expect(items):
    out = {}
    for item in items:
        name, _, value = item.partition('=')
        if not name.startswith('sonar') or not value:
            raise SystemExit(f'--expect wants sonarN=D, got {item!r}')
        out[name] = float(value)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--ns', default='/robot_01')
    ap.add_argument('--seconds', type=float, default=10.0)
    ap.add_argument('--expect', nargs='*', default=[])
    ap.add_argument('--tol', type=float, default=0.05)
    ap.add_argument('--guard', action='store_true')
    a = ap.parse_args()
    expect = parse_expect(a.expect)

    import rclpy
    from rclpy.duration import Duration
    from rclpy.qos import qos_profile_sensor_data
    from rclpy.time import Time
    from sensor_msgs.msg import Range
    from tf2_ros import Buffer, TransformException, TransformListener

    rclpy.init()
    node = rclpy.create_node('sonar_check')
    ns = a.ns.rstrip('/')
    samples = {f'sonar{i}': [] for i in range(1, 5)}
    for name in samples:
        node.create_subscription(Range, f'{ns}/ultrasonic/{name}/range',
                                 lambda m, n=name: samples[n].append((time.monotonic(), m.range)),
                                 qos_profile_sensor_data)
    tf = Buffer()
    TransformListener(tf, node)
    end = time.monotonic() + a.seconds
    while time.monotonic() < end:
        rclpy.spin_once(node, timeout_sec=0.1)

    ok = True
    print(f'{"sonar":7} {"msg/s":>6} {"new/s":>6} {"valid":>6} {"min":>6} {"median":>7} {"max":>6}'
          '   mount (x, y, yaw, pitch)')
    for name, s in samples.items():
        st = summarise(s, a.seconds)
        try:
            t = tf.lookup_transform('base_link', f'{name}_link', Time(), Duration(seconds=0.5)).transform
            q = t.rotation
            yaw = math.degrees(math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)))
            pitch = math.degrees(math.asin(max(-1.0, min(1.0, 2 * (q.w * q.y - q.z * q.x)))))
            mount = f'({t.translation.x:+.3f}, {t.translation.y:+.3f}, {yaw:+.1f} deg, {pitch:+.1f} deg)'
        except TransformException:
            mount = 'NO TF'
        mn, md, mx = (f'{st[k]:{w}.3f}' if k in st else ' ' * (w - 1) + '-'
                      for k, w in (('min', 6), ('median', 7), ('max', 6)))
        print(f'{name:7} {st["msgs_per_s"]:6.1f} {st["new_per_s"]:6.2f} {st["valid_share"]:6.0%} '
              f'{mn} {md} {mx}   {mount}')
        if not s:
            ok = False
            print(f'  FAIL {name}: no messages (bridge down, wrong namespace, or DDS discovery)')
        if name in expect:
            good, why = verdict(st, expect[name], a.tol)
            ok &= good
            print(f'  {"PASS" if good else "FAIL"} {name}: {why}')
    if a.guard:
        from lifecycle_msgs.srv import GetState
        cli = node.create_client(GetState, f'{ns}/collision_monitor/get_state')
        state = 'not running'
        if cli.wait_for_service(timeout_sec=3.0):
            fut = cli.call_async(GetState.Request())
            rclpy.spin_until_future_complete(node, fut, timeout_sec=3.0)
            state = fut.result().current_state.label if fut.result() else 'no answer'
        ok &= state == 'active'
        print(f'{"PASS" if state == "active" else "FAIL"} collision_monitor: {state}')
    node.destroy_node()
    rclpy.shutdown()
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
