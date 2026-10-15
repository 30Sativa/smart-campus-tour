"""Bounded TTL answer cache.

Keys combine the normalized question, the POI snapshot text and the
contentVersion, so any content change misses the cache. Only questions without
recent turns are cached. Nothing personal is stored.
"""

from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from collections.abc import Callable

from .guards import fold, normalize_text
from .models import AnswerResponse, PoiSnapshot


def cache_key(question: str, poi: PoiSnapshot | None, content_version: str) -> str:
    h = hashlib.sha256()
    for part in (
        " ".join(fold(normalize_text(question)).rstrip("?!. ").split()),
        "" if poi is None else f"{poi.id}|{poi.name}|{poi.description or ''}|{poi.narration_text or ''}",
        content_version,
    ):
        h.update(part.encode())
        h.update(b"\0")
    return h.hexdigest()


class AnswerCache:
    def __init__(self, max_entries: int, ttl_s: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.max_entries = max_entries
        self.ttl_s = ttl_s
        self._clock = clock
        self._items: OrderedDict[str, tuple[float, AnswerResponse]] = OrderedDict()

    def get(self, key: str) -> AnswerResponse | None:
        entry = self._items.get(key)
        if entry is None:
            return None
        stored_at, value = entry
        if self._clock() - stored_at > self.ttl_s:
            del self._items[key]
            return None
        self._items.move_to_end(key)
        return value

    def put(self, key: str, value: AnswerResponse) -> None:
        if self.max_entries <= 0:
            return
        self._items[key] = (self._clock(), value)
        self._items.move_to_end(key)
        while len(self._items) > self.max_entries:
            self._items.popitem(last=False)

    def __len__(self) -> int:
        return len(self._items)
