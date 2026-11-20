#!/usr/bin/env python3
"""Theo doi encoder that cua 2 motor HBS57H qua USB CDC (khong can ROS).

Doc FB (truong 2-3 = so xung STEP, 28-32 = encoder, robot/docs/PROTOCOL_FB.md),
lay khung dau tien lam moc 0 va moi `--every` giay in, cho tung banh:
xung STEP va count encoder da di tu moc, ti so count/STEP, toc do encoder
(count/s) trong khoang in vua roi, so loi chuyen trang thai (TERR).

Mac dinh CHI DOC: khong gui CMD, firmware o TIMEOUT, motor khong nhan xung
STEP (quay banh bang tay de do). Gui ENC,<seq> de in muc chan A/B.
`--drive L,R` moi gui CMD (toc do firmware, mm/s, toi da 100), chi khi
`--wheels-lifted`; luon gui STOP khi ket thuc, Ctrl+C hay loi.

TAT bridge ROS truoc (chi mot chuong trinh duoc giu cong serial).
Can pyserial (python3-serial). Quy trinh: docs/ENCODER_HBS57H.md.

  python3 enc_watch.py                          # tu tim cong, in moi 0.5 s
  python3 enc_watch.py --revs 5                 # quay tay dung 5 vong banh, Ctrl+C
  python3 enc_watch.py --rx off                 # tat receiver (kiem tra PB9)
  python3 enc_watch.py --wheels-lifted --drive 30,30 --seconds 10 --csv run.csv
"""
import argparse
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import serial
    from serial.tools import list_ports
    from bench_link import bridge_running, port_users
except ImportError:
    sys.exit('Thieu pyserial: sudo apt install python3-serial  (hoac pip install pyserial)')

FB_FIELDS = 33
STATES = {0: 'DISABLED', 1: 'RX_OFF', 2: 'RX_ON'}
DRIVE_CAP_MM_S = 100.0
SEND_PERIOD = 0.05          # 20 Hz nhu stm32_bridge; watchdog firmware 300 ms
STEPS_PER_WHEEL_REV = 16000  # 1600 xung/vong motor x hop so 10:1 (motor.h)
NOMINAL_GEAR = 10.0


def find_port():
    for p in list_ports.comports():
        if p.vid == 0x0483 and 'stlink' not in (p.description or '').lower().replace('-', ''):
            return p.device
    return None


def diff32(cur, prev):
    d = (cur - prev) & 0xFFFFFFFF
    return d - 0x100000000 if d >= 0x80000000 else d


def parse(line):
    """(dt_ms, status, state, (step_l, step_r), (enc_l, enc_r), (terr_l, terr_r)) hoac None."""
    p = line.split(',')
    if len(p) < FB_FIELDS or p[0] != 'FB':
        return None
    try:
        return (int(p[4]), p[5], int(p[28]), (int(p[2]), int(p[3])),
                (int(p[29]), int(p[30])), (int(p[31]), int(p[32])))
    except ValueError:
        return None


def stamp():
    return datetime.now().strftime('%H:%M:%S.%f')[:-3]


class Watch:
    def __init__(self):
        self.base = None     # (step, enc, terr) moc
        self.last = None     # FB cuoi
        self.mark = None     # (enc, ms) luc in lan truoc
        self.ms = 0          # tong dt_ms tu moc
        self.frames = 0

    def feed(self, fb):
        if self.base is None:
            self.base = (fb[3], fb[4], fb[5])
            self.mark = (fb[4], 0)
        else:
            self.ms += fb[0]
        self.last = fb
        self.frames += 1

    def moved(self, i):
        b, f = self.base, self.last
        return diff32(f[3][i], b[0][i]), diff32(f[4][i], b[1][i]), f[5][i] - b[2][i]

    def line(self):
        f = self.last
        out = [f'{stamp()} {STATES.get(f[2], f[2]):8} {f[1]:7}']
        span_ms = self.ms - self.mark[1]
        for i, name in enumerate(('TRAI', 'PHAI')):
            step, enc, terr = self.moved(i)
            ratio = f'{enc / step:+7.3f}' if step else '   n/a '
            cps = diff32(f[4][i], self.mark[0][i]) * 1000.0 / span_ms if span_ms > 0 else 0.0
            out.append(f'| {name} STEP {step:+8d} ENC {enc:+9d} r={ratio} {cps:+8.0f} c/s TERR+{terr}')
        self.mark = (f[4], self.ms)
        return ' '.join(out)


def summary(w, revs):
    if w.last is None:
        print('Khong nhan duoc khung FB nao co encoder.')
        return
    print(f'\n== Tong ket {w.frames} khung, {w.ms / 1000:.1f} s (theo dt_ms) ==')
    for i, name in enumerate(('TRAI (TIM3, PB4/PB5)', 'PHAI (TIM8, PC6/PB8)')):
        step, enc, terr = w.moved(i)
        print(f'{name}: STEP {step:+d}, encoder {enc:+d}, TERR +{terr}')
        if step:
            print(f'    count/STEP = {enc / step:+.4f}  (dau +: encoder dem len khi STEP firmware tang)'
                  f'  -> encoder_counts_per_step_{"left" if i == 0 else "right"}={abs(enc / step):.4f}, '
                  f'encoder_sign_{"left" if i == 0 else "right"}={1 if enc * step > 0 else -1}')
        if revs:
            per_rev = enc / revs
            print(f'    {revs:g} vong banh -> {per_rev:+.1f} count/vong banh, '
                  f'{per_rev / NOMINAL_GEAR:+.1f} count/vong motor (neu hop so dung {NOMINAL_GEAR:g}:1), '
                  f'{per_rev / STEPS_PER_WHEEL_REV:+.4f} count/STEP')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('port', nargs='?', default=None)
    ap.add_argument('--every', type=float, default=0.5, help='giay giua hai dong in')
    ap.add_argument('--report', type=float, default=0.0,
                    help='giay giua hai lan gui ENC,<seq> (0 = chi luc dau)')
    ap.add_argument('--rx', choices=('on', 'off'), help='bat/tat receiver AM26LV32E (PB9) luc dau')
    ap.add_argument('--revs', type=float, default=0.0,
                    help='so vong banh da quay tay, de tinh count/vong luc ket thuc')
    ap.add_argument('--csv', help='ghi moi khung FB ra file CSV')
    ap.add_argument('--drive', help='L,R: toc do firmware mm/s (dau theo firmware, khong theo ROS)')
    ap.add_argument('--seconds', type=float, default=10.0, help='thoi gian --drive')
    ap.add_argument('--wheels-lifted', action='store_true', help='xac nhan hai banh da ke khoi mat dat')
    a = ap.parse_args()

    drive = None
    if a.drive:
        try:
            drive = tuple(float(v) for v in a.drive.split(','))
            assert len(drive) == 2
        except (ValueError, AssertionError):
            sys.exit('--drive can dang L,R, vi du 30,30')
        if not a.wheels_lifted:
            sys.exit('Tu choi chay motor: ke hai banh khoi mat dat va them --wheels-lifted.')
        if max(abs(v) for v in drive) > DRIVE_CAP_MM_S:
            sys.exit(f'--drive gioi han {DRIVE_CAP_MM_S:g} mm/s cho bai thu encoder.')
    port = a.port or find_port()
    if not port:
        print('Khong thay STM32 (USB VID 0483).')
        return 2
    if bridge_running():
        sys.exit('stm32_bridge_node dang chay: tat bridge truoc (hai chuong trinh doc chung cong se hong du lieu).')
    users = port_users(port)
    if users:
        sys.exit(f'{port} dang bi tien trinh {", ".join(users)} giu.')
    try:
        sp = serial.Serial(port, 115200, timeout=0.05)
    except serial.SerialException as exc:
        print(f'[LOI] Khong mo duoc {port}: {exc}')
        return 3

    csv = open(a.csv, 'w', encoding='ascii') if a.csv else None
    if csv:
        csv.write('host_s,dt_ms,status,enc_state,step_left,step_right,enc_left,enc_right,'
                  'terr_left,terr_right\n')
    w = Watch()
    seq = 910000
    buf = b''
    old_fw_warned = False
    t_start = time.monotonic()
    next_print = t_start + a.every
    next_report = t_start
    next_cmd = t_start
    drive_end = t_start + a.seconds if drive else None

    def send(text):
        nonlocal seq
        seq += 1
        sp.write(f'{text.replace("<seq>", str(seq))}\r\n'.encode('ascii'))

    print(f'{stamp()} doc {port}. {"CHAY MOTOR " + a.drive + " mm/s trong " + str(a.seconds) + " s. " if drive else "Chi doc (khong gui CMD). "}Ctrl+C de thoat.')
    with sp:
        try:
            if a.rx:
                send(f'ENC,<seq>,{a.rx.upper()}')   # cung tra mot dong ENC
                next_report = time.monotonic() + a.report if a.report > 0 else None
            while True:
                now = time.monotonic()
                if drive is not None:
                    if now >= drive_end:
                        break
                    if now >= next_cmd:
                        send(f'CMD,<seq>,{drive[0]:g},{drive[1]:g}')
                        next_cmd = now + SEND_PERIOD
                if next_report is not None and now >= next_report:
                    send('ENC,<seq>')
                    next_report = now + a.report if a.report > 0 else None
                buf += sp.read(4096)
                while b'\n' in buf:
                    raw, buf = buf.split(b'\n', 1)
                    line = raw.decode('ascii', 'replace').strip()
                    if line.startswith(('ENC,', 'ERR,')):
                        print(f'{stamp()} {line}')
                        continue
                    if not line.startswith('FB,'):
                        continue
                    fb = parse(line)
                    if fb is None:
                        if not old_fw_warned:
                            print(f'{stamp()} [!] FB co {len(line.split(","))} truong (< {FB_FIELDS}): '
                                  'firmware chua co encoder, nap ban moi.')
                            old_fw_warned = True
                        continue
                    w.feed(fb)
                    if csv:
                        csv.write(f'{now - t_start:.4f},{fb[0]},{fb[1]},{fb[2]},'
                                  f'{fb[3][0]},{fb[3][1]},{fb[4][0]},{fb[4][1]},{fb[5][0]},{fb[5][1]}\n')
                if w.last is not None and now >= next_print:
                    print(w.line())
                    next_print = now + a.every
        except KeyboardInterrupt:
            print()
        finally:
            if drive is not None:
                try:
                    for _ in range(3):   # cong van mo: dung motor ngay, khong cho watchdog
                        sp.write(f'STOP,{seq + 1}\r\n'.encode('ascii'))
                        time.sleep(0.02)
                except (serial.SerialException, OSError):
                    print('[!] Khong gui duoc STOP; watchdog firmware dung motor sau 300 ms.')
            if csv:
                csv.close()
    summary(w, a.revs)
    return 0


if __name__ == '__main__':
    sys.exit(main())
