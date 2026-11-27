#!/usr/bin/env python3
"""Validate accepted and rejected release artifacts with the production validator."""

from __future__ import annotations

import json
import os
import re
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
    "database_schema_version": "1.26",
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
            "database_schema_version=1.26\n" +
            "sqlserver_image=" + VALID_MANIFEST["sqlserver_image"] + "\n",
            output,
        )

    def test_workflow_schema_passes_manifest_and_host_deployment_validation(self) -> None:
        repo = VALIDATOR.parents[2]
        workflow = (repo / ".github/workflows/backend-verify.yml").read_text(encoding="utf-8")
        versions = re.findall(r'echo "database_schema_version=([^"\n]+)"', workflow)
        self.assertEqual(1, len(versions))
        manifest = dict(VALID_MANIFEST, database_schema_version=versions[0])
        result, output = self.validate(json.dumps(manifest))
        self.assertEqual(0, result.returncode, result.stderr)
        values = dict(line.split("=", 1) for line in output.splitlines())
        result = subprocess.run(
            ["bash", str(VALIDATOR.with_name("deploy-ec2.sh")), "--validate-only", SOURCE_SHA,
             values["api_image"], values["db_init_image"], values["sqlserver_image"], "8" * 40],
            env=dict(os.environ, DB_INIT_SOURCE_SHA=values["db_init_source_sha"],
                     DB_SCHEMA_VERSION=values["database_schema_version"]),
            text=True, capture_output=True, check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr)

    def test_unsupported_schema_is_rejected_without_outputs(self) -> None:
        for version in ("1.25", "1.27", "", None, 1.26):
            with self.subTest(version=version):
                manifest = dict(VALID_MANIFEST, database_schema_version=version)
                result, output = self.validate(json.dumps(manifest))
                self.assertNotEqual(0, result.returncode)
                self.assertIn("database_schema_version", result.stderr)
                self.assertEqual("", output)

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
