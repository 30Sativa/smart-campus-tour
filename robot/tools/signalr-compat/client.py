import argparse
import json
import logging
import os
import ssl
import threading
import uuid
from datetime import datetime, timezone

from signalrcore.hub_connection_builder import HubConnectionBuilder


def make_connection(url, token, ssl_context):
    return (
        HubConnectionBuilder()
        .with_url(
            url,
            options={
                "headers": {"Authorization": f"Bearer {token}"},
                "ssl_context": ssl_context,
            },
        )
        .configure_logging(logging.ERROR)
        .build()
    )


def invoke(connection, method, payload, expected_result=True):
    completed = threading.Event()
    completion = {}

    def on_completion(message):
        completion["message"] = message
        completed.set()

    connection.invoke(method, [payload], on_invocation=on_completion)
    if not completed.wait(10):
        raise AssertionError(f"Timed out waiting for {method} completion")

    message = completion["message"]
    error = getattr(message, "error", None)
    if error:
        raise AssertionError(f"{method} failed: {error}")
    result = getattr(message, "result", None)
    if expected_result is not None and result is not expected_result:
        raise AssertionError(f"{method} returned {result!r}; expected {expected_result!r}")
    return result


def start_expect_rejection(connection, expected):
    try:
        connection.start()
    except Exception as error:  # Expected TLS or 401 negotiation rejection.
        if expected not in str(error).lower():
            raise AssertionError(f"Expected {expected} rejection, got {type(error).__name__}: {error}") from error
        return
    finally:
        try:
            connection.stop()
        except Exception:
            pass
    raise AssertionError(f"Connection unexpectedly succeeded; expected {expected} rejection")


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--ca", required=True)
    args = parser.parse_args()

    # The first attempt uses the system trust store only. The ephemeral
    # self-signed harness certificate must be rejected by normal verification.
    untrusted = make_connection(args.url, "s1-valid", ssl.create_default_context())
    start_expect_rejection(untrusted, "certificate")
    print("TLS untrusted certificate: rejected")

    trusted_context = ssl.create_default_context(cafile=args.ca)
    bad_auth = make_connection(args.url, "s1-invalid", trusted_context)
    start_expect_rejection(bad_auth, "401")
    print("Machine auth invalid credential: rejected")

    connection = make_connection(args.url, "s1-valid", trusted_context)
    received_command = threading.Event()
    command = {}

    def on_dummy_go_to(arguments):
        command["value"] = arguments[0]
        received_command.set()

    connection.on("DummyGoTo", on_dummy_go_to)
    connection.start()
    print("TLS trusted certificate + machine auth valid: connected")

    reported_at = utc_now()
    leg_id = str(uuid.UUID("22222222-2222-4222-8222-222222222222"))
    state = {
        "robotId": str(uuid.UUID("11111111-1111-4111-8111-111111111111")),
        "streamId": str(uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")),
        "seq": 42,
        "reportedAt": reported_at,
        "mapKey": "campus-map-v1",
        "frameId": "map",
        "pose": {
            "x": 2.5,
            "y": -1.25,
            "yaw": 0.7853981633974483,
            "capturedAt": reported_at,
        },
        "status": "NAVIGATING",
        "legId": leg_id,
    }
    invoke(connection, "ReportState", state)
    if not received_command.wait(5):
        raise AssertionError("Server did not invoke DummyGoTo on the Python client")
    go_to = command["value"]
    for field in ("legId", "mapKey", "frameId", "x", "y", "yaw"):
        if field not in go_to:
            raise AssertionError(f"DummyGoTo omitted {field}")
    print("Python -> .NET ReportState: accepted and typed JSON payload bound")
    print(".NET -> Python DummyGoTo: received; stored as evidence only, no ROS/Nav2")

    accepted = {
        "legId": go_to["legId"],
        "commandKind": "GO_TO",
        "phase": "ACCEPTED",
        "outcome": None,
        "reason": None,
    }
    invoke(connection, "ReportCommandResult", accepted)
    terminal = dict(accepted, phase="TERMINAL", outcome="ARRIVED")
    invoke(connection, "ReportCommandResult", terminal)
    print("Python -> .NET ReportCommandResult: GO_TO/ACCEPTED and GO_TO/TERMINAL/ARRIVED accepted")

    null_pose = dict(state, seq=43, status="IDLE", legId=None, pose=None)
    invoke(connection, "ReportState", null_pose)
    print("ReportState pose=null: accepted")

    invalid_state = dict(state, seq=-1)
    accepted_invalid_state = invoke(connection, "ReportState", invalid_state, expected_result=False)
    print(f"Invalid typed ReportState rejected by Hub: accepted={accepted_invalid_state}")

    malformed = dict(state, seq="not-a-number")
    accepted_malformed = invoke(connection, "RejectMalformedReportState", malformed, expected_result=False)
    print(f"Malformed ReportState JSON value rejected by Hub: accepted={accepted_malformed}")

    connection.stop()
    print(json.dumps({"verdict": "PASS", "python": os.popen("python3 --version").read().strip()}))


if __name__ == "__main__":
    main()
