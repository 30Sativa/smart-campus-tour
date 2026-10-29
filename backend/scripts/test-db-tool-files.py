#!/usr/bin/env python3
"""Check that every /database file the DB tool scripts read is copied into its image.

test-db-upgrade only runs when Docker is available and the DB tool changed, so
a missing COPY entry in Dockerfile.db-init (sqlcmd "Invalid filename") was found
only after merge. This check needs neither Docker nor SQL Server.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1]
DOCKERFILE = BACKEND / "Dockerfile.db-init"
USERS = [BACKEND / "deploy" / "init-db.sh", BACKEND / "deploy" / "upgrade-db.sh", BACKEND / "scripts" / "test-db-upgrade"]
DATABASE_PATH = re.compile(r"/database/([A-Za-z0-9_./-]+\.sql)")
APPLY_CALL = re.compile(r"^\s*apply\s+([A-Za-z0-9_./-]+\.sql)\s*$", re.MULTILINE)


def image_files() -> set[str]:
    """Return image paths under /database/ produced by the Dockerfile COPY instructions."""
    text = DOCKERFILE.read_text().replace("\\\n", " ")
    files: set[str] = set()
    for line in text.splitlines():
        words = line.split()
        if not words or words[0] != "COPY":
            continue
        args = [word for word in words[1:] if not word.startswith("--")]
        sources, destination = args[:-1], args[-1]
        if not destination.startswith("/database/"):
            continue
        for source in sources:
            if not (BACKEND / source).is_file():
                raise AssertionError(f"Dockerfile.db-init copies missing file {source}")
            files.add(destination.removeprefix("/database/") + Path(source).name)
    return files


def referenced_files() -> dict[str, set[str]]:
    references: dict[str, set[str]] = {}
    for user in USERS:
        text = user.read_text()
        names = set(DATABASE_PATH.findall(text)) | set(APPLY_CALL.findall(text))
        for name in names:
            references.setdefault(name, set()).add(str(user.relative_to(BACKEND)))
    return references


class DatabaseToolFilesTest(unittest.TestCase):
    def test_every_referenced_database_file_is_in_the_image(self) -> None:
        shipped = image_files()
        references = referenced_files()
        self.assertTrue(references, "no /database references were found; the parser no longer matches the scripts")
        missing = {name: sorted(users) for name, users in references.items() if name not in shipped}
        self.assertEqual({}, missing, "add these files to backend/Dockerfile.db-init (file: scripts using it)")


if __name__ == "__main__":
    unittest.main()
