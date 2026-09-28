"""Tests for quest-stream. Run from robot/quest-stream/:

    python3 -m unittest discover -s tests -v

The end-to-end test uses tests/fake_adb.py (a simulated Quest 3) and an
FFmpeg RTSP listener standing in for MediaMTX; it needs ffmpeg with libx264
and is skipped when ffmpeg is missing.
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import server  # noqa: E402


def cfg(**kw) -> server.Config:
    c = server.Config(**kw)
    c.validate()
    return c


class FilterTests(unittest.TestCase):
    def test_left_eye_is_the_left_half(self):
        vf = server.build_video_filter(cfg())
        self.assertTrue(vf.startswith("crop=w=iw/2:h=ih:x=0:y=0,"))

    def test_right_eye_is_the_right_half(self):
        vf = server.build_video_filter(cfg(eye="right"))
        self.assertTrue(vf.startswith("crop=w=iw/2:h=ih:x=iw/2:y=0,"))

    def test_output_size_fps_and_square_pixels(self):
        vf = server.build_video_filter(cfg())
        self.assertIn("fps=30", vf)
        self.assertIn("scale=1280:720", vf)
        self.assertIn("setsar=1", vf)
        self.assertIn("1280/720", vf)  # the crop window is 16:9

    def test_override_wins(self):
        self.assertEqual(server.build_video_filter(cfg(vf_override="null")), "null")

    def test_filter_is_accepted_by_ffmpeg_and_gives_1280x720(self):
        if not shutil.which("ffmpeg"):
            self.skipTest("ffmpeg not installed")
        # A 2560x1344 stereo frame through the real filter.
        out = subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=2560x1344:rate=72",
             "-t", "1", "-vf", server.build_video_filter(cfg()), "-f", "rawvideo", "-"],
            capture_output=True,
        )
        self.assertEqual(out.returncode, 0, out.stderr.decode())
        self.assertEqual(len(out.stdout), 30 * 1280 * 720 * 3 // 2)  # 30 yuv420p frames

    def test_invalid_config_is_refused(self):
        for bad in (
            {"eye": "both"}, {"crop_keep": 1.5}, {"width": 1279}, {"encoder": "x"},
            {"publish_url": "http://nuc/quest"}, {"publish_url": "rtsp://127.0.0.1:8554"},
            {"keyframe_interval": 0},
        ):
            with self.assertRaises(SystemExit, msg=str(bad)):
                cfg(**bad)


class FfmpegCommandTests(unittest.TestCase):
    def arg(self, cmd, flag):
        return cmd[cmd.index(flag) + 1]

    def test_publishes_rtsp_over_tcp_to_mediamtx(self):
        cmd = server.build_ffmpeg_command(cfg())
        self.assertEqual(cmd[-1], "rtsp://127.0.0.1:8554/quest")
        self.assertEqual(self.arg(cmd, "-f") , "h264")  # input
        self.assertEqual(cmd[-4:-1], ["rtsp", "-rtsp_transport", "tcp"])
        self.assertNotIn("hls", cmd)

    def test_webrtc_safe_h264(self):
        cmd = server.build_ffmpeg_command(cfg())
        self.assertEqual(self.arg(cmd, "-profile:v"), "baseline")
        self.assertEqual(self.arg(cmd, "-bf"), "0")
        self.assertEqual(self.arg(cmd, "-g"), "30")  # a keyframe every second
        vaapi = server.build_ffmpeg_command(cfg(encoder="h264_vaapi"))
        self.assertEqual(self.arg(vaapi, "-bf"), "0")

    def test_keyframe_interval(self):
        cmd = server.build_ffmpeg_command(cfg(keyframe_interval=2))
        self.assertEqual(self.arg(cmd, "-g"), "60")

    def test_path_endpoint_and_password_hiding(self):
        c = cfg(publish_url="rtsp://pub:secret@10.0.0.5:8554/robot1/quest")
        self.assertEqual(c.publish_endpoint, ("10.0.0.5", 8554))
        self.assertEqual(c.path_name, "robot1/quest")
        self.assertNotIn("secret", c.publish_url_safe)
        self.assertNotIn("secret", json.dumps(server.Status().snapshot(c)))

    def test_mediamtx_reachable(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            s.listen(1)
            port = s.getsockname()[1]
            self.assertTrue(server.mediamtx_reachable(cfg(publish_url=f"rtsp://127.0.0.1:{port}/quest"))[0])
        ok, why = server.mediamtx_reachable(cfg(publish_url=f"rtsp://127.0.0.1:{port}/quest"))
        self.assertFalse(ok)
        self.assertIn("MediaMTX", why)


class AdbParsingTests(unittest.TestCase):
    OUT = (
        "List of devices attached\n"
        "2G0YC5ZG123     device usb:1-1 product:eureka model:Quest_3 device:eureka transport_id:3\n\n"
    )

    def test_parse(self):
        devices = server.parse_adb_devices(self.OUT)
        self.assertEqual(devices[0][0], "2G0YC5ZG123")
        self.assertEqual(devices[0][1], "device")
        self.assertEqual(devices[0][2]["model"], "Quest_3")

    def test_pick_ready_quest(self):
        self.assertEqual(server.pick_quest(server.parse_adb_devices(self.OUT), ""), ("2G0YC5ZG123", "ok"))

    def test_nothing_attached(self):
        serial, reason = server.pick_quest([], "")
        self.assertIsNone(serial)
        self.assertIn("no ADB device", reason)

    def test_unauthorized_explains_what_to_do(self):
        serial, reason = server.pick_quest([("X", "unauthorized", {})], "")
        self.assertIsNone(serial)
        self.assertIn("Allow USB debugging", reason)

    def test_serial_filter(self):
        devices = server.parse_adb_devices(self.OUT)
        self.assertIsNone(server.pick_quest(devices, "OTHER")[0])

    def test_screenrecord_streams_h264_to_stdout(self):
        cmd = server.build_screenrecord_command(cfg(capture_size="2560x1344"), "S")
        self.assertEqual(cmd[:6], ["adb", "-s", "S", "exec-out", "screenrecord", "--output-format=h264"])
        self.assertEqual(cmd[-1], "-")
        self.assertIn("2560x1344", cmd)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg = cfg(log_dir=Path(self.tmp.name) / "logs")
        self.status = server.Status()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(self.cfg, self.status))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def get(self, path, method="GET"):
        req = urllib.request.Request(self.base + path, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def test_status_reports_state_reason_and_whep_path(self):
        self.status.set("offline", "QUEST_NOT_CONNECTED: no ADB device attached")
        code, headers, body = self.get("/status")
        self.assertEqual(code, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        self.assertEqual(headers["Cache-Control"], "no-store")
        data = json.loads(body)
        self.assertEqual(data["state"], "offline")
        self.assertIn("QUEST_NOT_CONNECTED", data["reason"])
        self.assertEqual(data["whepPath"], "/quest/whep")
        self.assertEqual(data["output"]["width"], 1280)

    def test_health_preflight_and_unknown(self):
        self.assertEqual(self.get("/health")[0], 200)
        code, headers, _ = self.get("/status", method="OPTIONS")
        self.assertEqual(code, 204)
        self.assertIn("GET", headers["Access-Control-Allow-Methods"])
        self.assertEqual(self.get("/hls/quest.m3u8")[0], 404)  # no video served here any more
        self.assertEqual(self.get("/../server.py")[0], 404)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FakeMediaMTX:
    """Stands in for MediaMTX: accepts an RTSP publisher and records the video.

    An FFmpeg RTSP listener would quit on the first bare TCP connect (the
    server's reachability check), so a small front door accepts connections,
    drops the ones that send nothing and hands the publisher to a fresh FFmpeg.
    """

    def __init__(self, port: int, out: Path):
        self.out = out
        self.procs = []
        self.sock = socket.socket()
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(("127.0.0.1", port))
        self.sock.listen(8)
        self.closed = False
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while not self.closed:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn):
        with conn:
            first = conn.recv(65536)
            if not first:
                return  # a reachability check
            inner = free_port()
            proc = subprocess.Popen(
                ["ffmpeg", "-v", "error", "-y", "-rtsp_flags", "listen", "-timeout", "60",
                 "-i", f"rtsp://127.0.0.1:{inner}/quest", "-c", "copy", "-f", "mpegts", str(self.out)],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            self.procs.append(proc)
            upstream = None
            for _ in range(100):
                try:
                    upstream = socket.create_connection(("127.0.0.1", inner), timeout=5)
                    break
                except OSError:
                    time.sleep(0.05)
            if upstream is None:
                return
            upstream.settimeout(None)  # an RTSP publish is quiet in one direction
            with upstream:
                upstream.sendall(first)

                def pipe(a, b):
                    try:
                        while True:
                            data = a.recv(65536)
                            if not data:
                                break
                            b.sendall(data)
                    except OSError:
                        pass
                    for x in (a, b):
                        try:
                            x.shutdown(socket.SHUT_RDWR)
                        except OSError:
                            pass

                t = threading.Thread(target=pipe, args=(upstream, conn), daemon=True)
                t.start()
                pipe(conn, upstream)
                t.join(timeout=5)

    def stop(self):
        self.closed = True
        try:
            self.sock.shutdown(socket.SHUT_RDWR)  # wakes the blocked accept()
        except OSError:
            pass
        self.sock.close()
        for proc in self.procs:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class EndToEndWithSimulatedQuest(unittest.TestCase):
    """fake adb -> server.py -> RTSP publish -> fake MediaMTX -> probe the result."""

    def test_publish_mediamtx_down_disconnect_and_recover(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            state = tmp / "adb-state"
            state.write_text("device")
            port, rtsp_port = free_port(), free_port()
            env = dict(
                os.environ,
                QUEST_ADB=str(HERE / "fake_adb.py"),
                FAKE_ADB_STATE_FILE=str(state),
                FAKE_ADB_SIZE="1920x1008",
                QUEST_STREAM_HOST="127.0.0.1",
                QUEST_STREAM_PORT=str(port),
                QUEST_PUBLISH_URL=f"rtsp://127.0.0.1:{rtsp_port}/quest",
                QUEST_LOG_DIR=str(tmp / "logs"),
                QUEST_X264_PRESET="ultrafast",
            )
            proc = subprocess.Popen(
                [sys.executable, str(HERE.parent / "server.py")], env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            base = f"http://127.0.0.1:{port}"

            def status():
                try:
                    with urllib.request.urlopen(base + "/status", timeout=2) as r:
                        return json.loads(r.read())
                except OSError:
                    return {}

            def wait_for(target, timeout, reason=None):
                end = time.time() + timeout
                while time.time() < end:
                    s = status()
                    if s.get("state") == target and (reason is None or reason in s.get("reason", "")):
                        return True
                    time.sleep(0.3)
                return False

            mtx = None
            try:
                # 1. MediaMTX not running yet: say so, do not start anything.
                self.assertTrue(wait_for("error", 15, "MEDIAMTX_ERROR"), status())

                # 2. MediaMTX up: the stream publishes.
                mtx = FakeMediaMTX(rtsp_port, tmp / "take1.ts")
                self.assertTrue(wait_for("live", 30), f"never went live: {status()}")
                time.sleep(4)
                mtx.stop()
                probe = subprocess.run(
                    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
                     "stream=codec_name,profile,width,height,sample_aspect_ratio,r_frame_rate,"
                     "has_b_frames,nb_read_frames", "-of", "json", str(tmp / "take1.ts")],
                    capture_output=True, text=True, timeout=30,
                )
                s = json.loads(probe.stdout)["streams"][0]
                self.assertEqual(s["codec_name"], "h264")
                self.assertEqual(s["profile"], "Constrained Baseline")
                self.assertEqual(s["has_b_frames"], 0)
                self.assertEqual((s["width"], s["height"]), (1280, 720))
                self.assertEqual(s["r_frame_rate"], "30/1")
                self.assertEqual(s["sample_aspect_ratio"], "1:1")
                self.assertGreater(int(s["nb_read_frames"]), 60)

                # 3. MediaMTX went away (restart): noticed, and back when it returns.
                self.assertTrue(wait_for("error", 20, "MEDIAMTX_ERROR"), status())
                mtx = FakeMediaMTX(rtsp_port, tmp / "take2.ts")
                self.assertTrue(wait_for("live", 30), f"did not republish: {status()}")

                # 4. Pull the USB cable, then plug it back.
                state.write_text("none")
                self.assertTrue(wait_for("offline", 10, "QUEST_NOT_CONNECTED"), status())
                state.write_text("device")
                self.assertTrue(wait_for("live", 30), f"did not recover after replug: {status()}")
            finally:
                if mtx:
                    mtx.stop()
                proc.terminate()
                proc.wait(timeout=15)


if __name__ == "__main__":
    unittest.main()
