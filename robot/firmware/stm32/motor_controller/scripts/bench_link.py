#!/usr/bin/env python3
"""Bench test of the STM32 USB link WITHOUT ROS (docs/BENCH_STM32_LINK.md).

Talks the FB/CMD protocol (robot/docs/PROTOCOL_FB.md) directly:
  1. speed sweep: CMD at 20 Hz like stm32_bridge, per level measures FB rate,
     largest FB gap, ERR lines, statuses and step rate vs. commanded speed;
  2. stop tests: explicit STOP, and "host dies" (stop sending CMD) -> time
     until the FB step counters stop changing, measured from the last CMD.

SAFETY: wheels must be OFF THE GROUND (--wheels-lifted). Speeds are capped
at 250 mm/s. Refuses to run while stm32_bridge_node holds the port. Sends
STOP on exit, Ctrl+C and errors. Never use it on a robot standing on the floor.

Usage:
  python3 scripts/bench_link.py --wheels-lifted [--port /dev/ttyACM0]
      [--speeds 0,50,100,150,200,250] [--seconds 15] [--stop-repeats 3]
"""
import argparse, glob, os, sys, time

try:
    import serial
except ImportError:
    sys.exit('needs pyserial (python3-serial)')

STEPS_PER_MM = 26.184875     # stm32_bridge steps_per_meter / 1000
CAP_MM_S = 250
SEND_PERIOD = 0.05           # 20 Hz, same as stm32_bridge send_rate_hz


def bridge_running():
    for cmdline in glob.glob('/proc/[0-9]*/cmdline'):
        try:
            if b'stm32_bridge_node' in open(cmdline, 'rb').read():
                return True
        except OSError:
            pass
    return False


def default_port():
    ids = sorted(glob.glob('/dev/serial/by-id/*STM32_Virtual_ComPort*'))
    return ids[0] if ids else '/dev/ttyACM0'


class Link:
    def __init__(self, port):
        self.s = serial.Serial(port, 115200, timeout=0)
        self.buf = b''; self.seq = 0
        self.fb = []        # (t, left_count, right_count, status, yaw_valid)
        self.err = []       # t of ERR lines

    def send(self, line):
        self.s.write((line % self.seq + '\r\n').encode()); self.seq += 1

    def cmd(self, mm_s):
        # stm32_bridge inverts both wheels for "forward": mimic it.
        self.send('CMD,%%d,%d,%d' % (-mm_s, -mm_s))

    def stop(self):
        self.send('STOP,%d')

    def poll(self):
        now = time.monotonic()
        self.buf += self.s.read(4096)
        while b'\n' in self.buf:
            line, self.buf = self.buf.split(b'\n', 1)
            p = line.decode('ascii', 'replace').strip().split(',')
            if p[0] == 'FB' and len(p) >= 8:
                try:
                    self.fb.append((now, int(p[2]), int(p[3]), p[5], p[7] == '1'))
                except ValueError:
                    pass
            elif p[0] == 'ERR':
                self.err.append(now)

    def run(self, seconds, mm_s=None, send=True):
        """Keep sending CMD (or nothing) for `seconds` while reading FB."""
        t_end = time.monotonic() + seconds; t_next = 0.0; last_cmd = None
        while time.monotonic() < t_end:
            now = time.monotonic()
            if send and now >= t_next:
                self.cmd(mm_s) if mm_s else self.stop()
                last_cmd = now; t_next = now + SEND_PERIOD
            self.poll(); time.sleep(0.002)
        return last_cmd


def window(fb, t0, t1):
    return [f for f in fb if t0 <= f[0] <= t1]


def sweep_level(link, mm_s, seconds):
    t0 = time.monotonic(); link.run(1.0, mm_s)           # settle
    t1 = time.monotonic(); link.run(seconds, mm_s); t2 = time.monotonic()
    w = window(link.fb, t1, t2)
    errs = sum(1 for t in link.err if t0 <= t <= t2)
    if len(w) < 2:
        return dict(mm_s=mm_s, fb_hz=0.0, max_gap=seconds, err=errs, step_ratio=0.0, statuses='', yaw=0.0)
    gaps = [b[0] - a[0] for a, b in zip(w, w[1:])]
    dt = w[-1][0] - w[0][0]
    steps = abs(w[-1][1] - w[0][1]) / dt if dt else 0.0
    expect = mm_s * STEPS_PER_MM
    return dict(mm_s=mm_s, fb_hz=(len(w) - 1) / dt, max_gap=max(gaps), err=errs,
                step_ratio=(steps / expect) if expect else (1.0 if steps == 0 else 0.0),
                statuses=','.join(sorted({f[3] for f in w})),
                yaw=sum(1 for f in w if f[4]) / len(w))


def stop_latency(link, mm_s, explicit_stop):
    """Run at mm_s, then STOP (explicit) or go silent. Latency is measured from
    the moment the STOP / the last CMD was written to the first FB frame after
    which the left step counter never changes again (resolution = FB period)."""
    t_last = link.run(3.0, mm_s)                         # when the last CMD was written
    if explicit_stop:
        link.stop(); t_last = time.monotonic()
    link.run(1.5, send=False)
    w = window(link.fb, t_last - 0.5, t_last + 1.5)
    if not w:
        return None, 'NO FB'
    final = w[-1][1]
    moving = [f for f in w if f[1] != final]
    if not moving:
        return None, ''
    t_stop = next(f[0] for f in w if f[0] > moving[-1][0])
    status = w[-1][3]
    link.run(0.3)                                         # back to STOP for the next run
    # The motor stopped somewhere between the last moving FB and t_stop.
    return (moving[-1][0] - t_last, t_stop - t_last), status


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--wheels-lifted', action='store_true', help='confirm both drive wheels are off the ground')
    ap.add_argument('--port', default=default_port())
    ap.add_argument('--speeds', default='0,50,100,150,200,250')
    ap.add_argument('--seconds', type=float, default=15.0)
    ap.add_argument('--stop-repeats', type=int, default=3)
    ap.add_argument('--stop-speed', type=int, default=100)
    a = ap.parse_args()
    if not a.wheels_lifted:
        sys.exit('Refusing to move motors: lift both wheels and pass --wheels-lifted.')
    if bridge_running():
        sys.exit('stm32_bridge_node is running and owns the port: stop the ROS launch first.')
    speeds = [int(x) for x in a.speeds.split(',')]
    if any(abs(v) > CAP_MM_S for v in speeds + [a.stop_speed]):
        sys.exit('speeds above %d mm/s are not allowed on the bench' % CAP_MM_S)

    link = Link(a.port)
    ok = True
    try:
        link.run(1.0)                                     # STOP, flush, check FB alive
        if not link.fb:
            sys.exit('no FB frames from %s' % a.port)
        print('== speed sweep (%.0f s per level, CMD at 20 Hz)' % a.seconds)
        print(' mm/s | FB Hz | max FB gap | ERR | steps/expected | statuses | yaw_valid')
        for v in speeds:
            r = sweep_level(link, v, a.seconds)
            good = r['fb_hz'] >= 35.0 and r['max_gap'] < 0.2 and r['err'] == 0 and \
                (v == 0 or 0.98 <= r['step_ratio'] <= 1.02)
            ok &= good
            print(' %4d | %5.1f | %8.3f s | %3d | %14.3f | %-8s | %5.0f %%  %s' % (
                v, r['fb_hz'], r['max_gap'], r['err'], r['step_ratio'], r['statuses'],
                100 * r['yaw'], 'PASS' if good else 'FAIL'))
        link.run(0.5)
        print('== stop latency at %d mm/s, from the STOP / the last CMD written' % a.stop_speed)
        # (label, explicit STOP?, earliest plausible stop, latest acceptable stop)
        for label, explicit, lo, hi in (('STOP command', True, 0.0, 0.10),
                                        ('host silent (no CMD)', False, 0.25, 0.45)):
            for k in range(a.stop_repeats):
                lat, status = stop_latency(link, a.stop_speed, explicit)
                good = lat is not None and lat[1] >= lo and lat[1] <= hi
                ok &= good
                print('  %-22s #%d: stopped between %s  final status %-7s accept <= %.2f s  %s' % (
                    label, k + 1, 'n/a' if lat is None else '%.3f and %.3f s' % lat, status, hi,
                    'PASS' if good else 'CHECK'))
    finally:
        for _ in range(3):
            try:
                link.stop(); time.sleep(0.02)
            except Exception:
                pass
        link.s.close()
    print('RESULT', 'PASS' if ok else 'CHECK FAILED ITEMS')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
