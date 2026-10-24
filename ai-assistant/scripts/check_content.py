#!/usr/bin/env python3
"""Validate the approved content pack and the evaluation question set.

Standard library only, so it runs before the Python project exists.
Rules are documented in ai-assistant/content/README.md.

Usage: check_content.py [--content DIR] [--evals FILE]
Exit code: 0 pass, 1 errors found.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path

FILE_BUDGET = 4000
PACK_BUDGET = 24000
KEYS = ("id", "title", "kind", "poiId", "priority", "status", "reviewedBy", "reviewedAt")
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){9,10}(?!\d)")
PLACEHOLDER = re.compile(r"TODO|\[ĐIỀN", re.IGNORECASE)
COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
CATEGORIES = {
    "tour", "robot", "assistant", "poi", "site", "out_of_scope", "follow_up",
    "robot_command", "injection", "unaccented", "privacy",
}
BEHAVIORS = {"answer", "out_of_scope", "refuse"}


@dataclass
class Doc:
    path: Path
    meta: dict[str, str]
    body: str


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def parse(path: Path, report: Report) -> Doc | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        report.error(f"{path}: missing frontmatter starting with '---'")
        return None
    end = text.find("\n---\n", 4)
    if end < 0:
        report.error(f"{path}: frontmatter is not closed with '---'")
        return None
    meta: dict[str, str] = {}
    for n, line in enumerate(text[4:end].splitlines(), start=2):
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        key = key.strip()
        if not sep or key not in KEYS:
            report.error(f"{path}:{n}: unknown or malformed frontmatter line {line!r}")
            continue
        if key in meta:
            report.error(f"{path}:{n}: duplicate key {key!r}")
        meta[key] = value.split(" #", 1)[0].strip()
    return Doc(path, meta, text[end + 5:])


def check_doc(doc: Doc, report: Report) -> None:
    m, p = doc.meta, doc.path
    for key in KEYS:
        if key not in m:
            report.error(f"{p}: missing frontmatter key {key!r}")
    if not SLUG.match(m.get("id", "")):
        report.error(f"{p}: id must be a lowercase slug")
    if not m.get("title"):
        report.error(f"{p}: title is empty")
    kind = m.get("kind")
    if kind not in ("campus", "poi"):
        report.error(f"{p}: kind must be campus or poi")
    expected_dir = {"campus": "campus", "poi": "pois"}.get(kind or "")
    if expected_dir and p.parent.name != expected_dir:
        report.error(f"{p}: kind {kind} must live in {expected_dir}/")
    if kind == "poi":
        try:
            uuid.UUID(m.get("poiId", ""))
        except ValueError:
            report.error(f"{p}: poiId must be the POI GUID")
    elif m.get("poiId"):
        report.error(f"{p}: poiId is only allowed for kind: poi")
    if kind == "campus" and m.get("priority", "") not in ("", "1", "2", "3"):
        report.error(f"{p}: priority must be 1, 2 or 3")
    status = m.get("status")
    if status not in ("draft", "approved"):
        report.error(f"{p}: status must be draft or approved")
    visible = COMMENT.sub("", doc.body)
    if EMAIL.search(visible) or PHONE.search(visible):
        report.error(f"{p}: contains an email address or phone number")
    if len(visible.strip()) > FILE_BUDGET:
        report.error(f"{p}: body is {len(visible.strip())} characters (max {FILE_BUDGET})")
    if status == "approved":
        if not m.get("reviewedBy"):
            report.error(f"{p}: approved file needs reviewedBy")
        if not DATE.match(m.get("reviewedAt", "")):
            report.error(f"{p}: approved file needs reviewedAt as YYYY-MM-DD")
        if PLACEHOLDER.search(visible):
            report.error(f"{p}: approved file still contains TODO/[ĐIỀN placeholders")
        if not visible.strip():
            report.error(f"{p}: approved file has no content")


def content_version(docs: list[Doc], root: Path) -> str:
    h = hashlib.sha256()
    for d in sorted(docs, key=lambda d: d.path.relative_to(root).as_posix()):
        h.update(d.path.relative_to(root).as_posix().encode())
        h.update(b"\0")
        h.update(COMMENT.sub("", d.body).strip().encode())
        h.update(b"\0")
    return h.hexdigest()[:12]


def check_evals(path: Path, docs: list[Doc], report: Report) -> None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        report.error(f"{path}: cannot read JSON ({exc})")
        return
    ids_by_content = {d.meta.get("id") for d in docs}
    poi_ids = {d.meta.get("poiId") for d in docs if d.meta.get("kind") == "poi"}
    seen: set[str] = set()
    items = data.get("items")
    if not isinstance(items, list) or not items:
        report.error(f"{path}: items must be a non-empty list")
        return
    for it in items:
        iid = it.get("id", "?")
        where = f"{path}#{iid}"
        if iid in seen:
            report.error(f"{where}: duplicate id")
        seen.add(iid)
        if it.get("category") not in CATEGORIES:
            report.error(f"{where}: unknown category {it.get('category')!r}")
        q = it.get("question", "")
        if not isinstance(q, str) or not q.strip() or len(q) > 500:
            report.error(f"{where}: question must be 1-500 characters")
        exp = it.get("expect", {})
        if exp.get("behavior") not in BEHAVIORS:
            report.error(f"{where}: expect.behavior must be one of {sorted(BEHAVIORS)}")
        for group in exp.get("mustMentionAny", []):
            if not isinstance(group, list) or not group or not all(isinstance(s, str) and s for s in group):
                report.error(f"{where}: mustMentionAny entries must be non-empty string lists")
        turns = it.get("recentTurns", [])
        if len(turns) > 3 or any(set(t) != {"question", "answer"} for t in turns):
            report.error(f"{where}: recentTurns must be at most 3 {{question, answer}} items")
        if it.get("poiId") and it["poiId"] not in poi_ids:
            report.error(f"{where}: poiId has no file in content/pois/")
        for cid in it.get("needsContent", []):
            if cid not in ids_by_content:
                report.error(f"{where}: needsContent refers to unknown content id {cid!r}")
    approved = {d.meta.get("id") for d in docs if d.meta.get("status") == "approved"}
    gradable = sum(1 for it in items if set(it.get("needsContent", [])) <= approved)
    print(f"evals: {len(items)} questions, {gradable} gradable with current approved content")


def main(argv: list[str] | None = None) -> int:
    here = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--content", type=Path, default=here / "content")
    ap.add_argument("--evals", type=Path, default=here / "evals" / "questions.json")
    args = ap.parse_args(argv)

    report = Report()
    files = sorted(p for p in args.content.rglob("*.md") if p.name != "README.md")
    docs = [d for p in files if (d := parse(p, report))]
    for d in docs:
        check_doc(d, report)
    seen: dict[str, Path] = {}
    for d in docs:
        for key in ("id", "poiId"):
            val = d.meta.get(key)
            if val and (key, val) in seen:
                report.error(f"{d.path}: {key} {val} also used by {seen[(key, val)]}")
            if val:
                seen[(key, val)] = d.path

    approved = [d for d in docs if d.meta.get("status") == "approved"]
    used = sum(len(COMMENT.sub("", d.body).strip()) for d in approved)
    if used > PACK_BUDGET:
        report.warn(f"approved pack uses {used} characters, over the {PACK_BUDGET} prompt budget")
    if not approved:
        report.warn("no approved content yet: the assistant would answer every question as out of scope")
    print(f"content: {len(docs)} files, {len(approved)} approved, "
          f"{used}/{PACK_BUDGET} characters, contentVersion {content_version(approved, args.content)}")

    if args.evals.exists():
        check_evals(args.evals, docs, report)
    else:
        report.error(f"{args.evals}: evaluation set is missing")

    for w in report.warnings:
        print(f"WARN  {w}")
    for e in report.errors:
        print(f"ERROR {e}")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
