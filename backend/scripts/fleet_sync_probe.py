#!/usr/bin/env python3
"""Send one telemetry-only Fleet Sync v1 report using the shared JSON fixture."""

from __future__ import annotations

import json
import os
import ssl
import sys
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "docs" / "contracts" / "fleet-sync" / "v1" / "sync-request.json"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def validate_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        hostname = parts.hostname
        _ = parts.port
    except ValueError as error:
        raise ValueError("FLEET_SYNC_URL is not a valid URL.") from error

    loopback_hosts = {"localhost", "127.0.0.1", "::1"}
    is_loopback_http = parts.scheme == "http" and hostname in loopback_hosts
    if not parts.netloc or hostname is None or parts.username is not None or parts.password is not None:
        raise ValueError("FLEET_SYNC_URL must be an absolute URL without embedded credentials.")
    if parts.scheme != "https" and not is_loopback_http:
        raise ValueError("FLEET_SYNC_URL must use HTTPS; HTTP is allowed only for localhost loopback testing.")
    return url


def build_report(robot_code: str, stream_id: str | None = None, seq: int = 1) -> dict:
    if seq < 1 or seq > 9_007_199_254_740_991:
        raise ValueError("FLEET_ROBOT_SEQ must be a positive browser-safe integer.")

    stream = str(uuid.uuid4()) if stream_id is None else str(uuid.UUID(stream_id))
    report = json.loads(FIXTURE.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    report["robotId"] = robot_code
    report["reportedAt"] = now
    report["streamId"] = stream
    report["seq"] = seq
    if report.get("pose") is not None:
        report["pose"]["capturedAt"] = now
    return report


def is_accepted_response(status: int, body: object) -> bool:
    if status != 200 or not isinstance(body, dict) or body.get("success") is not True:
        return False
    data = body.get("data")
    return isinstance(data, dict) and data.get("accepted") is True


def main() -> int:
    url = os.environ.get("FLEET_SYNC_URL", "").strip()
    robot_code = os.environ.get("FLEET_ROBOT_CODE", "").strip()
    credential = os.environ.get("FLEET_ROBOT_CREDENTIAL", "")
    if not url or not robot_code or not credential:
        print("Set FLEET_SYNC_URL, FLEET_ROBOT_CODE and FLEET_ROBOT_CREDENTIAL.", file=sys.stderr)
        return 2

    try:
        url = validate_url(url)
        seq = int(os.environ.get("FLEET_ROBOT_SEQ", "1"))
        report = build_report(robot_code, os.environ.get("FLEET_ROBOT_STREAM_ID") or None, seq)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    request = urllib.request.Request(
        url,
        data=json.dumps(report, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {credential}",
            "X-Robot-Code": robot_code,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    context = ssl.create_default_context()
    try:
        opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))
        with opener.open(request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
            print(json.dumps({"status": response.status, "response": body}, indent=2))
            return 0 if is_accepted_response(response.status, body) else 1
    except urllib.error.HTTPError as error:
        try:
            body = json.loads(error.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            body = {"message": "Fleet Sync returned a non-JSON error response."}
        print(json.dumps({"status": error.code, "response": body}, indent=2), file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        print(f"Fleet Sync request failed ({type(error).__name__}); credential and request headers were omitted.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
