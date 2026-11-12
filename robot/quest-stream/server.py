#!/usr/bin/env python3
"""Quest 3 -> USB/ADB -> FFmpeg -> MediaMTX (RTSP publish) -> WebRTC viewers.

One process, two jobs:

* a supervisor thread that keeps ``adb exec-out screenrecord`` piped into one
  long-lived FFmpeg (left eye, 16:9 crop, 1280x720, 30 fps, H.264 constrained
  baseline, no B-frames) that publishes to MediaMTX over RTSP, and restarts
  the pieces with back-off when the Quest, ADB, FFmpeg or MediaMTX fail;
* a device monitor thread that, every few seconds, asks ``adb devices -l``
  whether the Quest is attached / authorised and reads its battery with
  ``adb shell dumpsys battery`` (separate short adb calls; the video pipeline
  is not touched);
* a small HTTP server (stdlib only) with ``/status``, ``/device`` and ``/health``.

Browsers never talk to this process for video: MediaMTX serves the path over
WebRTC (WHEP, ``http://<NUC>:8889/quest/whep``). Nothing is written to disk
except logs.

Configuration is environment only (see ``quest-stream.env.example``). Python
3.8+, no third-party packages.
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import os
import random
import re
import shutil
import socket
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

MODULE_DIR = Path(__file__).resolve().parent

log = logging.getLogger("quest-stream")


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------


def _env(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return value if value else default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        raise SystemExit(f"CONFIG_ERROR {name} must be a number")


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        raise SystemExit(f"CONFIG_ERROR {name} must be an integer")


@dataclass
class Config:
    host: str = "0.0.0.0"
    port: int = 8080
    cors_origin: str = "*"

    adb: str = "adb"
    ffmpeg: str = "ffmpeg"
    serial: str = ""  # empty = the single attached device

    # Picture: which eye, how much of it, where the window sits.
    eye: str = "left"
    crop_keep: float = 0.80  # fraction of one eye's width kept (cuts the lens border)
    crop_offset_x: float = 0.0  # shift of the window centre, fraction of eye width (+ = right)
    crop_offset_y: float = 0.0  # fraction of eye height (+ = down)
    width: int = 1280
    height: int = 720
    fps: int = 30
    vf_override: str = ""  # full -vf replacement for experiments

    # Encoder.
    encoder: str = "libx264"  # or h264_vaapi
    x264_preset: str = "veryfast"
    bitrate: str = "4M"
    maxrate: str = "6M"
    bufsize: str = "8M"
    vaapi_device: str = "/dev/dri/renderD128"
    hwdec: str = ""  # "vaapi" = decode the Quest's H.264 on the iGPU

    # Capture on the Quest.
    capture_size: str = ""  # screenrecord --size WxH, empty = native
    capture_bitrate: int = 20_000_000
    screenrecord_limit: int = 180  # Android caps a screenrecord session at 180 s
    keep_awake: bool = False  # disable the proximity sensor while streaming
    # "screenrecord" (adb, no setup) or "scrcpy": scrcpy-server sends only one eye, at most
    # scrcpy_max_fps frames per second, so the NUC decodes far less and the picture lags far less.
    capture: str = "screenrecord"
    scrcpy_server: Path = MODULE_DIR / "bin" / "scrcpy-server"
    scrcpy_version: str = ""  # empty = bin/scrcpy-server.version (written by install-scrcpy-server.sh)
    scrcpy_max_fps: int = 0  # 0 = the output fps
    scrcpy_max_size: int = 1600  # longest side sent by the Quest, 0 = full eye
    scrcpy_crop: str = ""  # W:H:X:Y on the Quest display, empty = the chosen eye's half
    scrcpy_angle: float = 0.0  # rotate the eye image clockwise on the Quest (degrees), after the crop

    # Camera on demand (ADR-0052): capture only while the backend says someone needs the camera
    # (a Tour runs on this robot, or a Staff page holds a lease). Empty control_url = always capture.
    control_url: str = ""  # https://<api>/api/fleet/camera/v1/poll ("auto" in the env = from FLEET_SYNC_URL)
    robot_code: str = ""  # the Fleet robot identity (FLEET_ROBOT_CODE)
    robot_credential_file: str = ""  # the Fleet robot credential (FLEET_ROBOT_CREDENTIAL_FILE)
    control_failsafe: bool = True  # capture when the backend has never answered / not for control_grace
    control_grace: float = 60.0  # keep the last answer this long while the backend cannot be reached
    # ADR-0056: the same poll reports the headset (battery, adb, video) for the web. Off = keep polling and reporting,
    # but capture whenever the Quest is plugged in, as without a control URL.
    camera_on_demand: bool = True

    # Output: where FFmpeg publishes (MediaMTX RTSP) and how often a keyframe
    # is sent (a new WebRTC viewer starts on the next keyframe).
    publish_url: str = "rtsp://127.0.0.1:8554/quest"
    keyframe_interval: float = 1.0
    log_dir: Path = MODULE_DIR / "logs"

    # Supervision.
    stall_timeout: float = 10.0  # no bytes from the Quest for this long = stalled
    poll_min: float = 2.0  # device poll back-off while the Quest is missing
    poll_max: float = 10.0
    device_poll: float = 5.0  # seconds between headset/battery checks for /device

    @classmethod
    def from_env(cls) -> "Config":
        cfg = cls(
            host=_env("QUEST_STREAM_HOST", "0.0.0.0"),
            port=_env_int("QUEST_STREAM_PORT", 8080),
            cors_origin=_env("QUEST_CORS_ORIGIN", "*"),
            adb=_env("QUEST_ADB", "adb"),
            ffmpeg=_env("QUEST_FFMPEG", "ffmpeg"),
            serial=_env("QUEST_SERIAL", ""),
            eye=_env("QUEST_EYE", "left").lower(),
            crop_keep=_env_float("QUEST_CROP_KEEP", 0.80),
            crop_offset_x=_env_float("QUEST_CROP_OFFSET_X", 0.0),
            crop_offset_y=_env_float("QUEST_CROP_OFFSET_Y", 0.0),
            width=_env_int("QUEST_OUTPUT_WIDTH", 1280),
            height=_env_int("QUEST_OUTPUT_HEIGHT", 720),
            fps=_env_int("QUEST_FPS", 30),
            vf_override=_env("QUEST_VF", ""),
            encoder=_env("QUEST_ENCODER", "libx264"),
            x264_preset=_env("QUEST_X264_PRESET", "veryfast"),
            bitrate=_env("QUEST_VIDEO_BITRATE", "4M"),
            maxrate=_env("QUEST_VIDEO_MAXRATE", "6M"),
            bufsize=_env("QUEST_VIDEO_BUFSIZE", "8M"),
            vaapi_device=_env("QUEST_VAAPI_DEVICE", "/dev/dri/renderD128"),
            hwdec=_env("QUEST_HWDEC", "").lower(),
            capture_size=_env("QUEST_CAPTURE_SIZE", ""),
            capture_bitrate=_env_int("QUEST_CAPTURE_BITRATE", 20_000_000),
            screenrecord_limit=_env_int("QUEST_SCREENRECORD_LIMIT", 180),
            keep_awake=_env("QUEST_KEEP_AWAKE", "0") in ("1", "true", "yes"),
            capture=_env("QUEST_CAPTURE", "screenrecord").lower(),
            scrcpy_server=Path(_env("QUEST_SCRCPY_SERVER", str(MODULE_DIR / "bin" / "scrcpy-server"))),
            scrcpy_version=_env("QUEST_SCRCPY_VERSION", ""),
            scrcpy_max_fps=_env_int("QUEST_SCRCPY_MAX_FPS", 0),
            scrcpy_max_size=_env_int("QUEST_SCRCPY_MAX_SIZE", 1600),
            scrcpy_crop=_env("QUEST_SCRCPY_CROP", ""),
            scrcpy_angle=_env_float("QUEST_SCRCPY_ANGLE", 0.0),
            publish_url=_env("QUEST_PUBLISH_URL", "rtsp://127.0.0.1:8554/quest"),
            keyframe_interval=_env_float("QUEST_KEYFRAME_INTERVAL", 1.0),
            log_dir=Path(_env("QUEST_LOG_DIR", str(MODULE_DIR / "logs"))),
            stall_timeout=_env_float("QUEST_STALL_TIMEOUT", 10.0),
            device_poll=_env_float("QUEST_DEVICE_POLL", 5.0),
        )
        cfg.control_url, cfg.robot_code, cfg.robot_credential_file = resolve_control_settings(
            _env("QUEST_CONTROL_URL", ""),
            _env("QUEST_ROBOT_CODE", ""),
            _env("QUEST_ROBOT_CREDENTIAL_FILE", ""),
            read_env_file(Path(_env("QUEST_FLEET_ENV", str(Path.home() / ".config" / "campustour" / "fleet-sync.env")))),
        )
        cfg.control_failsafe = _env("QUEST_CONTROL_FAILSAFE", "on").lower() in ("1", "on", "true", "yes")
        cfg.control_grace = _env_float("QUEST_CONTROL_GRACE", 60.0)
        cfg.camera_on_demand = _env("QUEST_CAMERA_ON_DEMAND", "on").lower() in ("1", "on", "true", "yes")
        cfg.validate()
        return cfg

    def validate(self) -> None:
        if self.eye not in ("left", "right"):
            raise SystemExit("CONFIG_ERROR QUEST_EYE must be 'left' or 'right'")
        if not 0.2 <= self.crop_keep <= 1.0:
            raise SystemExit("CONFIG_ERROR QUEST_CROP_KEEP must be between 0.2 and 1.0")
        if self.width % 2 or self.height % 2:
            raise SystemExit("CONFIG_ERROR output width/height must be even")
        if self.encoder not in ("libx264", "h264_vaapi"):
            raise SystemExit("CONFIG_ERROR QUEST_ENCODER must be libx264 or h264_vaapi")
        if self.hwdec not in ("", "vaapi"):
            raise SystemExit("CONFIG_ERROR QUEST_HWDEC must be empty or 'vaapi'")
        if self.control_url:
            if urlsplit(self.control_url).scheme not in ("https", "http"):
                raise SystemExit("CONFIG_ERROR QUEST_CONTROL_URL must be https://<api>/api/fleet/camera/v1/poll or 'auto'")
            if not self.robot_code or not self.robot_credential_file:
                raise SystemExit("CONFIG_ERROR QUEST_CONTROL_URL needs the robot code and credential file "
                                 "(fleet-sync.env from robot/scripts/setup_fleet_sync.py, or QUEST_ROBOT_CODE + "
                                 "QUEST_ROBOT_CREDENTIAL_FILE)")
        if self.control_grace < 0:
            raise SystemExit("CONFIG_ERROR QUEST_CONTROL_GRACE must be >= 0")
        if self.capture not in ("screenrecord", "scrcpy"):
            raise SystemExit("CONFIG_ERROR QUEST_CAPTURE must be 'screenrecord' or 'scrcpy'")
        if self.scrcpy_crop and not re.fullmatch(r"\d+:\d+:\d+:\d+", self.scrcpy_crop):
            raise SystemExit("CONFIG_ERROR QUEST_SCRCPY_CROP must look like 2064:2208:0:0")
        if not 0 <= self.scrcpy_max_fps <= 120 or self.scrcpy_max_size < 0:
            raise SystemExit("CONFIG_ERROR QUEST_SCRCPY_MAX_FPS must be 0-120 and QUEST_SCRCPY_MAX_SIZE >= 0")
        if not -360 <= self.scrcpy_angle <= 360:
            raise SystemExit("CONFIG_ERROR QUEST_SCRCPY_ANGLE must be between -360 and 360 degrees")
        parts = urlsplit(self.publish_url)
        if parts.scheme not in ("rtsp", "rtsps") or not parts.hostname or len(parts.path) < 2:
            raise SystemExit("CONFIG_ERROR QUEST_PUBLISH_URL must look like rtsp://127.0.0.1:8554/quest")
        if not 2 <= self.device_poll <= 60:
            raise SystemExit("CONFIG_ERROR QUEST_DEVICE_POLL must be between 2 and 60 seconds")
        if not 0.2 <= self.keyframe_interval <= 10:
            raise SystemExit("CONFIG_ERROR QUEST_KEYFRAME_INTERVAL must be between 0.2 and 10 seconds")

    @property
    def publish_endpoint(self) -> Tuple[str, int]:
        parts = urlsplit(self.publish_url)
        return parts.hostname or "127.0.0.1", parts.port or (322 if parts.scheme == "rtsps" else 554)

    @property
    def path_name(self) -> str:
        """The MediaMTX path, e.g. 'quest' (the WHEP URL is /<path>/whep)."""
        return urlsplit(self.publish_url).path.strip("/")

    @property
    def publish_url_safe(self) -> str:
        """publish_url without a password, for logs and /status."""
        parts = urlsplit(self.publish_url)
        if parts.password is None:
            return self.publish_url
        netloc = f"{parts.username}:***@{parts.hostname}" + (f":{parts.port}" if parts.port else "")
        return urlunsplit(parts._replace(netloc=netloc))


# --------------------------------------------------------------------------
# FFmpeg command
# --------------------------------------------------------------------------


def build_video_filter(cfg: Config) -> str:
    """Stereo side-by-side frame -> one eye -> centred 16:9 window -> WxH@fps.

    Every expression is relative to the input size, so the same filter works
    whatever resolution the Quest's screenrecord produces.
    """
    if cfg.vf_override:
        return cfg.vf_override

    eye_x = "0" if cfg.eye == "left" else "iw/2"
    aspect = f"{cfg.width}/{cfg.height}"
    keep = f"{cfg.crop_keep:g}"
    ox = f"{cfg.crop_offset_x:g}"
    oy = f"{cfg.crop_offset_y:g}"
    steps = [
        # 1. one eye: the left (or right) half of the stereo frame. scrcpy already
        #    sends a single eye (cropped on the Quest), so it skips this step.
        *([] if cfg.capture == "scrcpy" else [f"crop=w=iw/2:h=ih:x={eye_x}:y=0"]),
        # 2. a 16:9 window, `keep` of the eye's width, centred (+ offset),
        #    never larger than the eye and never outside it
        (
            f"crop=w='trunc(min(iw*{keep}\\,ih*{aspect})/2)*2'"
            f":h='trunc(ow/({aspect})/2)*2'"
            f":x='max(0\\,min(iw-ow\\,(iw-ow)/2+iw*{ox}))'"
            f":y='max(0\\,min(ih-oh\\,(ih-oh)/2+ih*{oy}))'"
        ),
        # 3. constant frame rate before scaling, so we never scale frames we drop
        f"fps={cfg.fps}",
        f"scale={cfg.width}:{cfg.height}:flags=bicubic",
        "setsar=1",
    ]
    if cfg.encoder == "h264_vaapi":
        steps += ["format=nv12", "hwupload"]
    else:
        steps.append("format=yuv420p")
    return ",".join(steps)


def build_ffmpeg_command(cfg: Config) -> List[str]:
    gop = str(max(1, round(cfg.fps * cfg.keyframe_interval)))
    cmd = [cfg.ffmpeg, "-hide_banner", "-loglevel", "warning", "-nostats"]
    if cfg.encoder == "h264_vaapi":
        cmd += ["-vaapi_device", cfg.vaapi_device]
    if cfg.hwdec == "vaapi":
        cmd += ["-hwaccel", "vaapi", "-hwaccel_device", cfg.vaapi_device]
    cmd += [
        # Raw H.264 has no timestamps; stamp frames as they arrive so a
        # screenrecord restart (every 180 s) is just a short gap, not a reset.
        "-use_wallclock_as_timestamps", "1",
        "-fflags", "+genpts+nobuffer",
        "-flags", "low_delay",
        "-probesize", "5M",
        "-analyzeduration", "2M",
        "-f", "h264",
        "-i", "pipe:0",
        "-an",
        "-vf", build_video_filter(cfg),
    ]
    # WebRTC: every browser decodes H.264 constrained baseline, and B-frames
    # are not allowed at all.
    if cfg.encoder == "h264_vaapi":
        # Many Intel drivers cannot encode constrained baseline; main without
        # B-frames plays in every browser that plays WebRTC H.264.
        cmd += ["-c:v", "h264_vaapi", "-profile:v", "main", "-bf", "0"]
    else:
        cmd += [
            "-c:v", "libx264",
            "-preset", cfg.x264_preset,
            "-tune", "zerolatency",
            "-profile:v", "baseline",
            "-level:v", "3.1" if cfg.width * cfg.height <= 1280 * 720 and cfg.fps <= 30 else "4.1",
            "-pix_fmt", "yuv420p",
            "-bf", "0",
            # SPS/PPS before every keyframe: a viewer that joins late decodes at once.
            "-x264-params", "repeat-headers=1",
        ]
    cmd += [
        "-b:v", cfg.bitrate,
        "-maxrate", cfg.maxrate,
        "-bufsize", cfg.bufsize,
        "-g", gop,
        "-keyint_min", gop,
        "-sc_threshold", "0",
        "-progress", "pipe:1",
        "-stats_period", "0.5",
        "-f", "rtsp",
        "-rtsp_transport", "tcp",
        cfg.publish_url,
    ]
    return cmd


def mediamtx_reachable(cfg: Config, timeout: float = 2.0) -> Tuple[bool, str]:
    """Is something listening where FFmpeg will publish?"""
    host, port = cfg.publish_endpoint
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, "ok"
    except OSError as exc:
        return False, (
            f"cannot reach {host}:{port} ({exc.strerror or exc}); "
            "is MediaMTX running? sudo systemctl status mediamtx"
        )


def build_screenrecord_command(cfg: Config, serial: str) -> List[str]:
    cmd = [cfg.adb, "-s", serial, "exec-out", "screenrecord", "--output-format=h264"]
    cmd += ["--bit-rate", str(cfg.capture_bitrate)]
    cmd += ["--time-limit", str(cfg.screenrecord_limit)]
    if cfg.capture_size:
        cmd += ["--size", cfg.capture_size]
    cmd.append("-")
    return cmd


# --------------------------------------------------------------------------
# scrcpy capture (QUEST_CAPTURE=scrcpy)
# --------------------------------------------------------------------------

SCRCPY_REMOTE_PATH = "/data/local/tmp/scrcpy-server.jar"


def scrcpy_server_version(cfg: Config) -> str:
    """The version scrcpy-server must be started with (it refuses any other)."""
    if cfg.scrcpy_version:
        return cfg.scrcpy_version.lstrip("v")
    try:
        return cfg.scrcpy_server.with_name(cfg.scrcpy_server.name + ".version").read_text("utf-8").strip().lstrip("v")
    except OSError:
        return ""


def parse_wm_size(output: str) -> Optional[Tuple[int, int]]:
    """`adb shell wm size` -> (width, height); an override size wins over the physical one."""
    sizes = dict(re.findall(r"(Physical|Override) size:\s*(\d+x\d+)", output))
    value = sizes.get("Override") or sizes.get("Physical")
    if not value:
        return None
    w, h = value.split("x")
    return int(w), int(h)


def eye_crop(size: Tuple[int, int], eye: str) -> str:
    """scrcpy crop W:H:X:Y for one half of the side-by-side Quest display."""
    w, h = size
    half = (w // 2) - (w // 2) % 2
    return f"{half}:{h - h % 2}:{0 if eye == 'left' else w - half}:0"


def build_scrcpy_server_command(cfg: Config, serial: str, scid: str, crop: str, version: str) -> List[str]:
    """Start scrcpy-server on the Quest: raw H.264 of one eye, video only, no control."""
    args = [
        f"CLASSPATH={SCRCPY_REMOTE_PATH}", "app_process", "/", "com.genymobile.scrcpy.Server", version,
        f"scid={scid}", "log_level=warn", "tunnel_forward=true",
        "audio=false", "control=false", "cleanup=true",
        # Plain Annex-B H.264 (what FFmpeg's -f h264 reads); the dummy byte (a 0x00, harmless
        # before a start code) confirms the connection reached the server, not just adb.
        "raw_stream=true", "send_dummy_byte=true",
        "video_codec=h264", f"video_bit_rate={cfg.capture_bitrate}",
        f"max_fps={cfg.scrcpy_max_fps or cfg.fps}", f"max_size={cfg.scrcpy_max_size}",
        f"crop={crop}",
    ]
    if cfg.scrcpy_angle:
        # Rotates after the crop, on the Quest (scrcpy >= 3.0); only sent when set, so
        # older servers that do not know the option still start.
        args.append(f"angle={cfg.scrcpy_angle:g}")
    return [cfg.adb, "-s", serial, "shell", " ".join(args)]


def _connect_scrcpy(port: int, server: subprocess.Popen, timeout: float = 15.0) -> Optional[Tuple[socket.socket, bytes]]:
    """Connect through the adb forward; adb accepts and drops us until the server listens."""
    deadline = time.time() + timeout
    while time.time() < deadline and server.poll() is None:
        try:
            sock = socket.create_connection(("127.0.0.1", port), timeout=3)
            sock.settimeout(5)
            first = sock.recv(1)
            if first:
                sock.settimeout(None)
                return sock, first
            sock.close()
        except OSError:
            pass
        time.sleep(0.2)
    return None


def run_scrcpy_capture(cfg: Config, serial: str) -> int:
    """`server.py --scrcpy-capture SERIAL`: raw H.264 of one eye on stdout, like screenrecord.

    The supervisor runs this instead of `adb exec-out screenrecord`, so everything after
    the capture (stall detection, FFmpeg, MediaMTX) is the same for both methods.
    """
    out = sys.stdout.buffer

    def fail(code: int, message: str) -> int:
        print(f"SCRCPY_ERROR {message}", file=sys.stderr, flush=True)
        return code

    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))  # run the cleanup below on stop
    version = scrcpy_server_version(cfg)
    if not cfg.scrcpy_server.is_file() or not version:
        return fail(2, f"{cfg.scrcpy_server} or its version is missing; run scripts/install-scrcpy-server.sh")
    adb = [cfg.adb, "-s", serial]
    try:
        subprocess.run(adb + ["push", str(cfg.scrcpy_server), SCRCPY_REMOTE_PATH],
                       check=True, capture_output=True, timeout=30)
        crop = cfg.scrcpy_crop
        if not crop:
            size = parse_wm_size(subprocess.run(adb + ["shell", "wm", "size"], capture_output=True,
                                                text=True, timeout=10).stdout)
            if size is None:
                return fail(2, "cannot read the display size (adb shell wm size); set QUEST_SCRCPY_CROP")
            crop = eye_crop(size, cfg.eye)
        scid = f"{random.getrandbits(31):08x}"
        port = subprocess.run(adb + ["forward", "tcp:0", f"localabstract:scrcpy_{scid}"],
                              check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    except (subprocess.SubprocessError, OSError) as exc:
        return fail(3, f"adb setup failed: {exc}")

    print(f"SCRCPY_START version={version} crop={crop} max_fps={cfg.scrcpy_max_fps or cfg.fps} "
          f"max_size={cfg.scrcpy_max_size} angle={cfg.scrcpy_angle:g}", file=sys.stderr, flush=True)
    server = subprocess.Popen(build_scrcpy_server_command(cfg, serial, scid, crop, version),
                              stdin=subprocess.DEVNULL, stdout=sys.stderr, stderr=sys.stderr)
    try:
        connected = _connect_scrcpy(int(port), server)
        if connected is None:
            return fail(4, "scrcpy-server did not start (wrong version, or the Quest refused it)")
        sock, first = connected
        with sock:
            out.write(first)
            while True:
                data = sock.recv(65536)
                if not data:
                    return 0
                out.write(data)
                out.flush()
    except (BrokenPipeError, OSError):
        return 0
    finally:
        _kill(server)
        subprocess.run(adb + ["forward", "--remove", f"tcp:{port}"], capture_output=True, timeout=5)


# --------------------------------------------------------------------------
# ADB helpers
# --------------------------------------------------------------------------


def parse_adb_devices(output: str) -> List[Tuple[str, str, Dict[str, str]]]:
    """``adb devices -l`` -> [(serial, state, {model: ..., device: ...})]."""
    devices = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("List of devices") or line.startswith("*"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        props = dict(p.split(":", 1) for p in parts[2:] if ":" in p)
        devices.append((parts[0], parts[1], props))
    return devices


class AdbUnavailable(Exception):
    pass


def list_devices(cfg: Config) -> List[Tuple[str, str, Dict[str, str]]]:
    if shutil.which(cfg.adb) is None and not Path(cfg.adb).is_file():
        raise AdbUnavailable(f"adb not found ({cfg.adb}); install with: sudo apt install adb")
    try:
        out = subprocess.run(
            [cfg.adb, "devices", "-l"], capture_output=True, text=True, timeout=10
        )
    except subprocess.TimeoutExpired:
        raise AdbUnavailable("adb devices timed out (adb server hung? try: adb kill-server)")
    if out.returncode != 0:
        raise AdbUnavailable(f"adb devices failed: {out.stderr.strip()[:300]}")
    return parse_adb_devices(out.stdout)


def pick_quest(
    devices: List[Tuple[str, str, Dict[str, str]]], wanted_serial: str
) -> Tuple[Optional[str], str]:
    """Return (serial, reason). serial is None when no usable Quest is attached."""
    if wanted_serial:
        devices = [d for d in devices if d[0] == wanted_serial]
        if not devices:
            return None, f"device {wanted_serial} not attached"
    if not devices:
        return None, "no ADB device attached (check USB cable, Quest powered on, developer mode)"
    ready = [d for d in devices if d[1] == "device"]
    if not ready:
        serial, state, _ = devices[0]
        hint = {
            "unauthorized": "put the headset on and accept 'Allow USB debugging'",
            "offline": "replug USB or run: adb kill-server && adb start-server",
        }.get(state, "")
        return None, f"device {serial} is '{state}'" + (f": {hint}" if hint else "")
    if len(ready) > 1 and not wanted_serial:
        # Prefer something that looks like a Quest; set QUEST_SERIAL to be explicit.
        quests = [d for d in ready if "quest" in d[2].get("model", "").lower()]
        if quests:
            return quests[0][0], "ok"
    return ready[0][0], "ok"


# --------------------------------------------------------------------------
# Shared status
# --------------------------------------------------------------------------


@dataclass
class Status:
    state: str = "starting"  # starting | connecting | live | paused | offline | error | stopped
    reason: str = ""
    serial: str = ""
    model: str = ""
    since: float = field(default_factory=time.time)
    run_id: str = ""
    restarts: int = 0
    last_input_at: float = 0.0
    input_bytes: int = 0
    progress: Dict[str, str] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def set(self, state: str, reason: str = "", **extra) -> None:
        with self.lock:
            if state != self.state:
                self.since = time.time()
            self.state = state
            self.reason = reason
            for k, v in extra.items():
                setattr(self, k, v)

    def snapshot(self, cfg: Config) -> dict:
        with self.lock:
            now = time.time()
            p = dict(self.progress)
            return {
                "state": self.state,
                "reason": self.reason,
                "since": round(self.since, 3),
                "serial": self.serial,
                "model": self.model,
                "runId": self.run_id,
                "restarts": self.restarts,
                "secondsSinceInput": round(now - self.last_input_at, 1) if self.last_input_at else None,
                "inputBytes": self.input_bytes,
                "output": {
                    "width": cfg.width,
                    "height": cfg.height,
                    "targetFps": cfg.fps,
                    "eye": cfg.eye,
                    "encoder": cfg.encoder,
                    "targetBitrate": cfg.bitrate,
                    "fps": p.get("fps"),
                    "bitrate": p.get("bitrate"),
                    "speed": p.get("speed"),
                    "frames": p.get("frame"),
                    "dropFrames": p.get("drop_frames"),
                    "dupFrames": p.get("dup_frames"),
                },
                "publish": cfg.publish_url_safe,
                "whepPath": f"/{cfg.path_name}/whep",
            }


# --------------------------------------------------------------------------
# Camera on demand (ADR-0052)
# --------------------------------------------------------------------------

FLEET_SYNC_PATH = "/api/fleet/v1/sync"
CAMERA_POLL_PATH = "/api/fleet/camera/v1/poll"


def read_env_file(path: Path) -> Dict[str, str]:
    """KEY=VALUE lines (as written by robot/scripts/setup_fleet_sync.py); missing file = {}."""
    values: Dict[str, str] = {}
    try:
        text = path.read_text("utf-8")
    except OSError:
        return values
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("'\"")
    return values


def resolve_control_settings(url: str, robot_code: str, credential_file: str,
                             fleet_env: Dict[str, str]) -> Tuple[str, str, str]:
    """(control URL, robot code, credential file); 'auto' derives the URL from FLEET_SYNC_URL."""
    robot_code = robot_code or fleet_env.get("FLEET_ROBOT_CODE", "")
    credential_file = credential_file or fleet_env.get("FLEET_ROBOT_CREDENTIAL_FILE", "")
    if url.lower() == "auto":
        sync_url = fleet_env.get("FLEET_SYNC_URL", "")
        if not sync_url.endswith(FLEET_SYNC_PATH):
            raise SystemExit("CONFIG_ERROR QUEST_CONTROL_URL=auto needs FLEET_SYNC_URL=https://<api>/api/fleet/v1/sync "
                             "in fleet-sync.env (robot/scripts/setup_fleet_sync.py), or set the full URL")
        url = sync_url[: -len(FLEET_SYNC_PATH)] + CAMERA_POLL_PATH
    return url, robot_code, credential_file


class CameraDemand(threading.Thread):
    """Asks the backend every few seconds whether anyone needs this robot's camera.

    Without a control URL the camera is always wanted (the behaviour before ADR-0052). When the backend
    cannot answer, the last answer holds for ``control_grace`` seconds, then ``control_failsafe`` decides:
    by default the camera keeps running, so a backend outage never blacks out a running Tour.
    """

    def __init__(self, cfg: Config, opener=urlopen, clock=time.time, report=None, on_headset_command=None):
        super().__init__(name="camera-demand", daemon=True)
        self.cfg = cfg
        # Polling (and the headset report) runs with a control URL; deciding the camera also needs camera_on_demand.
        self.polling = bool(cfg.control_url)
        self.enabled = self.polling and cfg.camera_on_demand
        self._report = report  # () -> dict sent as the poll body (ADR-0056), or None
        self._on_headset_command = on_headset_command  # (id, action) -> None: a Staff wake/sleep press, or None
        self.changed = threading.Event()
        self.stop_event = threading.Event()
        self._opener = opener
        self._clock = clock
        self._lock = threading.Lock()
        self._wanted: Optional[bool] = None
        self._reason = ""
        self._last_ok = 0.0
        self._error = ""
        self._poll = 5.0

    def wanted(self) -> bool:
        if not self.enabled:
            return True
        with self._lock:
            if self._wanted is not None and self._clock() - self._last_ok <= self.cfg.control_grace:
                return self._wanted
            return self.cfg.control_failsafe

    def reason(self) -> str:
        if not self.enabled:
            return "ALWAYS_ON"
        with self._lock:
            if self._wanted is not None and self._clock() - self._last_ok <= self.cfg.control_grace:
                return self._reason
            return f"BACKEND_UNREACHABLE ({self._error or 'no answer yet'})"

    def snapshot(self) -> dict:
        with self._lock:
            last_ok = self._last_ok
            error = self._error
        return {"enabled": self.enabled, "wanted": self.wanted(), "reason": self.reason(),
                "lastAnswerAt": round(last_ok, 3) if last_ok else None, "error": error or None}

    def poll_once(self) -> None:
        before = self.wanted()
        try:
            credential = Path(self.cfg.robot_credential_file).read_text("utf-8").strip()
            request = Request(self.cfg.control_url, data=self._body(), method="POST", headers={
                "Authorization": f"Bearer {credential}",
                "X-Robot-Code": self.cfg.robot_code,
                "Content-Type": "application/json",
            })
            with self._opener(request, timeout=8) as response:
                body = json.loads(response.read().decode("utf-8"))
            data = body.get("data") or {}
            if not isinstance(data.get("wanted"), bool):
                raise ValueError("answer without data.wanted")
            with self._lock:
                self._wanted = data["wanted"]
                self._reason = str(data.get("reason") or "")
                self._last_ok = self._clock()
                self._error = ""
                poll = data.get("pollSeconds")
                if isinstance(poll, (int, float)) and 1 <= poll <= 60:
                    self._poll = float(poll)
            self._headset_command(data.get("headsetCommand"))
        except HTTPError as exc:
            why = (f"HTTP {exc.code}: the robot credential was refused (check {self.cfg.robot_credential_file})"
                   if exc.code in (401, 403) else f"HTTP {exc.code}")
            self._fail(why)
        except (URLError, OSError, ValueError) as exc:
            self._fail(str(getattr(exc, "reason", exc)))
        if self.wanted() != before:
            log.info("CAMERA_DEMAND %s (%s)", "on" if self.wanted() else "off", self.reason())
            self.changed.set()

    def _headset_command(self, order) -> None:
        """ADR-0056 addendum: hand a {id, action} press to the headset control; anything else is ignored."""
        if self._on_headset_command is None or not isinstance(order, dict):
            return
        command_id, action = order.get("id"), order.get("action")
        if not isinstance(command_id, str) or action not in HEADSET_ACTIONS:
            log.warning("HEADSET_COMMAND ignored: %r", order)
            return
        try:
            self._on_headset_command(command_id, action)
        except Exception as exc:  # noqa: BLE001 - a press never stops the camera poll
            log.warning("HEADSET_COMMAND not started: %s", exc)

    def _body(self) -> bytes:
        """The headset report as JSON; a failing report never stops the poll itself."""
        if self._report is None:
            return b""
        try:
            return json.dumps(self._report()).encode("utf-8")
        except Exception as exc:  # noqa: BLE001 - the camera decision matters more than the report
            log.debug("headset report skipped: %s", exc)
            return b""

    def _fail(self, why: str) -> None:
        with self._lock:
            if why != self._error:
                log.warning("CAMERA_DEMAND_ERROR %s", why)
            self._error = why

    def run(self) -> None:
        while not self.stop_event.is_set():
            self.poll_once()
            self.stop_event.wait(self._poll)

    def stop(self) -> None:
        self.stop_event.set()
        self.changed.set()


class AlwaysWanted:
    """Stand-in when no CameraDemand is given: capture whenever the Quest is attached."""

    enabled = False
    changed = threading.Event()

    def wanted(self) -> bool:
        return True

    def reason(self) -> str:
        return "ALWAYS_ON"


# --------------------------------------------------------------------------
# Device monitor: is the Quest attached, and how is its battery?
# --------------------------------------------------------------------------

#: ``adb devices`` state -> what /device reports.
ADB_STATE_TO_CONNECTION = {
    "device": "connected",
    "unauthorized": "unauthorized",
    "offline": "offline",
}

#: BatteryManager.BATTERY_STATUS_* values.
BATTERY_STATUS = {1: "unknown", 2: "charging", 3: "discharging", 4: "not_charging", 5: "full"}


def parse_battery(output: str) -> Optional[dict]:
    """``adb shell dumpsys battery`` -> {level, charging, plugged, status}.

    ``level`` is a percentage (scaled by ``scale``); ``plugged`` names the
    power source (AC, USB, Wireless) or None. Returns None when the output has
    no level (e.g. the command failed).
    """
    values: Dict[str, str] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.strip().partition(":")
        values[key.strip().lower()] = value.strip()
    try:
        level = int(values["level"])
    except (KeyError, ValueError):
        return None
    try:
        scale = int(values.get("scale", "100")) or 100
    except ValueError:
        scale = 100
    try:
        status_code = int(values.get("status", "1"))
    except ValueError:
        status_code = 1
    plugged = next(
        (name for key, name in (("ac powered", "AC"), ("usb powered", "USB"), ("wireless powered", "Wireless"))
         if values.get(key) == "true"),
        None,
    )
    status_name = BATTERY_STATUS.get(status_code, "unknown")
    return {
        "level": max(0, min(100, round(level * 100 / scale))),
        "charging": status_name == "charging",
        "plugged": plugged,
        "status": status_name,
    }


def read_battery(cfg: Config, serial: str, timeout: float = 5.0) -> Tuple[Optional[dict], str]:
    """One ``dumpsys battery`` call. Returns (battery or None, error text)."""
    try:
        out = subprocess.run(
            [cfg.adb, "-s", serial, "shell", "dumpsys", "battery"],
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return None, "dumpsys battery timed out"
    except OSError as exc:
        return None, f"cannot run adb: {exc}"
    if out.returncode != 0:
        return None, (out.stderr.strip() or "dumpsys battery failed")[:200]
    battery = parse_battery(out.stdout)
    return (battery, "") if battery else (None, "no battery level in dumpsys output")


#: ``dumpsys power`` mWakefulness -> the report's ``screen`` (ADR-0056 addendum). Dreaming keeps the display on.
WAKEFULNESS_TO_SCREEN = {"awake": "awake", "dreaming": "awake", "asleep": "asleep", "dozing": "asleep"}


def parse_screen(output: str) -> str:
    """``adb shell dumpsys power`` -> ``awake``, ``asleep`` or ``unknown``."""
    for line in output.splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key == "mWakefulness":
            return WAKEFULNESS_TO_SCREEN.get(value.strip().lower(), "unknown")
    return "unknown"


def read_screen(cfg: Config, serial: str, timeout: float = 5.0) -> str:
    """One ``dumpsys power`` call: is the headset's display on? ``unknown`` when adb cannot tell."""
    try:
        out = subprocess.run(
            [cfg.adb, "-s", serial, "shell", "dumpsys", "power"],
            capture_output=True, text=True, timeout=timeout,
        )
    except (subprocess.TimeoutExpired, OSError):
        return "unknown"
    return parse_screen(out.stdout) if out.returncode == 0 else "unknown"


@dataclass
class DeviceStatus:
    """What /device reports about the headset itself (not the video)."""

    connection: str = "unknown"  # connected | unauthorized | offline | not_found | adb_error | unknown
    reason: str = ""
    serial: str = ""
    model: str = ""
    battery: Optional[dict] = None
    battery_error: str = ""
    screen: str = "unknown"  # awake | asleep | unknown (ADR-0056 addendum)
    last_command: Optional[dict] = None  # the last Staff wake/sleep press and how it went
    checked_at: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, **values) -> None:
        with self.lock:
            for key, value in values.items():
                setattr(self, key, value)
            self.checked_at = time.time()

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "connection": self.connection,
                "reason": self.reason,
                "serial": self.serial,
                "model": self.model,
                "battery": dict(self.battery) if self.battery else None,
                "batteryError": self.battery_error or None,
                "screen": self.screen,
                "lastCommand": dict(self.last_command) if self.last_command else None,
                "checkedAt": round(self.checked_at, 3) if self.checked_at else None,
            }


def headset_report(device: "DeviceStatus", status: "Status") -> dict:
    """ADR-0056 poll body: the headset as /device sees it, battery and screen only while adb is connected."""
    snap = device.snapshot()
    # screen is always sent (unknown while adb is not connected): it also tells the backend that this quest-stream
    # runs Staff wake/sleep presses (ADR-0056 addendum).
    report = {"connection": snap["connection"], "stream": stream_summary(status.state),
              "screen": snap["screen"] if snap["connection"] == "connected" else "unknown"}
    battery = snap["battery"] or {}
    if snap["connection"] == "connected" and isinstance(battery.get("level"), int):
        report["batteryPercent"] = battery["level"]
        report["charging"] = bool(battery.get("charging"))
    return {"headset": report}


def stream_summary(state: str) -> str:
    """The video pipeline's state in the dashboard's three words."""
    if state == "live":
        return "live"
    if state in ("starting", "connecting"):
        return "connecting"
    if state == "paused":
        return "paused"  # ADR-0052: nobody needs the camera, so it is off on purpose
    return "lost"


class DeviceMonitor(threading.Thread):
    """Polls ``adb devices -l`` and ``dumpsys battery``. Read-only: it never
    restarts adb or touches the screenrecord/FFmpeg pipeline."""

    def __init__(self, cfg: Config, device: DeviceStatus):
        super().__init__(name="device-monitor", daemon=True)
        self.cfg = cfg
        self.device = device
        self.stop_event = threading.Event()

    def stop(self) -> None:
        self.stop_event.set()

    def poll_once(self) -> None:
        try:
            devices = list_devices(self.cfg)
        except AdbUnavailable as exc:
            self.device.update(connection="adb_error", reason=str(exc), battery=None, battery_error="", screen="unknown")
            return
        if self.cfg.serial:
            devices = [d for d in devices if d[0] == self.cfg.serial]
        if not devices:
            self.device.update(connection="not_found", reason="no ADB device attached",
                               serial="", model="", battery=None, battery_error="", screen="unknown")
            return
        ready = [d for d in devices if d[1] == "device"]
        quests = [d for d in ready if "quest" in d[2].get("model", "").lower()]
        serial, state, props = (quests or ready or devices)[0]
        connection = ADB_STATE_TO_CONNECTION.get(state, "offline")
        model = props.get("model", "").replace("_", " ")
        if connection != "connected":
            hint = {"unauthorized": "accept 'Allow USB debugging' in the headset"}.get(state, f"adb state '{state}'")
            self.device.update(connection=connection, reason=hint, serial=serial, model=model,
                               battery=None, battery_error="", screen="unknown")
            return
        battery, error = read_battery(self.cfg, serial)
        screen = read_screen(self.cfg, serial)
        self.device.update(connection="connected", reason="", serial=serial, model=model,
                           battery=battery, battery_error=error, screen=screen)

    def run(self) -> None:
        while not self.stop_event.is_set():
            try:
                self.poll_once()
            except Exception as exc:  # never let the monitor die
                log.warning("DEVICE_MONITOR_ERROR %s", exc)
                self.device.update(connection="unknown", reason=f"monitor error: {exc}")
            self.stop_event.wait(self.cfg.device_poll)


# --------------------------------------------------------------------------
# Headset wake/sleep: Staff presses delivered with the camera poll
# --------------------------------------------------------------------------

#: ADR-0056 addendum. WAKE turns the display on and keeps it on while nobody wears the headset (the proximity
#: sensor would otherwise put it back to sleep); SLEEP gives the proximity sensor back and turns the display off.
HEADSET_ACTIONS = {
    "WAKE": (["shell", "input", "keyevent", "KEYCODE_WAKEUP"],
             ["shell", "am", "broadcast", "-a", "com.oculus.vrpowermanager.prox_close"]),
    "SLEEP": (["shell", "am", "broadcast", "-a", "com.oculus.vrpowermanager.automation_disable"],
              ["shell", "input", "keyevent", "KEYCODE_SLEEP"]),
}


class HeadsetControl:
    """Runs a Staff wake/sleep press on the headset over adb, at most once per command id.

    Each press runs on its own short thread, so a slow adb never delays the camera poll. Afterwards the screen is read
    again, so the next poll already reports the result.
    """

    SETTLE_SECONDS = 1.0  # the display needs a moment before dumpsys power reports the new state

    def __init__(self, cfg: Config, device: DeviceStatus, runner=subprocess.run, clock=time.time,
                 settle: Optional[float] = None):
        self.cfg = cfg
        self.device = device
        self._run = runner
        self._clock = clock
        self._settle = self.SETTLE_SECONDS if settle is None else settle
        self._lock = threading.Lock()
        self._seen: List[str] = []

    def submit(self, command_id: str, action: str, wait: bool = False) -> Optional[threading.Thread]:
        """Starts the press unless this id already ran; ``wait`` runs it inline (tests). Returns the thread."""
        with self._lock:
            if command_id in self._seen:
                return None
            self._seen = (self._seen + [command_id])[-20:]
        if wait:
            self.execute(command_id, action)
            return None
        thread = threading.Thread(target=self.execute, args=(command_id, action), name="headset-command", daemon=True)
        thread.start()
        return thread

    def execute(self, command_id: str, action: str) -> bool:
        snap = self.device.snapshot()
        steps = HEADSET_ACTIONS.get(action)
        if steps is None:
            return self._done(command_id, action, False, f"unknown action {action!r}")
        if snap["connection"] != "connected" or not snap["serial"]:
            return self._done(command_id, action, False, f"headset not connected ({snap['connection']})")
        serial = snap["serial"]
        for step in steps:
            try:
                out = self._run([self.cfg.adb, "-s", serial, *step], capture_output=True, text=True, timeout=5)
            except (subprocess.TimeoutExpired, OSError) as exc:
                return self._done(command_id, action, False, f"adb {' '.join(step[1:3])}: {exc}")
            if out.returncode != 0:
                error = (out.stderr or "").strip()[:200] or f"exit {out.returncode}"
                return self._done(command_id, action, False, f"adb {' '.join(step[1:3])}: {error}")
        if self._settle:
            time.sleep(self._settle)
        self.device.update(screen=read_screen(self.cfg, serial))
        return self._done(command_id, action, True, "")

    def _done(self, command_id: str, action: str, ok: bool, error: str) -> bool:
        if ok:
            log.info("HEADSET_COMMAND %s done (id %s, screen %s)", action, command_id, self.device.snapshot()["screen"])
        else:
            log.warning("HEADSET_COMMAND %s failed (id %s): %s", action, command_id, error)
        self.device.update(last_command={"id": command_id, "action": action, "ok": ok, "error": error or None,
                                         "at": round(self._clock(), 3)})
        return ok


# --------------------------------------------------------------------------
# Supervisor
# --------------------------------------------------------------------------


def _kill(proc: Optional[subprocess.Popen], grace: float = 3.0) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=grace)
    except ProcessLookupError:
        pass


class Supervisor(threading.Thread):
    SHORT_SESSION = 3.0  # an adb session shorter than this is a failure, not a rollover
    MAX_SHORT_FAILURES = 5

    def __init__(self, cfg: Config, status: Status, demand=None):
        super().__init__(name="supervisor", daemon=True)
        self.cfg = cfg
        self.status = status
        self.demand = demand if demand is not None else AlwaysWanted()
        self.stop_event = threading.Event()
        self._ffmpeg: Optional[subprocess.Popen] = None
        self._adb: Optional[subprocess.Popen] = None
        self._awake_set = False

    # -- lifecycle -----------------------------------------------------------

    def stop(self) -> None:
        self.stop_event.set()
        _kill(self._adb)
        _kill(self._ffmpeg)

    def sleep(self, seconds: float) -> bool:
        """Interruptible sleep. Returns True if we should stop."""
        return self.stop_event.wait(seconds)

    def _wait_for_demand(self, seconds: float) -> bool:
        """Sleep until the camera demand changes, at most ``seconds``. Returns True if we should stop."""
        deadline = time.time() + seconds
        while time.time() < deadline:
            if self.demand.changed.wait(0.5):
                self.demand.changed.clear()
                break
            if self.stop_event.is_set():
                return True
        return self.stop_event.is_set()

    def _pause(self) -> None:
        """ADR-0052: nobody needs the camera. Nothing runs on the Quest; MediaMTX reports no stream."""
        reason = self.demand.reason()
        if self.status.state != "paused":
            log.info("CAMERA_OFF %s", reason)
        self._keep_awake(self.status.serial, False)
        self.status.set("paused", f"CAMERA_OFF: {reason}")

    def run(self) -> None:
        poll = self.cfg.poll_min
        ffmpeg_backoff = 2.0
        stall_backoff = 2.0
        last_missing_reason = None
        last_mediamtx_reason = None
        while not self.stop_event.is_set():
            if not self.demand.wanted():
                self._pause()
                if self._wait_for_demand(5.0):
                    break
                continue
            if self.status.state == "paused":
                log.info("CAMERA_ON %s", self.demand.reason())
            try:
                devices = list_devices(self.cfg)
            except AdbUnavailable as exc:
                if last_missing_reason != str(exc):
                    log.error("ADB_ERROR %s", exc)
                    last_missing_reason = str(exc)
                self.status.set("error", f"ADB_ERROR: {exc}")
                if self.sleep(15):
                    break
                continue

            serial, reason = pick_quest(devices, self.cfg.serial)
            if serial is None:
                if last_missing_reason != reason:
                    log.warning("QUEST_NOT_CONNECTED %s", reason)
                    last_missing_reason = reason
                self.status.set("offline", f"QUEST_NOT_CONNECTED: {reason}", serial="", model="")
                if self.sleep(poll):
                    break
                poll = min(self.cfg.poll_max, poll * 1.5)
                continue

            poll = self.cfg.poll_min
            last_missing_reason = None

            reachable, why = mediamtx_reachable(self.cfg)
            if not reachable:
                if last_mediamtx_reason != why:
                    log.error("MEDIAMTX_ERROR %s", why)
                    last_mediamtx_reason = why
                self.status.set("error", f"MEDIAMTX_ERROR: {why}")
                if self.sleep(3):
                    break
                continue
            last_mediamtx_reason = None

            model = self._model(serial)
            log.info("QUEST_CONNECTED serial=%s model=%s", serial, model or "?")
            self.status.set("connecting", "QUEST_CONNECTED", serial=serial, model=model)
            self._keep_awake(serial, True)

            started = time.time()
            outcome = self._run_session(serial)
            lived = time.time() - started

            if self.stop_event.is_set():
                break
            if outcome == "paused":
                continue  # the loop top pauses until someone needs the camera again
            if outcome == "ffmpeg":
                if lived > 60:
                    ffmpeg_backoff = 2.0
                log.warning("Restarting FFmpeg in %.0fs", ffmpeg_backoff)
                if self.sleep(ffmpeg_backoff):
                    break
                ffmpeg_backoff = min(10.0, ffmpeg_backoff * 2)
            elif outcome == "adb":
                if self.sleep(10):
                    break
            elif outcome == "stalled":
                # Headset asleep: retry, but slower and slower (max 30 s).
                if self.sleep(stall_backoff):
                    break
                stall_backoff = min(30.0, stall_backoff * 2)
            if outcome != "stalled" and lived > 30:
                stall_backoff = 2.0
            # "disconnected": loop straight back to device polling

        self._keep_awake(self.status.serial, False)
        self.status.set("stopped", "STREAM_STOPPED")
        log.info("STREAM_STOPPED supervisor exit")

    # -- helpers -------------------------------------------------------------

    def _model(self, serial: str) -> str:
        try:
            out = subprocess.run(
                [self.cfg.adb, "-s", serial, "shell", "getprop", "ro.product.model"],
                capture_output=True, text=True, timeout=5,
            )
            return out.stdout.strip()
        except (subprocess.TimeoutExpired, OSError):
            return ""

    def _keep_awake(self, serial: str, on: bool) -> None:
        """Optional: stop the Quest from sleeping when nobody wears it."""
        if not self.cfg.keep_awake or not serial or on == self._awake_set:
            return
        action = "prox_close" if on else "automation_disable"
        try:
            subprocess.run(
                [self.cfg.adb, "-s", serial, "shell", "am", "broadcast", "-a",
                 f"com.oculus.vrpowermanager.{action}"],
                capture_output=True, timeout=5,
            )
            self._awake_set = on
            log.info("QUEST_KEEP_AWAKE %s", "on" if on else "off")
        except (subprocess.TimeoutExpired, OSError) as exc:
            log.warning("QUEST_KEEP_AWAKE failed: %s", exc)

    def _device_still_there(self, serial: str) -> bool:
        try:
            found, _ = pick_quest(list_devices(self.cfg), serial)
            return found is not None
        except AdbUnavailable:
            return False

    def _start_ffmpeg(self, run_id: str) -> subprocess.Popen:
        cmd = build_ffmpeg_command(self.cfg)
        log.info("STREAM_STARTING run=%s", run_id)
        log.debug("ffmpeg: %s", " ".join(cmd))
        ffmpeg_log = open(self.cfg.log_dir / "ffmpeg.log", "w", encoding="utf-8")
        ffmpeg_log.write(" ".join(cmd).replace(self.cfg.publish_url, self.cfg.publish_url_safe) + "\n\n")
        ffmpeg_log.flush()
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=ffmpeg_log,
            bufsize=0,
        )
        proc._log_file = ffmpeg_log  # type: ignore[attr-defined]
        threading.Thread(target=self._read_progress, args=(proc,), daemon=True).start()
        return proc

    def _read_progress(self, proc: subprocess.Popen) -> None:
        """`-progress pipe:1` -> key=value blocks; keep the latest block."""
        block: Dict[str, str] = {}
        assert proc.stdout is not None
        for raw in iter(proc.stdout.readline, b""):
            line = raw.decode("utf-8", "replace").strip()
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            block[k] = v.strip()
            if k == "progress":
                with self.status.lock:
                    self.status.progress = dict(block)
                block = {}

    def _start_adb(self, serial: str) -> subprocess.Popen:
        adb_log = open(self.cfg.log_dir / "adb.log", "a", encoding="utf-8")
        cmd = (
            [sys.executable, "-u", str(Path(__file__).resolve()), "--scrcpy-capture", serial]
            if self.cfg.capture == "scrcpy" else build_screenrecord_command(self.cfg, serial)
        )
        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE, stderr=adb_log, stdin=subprocess.DEVNULL, bufsize=0,
        )

    def _pump(self, adb: subprocess.Popen, ffmpeg: subprocess.Popen) -> None:
        """Copy Quest H.264 bytes into FFmpeg's stdin. Nothing touches disk."""
        assert adb.stdout is not None and ffmpeg.stdin is not None
        try:
            while True:
                chunk = adb.stdout.read(65536)
                if not chunk:
                    return
                with self.status.lock:
                    self.status.last_input_at = time.time()
                    self.status.input_bytes += len(chunk)
                ffmpeg.stdin.write(chunk)
        except (BrokenPipeError, ValueError, OSError):
            return

    def _frames_out(self) -> int:
        with self.status.lock:
            try:
                return int(self.status.progress.get("frame", "0"))
            except ValueError:
                return 0

    def _ffmpeg_tail(self) -> str:
        try:
            lines = (self.cfg.log_dir / "ffmpeg.log").read_text("utf-8", "replace").splitlines()
            return " | ".join(lines[2:][-3:])[:500] or "(no ffmpeg stderr)"
        except OSError:
            return ""

    def _run_session(self, serial: str) -> str:
        """Run until something breaks.

        Returns 'disconnected', 'stalled', 'ffmpeg', 'adb', 'paused' or 'stop'.
        """
        run_id = time.strftime("%Y%m%d%H%M%S")
        self.cfg.log_dir.mkdir(parents=True, exist_ok=True)
        with self.status.lock:
            self.status.run_id = run_id
            self.status.progress = {}
            self.status.last_input_at = 0.0
            self.status.input_bytes = 0
        self._ffmpeg = self._start_ffmpeg(run_id)
        announced = False
        short_failures = 0
        outcome = "stop"

        try:
            while not self.stop_event.is_set():
                adb_started = time.time()
                self._adb = self._start_adb(serial)
                pump = threading.Thread(target=self._pump, args=(self._adb, self._ffmpeg), daemon=True)
                pump.start()

                # Watch this adb session.
                while not self.stop_event.is_set():
                    time.sleep(0.5)
                    if not self.demand.wanted():
                        self._pause()
                        return "paused"
                    if self._ffmpeg.poll() is not None:
                        log.error("FFMPEG_ERROR exit=%s %s", self._ffmpeg.returncode, self._ffmpeg_tail())
                        self.status.set("error", "FFMPEG_ERROR: encoder stopped, restarting")
                        return "ffmpeg"
                    if not announced and self._frames_out() > 0:
                        # FFmpeg only encodes after the RTSP publish succeeded.
                        announced = True
                        log.info("STREAM_STARTED publishing %s", self.cfg.publish_url_safe)
                        self.status.set("live", "STREAM_STARTED")
                    if self._adb.poll() is not None:
                        break
                    last = max(self.status.last_input_at, adb_started)
                    if time.time() - last > self.cfg.stall_timeout:
                        # Restart FFmpeg too: resuming after a long gap would
                        # make the fps filter emit a burst of duplicate frames.
                        log.warning(
                            "STREAM_STALLED no video from Quest for %.0fs "
                            "(headset asleep / display off?)", self.cfg.stall_timeout,
                        )
                        self.status.set("connecting", "STREAM_STALLED: no frames from the Quest")
                        return "stalled"

                pump.join(timeout=2)
                if self.stop_event.is_set():
                    return "stop"

                session = time.time() - adb_started
                if not self._device_still_there(serial):
                    log.warning("QUEST_NOT_CONNECTED device %s went away", serial)
                    self.status.set("offline", "QUEST_NOT_CONNECTED: USB disconnected")
                    outcome = "disconnected"
                    return outcome

                if session >= self.SHORT_SESSION:
                    # Normal 180 s screenrecord rollover: FFmpeg keeps running.
                    short_failures = 0
                    log.debug("screenrecord rollover after %.0fs", session)
                    continue

                short_failures += 1
                log.warning(
                    "ADB_ERROR %s ended after %.1fs (%d/%d) - see logs/adb.log", self.cfg.capture,
                    session, short_failures, self.MAX_SHORT_FAILURES,
                )
                if short_failures >= self.MAX_SHORT_FAILURES:
                    self.status.set("error", "ADB_ERROR: screenrecord keeps failing")
                    return "adb"
                if self.sleep(min(8.0, 1.0 * 2 ** short_failures)):
                    return "stop"
            return "stop"
        finally:
            with self.status.lock:
                self.status.restarts += 1
            _kill(self._adb)
            if self._ffmpeg and self._ffmpeg.stdin:
                try:
                    self._ffmpeg.stdin.close()
                except OSError:
                    pass
            _kill(self._ffmpeg)
            log_file = getattr(self._ffmpeg, "_log_file", None)
            if log_file:
                log_file.close()
            log.info("STREAM_STOPPED run=%s", run_id)


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


def make_handler(cfg: Config, status: Status, device: Optional[DeviceStatus] = None, demand=None):
    class Handler(BaseHTTPRequestHandler):
        server_version = "QuestStream/2.0"

        def log_message(self, fmt, *args):  # noqa: N802
            log.debug("http %s - %s", self.address_string(), fmt % args)

        def end_headers(self):
            self.send_header("Access-Control-Allow-Origin", cfg.cors_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            if cfg.cors_origin != "*":
                self.send_header("Vary", "Origin")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def _json(self, code: int, body: dict):
            data = json.dumps(body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)

        def do_OPTIONS(self):  # noqa: N802
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_HEAD(self):  # noqa: N802
            self.do_GET()

        def do_GET(self):  # noqa: N802
            path = self.path.split("?", 1)[0]
            if path in ("/health", "/healthz"):
                return self._json(200, {"ok": True})
            if path == "/status":
                body = status.snapshot(cfg)
                if demand is not None:
                    body["camera"] = demand.snapshot()
                return self._json(200, body)
            if path == "/device":
                # The headset (adb + battery) and the video, kept apart: a
                # connected headset can still have no live picture.
                stream = status.snapshot(cfg)
                body = device.snapshot() if device else DeviceStatus().snapshot()
                body.update({
                    "stream": stream_summary(stream["state"]),
                    "streamState": stream["state"],
                    "streamReason": stream["reason"],
                    "pollSeconds": cfg.device_poll,
                    "now": round(time.time(), 3),
                })
                return self._json(200, body)
            if path in ("/", ""):
                return self._json(200, {
                    "service": "quest-stream",
                    "status": "/status",
                    "device": "/device",
                    "publish": cfg.publish_url_safe,
                    "webrtc": f"http://<NUC_IP>:8889/{cfg.path_name}/whep",
                })
            return self._json(404, {"error": "not_found", "path": path})

    return Handler


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def setup_logging(cfg: Config) -> None:
    cfg.log_dir.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if os.environ.get("QUEST_DEBUG") == "1" else logging.INFO)
    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(fmt)
    root.addHandler(stream)
    fileh = logging.handlers.RotatingFileHandler(
        cfg.log_dir / "quest-stream.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
    )
    fileh.setFormatter(fmt)
    root.addHandler(fileh)


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--scrcpy-capture":
        return run_scrcpy_capture(Config.from_env(), sys.argv[2])
    cfg = Config.from_env()
    setup_logging(cfg)
    if shutil.which(cfg.ffmpeg) is None and not Path(cfg.ffmpeg).is_file():
        log.error("FFMPEG_ERROR ffmpeg not found (%s); install with: sudo apt install ffmpeg", cfg.ffmpeg)
        return 2

    status = Status()
    device = DeviceStatus()
    monitor = DeviceMonitor(cfg, device)
    headset = HeadsetControl(cfg, device)
    demand = CameraDemand(cfg, report=lambda: headset_report(device, status), on_headset_command=headset.submit)
    supervisor = Supervisor(cfg, status, demand)

    try:
        httpd = ThreadingHTTPServer((cfg.host, cfg.port), make_handler(cfg, status, device, demand))
    except OSError as exc:
        log.error("HTTP_ERROR cannot listen on %s:%s: %s", cfg.host, cfg.port, exc)
        return 3
    httpd.daemon_threads = True

    def shutdown(signum, _frame):
        log.info("Signal %s received, stopping", signum)
        supervisor.stop()
        monitor.stop()
        demand.stop()
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    log.info(
        "quest-stream: status on http://%s:%s/status, publishing to %s "
        "(capture=%s eye=%s keep=%s out=%sx%s@%s %s %s)",
        cfg.host, cfg.port, cfg.publish_url_safe, cfg.capture, cfg.eye, cfg.crop_keep,
        cfg.width, cfg.height, cfg.fps, cfg.encoder, cfg.bitrate,
    )
    if demand.polling:
        log.info("CAMERA_DEMAND asking %s as %s (camera on demand %s; failsafe %s after %.0fs without an answer; "
                 "headset reported and wake/sleep presses run with each poll)", cfg.control_url, cfg.robot_code,
                 "on" if demand.enabled else "off", "on" if cfg.control_failsafe else "off", cfg.control_grace)
        demand.poll_once()  # decide before the first capture, so an idle robot never starts the Quest
        demand.start()
    supervisor.start()
    monitor.start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        supervisor.stop()
        monitor.stop()
        demand.stop()
        supervisor.join(timeout=10)
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
