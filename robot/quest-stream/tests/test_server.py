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


class ScrcpyCaptureTests(unittest.TestCase):
    def test_default_capture_is_screenrecord(self):
        self.assertEqual(cfg().capture, "screenrecord")
        with self.assertRaises(SystemExit):
            cfg(capture="v4l2")
        with self.assertRaises(SystemExit):
            cfg(capture="scrcpy", scrcpy_crop="left")

    def test_scrcpy_frames_are_one_eye_already(self):
        both = server.build_video_filter(cfg())
        one = server.build_video_filter(cfg(capture="scrcpy"))
        self.assertTrue(both.startswith("crop=w=iw/2:h=ih:x=0:y=0,"))
        self.assertNotIn("crop=w=iw/2:h=ih", one)
        self.assertIn("fps=30", one)

    def test_wm_size_prefers_override(self):
        self.assertEqual(server.parse_wm_size("Physical size: 4128x2208\n"), (4128, 2208))
        self.assertEqual(server.parse_wm_size("Physical size: 4128x2208\nOverride size: 3664x1920\n"), (3664, 1920))
        self.assertIsNone(server.parse_wm_size("error: no devices"))

    def test_eye_crop_is_one_half(self):
        self.assertEqual(server.eye_crop((4128, 2208), "left"), "2064:2208:0:0")
        self.assertEqual(server.eye_crop((4128, 2208), "right"), "2064:2208:2064:0")
        self.assertEqual(server.eye_crop((3665, 1921), "left"), "1832:1920:0:0")

    def test_server_command_asks_for_raw_h264_of_one_eye(self):
        cmd = server.build_scrcpy_server_command(cfg(capture="scrcpy", fps=20), "S", "0abc1234", "2064:2208:0:0", "3.3.1")
        self.assertEqual(cmd[:4], ["adb", "-s", "S", "shell"])
        shell = cmd[4]
        self.assertTrue(shell.startswith("CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server 3.3.1 "))
        for arg in ("scid=0abc1234", "tunnel_forward=true", "audio=false", "control=false", "raw_stream=true",
                    "video_codec=h264", "max_fps=20", "max_size=1600", "crop=2064:2208:0:0"):
            self.assertIn(arg, shell.split())

    def test_angle_is_sent_only_when_set(self):
        plain = server.build_scrcpy_server_command(cfg(capture="scrcpy"), "S", "0abc1234", "2064:2208:0:0", "5.0.1")
        self.assertNotIn("angle=", plain[4])
        tilted = server.build_scrcpy_server_command(
            cfg(capture="scrcpy", scrcpy_angle=-12.5), "S", "0abc1234", "2064:2208:0:0", "5.0.1")
        self.assertIn("angle=-12.5", tilted[4].split())
        with self.assertRaises(SystemExit):
            cfg(capture="scrcpy", scrcpy_angle=400)

    def test_version_comes_from_the_installed_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            jar = Path(tmp) / "scrcpy-server"
            jar.write_bytes(b"x")
            (Path(tmp) / "scrcpy-server.version").write_text("3.3.1\n")
            self.assertEqual(server.scrcpy_server_version(cfg(scrcpy_server=jar)), "3.3.1")
            self.assertEqual(server.scrcpy_server_version(cfg(scrcpy_server=jar, scrcpy_version="v3.2")), "3.2")


class BatteryParsingTests(unittest.TestCase):
    DUMPSYS = (
        "Current Battery Service state:\n"
        "  AC powered: false\n"
        "  USB powered: true\n"
        "  Wireless powered: false\n"
        "  status: 2\n"
        "  health: 2\n"
        "  level: 54\n"
        "  scale: 100\n"
    )

    def test_level_and_charging(self):
        self.assertEqual(
            server.parse_battery(self.DUMPSYS),
            {"level": 54, "charging": True, "plugged": "USB", "status": "charging"},
        )

    def test_not_charging_and_scaled(self):
        out = "  AC powered: false\n  USB powered: false\n  status: 3\n  level: 30\n  scale: 50\n"
        battery = server.parse_battery(out)
        self.assertEqual(battery["level"], 60)
        self.assertFalse(battery["charging"])
        self.assertIsNone(battery["plugged"])

    def test_full_on_power_is_not_charging(self):
        out = "  AC powered: true\n  status: 5\n  level: 100\n"
        battery = server.parse_battery(out)
        self.assertFalse(battery["charging"])
        self.assertEqual(battery["plugged"], "AC")
        self.assertEqual(battery["status"], "full")

    def test_no_level_is_none(self):
        self.assertIsNone(server.parse_battery("error: closed"))

    def test_stream_summary(self):
        self.assertEqual(server.stream_summary("live"), "live")
        self.assertEqual(server.stream_summary("starting"), "connecting")
        self.assertEqual(server.stream_summary("connecting"), "connecting")
        for state in ("offline", "error", "stopped"):
            self.assertEqual(server.stream_summary(state), "lost")


class DeviceMonitorWithFakeAdb(unittest.TestCase):
    """poll_once against tests/fake_adb.py: no headset, no ffmpeg needed."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / "state"
        self.env = {k: os.environ.get(k) for k in ("FAKE_ADB_STATE_FILE", "FAKE_ADB_BATTERY", "FAKE_ADB_CHARGING")}
        os.environ["FAKE_ADB_STATE_FILE"] = str(self.state)
        self.cfg = cfg(adb=str(HERE / "fake_adb.py"))
        self.device = server.DeviceStatus()
        self.monitor = server.DeviceMonitor(self.cfg, self.device)

    def tearDown(self):
        for key, value in self.env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def poll(self, state):
        self.state.write_text(state)
        self.monitor.poll_once()
        return self.device.snapshot()

    def test_connected_reads_battery(self):
        os.environ["FAKE_ADB_BATTERY"] = "14"
        os.environ["FAKE_ADB_CHARGING"] = "1"
        snap = self.poll("device")
        self.assertEqual(snap["connection"], "connected")
        self.assertEqual(snap["model"], "Quest 3")
        self.assertEqual(snap["battery"]["level"], 14)
        self.assertTrue(snap["battery"]["charging"])
        self.assertIsNotNone(snap["checkedAt"])

    def test_connected_reads_the_screen(self):
        screen = Path(self.tmp.name) / "screen"
        os.environ["FAKE_ADB_SCREEN_FILE"] = str(screen)
        try:
            screen.write_text("Asleep")
            self.assertEqual(self.poll("device")["screen"], "asleep")
            screen.write_text("Awake")
            self.assertEqual(self.poll("device")["screen"], "awake")
            self.assertEqual(self.poll("none")["screen"], "unknown")
        finally:
            os.environ.pop("FAKE_ADB_SCREEN_FILE", None)

    def test_unauthorized_has_no_battery(self):
        snap = self.poll("unauthorized")
        self.assertEqual(snap["connection"], "unauthorized")
        self.assertIsNone(snap["battery"])
        self.assertIn("Allow USB debugging", snap["reason"])

    def test_unplugged(self):
        snap = self.poll("none")
        self.assertEqual(snap["connection"], "not_found")
        self.assertIsNone(snap["battery"])

    def test_adb_missing(self):
        monitor = server.DeviceMonitor(cfg(adb="/nonexistent/adb"), self.device)
        monitor.poll_once()
        self.assertEqual(self.device.snapshot()["connection"], "adb_error")


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

    def test_device_keeps_headset_and_video_apart(self):
        device = server.DeviceStatus()
        device.update(connection="connected", serial="S", model="Quest 3",
                      battery={"level": 18, "charging": False, "plugged": None, "status": "discharging"})
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(self.cfg, self.status, device))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            self.status.set("connecting", "STREAM_STALLED: no frames from the Quest")
            url = f"http://127.0.0.1:{httpd.server_address[1]}/device"
            with urllib.request.urlopen(url, timeout=5) as r:
                data = json.loads(r.read())
                self.assertEqual(r.headers["Access-Control-Allow-Origin"], "*")
        finally:
            httpd.shutdown()
            httpd.server_close()
        self.assertEqual(data["connection"], "connected")
        self.assertEqual(data["battery"]["level"], 18)
        self.assertEqual(data["stream"], "connecting")
        self.assertIn("STREAM_STALLED", data["streamReason"])
        self.assertEqual(data["pollSeconds"], 5.0)

    def test_device_before_first_check(self):
        code, _, body = self.get("/device")
        self.assertEqual(code, 200)
        data = json.loads(body)
        self.assertEqual(data["connection"], "unknown")
        self.assertIsNone(data["checkedAt"])

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


class CameraDemandTests(unittest.TestCase):
    """ADR-0052: capture only while the backend says someone needs the camera."""

    class Response:
        def __init__(self, body):
            self.body = json.dumps(body).encode("utf-8")

        def read(self):
            return self.body

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.credential = Path(self.tmp.name) / "amr_01.credential"
        self.credential.write_text("secret-token\n")
        self.now = 1000.0
        self.requests = []
        self.answer = {"success": True, "data": {"wanted": False, "reason": "IDLE", "pollSeconds": 5}}

    def tearDown(self):
        self.tmp.cleanup()

    def opener(self, request, timeout):
        self.requests.append(request)
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.Response(self.answer)

    def demand(self, **kw):
        c = cfg(control_url="https://api.example/api/fleet/camera/v1/poll", robot_code="amr_01",
                robot_credential_file=str(self.credential), **kw)
        return server.CameraDemand(c, opener=self.opener, clock=lambda: self.now)

    def test_without_a_control_url_the_camera_is_always_wanted(self):
        d = server.CameraDemand(cfg())
        self.assertFalse(d.enabled)
        self.assertTrue(d.wanted())
        self.assertEqual(d.reason(), "ALWAYS_ON")

    def test_asks_as_the_fleet_robot_and_follows_the_answer(self):
        d = self.demand()
        d.poll_once()
        self.assertFalse(d.wanted())
        self.assertEqual(d.reason(), "IDLE")
        self.assertTrue(d.changed.is_set())
        request = self.requests[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-token")
        self.assertEqual(request.get_header("X-robot-code"), "amr_01")

        self.answer = {"success": True, "data": {"wanted": True, "reason": "TOUR_RUNNING", "pollSeconds": 5}}
        d.changed.clear()
        d.poll_once()
        self.assertTrue(d.wanted())
        self.assertEqual(d.reason(), "TOUR_RUNNING")
        self.assertTrue(d.changed.is_set())

    def test_backend_outage_keeps_the_last_answer_then_fails_safe(self):
        d = self.demand(control_grace=60.0)
        d.poll_once()  # IDLE
        self.answer = urllib.error.URLError("connection refused")
        self.now += 30
        d.poll_once()
        self.assertFalse(d.wanted(), "within the grace period the last answer holds")
        self.now += 31
        self.assertTrue(d.wanted(), "after the grace period the failsafe keeps a Tour's camera running")
        self.assertIn("BACKEND_UNREACHABLE", d.reason())

    def test_failsafe_off_keeps_the_camera_off_without_an_answer(self):
        self.answer = urllib.error.URLError("no route")
        d = self.demand(control_failsafe=False)
        d.poll_once()
        self.assertFalse(d.wanted())

    def test_a_refused_credential_is_reported(self):
        self.answer = urllib.error.HTTPError("https://api.example", 401, "Unauthorized", {}, None)
        d = self.demand()
        d.poll_once()
        self.assertIn("credential was refused", d.snapshot()["error"])
        self.assertTrue(d.wanted(), "never answered: failsafe")

    def test_an_answer_without_wanted_is_not_trusted(self):
        self.answer = {"success": True, "data": {}}
        d = self.demand(control_failsafe=False)
        d.poll_once()
        self.assertFalse(d.wanted())
        self.assertIsNotNone(d.snapshot()["error"])

    def test_auto_url_comes_from_the_fleet_sync_settings(self):
        env = Path(self.tmp.name) / "fleet-sync.env"
        env.write_text("# saved by setup_fleet_sync.py\nFLEET_SYNC_URL=https://api.example/api/fleet/v1/sync\n"
                       "FLEET_ROBOT_CODE='amr_01'\nFLEET_ROBOT_CREDENTIAL_FILE=/home/u/.config/campustour/amr_01.credential\n")
        url, code, cred = server.resolve_control_settings("auto", "", "", server.read_env_file(env))
        self.assertEqual(url, "https://api.example/api/fleet/camera/v1/poll")
        self.assertEqual(code, "amr_01")
        self.assertEqual(cred, "/home/u/.config/campustour/amr_01.credential")
        self.assertEqual(server.read_env_file(Path(self.tmp.name) / "missing.env"), {})
        with self.assertRaises(SystemExit):
            server.resolve_control_settings("auto", "", "", {})

    def test_a_control_url_needs_the_robot_identity(self):
        with self.assertRaises(SystemExit):
            cfg(control_url="https://api.example/api/fleet/camera/v1/poll")
        with self.assertRaises(SystemExit):
            cfg(control_url="ftp://api.example/x", robot_code="amr_01", robot_credential_file="/x")

    def test_the_poll_carries_the_headset(self):
        c = cfg(control_url="https://api.example/api/fleet/camera/v1/poll", robot_code="amr_01",
                robot_credential_file=str(self.credential))
        d = server.CameraDemand(c, opener=self.opener, clock=lambda: self.now,
                                report=lambda: {"headset": {"connection": "connected", "batteryPercent": 54}})
        d.poll_once()
        self.assertEqual(json.loads(self.requests[0].data), {"headset": {"connection": "connected", "batteryPercent": 54}})

    def test_a_failing_report_still_polls(self):
        def broken():
            raise RuntimeError("adb gone")
        c = cfg(control_url="https://api.example/api/fleet/camera/v1/poll", robot_code="amr_01",
                robot_credential_file=str(self.credential))
        d = server.CameraDemand(c, opener=self.opener, clock=lambda: self.now, report=broken)
        d.poll_once()
        self.assertEqual(self.requests[0].data, b"")
        self.assertFalse(d.wanted())

    def test_reporting_without_camera_on_demand_keeps_the_camera_on(self):
        d = self.demand(camera_on_demand=False)
        self.assertTrue(d.polling)
        self.assertFalse(d.enabled)
        d.poll_once()  # the backend says IDLE
        self.assertTrue(d.wanted())
        self.assertEqual(len(self.requests), 1)

    def test_headset_report_sends_battery_only_while_connected(self):
        device, status = server.DeviceStatus(), server.Status()
        status.set("live", "STREAM_STARTED")
        device.update(connection="connected", screen="awake",
                      battery={"level": 54, "charging": True, "plugged": "USB", "status": "charging"})
        self.assertEqual(server.headset_report(device, status),
                         {"headset": {"connection": "connected", "stream": "live", "screen": "awake",
                                      "batteryPercent": 54, "charging": True}})
        device.update(connection="offline", reason="cable")
        status.set("paused", "CAMERA_OFF: IDLE")
        self.assertEqual(server.headset_report(device, status),
                         {"headset": {"connection": "offline", "stream": "paused", "screen": "unknown"}})

    def test_a_headset_command_in_the_answer_is_handed_over(self):
        presses = []
        c = cfg(control_url="https://api.example/api/fleet/camera/v1/poll", robot_code="amr_01",
                robot_credential_file=str(self.credential))
        d = server.CameraDemand(c, opener=self.opener, clock=lambda: self.now,
                                on_headset_command=lambda i, a: presses.append((i, a)))
        self.answer = {"success": True, "data": {"wanted": False, "reason": "IDLE", "pollSeconds": 5,
                                                 "headsetCommand": {"id": "abc", "action": "WAKE"}}}
        d.poll_once()
        self.assertEqual(presses, [("abc", "WAKE")])
        self.assertFalse(d.wanted())

    def test_no_or_a_strange_headset_command_is_ignored_and_never_breaks_the_poll(self):
        presses = []

        def explode(i, a):
            raise RuntimeError("boom")
        c = cfg(control_url="https://api.example/api/fleet/camera/v1/poll", robot_code="amr_01",
                robot_credential_file=str(self.credential))
        for command in (None, {"id": "x", "action": "POWER_OFF"}, {"action": "WAKE"}, "WAKE"):
            d = server.CameraDemand(c, opener=self.opener, clock=lambda: self.now,
                                    on_headset_command=lambda i, a: presses.append((i, a)))
            self.answer = {"success": True, "data": {"wanted": True, "reason": "STAFF_WATCHING", "pollSeconds": 5,
                                                     "headsetCommand": command}}
            d.poll_once()
            self.assertTrue(d.wanted())
        self.assertEqual(presses, [])
        d = server.CameraDemand(c, opener=self.opener, clock=lambda: self.now, on_headset_command=explode)
        self.answer = {"success": True, "data": {"wanted": True, "reason": "TOUR_RUNNING", "pollSeconds": 5,
                                                 "headsetCommand": {"id": "y", "action": "SLEEP"}}}
        d.poll_once()
        self.assertTrue(d.wanted())
        self.assertEqual(d.reason(), "TOUR_RUNNING")

    def test_paused_is_its_own_stream_state(self):
        self.assertEqual(server.stream_summary("paused"), "paused")
        self.assertEqual(server.stream_summary("offline"), "lost")

    def test_an_idle_robot_never_touches_the_quest(self):
        class Off:
            enabled = True
            changed = threading.Event()

            def wanted(self):
                return False

            def reason(self):
                return "IDLE"

        status = server.Status()
        # adb would fail loudly (ADB_ERROR) if the supervisor tried to list devices.
        sup = server.Supervisor(cfg(adb="/nonexistent/adb"), status, Off())
        sup.start()
        try:
            deadline = time.time() + 3
            while status.state != "paused" and time.time() < deadline:
                time.sleep(0.05)
            self.assertEqual(status.state, "paused")
            self.assertEqual(status.reason, "CAMERA_OFF: IDLE")
            time.sleep(0.6)
            self.assertEqual(status.state, "paused")
        finally:
            sup.stop()
            sup.join(timeout=5)


class ScreenParsingTests(unittest.TestCase):
    def test_wakefulness(self):
        self.assertEqual(server.parse_screen("POWER MANAGER\n  mWakefulness=Awake\n"), "awake")
        self.assertEqual(server.parse_screen("  mWakefulness=Asleep\n  mWakefulnessChanging=false"), "asleep")
        self.assertEqual(server.parse_screen("  mWakefulness=Dozing"), "asleep")
        self.assertEqual(server.parse_screen("  mWakefulness=Dreaming"), "awake")
        self.assertEqual(server.parse_screen("  mWakefulness=Sideways"), "unknown")
        self.assertEqual(server.parse_screen(""), "unknown")


class HeadsetControlWithFakeAdb(unittest.TestCase):
    """ADR-0056 addendum: Staff wake/sleep presses run over adb against tests/fake_adb.py."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp = Path(self.tmp.name)
        self.state, self.screen, self.log = tmp / "state", tmp / "screen", tmp / "adb.log"
        self.env = {k: os.environ.get(k) for k in ("FAKE_ADB_STATE_FILE", "FAKE_ADB_SCREEN_FILE", "FAKE_ADB_LOG")}
        os.environ.update(FAKE_ADB_STATE_FILE=str(self.state), FAKE_ADB_SCREEN_FILE=str(self.screen),
                          FAKE_ADB_LOG=str(self.log))
        self.state.write_text("device")
        self.screen.write_text("Asleep")
        self.cfg = cfg(adb=str(HERE / "fake_adb.py"))
        self.device = server.DeviceStatus()
        server.DeviceMonitor(self.cfg, self.device).poll_once()
        self.control = server.HeadsetControl(self.cfg, self.device, settle=0)

    def tearDown(self):
        for key, value in self.env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def shell_calls(self):
        return [line for line in self.log.read_text().splitlines() if not line.startswith("dumpsys")]

    def test_wake_turns_the_display_on_and_keeps_it_on(self):
        self.assertEqual(self.device.snapshot()["screen"], "asleep")
        self.assertTrue(self.control.execute("c1", "WAKE"))
        snap = self.device.snapshot()
        self.assertEqual(snap["screen"], "awake")
        self.assertEqual(snap["lastCommand"]["action"], "WAKE")
        self.assertTrue(snap["lastCommand"]["ok"])
        self.assertEqual(self.shell_calls(), ["input keyevent KEYCODE_WAKEUP",
                                              "am broadcast -a com.oculus.vrpowermanager.prox_close"])

    def test_sleep_gives_the_proximity_sensor_back_and_turns_the_display_off(self):
        self.screen.write_text("Awake")
        self.assertTrue(self.control.execute("c2", "SLEEP"))
        self.assertEqual(self.device.snapshot()["screen"], "asleep")
        self.assertEqual(self.shell_calls(), ["am broadcast -a com.oculus.vrpowermanager.automation_disable",
                                              "input keyevent KEYCODE_SLEEP"])

    def test_a_disconnected_headset_is_not_touched(self):
        self.state.write_text("none")
        server.DeviceMonitor(self.cfg, self.device).poll_once()
        self.log.write_text("")
        self.assertFalse(self.control.execute("c3", "WAKE"))
        self.assertEqual(self.shell_calls(), [])
        self.assertIn("not connected", self.device.snapshot()["lastCommand"]["error"])

    def test_the_same_press_runs_once(self):
        self.control.submit("c4", "WAKE", wait=True)
        self.screen.write_text("Asleep")
        self.assertIsNone(self.control.submit("c4", "WAKE", wait=True))
        self.assertEqual(self.screen.read_text(), "Asleep")

    def test_an_adb_failure_is_reported(self):
        def failing(cmd, **kw):
            return subprocess.CompletedProcess(cmd, 1, "", "error: closed")
        control = server.HeadsetControl(self.cfg, self.device, runner=failing, settle=0)
        self.assertFalse(control.execute("c5", "WAKE"))
        self.assertIn("error: closed", self.device.snapshot()["lastCommand"]["error"])

    def test_unknown_action_is_refused(self):
        self.assertFalse(self.control.execute("c6", "POWER_OFF"))


if __name__ == "__main__":
    unittest.main()
