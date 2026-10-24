#!/usr/bin/env python3
"""Regression for jq lookups of Docker Compose services with hyphenated names."""
import json
import re
import shutil
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "deploy/deploy-ec2.sh"


def main() -> None:
    jq = shutil.which("jq")
    if not jq:
        raise SystemExit("FAIL: jq is required to verify deployment jq filters.")
    script = SCRIPT.read_text()
    image_check = re.search(
        r"\[\[\s*\$\(jq -r '([^']+)' <<<\"\$candidate_config\"\)"
        r"\s*==\s*\"\$db_init_image\"\s*\]\]",
        script,
    )
    assert image_check is not None, "Initializer digest check is missing or changed"
    config = json.dumps({"services": {"db-init": {"image": "image@sha256:verified"}}})
    result = subprocess.run(
        [jq, "-r", image_check.group(1)],
        input=config, text=True, capture_output=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "image@sha256:verified", result.stdout
    print("PASS: initializer image digest comparison extracts hyphenated db-init service.")


if __name__ == "__main__":
    main()
