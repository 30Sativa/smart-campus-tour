#!/usr/bin/env python3
"""Validate a Backend Verify artifact before any production deployment action."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


SHA_PATTERN = re.compile(r"[0-9a-f]{40}\Z")
IMAGE_PATTERNS = {
    "api_image": re.compile(r"ghcr\.io/30sativa/smart-campus-tour/backend@sha256:[0-9a-f]{64}\Z"),
    "db_init_image": re.compile(r"ghcr\.io/30sativa/smart-campus-tour/backend-db-init@sha256:[0-9a-f]{64}\Z"),
    "sdk_image": re.compile(r"mcr\.microsoft\.com/dotnet/sdk@sha256:[0-9a-f]{64}\Z"),
    "runtime_image": re.compile(r"mcr\.microsoft\.com/dotnet/aspnet@sha256:[0-9a-f]{64}\Z"),
    "sqlserver_image": re.compile(r"mcr\.microsoft\.com/mssql/server@sha256:[0-9a-f]{64}\Z"),
}
OUTPUT_FIELDS = ("api_image", "db_init_image", "db_init_source_sha", "database_schema_version", "sqlserver_image")


def fail(message: str) -> int:
    print(f"FAIL: {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 4:
        return fail("usage: validate-release-manifest.py MANIFEST EXPECTED_SOURCE_SHA GITHUB_OUTPUT")

    manifest_path = Path(sys.argv[1])
    expected_sha = sys.argv[2]
    output_path = Path(sys.argv[3])
    if not SHA_PATTERN.fullmatch(expected_sha):
        return fail("expected source SHA must be 40 lowercase hexadecimal characters.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return fail(f"release manifest is unreadable or invalid JSON: {error}.")
    if not isinstance(manifest, dict):
        return fail("release manifest must be a JSON object.")
    if type(manifest.get("format_version")) is not int or manifest["format_version"] != 2:
        return fail("release manifest format_version must be 2.")
    if manifest.get("source_sha") != expected_sha:
        return fail("release manifest source_sha does not match the selected successful build.")
    for field, pattern in IMAGE_PATTERNS.items():
        value = manifest.get(field)
        if not isinstance(value, str) or not pattern.fullmatch(value):
            return fail(f"release manifest field {field} is missing or is not an approved immutable image digest.")
    db_source_sha = manifest.get("db_init_source_sha")
    if not isinstance(db_source_sha, str) or not SHA_PATTERN.fullmatch(db_source_sha):
        return fail("release manifest field db_init_source_sha must be a full lowercase commit SHA independent of source_sha.")
    if manifest.get("database_schema_version") != "1.15":
        return fail("release manifest database_schema_version must be the supported value 1.15.")

    try:
        with output_path.open("a", encoding="utf-8", newline="\n") as output:
            for field in OUTPUT_FIELDS:
                output.write(f"{field}={manifest[field]}\n")
    except OSError as error:
        return fail(f"could not write validated image references to the workflow output: {error}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
