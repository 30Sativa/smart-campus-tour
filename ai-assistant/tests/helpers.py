"""Shared test helpers: temporary content packs, a manual clock and an ASGI caller."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

REPO_AI = Path(__file__).resolve().parents[1]
POI_A = "8fd832a5-7e3b-4e6d-a101-000000000001"
POI_B = "8fd832a5-7e3b-4e6d-a101-000000000002"
SERVICE_KEY = "test-service-key-0123456789"


def doc(
    id_: str,
    body: str,
    kind: str = "campus",
    poi: str = "",
    status: str = "approved",
    priority: str = "",
    title: str | None = None,
) -> str:
    reviewed = "An" if status == "approved" else ""
    at = "2026-10-13" if status == "approved" else ""
    return (
        f"---\nid: {id_}\ntitle: {title or id_}\nkind: {kind}\npoiId: {poi}\npriority: {priority}\n"
        f"status: {status}\nreviewedBy: {reviewed}\nreviewedAt: {at}\n---\n{body}\n"
    )


class TempContent:
    """Context manager writing {relative path: text} into a temporary content dir."""

    def __init__(self, files: dict[str, str]) -> None:
        self.files = files

    def __enter__(self) -> Path:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        for rel, text in self.files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")
        return root

    def __exit__(self, *exc: object) -> None:
        self._tmp.cleanup()


class Clock:
    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


async def asgi_call(
    app, method: str, path: str, body: bytes = b"", headers: dict[str, str] | None = None
) -> tuple[int, dict]:
    hdrs = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    if body:
        hdrs.append((b"content-length", str(len(body)).encode()))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "query_string": b"",
        "headers": hdrs,
        "client": ("127.0.0.1", 5000),
        "server": ("127.0.0.1", 8090),
    }
    sent_request = False

    async def receive() -> dict:
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    status = 0
    chunks: list[bytes] = []

    async def send(message: dict) -> None:
        nonlocal status
        if message["type"] == "http.response.start":
            status = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body", b""))

    await app(scope, receive, send)
    raw = b"".join(chunks)
    return status, (json.loads(raw) if raw else {})
