"""Providers that never call a network service.

ContentEchoProvider: AI_PROVIDER=fake for local development; answers with the
first sentence of the most relevant context block.
ScriptedProvider: tests; returns queued texts or raises queued errors.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections import deque
from collections.abc import Iterable

_SOURCE = re.compile(r'<source name="([^"]*)">\n(.*?)\n</source>', re.DOTALL)


class ContentEchoProvider:
    name = "fake"

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        sources = _SOURCE.findall(user)
        if not sources:
            return json.dumps(
                {"answer": "Mình chưa có thông tin về câu này.", "outOfScope": True, "usedSources": []},
                ensure_ascii=False,
            )
        name, text = sources[0]
        lines = [ln.strip("-# ").strip() for ln in text.splitlines() if ln.strip("-# ").strip()]
        first = lines[1] if len(lines) > 1 else lines[0]
        answer = f"[Chế độ thử, không dùng AI] {first}"
        return json.dumps({"answer": answer, "outOfScope": False, "usedSources": [name]}, ensure_ascii=False)


class ScriptedProvider:
    name = "scripted"

    def __init__(self, steps: Iterable[str | Exception], delay_s: float = 0.0) -> None:
        self.steps = deque(steps)
        self.delay_s = delay_s
        self.calls: list[tuple[str, str, float]] = []

    async def generate(self, system: str, user: str, timeout_s: float) -> str:
        self.calls.append((system, user, timeout_s))
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        step = self.steps.popleft()
        if isinstance(step, Exception):
            raise step
        return step
