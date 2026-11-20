#!/usr/bin/env python3
"""Theo doi ALM cua 2 driver HBS57H qua USB CDC, khi han mach / thu loi.

In moi lan alm_left/alm_right (FB truong 24-27) doi trang thai, kem gio may
tinh, va moi `--report` giay gui ALM,<seq> de in dong chi tiet (muc doc voi
pull-up/pull-down, so glitch, tick luc doi). Khong gui CMD/STOP/CONTACTOR:
banh xe dung yen (firmware o TIMEOUT), contactor giu nguyen.

TAT bridge ROS truoc (chi mot chuong trinh duoc giu cong serial).
Can pyserial (python3-serial).

  python3 alm_watch.py                       # tu tim cong STM32
  python3 alm_watch.py /dev/ttyACM0 --report 2
"""
import argparse
import sys
import time
from datetime import datetime

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    sys.exit('Thieu pyserial: sudo apt install python3-serial  (hoac pip install pyserial)')

STATES = {0: 'DISABLED', 1: 'UNKNOWN', 2: 'OK', 3: 'ALARM', 4: 'NO_SIGNAL'}


def find_port():
    for p in list_ports.comports():
        if p.vid == 0x0483 and 'stlink' not in (p.description or '').lower().replace('-', ''):
            return p.device
    return None


def parse(line):
    parts = line.split(',')
    if len(parts) < 28:
        return None
    try:
        return (int(parts[24]), int(parts[25])), (int(parts[26]), int(parts[27]))
    except ValueError:
        return None


def stamp():
    return datetime.now().strftime('%H:%M:%S.%f')[:-3]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('port', nargs='?', default=None)
    ap.add_argument('--report', type=float, default=5.0,
                    help='giay giua hai lan gui ALM,<seq> (0 = khong gui)')
    a = ap.parse_args()
    port = a.port or find_port()
    if not port:
        print('Khong thay STM32 (USB VID 0483).')
        return 2
    try:
        sp = serial.Serial(port, 115200, timeout=0.2)
    except serial.SerialException as exc:
        print(f'[LOI] Khong mo duoc {port}: {exc} (bridge ROS dang giu cong?)')
        return 3

    print(f'{stamp()} doc {port}. Ctrl+C de thoat.')
    last = None
    old_fw_warned = False
    seq = 900000
    next_report = time.monotonic()
    with sp:
        try:
            while True:
                if a.report > 0 and time.monotonic() >= next_report:
                    seq += 1
                    sp.write(f'ALM,{seq}\r\n'.encode('ascii'))
                    next_report = time.monotonic() + a.report
                line = sp.readline().decode(errors='ignore').strip()
                if line.startswith('ALM,') or line.startswith('ERR,'):
                    print(f'{stamp()} {line}')
                    continue
                if not line.startswith('FB,'):
                    continue
                fb = parse(line)
                if fb is None:
                    if not old_fw_warned:
                        print(f'{stamp()} [!] FB co {len(line.split(","))} truong (< 28): '
                              'firmware chua co ALM')
                        old_fw_warned = True
                    continue
                if fb != last:
                    (sl, sr), (tl, tr) = fb
                    print(f'{stamp()} TRAI={STATES.get(sl, sl):9} (trips={tl})   '
                          f'PHAI={STATES.get(sr, sr):9} (trips={tr})')
                    last = fb
        except KeyboardInterrupt:
            print()
    return 0


if __name__ == '__main__':
    sys.exit(main())
