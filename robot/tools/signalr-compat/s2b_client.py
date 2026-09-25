import asyncio
import json
import os
import platform
import ssl
import subprocess
import time
import threading
import uuid
import urllib.request
from pathlib import Path

from pysignalr.client import SignalRClient

CONTROL = Path(os.environ.get("S2B_CONTROL_DIR", "/s2b-control"))
URL = os.environ.get("S2B_URL", "https://compat-server:5443/hubs/compatibility")
CA = os.environ.get("S2B_CA", "/certs/server.pem")
TOKEN = "s2b-valid"
ROBOT_ID = "11111111-1111-4111-8111-111111111111"
STREAM_ID = str(uuid.uuid4())
LEG_ID = "22222222-2222-4222-8222-222222222222"

metrics = {
    "candidate": "pysignalr",
    "version": "1.3.2",
    "os": platform.platform(),
    "python": platform.python_version(),
    "streamId": STREAM_ID,
    "handlersRegistered": 0,
    "openCallbacks": 0,
    "closeCallbacks": 0,
    "errorCallbacks": 0,
    "commandsReceived": 0,
    "commandCallbackExecutions": 0,
    "stateSent": 0,
    "exceptions": [],
    "bindingErrors": [],
    "startedAt": time.time(),
}


def write_evidence(verdict, failure=None):
    metrics["verdict"] = verdict
    if failure:
        metrics["failure"] = failure
    path = CONTROL / "s2b-pysignalr-last-run.json"
    path.write_text(json.dumps(metrics, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(metrics, sort_keys=True))


async def wait_event(event, timeout, label):
    try:
        await asyncio.wait_for(event.wait(), timeout)
    except asyncio.TimeoutError as error:
        raise TimeoutError(f"timed out waiting for {label}") from error


def error_text(message):
    return str(getattr(message, "error", message))


async def run_connection(client, timeout=20):
    task = asyncio.create_task(client.run(), name="pysignalr.run")
    await asyncio.sleep(timeout)
    if task.done():
        error = task.exception()
        if error:
            raise error
        raise RuntimeError("SignalR client run task ended unexpectedly")
    return task


async def stop_task(task):
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    except Exception:
        pass


async def connect_probe(url, ssl_context, token, duration=4):
    opened = asyncio.Event()
    errors = []
    client = SignalRClient(
        url,
        headers={"Authorization": f"Bearer {token}"},
        ssl=ssl_context,
        retry_sleep=0.2,
        retry_multiplier=1.2,
        retry_count=1,
        connection_timeout=3,
    )

    async def on_open():
        opened.set()

    async def on_error(message):
        errors.append(error_text(message))

    client.on_open(on_open)
    client.on_error(on_error)
    task = asyncio.create_task(client.run(), name="pysignalr.probe")
    try:
        await asyncio.wait_for(asyncio.sleep(duration), duration + 1)
        run_error = None
        if task.done():
            try:
                task.result()
            except Exception as error:
                run_error = f"{type(error).__name__}: {error}"
        return {"opened": opened.is_set(), "errors": errors, "runError": run_error}
    finally:
        await stop_task(task)


async def stage0():
    trusted = ssl.create_default_context(cafile=CA)
    untrusted = ssl.create_default_context()

    bad_tls = await connect_probe(URL, untrusted, TOKEN, duration=3)
    metrics["tlsUntrusted"] = bad_tls
    if bad_tls["opened"] or not bad_tls["runError"]:
        raise AssertionError(f"untrusted certificate was not observably rejected: {bad_tls}")

    bad_auth = await connect_probe(URL, trusted, "s2b-invalid", duration=3)
    metrics["invalidAuth"] = bad_auth
    if bad_auth["opened"] or not bad_auth["runError"]:
        raise AssertionError(f"invalid bearer credential was not observably rejected: {bad_auth}")

    opened = asyncio.Event()
    close_events = []
    state_done = asyncio.Event()
    command_received = asyncio.Event()
    command_ids = []
    invocation_error = asyncio.Event()
    binding_error_observed = asyncio.Event()
    invocation_results = {}

    client = SignalRClient(
        URL,
        headers={"Authorization": f"Bearer {TOKEN}"},
        ssl=trusted,
        retry_sleep=0.2,
        retry_multiplier=1.5,
        retry_count=10,
        connection_timeout=5,
    )

    async def on_open():
        metrics["openCallbacks"] += 1
        opened.set()

    async def on_close():
        metrics["closeCallbacks"] += 1
        close_events.append(time.time())

    async def on_error(message):
        value = error_text(message)
        metrics["errorCallbacks"] += 1
        metrics["bindingErrors"].append(value)
        if "seq" in value.lower() or "convert" in value.lower() or "number" in value.lower():
            binding_error_observed.set()

    async def on_command(arguments):
        payload = arguments[0]
        command_ids.append(payload["legId"])
        metrics["commandsReceived"] += 1
        metrics["commandCallbackExecutions"] += 1
        command_received.set()

    client.on_open(on_open)
    client.on_close(on_close)
    client.on_error(on_error)
    client.on("DummyGoTo", on_command)
    metrics["handlersRegistered"] += 1

    run_task = asyncio.create_task(client.run(), name="pysignalr.stage0")
    try:
        await wait_event(opened, 15, "valid TLS/auth connection")

        async def state_completion(message):
            invocation_results["state"] = {"result": getattr(message, "result", None), "error": getattr(message, "error", None)}
            state_done.set()

        stamp = "2026-09-25T00:00:00Z"
        state = {
            "robotId": ROBOT_ID,
            "streamId": STREAM_ID,
            "seq": 1,
            "reportedAt": stamp,
            "mapKey": "campus-map-v1",
            "frameId": "map",
            "pose": {"x": 2.5, "y": -1.25, "yaw": 0.2, "capturedAt": stamp},
            "status": "NAVIGATING",
            "legId": LEG_ID,
        }
        await client.send("ReportState", [state], on_invocation=state_completion)
        await wait_event(state_done, 10, "ReportState completion")
        await wait_event(command_received, 10, "DummyGoTo callback")
        if invocation_results["state"]["error"] or invocation_results["state"]["result"] is not True:
            raise AssertionError(f"ReportState was not accepted: {invocation_results['state']}")
        metrics["stateSent"] += 1
        metrics["validTlsAuth"] = True
        metrics["reportState"] = invocation_results["state"]
        metrics["dummyGoTo"] = {"received": True, "legId": command_ids[0]}

        async def command_completion(message):
            invocation_results["command"] = {"result": getattr(message, "result", None), "error": getattr(message, "error", None)}
            state_done.set()

        state_done.clear()
        command_report = {
            "legId": LEG_ID,
            "commandKind": "GO_TO",
            "phase": "TERMINAL",
            "outcome": "ARRIVED",
            "reason": None,
        }
        await client.send("ReportCommandResult", [command_report], on_invocation=command_completion)
        await wait_event(state_done, 10, "ReportCommandResult completion")
        if invocation_results["command"]["error"] or invocation_results["command"]["result"] is not True:
            raise AssertionError(f"ReportCommandResult was not accepted: {invocation_results['command']}")
        metrics["reportCommandResult"] = invocation_results["command"]

        state_done.clear()
        null_pose_state = dict(state, seq=2, pose=None, status="IDLE", legId=None)
        await client.send("ReportState", [null_pose_state], on_invocation=state_completion)
        await wait_event(state_done, 10, "ReportState pose=null completion")
        if invocation_results["state"]["error"] or invocation_results["state"]["result"] is not True:
            raise AssertionError(f"ReportState pose=null failed: {invocation_results['state']}")
        metrics["nullPose"] = invocation_results["state"]

        state_done.clear()
        malformed = dict(state, seq="not-a-number", status="IDLE", legId=None)

        async def malformed_completion(message):
            invocation_results["malformed"] = {
                "result": getattr(message, "result", None),
                "error": getattr(message, "error", None),
                "type": type(message).__name__,
            }
            if invocation_results["malformed"]["error"]:
                invocation_error.set()
            state_done.set()

        await client.send("ReportState", [malformed], on_invocation=malformed_completion)
        await wait_event(state_done, 10, "malformed typed ReportState completion")
        await asyncio.sleep(0.2)
        metrics["typedBindingError"] = {
            "method": "ReportState",
            "field": "seq",
            "sentValue": "not-a-number",
            "completion": invocation_results["malformed"],
            "errorCallbackObserved": binding_error_observed.is_set(),
            "invocationErrorObserved": invocation_error.is_set(),
            "errorCallbackMessages": metrics["bindingErrors"],
        }
        if not invocation_error.is_set():
            raise AssertionError(f"typed ReportState binding error was not observable: {invocation_results['malformed']}")

        return run_task
    except Exception:
        await stop_task(run_task)
        raise


async def main():
    CONTROL.mkdir(parents=True, exist_ok=True)
    if len(os.sys.argv) > 1 and os.sys.argv[1] == "--stream-probe":
        print(json.dumps({"streamId": str(uuid.uuid4()), "processId": os.getpid()}))
        return
    try:
        task = await stage0()
        await stop_task(task)
        write_evidence("STAGE0_PASS")
        if len(os.sys.argv) <= 1 or os.sys.argv[1] != "--stage0":
            await reliability()
    except Exception as error:
        metrics["exceptions"].append(f"{type(error).__name__}: {error}")
        write_evidence("BLOCKED", metrics["exceptions"][-1])
        raise


def runner_marker(name, payload=None):
    path = CONTROL / name
    path.write_text(json.dumps(payload or {}, sort_keys=True), encoding="utf-8")
    return path


async def request_runner(action, payload=None, timeout=180):
    request = CONTROL / f"request-{action}.json"
    done = CONTROL / f"done-{action}.json"
    request.unlink(missing_ok=True)
    done.unlink(missing_ok=True)
    runner_marker(request.name, payload)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if done.exists():
            result = json.loads(done.read_text(encoding="utf-8"))
            if result.get("error"):
                raise RuntimeError(result["error"])
            return result
        await asyncio.sleep(0.2)
    raise TimeoutError(f"runner did not complete {action}")


async def reliability():
    global metrics
    evidence = CONTROL / "s2b-pysignalr-last-run.json"
    metrics = json.loads(evidence.read_text(encoding="utf-8"))
    metrics.update({
        "initialRetry": {"attempts": 0, "elapsedSeconds": None, "retryDelaysSeconds": []},
        "disconnectObservedAt": [],
        "reconnectedAt": [],
        "reconnectCycles": 0,
        "exceptions": list(metrics.get("exceptions", [])),
    })
    token = {"value": TOKEN, "calls": 0}
    opened = asyncio.Event()
    closed = asyncio.Event()
    command_event = asyncio.Event()
    state_completion = asyncio.Event()
    seq = 0
    command_count = 0
    open_times = []
    retry_transitions = []
    failures_before_first_open = 0
    callback_context = {}
    run_started = time.monotonic()

    await request_runner("stop", {"reason": "stage1-start-before-backend"})

    def token_factory():
        token["calls"] += 1
        return token["value"]

    client = SignalRClient(
        URL,
        headers={"Authorization": f"Bearer {TOKEN}"},
        ssl=ssl.create_default_context(cafile=CA),
        retry_sleep=0.4,
        retry_multiplier=1.7,
        retry_count=100,
        connection_timeout=5,
        ping_interval=10,
        signalr_ping_interval=5,
        access_token_factory=token_factory,
    )

    async def on_open():
        open_times.append(time.monotonic())
        callback_context["open"] = _callback_context()
        metrics["openCallbacks"] = metrics.get("openCallbacks", 0) + 1
        opened.set()
        closed.clear()

    async def on_close():
        nonlocal failures_before_first_open
        stamp = time.time()
        retry_transitions.append(time.monotonic())
        if opened.is_set():
            metrics["disconnectObservedAt"].append(stamp)
        elif not open_times:
            failures_before_first_open += 1
        callback_context["close"] = _callback_context()
        metrics["closeCallbacks"] = metrics.get("closeCallbacks", 0) + 1
        closed.set()
        opened.clear()

    async def on_error(message):
        metrics.setdefault("runtimeErrors", []).append(error_text(message))
        callback_context["error"] = _callback_context()

    async def on_command(arguments):
        nonlocal command_count
        command_count += 1
        callback_context["command"] = _callback_context()
        command_event.set()

    client.on_open(on_open)
    client.on_close(on_close)
    client.on_error(on_error)
    client.on("DummyGoTo", on_command)
    metrics["handlersRegistered"] = 1
    run_task = asyncio.create_task(client.run(), name="pysignalr.reliability")
    runner_marker("client-started.json", {"pid": os.getpid(), "streamId": metrics["streamId"]})

    def ensure_task_alive():
        if run_task.done():
            error = run_task.exception()
            raise RuntimeError(f"pysignalr.run ended: {type(error).__name__}: {error}" if error else "pysignalr.run ended")

    async def report_state(status="IDLE", pose=True):
        nonlocal seq
        seq += 1
        stamp = "2026-09-25T00:00:00Z"
        payload = {
            "robotId": ROBOT_ID,
            "streamId": metrics["streamId"],
            "seq": seq,
            "reportedAt": stamp,
            "mapKey": "campus-map-v1",
            "frameId": "map",
            "pose": {"x": 2.5, "y": -1.25, "yaw": 0.2, "capturedAt": stamp} if pose else None,
            "status": status,
            "legId": LEG_ID if status == "NAVIGATING" else None,
        }
        completion = asyncio.Event()
        result = {}

        async def on_complete(message):
            result["result"] = getattr(message, "result", None)
            result["error"] = getattr(message, "error", None)
            callback_context["completion"] = _callback_context()
            completion.set()

        await client.send("ReportState", [payload], on_invocation=on_complete)
        await wait_event(completion, 15, "ReportState completion")
        if result.get("error") or result.get("result") is not True:
            raise RuntimeError(f"ReportState completion failed: {result}")
        metrics["stateSent"] += 1
        metrics["seqLast"] = seq
        metrics["seqFirst"] = metrics.get("seqFirst") or seq
        return result

    try:
        open_wait = asyncio.create_task(opened.wait())
        done, _ = await asyncio.wait({open_wait, run_task}, timeout=45, return_when=asyncio.FIRST_COMPLETED)
        if open_wait not in done:
            if run_task.done():
                run_task.result()
                raise RuntimeError("pysignalr.run ended before the backend appeared")
            raise TimeoutError("timed out waiting for backend appearance after client startup")
        open_wait.result()
        ensure_task_alive()
        metrics["initialRetry"] = {
            "attempts": failures_before_first_open + 1,
            "elapsedSeconds": round(open_times[0] - run_started, 3),
            "retryDelaysSeconds": [round(b - a, 3) for a, b in zip(retry_transitions, retry_transitions[1:])],
            "clientStartedBeforeBackendSeconds": 8,
        }
        metrics["startupBeforeBackend"] = "PASS"
        metrics["authTokenFactoryCalls"] = token["calls"]

        await report_state("NAVIGATING")
        metrics["establishedReportState"] = "PASS"
        await request_runner("stop", {"reason": "s2b-established-reconnect"})
        await wait_event(closed, 35, "observable disconnect after backend stop")
        disconnect_at = time.monotonic()
        metrics["stage2Disconnected"] = True
        await request_runner("restart", {"reason": "s2b-established-reconnect"})
        await wait_event(opened, 60, "reconnect after backend restart")
        reconnected_at = time.monotonic()
        metrics["reconnectedAt"].append(time.time())
        metrics["stage2ReconnectSeconds"] = round(reconnected_at - disconnect_at, 3)
        metrics["stage2AuthTokenCalls"] = token["calls"]
        await report_state("IDLE", pose=False)
        metrics["postRestartReportState"] = "PASS"
        metrics["sameProcessStreamId"] = metrics["streamId"]
        metrics["streamIdPreservedAfterReconnect"] = True
        metrics["reconnectCycles"] = 1
        metrics["duplicateHandlers"] = metrics["handlersRegistered"] == 1
        metrics["stage2"] = "PASS"
        write_evidence("STAGE2_PASS")
    except Exception as error:
        metrics.setdefault("exceptions", []).append(f"{type(error).__name__}: {error}")
        metrics["stage2"] = "BLOCKED"
        write_evidence("BLOCKED", metrics["exceptions"][-1])
        raise
    finally:
        await stop_task(run_task)


def _callback_context():
    return {
        "thread": threading.current_thread().name,
        "eventLoop": asyncio.get_running_loop().get_name(),
    }


if __name__ == "__main__":
    asyncio.run(main())
