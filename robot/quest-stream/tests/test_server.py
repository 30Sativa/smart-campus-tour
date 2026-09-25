"""Tests for quest-stream. Run from robot/quest-stream/:

    python3 -m unittest discover -s tests -v

The end-to-end test uses tests/fake_adb.py (a simulated Quest 3) and needs
ffmpeg with libx264; it is skipped when ffmpeg is missing.
"""

import json
import os
import shutil
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
        for bad in ({"eye": "both"}, {"crop_keep": 1.5}, {"width": 1279}, {"encoder": "x"}):
            with self.assertRaises(SystemExit):
                cfg(**bad)


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
        hls = Path(self.tmp.name) / "hls"
        hls.mkdir()
        self.cfg = cfg(hls_dir=hls, log_dir=Path(self.tmp.name) / "logs")
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

    def test_offline_playlist_is_503_with_reason_and_cors(self):
        self.status.set("offline", "QUEST_NOT_CONNECTED: no ADB device attached")
        code, headers, body = self.get("/hls/quest.m3u8")
        self.assertEqual(code, 503)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        self.assertIn("QUEST_NOT_CONNECTED", json.loads(body)["reason"])

    def test_live_playlist_is_served_uncached(self):
        (self.cfg.hls_dir / "quest.m3u8").write_text("#EXTM3U\n")
        self.status.set("live", "STREAM_STARTED")
        code, headers, body = self.get("/hls/quest.m3u8")
        self.assertEqual(code, 200)
        self.assertEqual(headers["Content-Type"], "application/vnd.apple.mpegurl")
        self.assertIn("no-store", headers["Cache-Control"])
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")

    def test_stale_playlist_is_not_served_when_not_live(self):
        (self.cfg.hls_dir / "quest.m3u8").write_text("#EXTM3U\n")
        self.status.set("connecting", "STREAM_STALLED")
        self.assertEqual(self.get("/hls/quest.m3u8")[0], 503)

    def test_segment_type_and_cache(self):
        (self.cfg.hls_dir / "quest_1_00001.ts").write_bytes(b"\x47" * 188)
        code, headers, _ = self.get("/hls/quest_1_00001.ts")
        self.assertEqual(code, 200)
        self.assertEqual(headers["Content-Type"], "video/mp2t")
        self.assertIn("max-age", headers["Cache-Control"])

    def test_missing_segment_traversal_and_listing_are_404(self):
        self.assertEqual(self.get("/hls/quest_x.ts")[0], 404)
        self.assertEqual(self.get("/hls/../server.py")[0], 404)
        self.assertEqual(self.get("/hls/")[0], 404)

    def test_preflight_and_status(self):
        code, headers, _ = self.get("/hls/quest.m3u8", method="OPTIONS")
        self.assertEqual(code, 204)
        self.assertIn("GET", headers["Access-Control-Allow-Methods"])
        code, _, body = self.get("/status")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["output"]["width"], 1280)


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class EndToEndWithSimulatedQuest(unittest.TestCase):
    """fake adb -> screenrecord H.264 -> server.py -> HLS -> probe the result."""

    def test_stream_disconnect_and_recover(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "adb-state"
            state.write_text("device")
            port = 18080 + os.getpid() % 1000
            env = dict(
                os.environ,
                QUEST_ADB=str(HERE / "fake_adb.py"),
                FAKE_ADB_STATE_FILE=str(state),
                FAKE_ADB_SIZE="1920x1008",
                QUEST_STREAM_HOST="127.0.0.1",
                QUEST_STREAM_PORT=str(port),
                QUEST_HLS_DIR=str(Path(tmp) / "hls"),
                QUEST_LOG_DIR=str(Path(tmp) / "logs"),
                QUEST_X264_PRESET="ultrafast",
            )
            proc = subprocess.Popen(
                [sys.executable, str(HERE.parent / "server.py")], env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            base = f"http://127.0.0.1:{port}"

            def state_of():
                try:
                    with urllib.request.urlopen(base + "/status", timeout=2) as r:
                        return json.loads(r.read())["state"]
                except OSError:
                    return None

            def wait_for(target, timeout):
                end = time.time() + timeout
                while time.time() < end:
                    if state_of() == target:
                        return True
                    time.sleep(0.5)
                return False

            try:
                self.assertTrue(wait_for("live", 30), "stream never went live")
                time.sleep(3)
                probe = subprocess.run(
                    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                     "stream=width,height,sample_aspect_ratio,r_frame_rate", "-of", "json",
                     base + "/hls/quest.m3u8"],
                    capture_output=True, text=True, timeout=30,
                )
                s = json.loads(probe.stdout)["streams"][0]
                self.assertEqual((s["width"], s["height"]), (1280, 720))
                self.assertEqual(s["r_frame_rate"], "30/1")
                self.assertEqual(s["sample_aspect_ratio"], "1:1")

                state.write_text("none")  # pull the cable
                self.assertTrue(wait_for("offline", 10), "unplug not detected")
                with self.assertRaises(urllib.error.HTTPError) as ctx:
                    urllib.request.urlopen(base + "/hls/quest.m3u8", timeout=2)
                self.assertEqual(ctx.exception.code, 503)

                state.write_text("device")  # plug it back
                self.assertTrue(wait_for("live", 30), "did not recover after replug")
            finally:
                proc.terminate()
                proc.wait(timeout=15)
            self.assertEqual(list((Path(tmp) / "hls").glob("*.ts")), [], "segments left behind")


if __name__ == "__main__":
    unittest.main()
