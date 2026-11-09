#!/usr/bin/env python3
"""Validate accepted and rejected release artifacts with the production validator."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


VALIDATOR = Path(__file__).resolve().parents[1] / "deploy" / "validate-release-manifest.py"
SOURCE_SHA = "a" * 40
VALID_MANIFEST = {
    "format_version": 2,
    "source_sha": SOURCE_SHA,
    "api_image": "ghcr.io/30sativa/smart-campus-tour/backend@sha256:" + "b" * 64,
    "db_init_image": "ghcr.io/30sativa/smart-campus-tour/backend-db-init@sha256:" + "c" * 64,
    "db_init_source_sha": "9" * 40,
    "database_schema_version": "1.19",
    "sdk_image": "mcr.microsoft.com/dotnet/sdk@sha256:" + "d" * 64,
    "runtime_image": "mcr.microsoft.com/dotnet/aspnet@sha256:" + "e" * 64,
    "sqlserver_image": "mcr.microsoft.com/mssql/server@sha256:" + "f" * 64,
}


class ReleaseManifestTests(unittest.TestCase):
    def validate(self, manifest_text: str, expected_sha: str = SOURCE_SHA) -> tuple[subprocess.CompletedProcess[str], str]:
        with tempfile.TemporaryDirectory(prefix="campustour-release-manifest-") as directory:
            root = Path(directory)
            manifest_path = root / "backend-release.json"
            output_path = root / "github-output"
            manifest_path.write_text(manifest_text, encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(VALIDATOR), str(manifest_path), expected_sha, str(output_path)],
                text=True, capture_output=True, check=False,
            )
            return result, output_path.read_text(encoding="utf-8") if output_path.exists() else ""

    def test_valid_manifest_exports_only_deployable_image_digests(self) -> None:
        result, output = self.validate(json.dumps(VALID_MANIFEST))
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(
            "api_image=" + VALID_MANIFEST["api_image"] + "\n" +
            "db_init_image=" + VALID_MANIFEST["db_init_image"] + "\n" +
            "db_init_source_sha=" + VALID_MANIFEST["db_init_source_sha"] + "\n" +
            "database_schema_version=1.19\n" +
            "sqlserver_image=" + VALID_MANIFEST["sqlserver_image"] + "\n",
            output,
        )

    def test_incomplete_manifest_is_rejected_without_outputs(self) -> None:
        manifest = dict(VALID_MANIFEST)
        del manifest["db_init_image"]
        result, output = self.validate(json.dumps(manifest))
        self.assertNotEqual(0, result.returncode)
        self.assertIn("db_init_image", result.stderr)
        self.assertEqual("", output)

    def test_mutable_image_tag_is_rejected_without_outputs(self) -> None:
        manifest = dict(VALID_MANIFEST)
        manifest["api_image"] = "ghcr.io/30sativa/smart-campus-tour/backend:latest"
        result, output = self.validate(json.dumps(manifest))
        self.assertNotEqual(0, result.returncode)
        self.assertIn("immutable image digest", result.stderr)
        self.assertEqual("", output)

    def test_manifest_for_another_commit_is_rejected(self) -> None:
        result, output = self.validate(json.dumps(VALID_MANIFEST), "9" * 40)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("does not match", result.stderr)
        self.assertEqual("", output)

    def test_malformed_json_is_rejected(self) -> None:
        result, output = self.validate("{broken")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("invalid JSON", result.stderr)
        self.assertEqual("", output)


if __name__ == "__main__":
    unittest.main()
