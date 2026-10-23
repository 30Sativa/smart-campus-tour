#!/usr/bin/env python3
"""Doc khung FB tu STM32 (USB CDC), dem so truong va giai ma. Chi DOC.

Linux/Windows, can pyserial (python3-serial). Dung khi bridge ROS DA TAT
(chi mot chuong trinh duoc giu cong serial).

  python3 check_fb.py                 # tu tim /dev/ttyACM* hoac COM cua STM32
  python3 check_fb.py /dev/ttyACM0 5  # cong, so giay doc
"""
import sys
import time

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    sys.exit('Thieu pyserial: sudo apt install python3-serial  (hoac pip install pyserial)')

EXPECTED = 24
NAMES = ['FB', 'seq', 'left_count', 'right_count', 'dt_ms', 'status', 'yaw_cdeg', 'yaw_valid',
         's1_mm', 's1_valid', 's2_mm', 's2_valid', 's3_mm', 's3_valid', 's4_mm', 's4_valid',
         'yaw_acc', 'imu_rearm', 'imu_reset_seen', 'head_seq', 'pan_cdeg', 'tilt_cdeg',
         'head_state', 'contactor']
HEAD_STATES = {'0': 'OFF', '1': 'IDLE', '2': 'MOVING', '3': 'HOMING', '4': 'NO_REF'}


def find_port():
    for p in list_ports.comports():
        if p.vid == 0x0483 and 'stlink' not in (p.description or '').lower().replace('-', ''):
            return p.device
    return None


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else find_port()
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
    if not port:
        print('Khong thay STM32 (USB VID 0483). Cong dang co:',
              ', '.join(p.device for p in list_ports.comports()) or '(khong co)')
        return 2
    try:
        sp = serial.Serial(port, 115200, timeout=0.3)
    except serial.SerialException as exc:
        print(f'[LOI] Khong mo duoc {port}: {exc}')
        print('Bridge ROS / ModemManager / terminal khac dang giu cong? Quyen dialout?')
        return 3
    print(f'Dang doc {port} trong {seconds:g} giay...')
    frames, t0 = [], time.monotonic()
    with sp:
        while time.monotonic() - t0 < seconds:
            line = sp.readline().decode(errors='ignore').strip()
            if line.startswith('FB,'):
                frames.append(line)
    if not frames:
        print('[LOI] Khong nhan duoc khung FB nao (firmware chay chua? dung cong chua?).')
        return 4
    counts = {}
    for f in frames:
        n = len(f.split(','))
        counts[n] = counts.get(n, 0) + 1
    print(f'Nhan {len(frames)} khung (~{len(frames) / seconds:.1f}/giay, mong doi ~50).')
    for n, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f'  {n} truong : {c} khung')
    parts = frames[-1].split(',')
    print(f'\nKhung cuoi: {frames[-1]}\n')
    for i, v in enumerate(parts):
        name = NAMES[i] if i < len(NAMES) else '(la)'
        extra = ''
        if name == 'head_state':
            extra = ' = ' + HEAD_STATES.get(v, '?')
        elif name == 'contactor':
            extra = ' = BAT (PA10 cao)' if v == '1' else ' = TAT (PA10 thap)'
        elif name in ('pan_cdeg', 'tilt_cdeg') and v.lstrip('-').isdigit():
            extra = f' = {int(v) / 100:.2f} do'
        print(f'  [{i:2}] {name:15} {v}{extra}')
    main_n = max(counts, key=counts.get)
    print()
    if main_n == EXPECTED:
        print(f'=== DAT: khung FB du {EXPECTED} truong. ===')
        return 0
    if main_n < EXPECTED:
        print(f'=== CHUA DAT: {main_n} truong, can {EXPECTED}. Firmware cu, nap lai. ===')
        return 1
    print(f'=== {main_n} truong (> {EXPECTED}): firmware moi hon, van doc duoc. ===')
    return 0


if __name__ == '__main__':
    sys.exit(main())
