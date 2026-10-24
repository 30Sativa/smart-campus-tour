#!/usr/bin/env python3
"""Exercise Buildx output handling without Docker Engine or registry access."""
import os
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("resolve-base-images")
FAKE_DOCKER = r'''#!/usr/bin/env python3
import os, sys
assert sys.argv[1:4] == ['buildx', 'imagetools', 'inspect']
mode = os.environ['INSPECT_FIXTURE']
if mode == 'upstream-failure':
    # A valid-looking partial response must never mask producer failure.
    print('Digest: sha256:' + 'a' * 64, flush=True)
    sys.exit(42)
digest = 'sha256:' + 'a' * 64
if mode == 'mutable': digest = 'latest'
if mode != 'missing': print('Digest: ' + digest, flush=True)
try:
    # A multi-platform manifest can be longer than the pipe buffer. An awk
    # consumer exiting at the first Digest line makes the producer fail.
    for _ in range(512): os.write(1, b'  manifest platform metadata\n' * 512)
    if mode != 'missing': print('Digest: sha256:' + 'b' * 64, flush=True)
except BrokenPipeError:
    os._exit(255)
'''


def main():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        docker = root / "docker"
        docker.write_text(FAKE_DOCKER)
        docker.chmod(0o755)
        env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}")
        for mode in ("large-output", "missing", "mutable", "upstream-failure"):
            env["INSPECT_FIXTURE"] = mode
            output = root / mode
            result = subprocess.run(["bash", str(SCRIPT), str(output)], env=env, text=True, capture_output=True)
            assert (result.returncode == 0) == (mode == "large-output"), (mode, result.stderr)
            if mode == "large-output":
                assert output.read_text().splitlines() == [
                    f"{name}={repository}@sha256:" + "a" * 64
                    for name, repository in (("sdk", "mcr.microsoft.com/dotnet/sdk"),
                                             ("runtime", "mcr.microsoft.com/dotnet/aspnet"),
                                             ("sql", "mcr.microsoft.com/mssql/server"))]
            else:
                assert not output.exists(), "Failed inspection emitted a trusted image pin"
    print("PASS: large Buildx output is consumed fully; first immutable digest selected; missing/mutable digest and failed producer rejected.")


if __name__ == "__main__":
    main()
