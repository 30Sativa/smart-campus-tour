"""Tour events for the MC character in the Quest headset (the Unity app's RobotTourClient).

The backend's camera poll (``/api/fleet/camera/v1/poll``) carries the Tour running on this robot as ``tour``:
step, visit id, the stop it is at or driving to, and that stop's approved narration (the text the Student page
reads). ``TourBridge`` turns those answers into events the headset app long-polls:

    GET  /quest/events?after=<seq>&wait=<s>
         -> {"seq": 12, "state": "observing", "current_stop": "<id>", "target_stop": "",
             "events": [{"seq": 12, "type": "arrived", "stop_id": "<id>", "name": "Thư viện",
                         "narration": "...", "target_stop": "", "target_name": ""}]}
    POST /quest/narration  {"stop_id": "<id>", "state": "started|finished"}   (logged only)

Types: ``arrived`` (a new visit, OBSERVING and not held: the MC presents the stop), ``departed`` (NAVIGATING
towards a new stop, or returning to the end: the MC asks everyone to follow), ``cancelled`` (the Tour is no longer
running: the MC stops talking). Stdlib only, like server.py.
"""

from __future__ import annotations

import collections
import hmac
import json
import logging
import ssl
import subprocess
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, Dict, List, Optional
from urllib.parse import parse_qs, urlsplit

log = logging.getLogger("quest-stream")

END_STOP = "end"
END_NAME = "điểm kết thúc"
MAX_WAIT = 55.0


class TourBridge:
    """Keeps the last few Tour events and wakes long-polling headsets when a new one arrives."""

    def __init__(self, clock: Callable[[], float] = time.time, keep: int = 50):
        self._cond = threading.Condition()
        # Starts from the clock so a restarted NUC never reuses a sequence number the headset has already seen.
        self._seq = int(clock() * 1000)
        self._events: collections.deque = collections.deque(maxlen=keep)
        self._state = "idle"
        self._current = ""
        self._target = ""
        self._tour_id: Optional[str] = None
        self._announced_visit: Optional[str] = None
        self._departed_to: Optional[str] = None
        self.last_narration: Optional[dict] = None

    # ---------------------------------------------------------------- input
    def update(self, tour) -> None:
        """One successful camera poll answer's ``tour`` (a dict, or None when no Tour runs)."""
        with self._cond:
            if not isinstance(tour, dict):
                if self._tour_id is not None:
                    self._emit("cancelled", stop_id=self._current)
                    log.info("TOUR_BRIDGE tour %s no longer running", self._tour_id)
                self._reset()
                self._cond.notify_all()
                return

            tour_id = str(tour.get("tourId") or "")
            if tour_id != self._tour_id:
                if self._tour_id is not None:
                    self._emit("cancelled", stop_id=self._current)
                self._reset()
                self._tour_id = tour_id
                log.info("TOUR_BRIDGE following tour %s", tour_id)

            step = str(tour.get("step") or "").upper()
            stop_id = str(tour.get("stopId") or "")
            name = str(tour.get("stopName") or "")
            narration = str(tour.get("narrationText") or "")
            visit = str(tour.get("visitId") or "")
            held = bool(tour.get("isHeld"))

            if step == "OBSERVING" and stop_id:
                self._current, self._target, self._departed_to = stop_id, "", None
                if held:
                    self._state = "holding"
                elif visit and visit != self._announced_visit:
                    self._announced_visit = visit
                    self._state = "observing"
                    self._emit("arrived", stop_id=stop_id, name=name, narration=narration)
                    log.info("TOUR_BRIDGE arrived at %s (%s), narration %d chars", name or stop_id, stop_id,
                             len(narration))
                else:
                    self._state = "observing"
            elif step == "NAVIGATING" and stop_id:
                self._state, self._target = "moving", stop_id
                if self._departed_to != stop_id:
                    self._departed_to = stop_id
                    self._emit("departed", target_stop=stop_id, target_name=name)
                    log.info("TOUR_BRIDGE departed towards %s (%s)", name or stop_id, stop_id)
            elif step == "RETURNING_TO_END":
                self._state, self._target = "moving", END_STOP
                if self._departed_to != END_STOP:
                    self._departed_to = END_STOP
                    self._emit("departed", target_stop=END_STOP, target_name=END_NAME)
            else:
                self._state = "waiting" if step == "INITIALIZING" else (step.lower() or "running")
            self._cond.notify_all()

    def narration_report(self, stop_id: str, state: str) -> None:
        self.last_narration = {"stopId": stop_id, "state": state, "at": round(time.time(), 3)}
        log.info("TOUR_BRIDGE headset narration %s at %s", state, stop_id)

    # --------------------------------------------------------------- output
    def wait(self, after: int, wait: float) -> dict:
        """Events newer than ``after``; blocks up to ``wait`` seconds while there are none."""
        deadline = time.monotonic() + max(0.0, min(wait, MAX_WAIT))
        with self._cond:
            # after < 0 is the headset's first call: answer at once so it learns the current sequence number.
            while after >= 0 and after >= self._seq and not self._events_after(after):
                left = deadline - time.monotonic()
                if left <= 0:
                    break
                self._cond.wait(left)
            return {
                "seq": self._seq,
                "state": self._state,
                "current_stop": self._current,
                "target_stop": self._target,
                "events": self._events_after(after) if after >= 0 else [],
            }

    def snapshot(self) -> dict:
        with self._cond:
            return {"seq": self._seq, "state": self._state, "tourId": self._tour_id, "currentStop": self._current,
                    "targetStop": self._target, "lastEvent": dict(self._events[-1]) if self._events else None,
                    "lastNarration": self.last_narration}

    # -------------------------------------------------------------- helpers
    def _events_after(self, after: int) -> List[dict]:
        return [dict(e) for e in self._events if e["seq"] > after]

    def _emit(self, kind: str, stop_id: str = "", name: str = "", narration: str = "", target_stop: str = "",
              target_name: str = "") -> None:
        self._seq += 1
        self._events.append({"seq": self._seq, "type": kind, "stop_id": stop_id, "name": name,
                             "narration": narration, "target_stop": target_stop, "target_name": target_name})

    def _reset(self) -> None:
        self._state, self._current, self._target = "idle", "", ""
        self._tour_id = self._announced_visit = self._departed_to = None


def make_bridge_handler(bridge: TourBridge, token: str = ""):
    class Handler(BaseHTTPRequestHandler):
        server_version = "QuestTourBridge/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):  # noqa: N802
            log.debug("bridge %s - %s", self.address_string(), fmt % args)

        def _json(self, code: int, body: Optional[dict]) -> None:
            data = b"" if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if data:
                self.wfile.write(data)

        def _authorised(self) -> bool:
            if not token:
                return True
            sent = self.headers.get("Authorization", "")
            if hmac.compare_digest(sent.encode("utf-8"), f"Bearer {token}".encode("utf-8")):
                return True
            self._json(401, {"error": "unauthorized"})
            return False

        def do_GET(self):  # noqa: N802
            parts = urlsplit(self.path)
            if parts.path == "/health":
                return self._json(200, {"ok": True})
            if parts.path != "/quest/events":
                return self._json(404, {"error": "not_found"})
            if not self._authorised():
                return None
            query = parse_qs(parts.query)
            try:
                after = int(query.get("after", ["-1"])[0])
                wait = float(query.get("wait", ["0"])[0])
            except ValueError:
                return self._json(400, {"error": "after and wait must be numbers"})
            return self._json(200, bridge.wait(after, wait))

        def do_POST(self):  # noqa: N802
            if urlsplit(self.path).path != "/quest/narration":
                return self._json(404, {"error": "not_found"})
            if not self._authorised():
                return None
            try:
                length = min(int(self.headers.get("Content-Length") or 0), 4096)
                body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except (ValueError, UnicodeDecodeError):
                return self._json(400, {"error": "invalid json"})
            state = str(body.get("state") or "")
            if state not in ("started", "finished"):
                return self._json(400, {"error": "state must be started or finished"})
            bridge.narration_report(str(body.get("stop_id") or ""), state)
            return self._json(204, None)

    return Handler


def tls_context(cert: str, key: str) -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(cert, key)
    return context


def start_bridge_server(bridge: TourBridge, host: str, port: int, token: str = "", cert: str = "",
                        key: str = "") -> ThreadingHTTPServer:
    """Listens on ``host:port`` (HTTPS when ``cert`` and ``key`` are given) in a daemon thread."""
    httpd = ThreadingHTTPServer((host, port), make_bridge_handler(bridge, token))
    httpd.daemon_threads = True
    if cert and key:
        httpd.socket = tls_context(cert, key).wrap_socket(httpd.socket, server_side=True)
    threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.5}, name="tour-bridge",
                     daemon=True).start()
    return httpd


def read_mediamtx_tls(env_file: Path) -> Dict[str, str]:
    """The certificate MediaMTX serves WebRTC with (mediamtx.env), so the headset pins one fingerprint for both."""
    values: Dict[str, str] = {}
    try:
        for line in env_file.read_text("utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip("'\"")
    except OSError:
        return {}
    return {"cert": values.get("MTX_WEBRTCSERVERCERT", ""), "key": values.get("MTX_WEBRTCSERVERKEY", "")}


class UsbReverse(threading.Thread):
    """Keeps ``adb reverse tcp:<port> tcp:<port>`` on the headset, so the app reaches the bridge over the cable at
    https://127.0.0.1:<port> (RobotTourClient tries that first). Re-applied when the serial changes and every minute,
    because a replug or an adb restart drops it."""

    def __init__(self, adb: str, port: int, serial_of: Callable[[], str], runner=subprocess.run,
                 every: float = 60.0, check: float = 10.0):
        super().__init__(name="usb-reverse", daemon=True)
        self.adb, self.port, self.serial_of, self.runner = adb, port, serial_of, runner
        self.every, self.check = every, check
        self.stop_event = threading.Event()
        self._serial = ""
        self._at = 0.0

    def apply_once(self, now: Optional[float] = None) -> bool:
        now = time.monotonic() if now is None else now
        serial = self.serial_of() or ""
        if not serial:
            self._serial = ""
            return False
        if serial == self._serial and now - self._at < self.every:
            return False
        spec = f"tcp:{self.port}"
        try:
            result = self.runner([self.adb, "-s", serial, "reverse", spec, spec], capture_output=True, text=True,
                                 timeout=10)
            ok = result.returncode == 0
        except (OSError, subprocess.SubprocessError) as exc:
            ok, result = False, None
            log.warning("USB_REVERSE failed on %s: %s", serial, exc)
        if ok:
            if serial != self._serial:
                log.info("USB_REVERSE headset %s reaches the tour bridge at 127.0.0.1:%s", serial, self.port)
            self._serial, self._at = serial, now
        elif result is not None:
            log.warning("USB_REVERSE failed on %s: %s", serial, (result.stderr or result.stdout or "").strip())
        return ok

    def run(self) -> None:
        while not self.stop_event.is_set():
            try:
                self.apply_once()
            except Exception as exc:  # noqa: BLE001 - never let it die
                log.warning("USB_REVERSE error: %s", exc)
            self.stop_event.wait(self.check)

    def stop(self) -> None:
        self.stop_event.set()
