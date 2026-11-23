#!/usr/bin/env python3
"""T0: what the four SR04T really report, read straight from the STM32 FB frames.

  python3 robot/tools/sonar/sonar_watch.py [--port /dev/ttyACM0] [--seconds 10]
          [--label "s1 board 0.10"] [--csv t0.csv] [--raw raw.log] [--events]

READ ONLY: opens the serial port, reads FB lines, never writes a byte (no CMD, no STOP,
no DIAG): the firmware stays in TIMEOUT and the wheels get no STEP pulses. Refuses to
start while stm32_bridge_node runs (only one program may read the port, or both lose
frames); --force overrides that check. No ROS needed. Needs pyserial.

Unlike the ROS Range topics, this sees the firmware's own (mm, valid) pairs (FB fields
8-15, robot/docs/PROTOCOL_FB.md) before the bridge's [sonar_min_range, sonar_max_range]
window turns anything into NaN, plus the raw FB line length (for the TX buffer budget).

Per sonar over --seconds: FB frames, value CHANGES per second (a new measurement shows
as a change; two equal measurements in a row do not, so this is a lower bound of the
measurement rate), share of frames with valid=1, min / median / max of the valid mm,
the most common values (a module stuck at its minimum range shows as one value), and
the longest time one value stood. --csv appends one row per sonar with --label: that
is the T0 table (robot/docs/sonar-t0-check.md). --events prints every change.
"""
import argparse
import collections
import csv
import os
import statistics
import sys
import time

PAIRS_AT = 8          # FB index of s1_mm (PROTOCOL_FB.md)


def parse_fb(line):
    """'FB,...' -> (field count, [(mm, valid) or None] * 4), or None if not a usable FB line."""
    parts = [p.strip() for p in line.strip().split(',')]
    if not parts or parts[0] != 'FB' or len(parts) < PAIRS_AT + 2:
        return None
    pairs = []
    try:
        for i in range(4):
            b = PAIRS_AT + 2 * i
            pairs.append((int(parts[b]), int(parts[b + 1]) != 0) if b + 1 < len(parts) else None)
    except ValueError:
        return None
    return len(parts), pairs


class SonarStats:
    """Frames of one sonar: (t, (mm, valid)) in arrival order (pure, tested)."""

    def __init__(self):
        self.frames = 0
        self.valid_frames = 0
        self.mm = []
        self.changes = []          # (t, (mm, valid), seconds since the previous change)
        self.values = collections.Counter()
        self._last = None
        self._since = None
        self.longest = 0.0

    def add(self, t, reading):
        self.frames += 1
        mm, valid = reading
        if valid:
            self.valid_frames += 1
            self.mm.append(mm)
        if reading != self._last:
            prev = self.changes[-1][0] if self.changes else None
            self.changes.append((t, reading, None if prev is None else t - prev))
            self.values[mm if valid else 'invalid'] += 1
            if self._since is not None:
                self.longest = max(self.longest, t - self._since)
            self._last, self._since = reading, t
            return True
        return False

    def summary(self, seconds, t_end=None):
        if self._since is not None and t_end is not None:
            self.longest = max(self.longest, t_end - self._since)
        out = {'frames': self.frames,
               'changes_per_s': len(self.changes) / seconds if seconds > 0 else 0.0,
               'valid_share': self.valid_frames / self.frames if self.frames else 0.0,
               'longest_same_s': self.longest,
               'top_values': ' '.join(f'{v}x{n}' for v, n in self.values.most_common(6))}
        if self.mm:
            out.update(min_mm=min(self.mm), median_mm=statistics.median(self.mm), max_mm=max(self.mm))
        return out


def bridge_running():
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            cmd = open(f'/proc/{pid}/cmdline', 'rb').read().replace(b'\0', b' ').decode(errors='ignore')
        except OSError:
            continue
        if 'stm32_bridge_node' in cmd and 'sonar_watch' not in cmd:
            return pid
    return None


def find_port():
    from serial.tools import list_ports
    for p in list_ports.comports():
        if (p.vid, p.pid) == (0x0483, 0x5740) or 'STM32' in (p.description or ''):
            return p.device
    return '/dev/ttyACM0'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--port')
    ap.add_argument('--seconds', type=float, default=10.0)
    ap.add_argument('--label', default='')
    ap.add_argument('--csv')
    ap.add_argument('--raw')
    ap.add_argument('--events', action='store_true')
    ap.add_argument('--force', action='store_true', help='skip the "bridge is running" check')
    a = ap.parse_args()
    pid = bridge_running()
    if pid and not a.force:
        sys.exit(f'stm32_bridge_node is running (pid {pid}): stop the ROS stack first, '
                 'only one program may read the port')
    try:
        import serial
    except ImportError:
        sys.exit('pyserial missing: python3-serial')
    port = a.port or find_port()
    stats = [SonarStats() for _ in range(4)]
    fields, line_len, other = collections.Counter(), [], collections.Counter()
    raw = open(a.raw, 'a') if a.raw else None
    s = serial.Serial(port, 115200, timeout=0.2)
    t0 = time.monotonic()
    buf = b''
    try:
        while time.monotonic() - t0 < a.seconds:
            buf += s.read(4096)
            while b'\n' in buf:
                line, buf = buf.split(b'\n', 1)
                t = time.monotonic() - t0
                text = line.decode(errors='replace').strip()
                if raw:
                    raw.write(f'{t:.4f} {text}\n')
                parsed = parse_fb(text)
                if parsed is None:
                    if text:
                        other[text.split(',')[0][:12]] += 1
                    continue
                n, pairs = parsed
                fields[n] += 1
                line_len.append(len(line) + 1)
                for i, reading in enumerate(pairs):
                    if reading is not None and stats[i].add(t, reading) and a.events:
                        dt = stats[i].changes[-1][2]
                        print(f'{t:8.3f} s{i + 1} {"valid" if reading[1] else "INVALID"} '
                              f'{reading[0]:5d} mm' + (f'  (+{dt:.3f} s)' if dt is not None else ''))
    finally:
        s.close()
        if raw:
            raw.close()
    elapsed = time.monotonic() - t0
    print(f'{port}: {sum(fields.values())} FB frames in {elapsed:.1f} s '
          f'({sum(fields.values()) / elapsed:.1f}/s), fields {dict(fields)}, '
          f'line bytes max {max(line_len, default=0)} median {statistics.median(line_len) if line_len else 0}'
          + (f', other lines {dict(other)}' if other else ''))
    print(f'{"sonar":5} {"frames":>6} {"chg/s":>6} {"valid":>6} {"min":>5} {"median":>7} {"max":>5} '
          f'{"same max s":>10}  top values (mm x times seen)')
    rows = []
    for i, st in enumerate(stats):
        sm = st.summary(elapsed, elapsed)
        cell = (lambda k, w: f'{sm[k]:{w}.0f}' if k in sm else ' ' * (w - 1) + '-')
        print(f's{i + 1:<4} {sm["frames"]:6d} {sm["changes_per_s"]:6.2f} {sm["valid_share"]:6.0%} '
              f'{cell("min_mm", 5)} {cell("median_mm", 7)} {cell("max_mm", 5)} '
              f'{sm["longest_same_s"]:10.2f}  {sm["top_values"]}')
        rows.append({'time': time.strftime('%Y-%m-%d %H:%M:%S'), 'label': a.label, 'sonar': f's{i + 1}',
                     'seconds': round(elapsed, 1), 'frames': sm['frames'],
                     'changes_per_s': round(sm['changes_per_s'], 2),
                     'valid_share': round(sm['valid_share'], 3), 'min_mm': sm.get('min_mm', ''),
                     'median_mm': sm.get('median_mm', ''), 'max_mm': sm.get('max_mm', ''),
                     'longest_same_s': round(sm['longest_same_s'], 2), 'top_values': sm['top_values'],
                     'fb_fields': ' '.join(str(k) for k in sorted(fields)),
                     'fb_line_max_bytes': max(line_len, default=0)})
    if a.csv:
        new = not os.path.exists(a.csv)
        with open(a.csv, 'a', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            if new:
                w.writeheader()
            w.writerows(rows)
        print(f'appended 4 rows to {a.csv}')
    return 0 if sum(fields.values()) else 1


if __name__ == '__main__':
    sys.exit(main())
