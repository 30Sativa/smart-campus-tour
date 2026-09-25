#!/usr/bin/env python3
"""Quest 3 -> USB/ADB -> FFmpeg -> HLS live stream, served over HTTP.

One process, two jobs:

* a supervisor thread that keeps ``adb exec-out screenrecord`` piped into one
  long-lived FFmpeg (left eye, 16:9 crop, 1280x720, 30 fps, H.264, HLS), and
  restarts the pieces with back-off when the Quest, ADB or FFmpeg fail;
* a small HTTP server (stdlib only) that serves ``/hls/quest.m3u8`` with CORS
  and live-appropriate caching, plus ``/status`` and ``/health``.

Nothing is recorded to disk except the rolling HLS window (a few 1 s
segments), which FFmpeg deletes as it goes and this process wipes on every
start/stop so a browser never plays a stale segment.

Configuration is environment only (see ``quest-stream.env.example``). Python
3.8+, no third-party packages.
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import mimetypes
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Optional, Tuple

MODULE_DIR = Path(__file__).resolve().parent
PLAYLIST_NAME = "quest.m3u8"
SEGMENT_PREFIX = "quest"

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

    # HLS.
    hls_time: float = 1.0
    hls_list_size: int = 4
    hls_dir: Path = MODULE_DIR / "public" / "hls"
    log_dir: Path = MODULE_DIR / "logs"

    # Supervision.
    stall_timeout: float = 10.0  # no bytes from the Quest for this long = stalled
    poll_min: float = 2.0  # device poll back-off while the Quest is missing
    poll_max: float = 10.0

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
            hls_time=_env_float("QUEST_HLS_TIME", 1.0),
            hls_list_size=_env_int("QUEST_HLS_LIST_SIZE", 4),
            hls_dir=Path(_env("QUEST_HLS_DIR", str(MODULE_DIR / "public" / "hls"))),
            log_dir=Path(_env("QUEST_LOG_DIR", str(MODULE_DIR / "logs"))),
            stall_timeout=_env_float("QUEST_STALL_TIMEOUT", 10.0),
        )
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
        # 1. one eye: the left (or right) half of the stereo frame
        f"crop=w=iw/2:h=ih:x={eye_x}:y=0",
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


def build_ffmpeg_command(cfg: Config, run_id: str) -> List[str]:
    gop = str(max(1, round(cfg.fps * cfg.hls_time)))
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
    if cfg.encoder == "h264_vaapi":
        cmd += ["-c:v", "h264_vaapi", "-bf", "0"]
    else:
        cmd += [
            "-c:v", "libx264",
            "-preset", cfg.x264_preset,
            "-tune", "zerolatency",
            "-profile:v", "main",
            "-pix_fmt", "yuv420p",
        ]
    cmd += [
        "-b:v", cfg.bitrate,
        "-maxrate", cfg.maxrate,
        "-bufsize", cfg.bufsize,
        "-g", gop,
        "-keyint_min", gop,
        "-sc_threshold", "0",
        "-f", "hls",
        "-hls_time", f"{cfg.hls_time:g}",
        "-hls_list_size", str(cfg.hls_list_size),
        "-hls_delete_threshold", "2",
        "-hls_flags", "delete_segments+omit_endlist+independent_segments+temp_file+program_date_time",
        # A new name per run: a browser can never be handed a cached segment
        # from a previous run under the same URL.
        "-hls_segment_filename", str(cfg.hls_dir / f"{SEGMENT_PREFIX}_{run_id}_%05d.ts"),
        "-progress", "pipe:1",
        str(cfg.hls_dir / PLAYLIST_NAME),
    ]
    return cmd


def build_screenrecord_command(cfg: Config, serial: str) -> List[str]:
    cmd = [cfg.adb, "-s", serial, "exec-out", "screenrecord", "--output-format=h264"]
    cmd += ["--bit-rate", str(cfg.capture_bitrate)]
    cmd += ["--time-limit", str(cfg.screenrecord_limit)]
    if cfg.capture_size:
        cmd += ["--size", cfg.capture_size]
    cmd.append("-")
    return cmd


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
    state: str = "starting"  # starting | connecting | live | offline | error | stopped
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
                "playlist": f"/hls/{PLAYLIST_NAME}",
            }


# --------------------------------------------------------------------------
# Supervisor
# --------------------------------------------------------------------------


def clear_hls_dir(hls_dir: Path) -> None:
    hls_dir.mkdir(parents=True, exist_ok=True)
    for f in hls_dir.iterdir():
        if f.is_file() and (f.suffix in (".ts", ".m3u8", ".tmp") or f.name.endswith(".m3u8.tmp")):
            try:
                f.unlink()
            except FileNotFoundError:
                pass


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

    def __init__(self, cfg: Config, status: Status):
        super().__init__(name="supervisor", daemon=True)
        self.cfg = cfg
        self.status = status
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

    def run(self) -> None:
        poll = self.cfg.poll_min
        ffmpeg_backoff = 2.0
        stall_backoff = 2.0
        last_missing_reason = None
        while not self.stop_event.is_set():
            try:
                devices = list_devices(self.cfg)
            except AdbUnavailable as exc:
                if last_missing_reason != str(exc):
                    log.error("ADB_ERROR %s", exc)
                    last_missing_reason = str(exc)
                self.status.set("error", f"ADB_ERROR: {exc}")
                clear_hls_dir(self.cfg.hls_dir)
                if self.sleep(15):
                    break
                continue

            serial, reason = pick_quest(devices, self.cfg.serial)
            if serial is None:
                if last_missing_reason != reason:
                    log.warning("QUEST_NOT_CONNECTED %s", reason)
                    last_missing_reason = reason
                self.status.set("offline", f"QUEST_NOT_CONNECTED: {reason}", serial="", model="")
                clear_hls_dir(self.cfg.hls_dir)
                if self.sleep(poll):
                    break
                poll = min(self.cfg.poll_max, poll * 1.5)
                continue

            poll = self.cfg.poll_min
            last_missing_reason = None
            model = self._model(serial)
            log.info("QUEST_CONNECTED serial=%s model=%s", serial, model or "?")
            self.status.set("connecting", "QUEST_CONNECTED", serial=serial, model=model)
            self._keep_awake(serial, True)

            started = time.time()
            outcome = self._run_session(serial)
            lived = time.time() - started

            if self.stop_event.is_set():
                break
            if outcome == "ffmpeg":
                if lived > 60:
                    ffmpeg_backoff = 2.0
                log.warning("Restarting FFmpeg in %.0fs", ffmpeg_backoff)
                if self.sleep(ffmpeg_backoff):
                    break
                ffmpeg_backoff = min(60.0, ffmpeg_backoff * 2)
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
        clear_hls_dir(self.cfg.hls_dir)
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
        cmd = build_ffmpeg_command(self.cfg, run_id)
        log.info("STREAM_STARTING run=%s", run_id)
        log.debug("ffmpeg: %s", " ".join(cmd))
        ffmpeg_log = open(self.cfg.log_dir / "ffmpeg.log", "w", encoding="utf-8")
        ffmpeg_log.write(" ".join(cmd) + "\n\n")
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
        return subprocess.Popen(
            build_screenrecord_command(self.cfg, serial),
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

    def _ffmpeg_tail(self) -> str:
        try:
            lines = (self.cfg.log_dir / "ffmpeg.log").read_text("utf-8", "replace").splitlines()
            return " | ".join(lines[2:][-3:])[:500] or "(no ffmpeg stderr)"
        except OSError:
            return ""

    def _run_session(self, serial: str) -> str:
        """Run until something breaks.

        Returns 'disconnected', 'stalled', 'ffmpeg', 'adb' or 'stop'.
        """
        run_id = time.strftime("%Y%m%d%H%M%S")
        clear_hls_dir(self.cfg.hls_dir)
        self.cfg.log_dir.mkdir(parents=True, exist_ok=True)
        with self.status.lock:
            self.status.run_id = run_id
            self.status.progress = {}
            self.status.last_input_at = 0.0
            self.status.input_bytes = 0
        self._ffmpeg = self._start_ffmpeg(run_id)
        playlist = self.cfg.hls_dir / PLAYLIST_NAME
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
                    if self._ffmpeg.poll() is not None:
                        log.error("FFMPEG_ERROR exit=%s %s", self._ffmpeg.returncode, self._ffmpeg_tail())
                        self.status.set("error", "FFMPEG_ERROR: encoder stopped, restarting")
                        return "ffmpeg"
                    if not announced and playlist.exists():
                        announced = True
                        log.info("STREAM_STARTED url=/hls/%s", PLAYLIST_NAME)
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
                    "ADB_ERROR screenrecord ended after %.1fs (%d/%d) - see logs/adb.log",
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
            clear_hls_dir(self.cfg.hls_dir)
            log.info("STREAM_STOPPED run=%s", run_id)


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


mimetypes.add_type("application/vnd.apple.mpegurl", ".m3u8")
mimetypes.add_type("video/mp2t", ".ts")


def make_handler(cfg: Config, status: Status):
    public_dir = cfg.hls_dir.parent

    class Handler(SimpleHTTPRequestHandler):
        server_version = "QuestStream/1.0"

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(public_dir), **kwargs)

        # quiet: players poll the playlist every second
        def log_message(self, fmt, *args):  # noqa: N802
            log.debug("http %s - %s", self.address_string(), fmt % args)

        def end_headers(self):
            self.send_header("Access-Control-Allow-Origin", cfg.cors_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
            self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range")
            if cfg.cors_origin != "*":
                self.send_header("Vary", "Origin")
            path = self.path.split("?", 1)[0]
            if path.endswith(".ts"):
                # Segment names are unique per run and never rewritten.
                self.send_header("Cache-Control", "public, max-age=30, immutable")
            else:
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
            super().end_headers()

        def _json(self, code: int, body: dict, extra_headers: Optional[Dict[str, str]] = None):
            data = json.dumps(body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            for k, v in (extra_headers or {}).items():
                self.send_header(k, v)
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
                return self._json(200, status.snapshot(cfg))
            if path == "/" or path == "":
                return self._json(200, {
                    "service": "quest-stream",
                    "playlist": f"/hls/{PLAYLIST_NAME}",
                    "status": "/status",
                })
            if not path.startswith("/hls/") or path.endswith("/") or ".." in path:
                return self._json(404, {"error": "not_found", "path": path})

            name = path[len("/hls/"):]
            if name == PLAYLIST_NAME and (
                status.state != "live" or not (cfg.hls_dir / PLAYLIST_NAME).exists()
            ):
                snap = status.snapshot(cfg)
                return self._json(
                    503,
                    {"error": "stream_unavailable", "state": snap["state"], "reason": snap["reason"]},
                    {"Retry-After": "2"},
                )
            if not (cfg.hls_dir / name).is_file():
                return self._json(404, {"error": "segment_not_found", "path": path})
            if self.command == "HEAD":
                return super().do_HEAD()
            return super().do_GET()

        def list_directory(self, path):  # never expose a listing
            self._json(404, {"error": "not_found"})
            return None

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
    cfg = Config.from_env()
    setup_logging(cfg)
    if shutil.which(cfg.ffmpeg) is None and not Path(cfg.ffmpeg).is_file():
        log.error("FFMPEG_ERROR ffmpeg not found (%s); install with: sudo apt install ffmpeg", cfg.ffmpeg)
        return 2
    clear_hls_dir(cfg.hls_dir)

    status = Status()
    supervisor = Supervisor(cfg, status)

    try:
        httpd = ThreadingHTTPServer((cfg.host, cfg.port), make_handler(cfg, status))
    except OSError as exc:
        log.error("HTTP_ERROR cannot listen on %s:%s: %s", cfg.host, cfg.port, exc)
        return 3
    httpd.daemon_threads = True

    def shutdown(signum, _frame):
        log.info("Signal %s received, stopping", signum)
        supervisor.stop()
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    log.info(
        "quest-stream listening on http://%s:%s/hls/%s (eye=%s keep=%s out=%sx%s@%s %s %s)",
        cfg.host, cfg.port, PLAYLIST_NAME, cfg.eye, cfg.crop_keep,
        cfg.width, cfg.height, cfg.fps, cfg.encoder, cfg.bitrate,
    )
    supervisor.start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        supervisor.stop()
        supervisor.join(timeout=10)
        httpd.server_close()
        clear_hls_dir(cfg.hls_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
