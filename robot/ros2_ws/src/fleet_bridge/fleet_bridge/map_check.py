"""Checks the map really loaded on the robot against the MapVersion package (ADR-0049, Decision 4).

PackageSha256 covers the whole uploaded ZIP, so the robot keeps that exact ZIP. The loaded yaml and
the image named by its image: field must then equal the ZIP's members byte for byte.
"""

from __future__ import annotations

import hashlib
import re
import zipfile
from pathlib import Path

from .readiness import MAP_CONTENT_MISMATCH, MAP_EVIDENCE_MISSING

_IMAGE_LINE = re.compile(rb'^\s*image\s*:\s*(.+?)\s*$', re.MULTILINE)
_SHA256_HEX = re.compile(r'^[0-9a-f]{64}$')


def image_name(yaml_bytes: bytes) -> str | None:
    match = _IMAGE_LINE.search(yaml_bytes)
    if match is None:
        return None
    value = match.group(1).split(b' #', 1)[0].strip().strip(b'"\'')
    return value.decode('utf-8', 'replace') or None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _compare(package: Path, expected: str, yaml_bytes: bytes, image: Path) -> str | None:
    if _sha256(package) != expected:
        return MAP_CONTENT_MISMATCH
    try:
        with zipfile.ZipFile(package) as archive:
            members = {name for name in archive.namelist() if '/' not in name}
            yaml_members = [name for name in members if name.lower().endswith(('.yaml', '.yml'))]
            if len(yaml_members) != 1 or image.name not in members:
                return MAP_CONTENT_MISMATCH
            if archive.read(yaml_members[0]) != yaml_bytes or archive.read(image.name) != image.read_bytes():
                return MAP_CONTENT_MISMATCH
    except zipfile.BadZipFile:
        return MAP_CONTENT_MISMATCH
    return None


class MapChecker:
    """Hashing is repeated only when a file changes, so the periodic re-check costs a few stat calls."""

    def __init__(self, package_path: str, expected_sha256: str):
        self._package = Path(package_path) if package_path else None
        self._expected = expected_sha256.strip().lower()
        self._signature = None
        self._result: str | None = MAP_EVIDENCE_MISSING

    def check(self, loaded_yaml: str) -> str | None:
        """Return None when verified, otherwise the fault code."""
        if self._package is None or not loaded_yaml or not _SHA256_HEX.match(self._expected):
            return MAP_EVIDENCE_MISSING
        loaded = Path(loaded_yaml)
        try:
            yaml_bytes = loaded.read_bytes()
            name = image_name(yaml_bytes)
            if name is None:
                return MAP_CONTENT_MISMATCH
            image = loaded.parent / name
            package_stat, image_stat = self._package.stat(), image.stat()
            signature = (loaded_yaml, yaml_bytes, str(image), package_stat.st_mtime_ns, package_stat.st_size,
                         image_stat.st_mtime_ns, image_stat.st_size)
            if signature != self._signature:
                self._result = _compare(self._package, self._expected, yaml_bytes, image)
                self._signature = signature
        except OSError:
            self._signature = None
            return MAP_EVIDENCE_MISSING
        return self._result
