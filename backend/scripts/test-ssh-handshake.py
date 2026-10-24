#!/usr/bin/env python3
"""Optional real OpenSSH negative tests; isolated loopback sshd, no Docker/EC2.

Run on Linux: sudo python3 backend/scripts/test-ssh-handshake.py
Requires openssh-client/server and /run/sshd prepared by the OS package.
"""
import os
import pwd
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path


def main():
    sshd = shutil.which("sshd")
    if not sshd or os.geteuid() != 0:
        raise SystemExit("Run this optional test as root on a disposable Linux host with sshd installed.")
    script = Path(__file__).resolve().parents[1] / "deploy/ssh-deploy.sh"
    with tempfile.TemporaryDirectory(prefix="campustour-ssh-test-") as directory:
        root = Path(directory)
        for name in ("host", "client", "wrong-client", "wrong-host"):
            subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(root / name)], check=True)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        username = pwd.getpwuid(os.getuid()).pw_name
        config = root / "sshd_config"
        config.write_text(f"""ListenAddress 127.0.0.1
Port {port}
HostKey {root / 'host'}
PidFile {root / 'sshd.pid'}
AuthorizedKeysFile {root / 'client.pub'}
StrictModes no
UsePAM no
PasswordAuthentication no
KbdInteractiveAuthentication no
AuthenticationMethods publickey
PermitRootLogin yes
AllowUsers {username}
LogLevel ERROR
""")
        with (root / "sshd.log").open("w") as log:
            server = subprocess.Popen([sshd, "-D", "-e", "-f", str(config)], stdout=log, stderr=log)
            try:
                for _ in range(50):
                    if server.poll() is not None:
                        raise AssertionError((root / "sshd.log").read_text())
                    try:
                        with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                            break
                    except OSError:
                        time.sleep(0.1)
                pin = root / "known_hosts"
                pin.write_text(f"[127.0.0.1]:{port} " + (root / "host.pub").read_text())
                # Establish that the local fixture accepts its intended identity.
                subprocess.run(["ssh", "-F", "/dev/null", "-p", str(port), "-i", str(root / "client"),
                                "-o", "IdentityAgent=none", "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
                                "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={pin}",
                                f"{username}@127.0.0.1", "true"], check=True, capture_output=True)
                bundle = root / "bundle"
                (bundle / "ops").mkdir(parents=True)
                (bundle / "ops/receive-release.sh").touch()
                (bundle / "verified-revisions").write_text("fixture\n")
                env = dict(os.environ, DEPLOY_SSH_HOST="127.0.0.1", DEPLOY_SSH_PORT=str(port),
                           DEPLOY_SSH_USER=username, DEPLOY_SSH_KEY_FILE=str(root / "wrong-client"),
                           DEPLOY_SSH_KNOWN_HOSTS_FILE=str(pin), GHCR_USER="test", GHCR_TOKEN="unused-disposable-token")
                result = subprocess.run(["bash", str(script), str(bundle), "application"], env=env,
                                        capture_output=True, text=True, timeout=20)
                assert result.returncode != 0 and "Permission denied" in result.stderr, result.stderr
                env["DEPLOY_SSH_KEY_FILE"] = str(root / "client")
                pin.write_text(f"[127.0.0.1]:{port} " + (root / "wrong-host.pub").read_text())
                result = subprocess.run(["bash", str(script), str(bundle), "application"], env=env,
                                        capture_output=True, text=True, timeout=20)
                assert result.returncode != 0 and "Host key verification failed" in result.stderr, result.stderr
                print("PASS: real loopback OpenSSH accepts fixture identity; deployment rejects wrong key and mismatched host pin before upload.")
            finally:
                server.terminate()
                server.wait(timeout=5)


if __name__ == "__main__":
    main()
