#!/usr/bin/env python3
"""Exercise backend CI path classification against representative changes."""
from __future__ import annotations

import subprocess
import os
import shutil
import stat
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

        def commit_change(path: str, content: str) -> str:
            git("reset", "--hard", base)
            git("clean", "-fd")
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
            git("add", path)
            git("commit", "--quiet", "-m", "change " + path)
            return git("rev-parse", "HEAD")

        def detect(base_sha: str, head_sha: str, github_output: Path | None = None) -> subprocess.CompletedProcess[str]:
            child_env = os.environ.copy()
            child_env.pop("GITHUB_OUTPUT", None)
            if github_output is not None:
                child_env["GITHUB_OUTPUT"] = str(github_output)
            return subprocess.run(
                ["bash", script_path, base_sha, head_sha], cwd=root, text=True,
                capture_output=True, check=False, env=child_env,
            )

        def classify(path: str, content: str) -> dict[str, str]:
            result = detect(base, commit_change(path, content))
            if result.returncode != 0:
                raise AssertionError(f"{path}: valid comparison failed: {result.stderr}")
            return dict(line.split("=", 1) for line in result.stdout.splitlines())

        def expect_failure(name: str, base_sha: str, head_sha: str, message: str) -> None:
            output = root / ".git" / "github-output"
            output.write_text("")
            result = detect(base_sha, head_sha, output)
            if result.returncode == 0:
                raise AssertionError(f"{name}: comparison failure exited 0 with {result.stdout!r}")
            if message not in result.stderr:
                raise AssertionError(f"{name}: expected {message!r} in stderr, got {result.stderr!r}")
            # No partial or all-false classification may reach the workflow outputs.
            if result.stdout or output.read_text():
                raise AssertionError(f"{name}: failed comparison still produced outputs")

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

        head = commit_change("backend/src/api.cs", "API change")
        missing = "0123456789abcdef0123456789abcdef01234567"
        expect_failure("missing base", missing, head, f"commit {missing} is not available")
        expect_failure("missing head", base, missing, f"commit {missing} is not available")
        # Both commits exist but git diff itself fails (unreadable tree), as with a damaged or partial clone.
        tree = git("rev-parse", f"{head}^{{tree}}")
        tree_object = root / ".git" / "objects" / tree[:2] / tree[2:]
        os.chmod(tree_object, stat.S_IWRITE | stat.S_IREAD)
        tree_object.unlink()
        expect_failure("git diff failure", base, head, f"git diff {base} {head} failed")
    print("PASS: web-only, API-only, SQL, build-input and architecture-doc changes select the intended backend CI gates;"
          " missing base/head commits and git diff failures fail without emitting outputs.")


if __name__ == "__main__":
    run()
