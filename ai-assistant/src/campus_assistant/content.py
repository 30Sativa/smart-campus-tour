"""Approved content pack loading and context selection.

Rules and the selection order are documented in content/README.md. The
contentVersion algorithm matches scripts/check_content.py.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from .models import PoiSnapshot

DEFAULT_BUDGET = 24_000
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


@dataclass(frozen=True)
class ContentDoc:
    rel_path: str
    id: str
    title: str
    kind: str
    poi_id: str
    priority: int
    body: str


@dataclass(frozen=True)
class ContextItem:
    source: str
    text: str


def _parse(path: Path, root: Path) -> ContentDoc | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end < 0:
        return None
    meta: dict[str, str] = {}
    for line in text[4:end].splitlines():
        key, sep, value = line.partition(":")
        if sep:
            meta[key.strip()] = value.split(" #", 1)[0].strip()
    if meta.get("status") != "approved" or not meta.get("reviewedBy") or not meta.get("reviewedAt"):
        return None
    body = _COMMENT.sub("", text[end + 5:]).strip()
    if not body:
        return None
    priority = meta.get("priority", "")
    return ContentDoc(
        rel_path=path.relative_to(root).as_posix(),
        id=meta.get("id", ""),
        title=meta.get("title", "") or meta.get("id", ""),
        kind=meta.get("kind", ""),
        poi_id=meta.get("poiId", "").lower(),
        priority=int(priority) if priority in ("1", "2", "3") else 2,
        body=body,
    )


class ContentPack:
    """Approved documents only; drafts are never loaded."""

    def __init__(self, docs: list[ContentDoc], budget: int = DEFAULT_BUDGET) -> None:
        self.docs = sorted(docs, key=lambda d: d.rel_path)
        self.budget = budget
        self.version = self._version()
        self._pois = {d.poi_id: d for d in self.docs if d.kind == "poi" and d.poi_id}
        self._campus = sorted((d for d in self.docs if d.kind == "campus"), key=lambda d: (d.priority, d.rel_path))

    @classmethod
    def load(cls, root: Path, budget: int = DEFAULT_BUDGET) -> ContentPack:
        files = sorted(p for p in root.rglob("*.md") if p.name != "README.md")
        return cls([d for p in files if (d := _parse(p, root))], budget)

    def _version(self) -> str:
        h = hashlib.sha256()
        for d in self.docs:
            h.update(d.rel_path.encode())
            h.update(b"\0")
            h.update(d.body.encode())
            h.update(b"\0")
        return h.hexdigest()[:12]

    def select(self, poi: PoiSnapshot | None) -> list[ContextItem]:
        """Context in priority order, dropping lowest-priority items over budget."""
        items: list[ContextItem] = []
        if poi is not None:
            parts = [f"Tên: {poi.name}"]
            if poi.description:
                parts.append(f"Mô tả: {poi.description}")
            if poi.narration_text:
                parts.append(f"Thuyết minh: {poi.narration_text}")
            items.append(ContextItem(poi.name, "Điểm tham quan hiện tại.\n" + "\n".join(parts)))
            own = self._pois.get(str(poi.id).lower())
            if own is not None:
                items.append(ContextItem(own.title, f"Thông tin thêm về điểm hiện tại ({poi.name}):\n{own.body}"))
        current = str(poi.id).lower() if poi is not None else None
        items += [ContextItem(d.title, d.body) for d in self._campus if d.priority == 1]
        items += [
            ContextItem(d.title, f"Điểm tham quan khác: {d.title}\n{d.body}")
            for d in self._pois.values()
            if d.poi_id != current
        ]
        items += [ContextItem(d.title, d.body) for d in self._campus if d.priority > 1]

        selected: list[ContextItem] = []
        used = 0
        for item in items:
            if selected and used + len(item.text) > self.budget:
                continue  # does not fit: skip it, smaller lower-priority items may still fit
            selected.append(item)
            used += len(item.text)
        return selected
