#!/usr/bin/env python3
"""Run Backend Verify's main comparison-base step against a fake gh.

On main the classifier must diff against the release Backend Deploy last put on the
host. A backend push cancelled by a newer web-only push (or skipped as superseded)
must still be released by that newer push, so any marker that cannot be trusted or
read must widen the comparison to everything, never narrow it.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
import textwrap
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / ".github" / "workflows" / "backend-verify.yml"
DEPLOY_WORKFLOW = REPO / ".github" / "workflows" / "backend-deploy.yml"
ZERO = "0" * 40
REPOSITORY = "30Sativa/smart-campus-tour"

FAKE_GH = r"""#!/usr/bin/env bash
case "$*" in
  *"artifacts?name=backend-deployed"*)
    case $MODE in none) ;; list-fails) exit 1 ;; *) printf '11 101\n22 202\n' ;; esac ;;
  *"actions/runs/101"*)
    if [[ $MODE == pull-request ]]; then
      printf '.github/workflows/backend-deploy.yml\tpull_request\tmain\t30Sativa/smart-campus-tour\n'
    elif [[ $MODE == fork ]]; then
      printf '.github/workflows/backend-deploy.yml\tworkflow_run\tmain\tfork/smart-campus-tour\n'
    elif [[ $MODE == other-workflow ]]; then
      printf '.github/workflows/web-e2e.yml\tworkflow_run\tmain\t30Sativa/smart-campus-tour\n'
    else
      printf '.github/workflows/backend-deploy.yml\tworkflow_run\tmain\t30Sativa/smart-campus-tour\n'
    fi ;;
  *"actions/runs/202"*)
    printf '.github/workflows/backend-deploy.yml\tworkflow_dispatch\tmain\t30Sativa/smart-campus-tour\n' ;;
  "run download 101"*)
    [[ $MODE == download-fails ]] && exit 1
    mkdir -p "${@: -1}"; printf '%s\n' "$NEWEST" > "${@: -1}/release_sha" ;;
  "run download 202"*)
    mkdir -p "${@: -1}"; printf '%s\n' "$OLDER" > "${@: -1}/release_sha" ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
"""


def step_block(text: str, step_id: str) -> str:
    """Return the YAML lines of the workflow step carrying `id: <step_id>`."""
    lines = text.splitlines()
    at = lines.index(next(line for line in lines if line.strip() == f"id: {step_id}"))
    start = next(i for i in range(at, -1, -1) if lines[i].lstrip().startswith("- "))
    indent = len(lines[start]) - len(lines[start].lstrip())
    end = next((i for i in range(start + 1, len(lines))
                if lines[i].strip() and len(lines[i]) - len(lines[i].lstrip()) <= indent), len(lines))
    return "\n".join(lines[start:end])


def run_script(block: str) -> str:
    lines = block.splitlines()
    at = next(i for i, line in enumerate(lines) if line.strip() == "run: |")
    indent = len(lines[at]) - len(lines[at].lstrip())
    body = []
    for line in lines[at + 1:]:
        if line.strip() and len(line) - len(line.lstrip()) <= indent:
            break
        body.append(line)
    return textwrap.dedent("\n".join(body)) + "\n"


def run() -> None:
    verify = WORKFLOW.read_text(encoding="utf-8")
    changes = verify[verify.index("  changes:\n"):verify.index("\n  verify:\n")]
    assert "      actions: read\n" in changes, "the base lookup needs actions: read"
    step = step_block(changes, "deployed")
    assert "if: github.event_name == 'push' && github.ref == 'refs/heads/main'\n" in step + "\n", step
    assert "|| steps.deployed.outputs.base_sha ||" in step_block(changes, "detect")

    deploy = DEPLOY_WORKFLOW.read_text(encoding="utf-8")
    ssh_step = deploy.index("- name: Deploy verified bundle over pinned SSH")
    marker = deploy.index("name: backend-deployed\n")
    # The marker may only follow a successful host deploy of the selected release.
    assert ssh_step < marker < deploy.index("- name: Check public HTTPS readiness"), "marker must follow the SSH deploy"
    marker_step = deploy[deploy.rindex("- name:", 0, marker):marker]
    assert "if: steps.freshness.outputs.deploy == 'true'" in marker_step, marker_step
    script_text = run_script(step)

    with tempfile.TemporaryDirectory(prefix="campustour-ci-base-") as temp:
        root = Path(temp)
        repo = root / "repo"
        repo.mkdir()

        def git(*args: str) -> str:
            return subprocess.run(["git", "-C", str(repo), *args], check=True, text=True,
                                  capture_output=True).stdout.strip()

        git("init", "--quiet")
        git("config", "user.name", "CI base fixture")
        git("config", "user.email", "ci-base@example.invalid")
        shas = []
        for n in range(3):
            (repo / "file").write_text(str(n))
            git("add", "file")
            git("commit", "--quiet", "-m", f"c{n}")
            shas.append(git("rev-parse", "HEAD"))
        older, newest, head = shas
        bin_dir = root / "bin"
        bin_dir.mkdir()
        (bin_dir / "gh").write_text(FAKE_GH)
        (bin_dir / "gh").chmod(0o755)
        script = root / "step.sh"
        script.write_text(script_text)

        def base(mode: str, newest_marker: str = newest) -> str:
            runner_temp = Path(tempfile.mkdtemp(dir=root))
            output = runner_temp / "github-output"
            env = os.environ | {
                "PATH": f"{bin_dir}:{os.environ['PATH']}", "MODE": mode, "NEWEST": newest_marker, "OLDER": older,
                "GITHUB_REPOSITORY": REPOSITORY, "GITHUB_SHA": head, "RUNNER_TEMP": str(runner_temp),
                "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(runner_temp / "summary"),
            }
            result = subprocess.run(["bash", str(script)], cwd=repo, env=env, text=True, capture_output=True, check=False)
            assert result.returncode == 0, f"{mode}: {result.stderr}"
            lines = output.read_text().splitlines()
            assert len(lines) == 1 and lines[0].startswith("base_sha="), lines
            return lines[0].removeprefix("base_sha=")

        cases = {
            "newest trusted marker": (base("ok"), newest),
            "pull_request marker is skipped": (base("pull-request"), older),
            "fork marker is skipped": (base("fork"), older),
            "marker from another workflow is skipped": (base("other-workflow"), older),
            "no marker rebuilds everything": (base("none"), ZERO),
            "failed marker listing rebuilds everything": (base("list-fails"), ZERO),
            "failed marker download rebuilds everything": (base("download-fails"), ZERO),
            "marker outside main history rebuilds everything": (base("ok", "1" * 40), ZERO),
            "malformed marker rebuilds everything": (base("ok", "not-a-sha"), ZERO),
        }
        for name, (actual, expected) in cases.items():
            assert actual == expected, f"{name}: expected {expected}, got {actual}"
    print("PASS: main compares against the last trusted deployed release marker; missing, untrusted,"
          " unreadable or foreign markers widen the comparison to every backend input.")


if __name__ == "__main__":
    run()
