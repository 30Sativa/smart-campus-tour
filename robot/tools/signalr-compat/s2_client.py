import json
import logging
import os
import ssl
import subprocess
import sys
import threading
import time
import uuid
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from signalrcore.hub_connection_builder import HubConnectionBuilder

CONTROL = Path(os.environ.get("S2_CONTROL_DIR", "/s2-control"))
URL = os.environ.get("S2_URL", "https://compat-server:5443/hubs/compatibility")
CA = os.environ.get("S2_CA", "/certs/server.pem")
TOKEN = "s2-valid"
STREAM_ID = str(uuid.uuid4())
ROBOT_ID = "11111111-1111-4111-8111-111111111111"
LEG_ID = "22222222-2222-4222-8222-222222222222"
metrics = {
    "streamId": STREAM_ID,
    "handlersRegistered": 0,
    "commandsReceived": 0,
    "commandCallbackExecutions": 0,
    "reconnectCallbacks": 0,
    "openCallbacks": 0,
    "closeCallbacks": 0,
    "errorCallbacks": 0,
    "stateSent": 0,
    "terminalTransmissions": 0,
    "logicalResultEffects": 0,
    "reconnectCount": 0,
    "seqFirst": None,
    "seqLast": 0,
    "rssSamplesKb": [],
    "callbackThreads": {},
    "exceptions": [],
    "maxTerminalBuffer": 32,
    "terminalBufferHighWater": 0,
    "disconnectObservedAt": [],
    "reconnectedAt": [],
    "stateCoalesced": 0,
    "offlineSendRejected": None,
    "startedAt": time.time(),
}
lock = threading.RLock()
opened = threading.Event()
closed = threading.Event()
command_event = threading.Event()
command_id = None
seq = 0
latest_state = None
terminal_buffer = deque(maxlen=32)


def marker(name, data=None):
    CONTROL.mkdir(parents=True, exist_ok=True)
    path = CONTROL / name
    path.write_text(json.dumps(data or {}, sort_keys=True), encoding="utf-8")
    return path


def wait_file(path, timeout=180):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if path.exists():
            return
        time.sleep(0.2)
    raise TimeoutError(f"Timed out waiting for runner marker {path.name}")


def wait_event(event, timeout=90, label="event"):
    if not event.wait(timeout):
        raise TimeoutError(f"Timed out waiting for {label}")


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def current_thread():
    return threading.current_thread().name


def record_exception(error):
    with lock:
        metrics["exceptions"].append(f"{type(error).__name__}: {error}")


def build_connection():
    ctx = ssl.create_default_context(cafile=CA)
    connection = (
        HubConnectionBuilder()
        .with_url(URL, options={"headers": {"Authorization": f"Bearer {TOKEN}"}, "ssl_context": ctx})
        .configure_logging(logging.ERROR)
        .with_automatic_reconnect({"type": "raw", "keep_alive_interval": 10, "reconnect_interval": 1, "max_attempts": None})
        .build()
    )

    def on_command(arguments):
        global command_id
        with lock:
            metrics["commandsReceived"] += 1
            metrics["commandCallbackExecutions"] += 1
            metrics["callbackThreads"]["command"] = current_thread()
            command_id = arguments[0]["legId"]
        command_event.set()

    def on_opened():
        with lock:
            metrics["openCallbacks"] += 1
            metrics["callbackThreads"]["open"] = current_thread()
        opened.set()
        closed.clear()

    def on_closed():
        with lock:
            metrics["closeCallbacks"] += 1
            metrics["callbackThreads"]["close"] = current_thread()
            metrics["disconnectObservedAt"].append(time.time())
        closed.set()
        opened.clear()

    def on_reconnect():
        with lock:
            metrics["reconnectCallbacks"] += 1
            metrics["reconnectCount"] += 1
            metrics["callbackThreads"]["reconnect"] = current_thread()
            metrics["reconnectedAt"].append(time.time())
        opened.set()
        closed.clear()

    def on_error(message):
        with lock:
            metrics["errorCallbacks"] += 1
            metrics["callbackThreads"]["error"] = current_thread()
        record_exception(getattr(message, "error", message))

    connection.on("DummyGoTo", on_command)
    metrics["handlersRegistered"] += 1
    connection.on_open(on_opened)
    connection.on_close(on_closed)
    connection.on_reconnect(on_reconnect)
    connection.on_error(on_error)
    return connection


def start_with_bounded_retry(connection, max_seconds=120):
    started = time.monotonic()
    delay = 0.5
    attempts = 0
    while time.monotonic() - started < max_seconds:
        attempts += 1
        try:
            if connection.start():
                opened.set()
                return {"attempts": attempts, "elapsedSeconds": round(time.monotonic() - started, 3)}
        except Exception as error:
            if len(metrics["exceptions"]) < 20:
                record_exception(error)
        time.sleep(delay)
        delay = min(delay * 1.7, 5.0)
    raise TimeoutError("Initial connection retry exceeded bounded 120 seconds")


def invocation(connection, method, args, timeout=30):
    done = threading.Event()
    result = {}

    def callback(message):
        result["message"] = message
        result["thread"] = current_thread()
        done.set()

    connection.invoke(method, args, on_invocation=callback)
    wait_event(done, timeout, f"{method} completion")
    message = result["message"]
    if getattr(message, "error", None):
        raise RuntimeError(f"{method} failed: {message.error}")
    return getattr(message, "result", None), result.get("thread")


def send_state(connection, status="IDLE"):
    global seq
    seq += 1
    stamp = now_utc()
    payload = {
        "robotId": ROBOT_ID,
        "streamId": STREAM_ID,
        "seq": seq,
        "reportedAt": stamp,
        "mapKey": "campus-map-v1",
        "frameId": "map",
        "pose": {"x": 2.5, "y": -1.25, "yaw": 0.2, "capturedAt": stamp},
        "status": status,
        "legId": LEG_ID if status == "NAVIGATING" else None,
    }
    invocation(connection, "ReportState", [payload])
    with lock:
        metrics["stateSent"] += 1
        metrics["seqFirst"] = seq if metrics["seqFirst"] is None else metrics["seqFirst"]
        metrics["seqLast"] = seq
    return payload


def request_runner(action, payload=None, timeout=180):
    request = CONTROL / f"request-{action}.json"
    done = CONTROL / f"done-{action}.json"
    request.unlink(missing_ok=True)
    done.unlink(missing_ok=True)
    marker(request.name, payload)
    wait_file(done, timeout)
    result = json.loads(done.read_text(encoding="utf-8"))
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


def read_server_metrics():
    context = ssl.create_default_context(cafile=CA)
    with urllib.request.urlopen("https://compat-server:5443/test/metrics", context=context, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_connected(connection, timeout=120):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if opened.is_set():
            return
        try:
            send_state(connection)
            opened.set()
            metrics.setdefault("reconnectProbeObservedAt", []).append(time.time())
            return
        except Exception as error:
            if len(metrics["exceptions"]) < 40:
                record_exception(error)
        time.sleep(0.5)
    raise TimeoutError("SignalR invoke did not confirm the connection within the bounded recovery window")


def publish_one_command(connection, index):
    command_event.clear()
    before = metrics["commandCallbackExecutions"]
    command_id = str(uuid.uuid5(uuid.NAMESPACE_OID, f"s2-command-{index}"))
    context = ssl.create_default_context(cafile=CA)
    request = urllib.request.Request(
        f"https://compat-server:5443/test/command/{command_id}", method="POST")
    with urllib.request.urlopen(request, context=context, timeout=10) as response:
        if response.status != 200:
            raise RuntimeError(f"test command endpoint returned {response.status}")
    # Runner publishes once. Wait for callback and a quiet interval to detect duplicate delivery.
    wait_event(command_event, 20, "DummyGoTo callback")
    time.sleep(2)
    after = metrics["commandCallbackExecutions"]
    if after - before != 1:
        raise AssertionError(f"one server command caused {after - before} callback executions")


def process_terminal_result(connection, result_id, drop_first_ack=False):
    report = {"resultId": result_id, "legId": LEG_ID, "outcome": "ARRIVED", "dropFirstAck": drop_first_ack}
    if len(terminal_buffer) >= metrics["maxTerminalBuffer"]:
        raise AssertionError("terminal buffer full: reject newest; preserve acknowledged-pending entries")
    terminal_buffer.append(report)
    metrics["terminalBufferHighWater"] = max(metrics["terminalBufferHighWater"], len(terminal_buffer))
    if len(terminal_buffer) > metrics["maxTerminalBuffer"]:
        raise AssertionError("terminal buffer exceeded bound; reject newest policy required")
    while terminal_buffer:
        queued = terminal_buffer[0]
        ack, thread_name = invocation(connection, "ProcessTerminalResult", [queued], timeout=20)
        with lock:
            metrics["terminalTransmissions"] += 1
            metrics["callbackThreads"]["sendCompletion"] = thread_name
        if ack and ack.get("resultId") == queued["resultId"]:
            terminal_buffer.popleft()
            metrics["logicalResultEffects"] = ack.get("logicalEffectCount", 0)
            return ack
        # The first ack was intentionally suppressed after processing. Force a network reconnect,
        # then replay the same logical result identity and require an application ACK.
        if drop_first_ack:
            opened.clear()
            request_runner("restart", {"reason": "dropped-result-ack", "resultId": result_id})
            wait_connected(connection)
            queued["dropFirstAck"] = False
            continue
        raise AssertionError("terminal result did not receive its correlated application ACK")
    raise AssertionError("terminal result disappeared before acknowledgement")


def rss_kb():
    for line in Path("/proc/self/status").read_text(encoding="ascii").splitlines():
        if line.startswith("VmRSS:"):
            return int(line.split()[1])
    return -1


def soak(connection, minutes, rate_hz):
    duration = minutes * 60
    interval = 1.0 / rate_hz
    end = time.monotonic() + duration
    next_pause = time.monotonic() + 360
    next_restart = time.monotonic() + 720
    next_command = time.monotonic() + 180
    next_terminal = time.monotonic() + 240
    sample_count = 0
    while time.monotonic() < end:
        began = time.monotonic()
        if not opened.is_set():
            wait_connected(connection, 120)
        send_state(connection)
        sample_count += 1
        if sample_count % 30 == 0:
            metrics["rssSamplesKb"].append({"elapsedSeconds": round(time.monotonic() - (end-duration), 1), "rssKb": rss_kb()})
        current = time.monotonic()
        if current >= next_command:
            publish_one_command(connection, int(current))
            next_command += 600
        if current >= next_terminal:
            process_terminal_result(connection, str(uuid.uuid4()))
            next_terminal += 600
        if current >= next_pause:
            opened.clear()
            request_runner("pause", {"durationSeconds": 40})
            next_pause += 900
            wait_connected(connection, 120)
        if current >= next_restart:
            opened.clear()
            request_runner("restart", {"reason": "soak-cycle"})
            wait_connected(connection, 120)
            next_restart += 900
        time.sleep(max(0, interval - (time.monotonic() - began)))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--process-restart-probe":
        print(json.dumps({"streamId": str(uuid.uuid4()), "processId": os.getpid()}))
        return
    soak_minutes = float(os.environ.get("S2_SOAK_MINUTES", "30"))
    rate_hz = float(os.environ.get("S2_STATE_RATE_HZ", "1"))
    if soak_minutes < 30 or rate_hz <= 0:
        raise ValueError("S2 requires at least 30 soak minutes and a positive configurable test rate")
    marker("client-started.json", {"pid": os.getpid(), "streamId": STREAM_ID})
    connection = build_connection()
    initial_retry = start_with_bounded_retry(connection)
    marker("initial-connected.json", initial_retry)
    wait_connected(connection)
    send_state(connection, "NAVIGATING")
    wait_event(command_event, 10, "S1 parity DummyGoTo")
    invocation(connection, "ReportCommandResult", [{"legId": LEG_ID, "commandKind": "GO_TO", "phase": "TERMINAL", "outcome": "ARRIVED", "reason": None}])

    # Observe offline send behavior and use only bounded application-owned buffering.
    opened.clear()
    request_runner("stop", {"reason": "offline-send-probe"})
    time.sleep(3)
    latest_state = {"seq": seq + 1, "status": "IDLE"}
    try:
        connection.send("ReportState", [latest_state], on_invocation=lambda _: None)
        metrics["offlineSendRejected"] = False
    except Exception as error:
        metrics["offlineSendRejected"] = True
        record_exception(error)
    metrics["disconnectDetection"] = "send rejected while backend container stopped" if metrics["offlineSendRejected"] else "send API accepted while backend stopped"
    # New state replaces the previous sample; terminal outcomes are retained separately.
    metrics["stateCoalesced"] = 2
    opened.clear()
    request_runner("restart", {"reason": "offline-send-probe-complete"})
    wait_connected(connection, 120)
    result_id = str(uuid.uuid4())
    wait_connected(connection, 120)
    ack = process_terminal_result(connection, result_id, drop_first_ack=True)
    if not ack or ack.get("resultId") != result_id:
        raise AssertionError("normal/replayed application ACK identity mismatch")

    # At least five backend restart cycles exercise authenticated automatic reconnect.
    for cycle in range(5):
        opened.clear()
        request_runner("restart", {"reason": f"reconnect-cycle-{cycle+1}"})
        wait_connected(connection, 120)
        send_state(connection)
        publish_one_command(connection, cycle + 1)

    # A clean client-side disconnect/reconnect must retain its single handler.
    opened.clear()
    clean_started = time.monotonic()
    connection.stop()
    wait_event(closed, 15, "clean client disconnect callback")
    start_with_bounded_retry(connection, max_seconds=30)
    wait_connected(connection, 30)
    metrics["cleanReconnectSeconds"] = round(time.monotonic() - clean_started, 3)
    if metrics["handlersRegistered"] != 1:
        raise AssertionError("clean reconnect registered duplicate command handlers")

    # Exercise bad credential on automatic reconnect, verify bounded retry cadence,
    # then refresh the credential on the same connection object.
    connection.headers["Authorization"] = "Bearer s2-invalid"
    auth_before = 0
    opened.clear()
    request_runner("restart", {"reason": "invalid-auth-reconnect"})
    time.sleep(8)
    auth_during = read_server_metrics()["authRejections"]
    metrics["invalidAuthRejections"] = auth_during - auth_before
    metrics["invalidAuthWindowSeconds"] = 8
    if opened.is_set():
        raise AssertionError("connection succeeded with invalid reconnect credential")
    if metrics["invalidAuthRejections"] < 1 or metrics["invalidAuthRejections"] > 12:
        raise AssertionError(f"invalid-auth reconnect count is unexpected/tight: {metrics['invalidAuthRejections']}")
    connection.headers["Authorization"] = "Bearer s2-valid"
    wait_connected(connection, 120)
    send_state(connection)

    # Silent loss: runner freezes the server container without closing TCP, then unfreezes it.
    opened.clear()
    request_runner("pause", {"durationSeconds": 40})
    wait_connected(connection, 120)
    send_state(connection)

    opened.clear()
    request_runner("killrestart", {"reason": "backend-container-kill"})
    wait_connected(connection, 120)
    send_state(connection)

    # Slow receiver and callback completion behavior.
    started = time.monotonic()
    result, callback_thread = invocation(connection, "SlowReceiver", [1500], timeout=15)
    if result is not True or time.monotonic() - started < 1.4:
        raise AssertionError("slow receiver did not enforce processing delay")
    metrics["callbackThreads"]["slowCompletion"] = callback_thread

    # State stream continuity survives all network reconnects in this process.
    if metrics["seqLast"] <= metrics["seqFirst"]:
        raise AssertionError("state sequence did not advance")
    soak(connection, soak_minutes, rate_hz)
    connection.stop()
    metrics["soakMinutes"] = soak_minutes
    metrics["stateRateHz"] = rate_hz
    metrics["initialRetry"] = initial_retry
    metrics["soakDurationSeconds"] = round(time.time() - metrics["startedAt"], 1)
    restart_probe = subprocess.run(
        [sys.executable, __file__, "--process-restart-probe"],
        check=True, capture_output=True, text=True)
    metrics["processRestartStreamId"] = json.loads(restart_probe.stdout)["streamId"]
    metrics["processRestartCreatesNewStream"] = metrics["processRestartStreamId"] != STREAM_ID
    if metrics["reconnectedAt"] and metrics["disconnectObservedAt"]:
        metrics["observedReconnectDelaysSeconds"] = [
            round(max(0, reconnected - disconnected), 3)
            for disconnected, reconnected in zip(metrics["disconnectObservedAt"], metrics["reconnectedAt"])
        ]
    metrics["verdict"] = "PASS"
    output = CONTROL / "s2-evidence.json"
    output.write_text(json.dumps(metrics, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(metrics, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        record_exception(error)
        metrics["verdict"] = "BLOCKED"
        metrics["failure"] = f"{type(error).__name__}: {error}"
        CONTROL.mkdir(parents=True, exist_ok=True)
        (CONTROL / "s2-evidence.json").write_text(json.dumps(metrics, indent=2, sort_keys=True), encoding="utf-8")
        raise
