#!/usr/bin/env python3
"""A stand-in for `adb` that behaves like a Quest 3 on USB, for testing
quest-stream without a headset.

Point the stream at it with ``QUEST_ADB=tests/fake_adb.py``. The "USB cable"
is a text file (``FAKE_ADB_STATE_FILE``, default /tmp/fake-adb-state):

    device        -> Quest attached and authorised
    unauthorized  -> attached, USB debugging not accepted
    none          -> unplugged (also: file missing)

``exec-out screenrecord`` emits a real side-by-side stereo H.264 stream: the
left eye is a moving test pattern, the right eye solid red, each surrounded by
a black "lens" border. It stops at --time-limit (like Android) or as soon as
the state file stops saying ``device`` (like pulling the cable).
"""

import os
import subprocess
import sys
import time

STATE_FILE = os.environ.get("FAKE_ADB_STATE_FILE", "/tmp/fake-adb-state")
SERIAL = "2G0YC5ZFAKE0001"
DEFAULT_SIZE = os.environ.get("FAKE_ADB_SIZE", "2560x1344")  # both eyes
FPS = os.environ.get("FAKE_ADB_FPS", "72")


def state() -> str:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return f.read().strip() or "none"
    except FileNotFoundError:
        return "none"


def main(argv):
    args = list(argv)
    if args[:1] == ["-s"]:
        args = args[2:]
    if not args:
        return 1
    cmd = args[0]

    if cmd == "version":
        print("Android Debug Bridge version 1.0.41 (fake for quest-stream tests)")
        return 0
    if cmd in ("start-server", "kill-server"):
        return 0
    if cmd == "devices":
        print("List of devices attached")
        st = state()
        if st != "none":
            extra = " product:eureka model:Quest_3 device:eureka transport_id:1" if st == "device" else " transport_id:1"
            print(f"{SERIAL}       {st}{extra}")
        print()
        return 0
    if cmd == "get-state":
        st = state()
        if st == "none":
            print(f"error: device '{SERIAL}' not found", file=sys.stderr)
            return 1
        print(st)
        return 0

    if state() != "device":
        print(f"error: device '{SERIAL}' not found", file=sys.stderr)
        return 1

    if cmd == "shell" and args[1:3] == ["getprop", "ro.product.model"]:
        print("Quest 3")
        return 0
    if cmd == "shell":
        return 0

    if cmd == "exec-out" and len(args) > 1 and args[1] == "screenrecord":
        limit = 180
        size = DEFAULT_SIZE
        rest = args[2:]
        for i, a in enumerate(rest):
            if a == "--time-limit":
                limit = int(rest[i + 1])
            elif a == "--size":
                size = rest[i + 1]
        if os.environ.get("FAKE_ADB_NO_FRAMES") == "1":
            # Headset asleep: the session is open but no video arrives.
            end = time.time() + limit
            while time.time() < end and state() == "device":
                time.sleep(0.5)
            return 0
        w, h = (int(x) for x in size.split("x"))
        ew, eh = w // 2, h
        iw, ih = int(ew * 0.82) // 2 * 2, int(eh * 0.86) // 2 * 2
        graph = (
            f"testsrc2=size={iw}x{ih}:rate={FPS},pad={ew}:{eh}:(ow-iw)/2:(oh-ih)/2:black[l];"
            f"color=c=red:size={iw}x{ih}:rate={FPS},pad={ew}:{eh}:(ow-iw)/2:(oh-ih)/2:black[r];"
            f"[l][r]hstack=inputs=2,format=yuv420p"
        )
        proc = subprocess.Popen(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-re",
                "-f", "lavfi", "-i", graph, "-t", str(limit),
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
                "-g", FPS, "-bsf:v", "h264_mp4toannexb", "-f", "h264", "-",
            ],
            stdout=sys.stdout.buffer, stdin=subprocess.DEVNULL,
        )
        while proc.poll() is None:
            if state() != "device":
                proc.kill()
                print("error: device disconnected", file=sys.stderr)
                return 1
            time.sleep(0.3)
        return proc.returncode

    print(f"fake adb: unsupported command {args}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
