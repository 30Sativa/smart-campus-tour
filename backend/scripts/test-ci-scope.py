#!/usr/bin/env python3
"""Exercise backend CI path classification against representative changes."""
from __future__ import annotations

import subprocess
import os
import shutil
import tempfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "detect-ci-changes.sh"


def run() -> None:
    with tempfile.TemporaryDirectory(prefix="campustour-ci-scope-") as temp:
        root = Path(temp)
        shutil.copyfile(SCRIPT, root / "detect-ci-changes.sh")
        script_path = "detect-ci-changes.sh"

        def git(*args: str) -> str:
            return subprocess.run(
                ["git", "-C", str(root), *args], check=True, text=True,
                capture_output=True,
            ).stdout.strip()

        git("init", "--quiet")
        git("config", "user.name", "CI scope fixture")
        git("config", "user.email", "ci-scope@example.invalid")
        (root / "web").mkdir()
        (root / "backend/src").mkdir(parents=True)
        (root / "backend/database/patches").mkdir(parents=True)
        (root / "backend").mkdir(exist_ok=True)
        (root / "docs").mkdir()
        (root / "web/file.ts").write_text("baseline")
        (root / "backend/src/api.cs").write_text("baseline")
        (root / "backend/database/patches/schema.sql").write_text("baseline")
        (root / "backend/Dockerfile.db-init").write_text("baseline")
        (root / "docs/architecture.md").write_text("baseline")
        git("add", ".")
        git("commit", "--quiet", "-m", "baseline")
        base = git("rev-parse", "HEAD")

        def classify(path: str, content: str) -> dict[str, str]:
            git("reset", "--hard", base)
            git("clean", "-fd")
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
            git("add", path)
            git("commit", "--quiet", "-m", "change " + path)
            head = git("rev-parse", "HEAD")
            child_env = os.environ.copy()
            child_env.pop("GITHUB_OUTPUT", None)
            result = subprocess.run(
                ["bash", script_path, base, head], cwd=root, text=True,
                capture_output=True, check=True, env=child_env,
            )
            return dict(line.split("=", 1) for line in result.stdout.splitlines())

        cases = [
            ("web/file.ts", "web only", {"backend_changed": "false", "release_needed": "false", "database_tool_changed": "false", "cache_test_needed": "false"}),
            ("backend/src/api.cs", "API change", {"backend_changed": "true", "release_needed": "true", "database_tool_changed": "false", "cache_test_needed": "false"}),
            ("backend/database/patches/schema.sql", "schema change", {"backend_changed": "true", "release_needed": "true", "database_tool_changed": "true", "cache_test_needed": "false"}),
            ("backend/database/README.md", "database docs", {"backend_changed": "true", "release_needed": "false", "database_tool_changed": "false", "cache_test_needed": "false"}),
            ("backend/Dockerfile.db-init", "database image change", {"backend_changed": "true", "release_needed": "true", "database_tool_changed": "true", "cache_test_needed": "false"}),
            ("backend/Dockerfile", "build change", {"backend_changed": "true", "release_needed": "true", "database_tool_changed": "false", "cache_test_needed": "true"}),
            ("backend/tests/SmartCampus.IntegrationTests/SmartCampus.IntegrationTests.csproj", "test build input", {"backend_changed": "true", "release_needed": "true", "database_tool_changed": "false", "cache_test_needed": "true"}),
            (".github/workflows/backend-verify.yml", "backend workflow change", {"backend_changed": "true", "release_needed": "true", "database_tool_changed": "false", "cache_test_needed": "true"}),
            ("docs/architecture.md", "docs change", {"backend_changed": "true", "release_needed": "false", "database_tool_changed": "false", "cache_test_needed": "false"}),
        ]
        for path, content, expected in cases:
            actual = classify(path, content)
            if actual != expected:
                raise AssertionError(f"{path}: expected {expected}, got {actual}")
    print("PASS: web-only, API-only, SQL, build-input and architecture-doc changes select the intended backend CI gates.")


if __name__ == "__main__":
    run()
