#!/usr/bin/env python3
"""
Test IMU qua USB CDC: in yaw 5 Hz, Enter de tare.

    pip install pyserial
    python scripts/imu_test.py COM5

Trong luc chay (go roi Enter):
    <trong>   -> TARE      dat huong hien tai = 0
    <so>      -> TARE,<so>  dat huong hien tai = <so> do
    raw       -> TARE,RAW   bo offset, ve yaw tho
    d         -> DIAG       chan doan IMU tai cho
    (cot son=[s1 s2 s3 s4]: ---- la khong co so do hop le)
    <lenh,..> -> gui nguyen van (vd: CMD,9,100,100)
    q         -> thoat
"""
import sys
import threading
import time

try:
    import serial
except ImportError:
    sys.exit("Thieu pyserial. Chay: pip install pyserial")


def wrap180(deg):
    while deg > 180.0:
        deg -= 360.0
    while deg <= -180.0:
        deg += 360.0
    return deg


def main():
    if len(sys.argv) < 2:
        sys.exit(f"Dung: {sys.argv[0]} <cong>   (vd COM5 hoac /dev/ttyACM0)")

    port = sys.argv[1]
    ser = serial.Serial(port, 115200, timeout=0.1)
    print(f"Mo {port}.  d=DIAG | Enter=tare ve 0 | <so>=tare ve goc do | "
          f"raw=bo offset | q=thoat\n")

    seq = [0]
    stop = threading.Event()

    def send_commands():
        for line in sys.stdin:
            line = line.strip()
            if line.lower() == "q":
                stop.set()
                return
            seq[0] += 1
            low = line.lower()
            if line == "":
                cmd = f"TARE,{seq[0]}"
            elif low == "raw":
                cmd = f"TARE,{seq[0]},RAW"
            elif low in ("d", "diag"):
                cmd = f"DIAG,{seq[0]}"
            elif "," in line:
                cmd = line               # gui nguyen van
            else:
                try:
                    float(line)
                except ValueError:
                    print(f"  ? khong hieu: {line!r}")
                    continue
                cmd = f"TARE,{seq[0]},{line}"
            ser.write((cmd + "\n").encode())
            print(f"  -> {cmd}")

    threading.Thread(target=send_commands, daemon=True).start()

    last_print = 0.0
    buf = b""
    prev_yaw = None          # mau truoc, de biet co dang xoay khong
    last_move = time.time()  # lan cuoi yaw thay doi dang ke
    settled_shown = True     # da in dong "dung yen" cho lan dung nay chua
    prev_settled = None      # gia tri o lan dung yen truoc, de tinh do lech
    try:
      while not stop.is_set():
        buf += ser.read(256)
        while b"\n" in buf:
            raw, buf = buf.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            if not line.startswith("FB,"):
                print(f">>> {line}")     # DIAG, ERR, log boot ...
                continue
            f = line.split(",")
            if len(f) < 8:
                continue
            try:
                yaw = int(f[6]) / 100.0
            except ValueError:
                continue
            valid = f[7] == "1"
            now = time.time()

            # --- phat hien dung yen, chay tren MOI frame chu khong chi frame in ra ---
            if valid:
                if prev_yaw is None or abs(wrap180(yaw - prev_yaw)) > 0.5:
                    last_move = now
                    settled_shown = False
                prev_yaw = yaw
                if not settled_shown and (now - last_move) >= 1.0:
                    settled_shown = True
                    if prev_settled is None:
                        print(f">>> DUNG YEN: yaw = {yaw:+.2f}")
                    else:
                        d = wrap180(yaw - prev_settled)
                        print(f">>> DUNG YEN: yaw = {yaw:+.2f}"
                              f"   (lech {d:+.2f} do so voi lan dung truoc)")
                    prev_settled = yaw

            if now - last_print < 0.2:
                continue
            last_print = now
            bar = "#" * int((yaw + 180) / 360 * 20)
            acc = f[16] if len(f) > 16 else "?"

            # 4 cap <mm>,<valid> bat dau tu vi tri 8. Chua cam cam bien thi
            # phai ra "----" het; ra so nghia la chan ECHO dang bat nhieu.
            son = []
            for i in range(4):
                mm_i, v_i = 8 + (i * 2), 9 + (i * 2)
                if len(f) > v_i and f[v_i] == "1":
                    son.append(f"{int(f[mm_i]):>4}")
                else:
                    son.append("----")

            print(f"seq={f[1]:>5} {f[5]:<7} "
                  f"yaw={yaw:8.2f} {'OK ' if valid else 'STALE'} acc={acc} "
                  f"son=[{' '.join(son)}] |{bar:<20}|")
    except KeyboardInterrupt:
        print("\ndung.")
    except serial.SerialException as exc:
        print(f"\nmat ket noi cong: {exc}")

    try:
        ser.close()
    except Exception:
        pass


if __name__ == "__main__":
    main()
