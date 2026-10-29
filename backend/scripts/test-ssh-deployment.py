#!/usr/bin/env python3
"""Failure injection at external CLI boundaries; no EC2 or production credentials."""
import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEPLOY = REPO / "backend/deploy"
SHA, OPS = "a" * 40, "c" * 40
MANIFEST = {
    "format_version": 2, "source_sha": SHA,
    "api_image": "ghcr.io/30sativa/smart-campus-tour/backend@sha256:" + "b" * 64,
    "db_init_image": "ghcr.io/30sativa/smart-campus-tour/backend-db-init@sha256:" + "b" * 64,
    "db_init_source_sha": "9" * 40,
    "database_schema_version": "1.6",
    "sqlserver_image": "mcr.microsoft.com/mssql/server@sha256:" + "b" * 64,
    "sdk_image": "mcr.microsoft.com/dotnet/sdk@sha256:" + "b" * 64,
    "runtime_image": "mcr.microsoft.com/dotnet/aspnet@sha256:" + "b" * 64,
}

FAKE = r'''#!/usr/bin/env python3
import json, os, sys, tarfile
from pathlib import Path
name = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['LOG'], 'a') as log:
    log.write(json.dumps([name, args]) + '\n')
mode = os.environ.get('FAIL_MODE', '')
if name == 'git':
    if 'rev-parse' in args:
        print(os.environ['OPS'])
    elif 'status' in args:
        pass
    elif 'archive' in args:
        with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as archive:
            for path in Path(os.environ['DEPLOY_SOURCE']).rglob('*'):
                if path.is_file(): archive.add(path, arcname='backend/deploy/' + str(path.relative_to(os.environ['DEPLOY_SOURCE'])))
    sys.exit(0)
if name == 'id':
    print('0')
    sys.exit(0)
if name == 'docker':
    assert args[0] == 'login' and '--password-stdin' in args
    assert sys.stdin.read() == 'receiver-disposable-secret\n'
    (Path(os.environ['DOCKER_CONFIG']) / 'config.json').write_text('temporary-auth')
    sys.exit(1 if mode == 'login-failure' else 0)
if name == 'gh':
    if mode == 'gh-unavailable': sys.exit(22)
    if args[:2] == ['run', 'download']:
        if mode == 'missing-artifact': sys.exit(1)
        manifest = json.loads(os.environ['MANIFEST'])
        if mode == 'bad-manifest': manifest['source_sha'] = 'e' * 40
        (Path(args[args.index('--dir') + 1]) / 'backend-release.json').write_text(json.dumps(manifest))
    elif '/contents/' in args[-1]:
        print('services: {}')
    else:
        sha = args[-1].split('head_sha=')[1].split('&')[0]
        print(json.dumps({'workflow_runs': [] if mode == 'unverified' or (mode == 'unverified-ops' and sha == os.environ['OPS']) else [
            {'id': 71, 'event': 'push', 'head_branch': 'main', 'head_sha': sha, 'conclusion': 'success', 'run_number': 1},
            {'id': 72, 'event': 'pull_request', 'head_branch': 'main', 'head_sha': sha, 'conclusion': 'success', 'run_number': 2}
        ]}))
    sys.exit(0)
if name == 'ssh':
    if mode in ('host-key', 'authentication'):
        print('Host key verification failed' if mode == 'host-key' else 'Permission denied (publickey)', file=sys.stderr)
        sys.exit(255)
    if 'mktemp -d' in args[-1]: print('/tmp/campustour-delivery.ABCDE12345')
    elif args[-1].startswith('sudo '):
        Path(os.environ['TOKEN_RECEIVED']).write_text(sys.stdin.read())
        if mode == 'disconnect': sys.exit(255)
        if mode == 'remote-failure': sys.exit(73)
    sys.exit(0)
if name == 'scp':
    sys.exit(1 if mode == 'upload-failure' else 0)
raise SystemExit('Unexpected mock invocation')
'''


def main():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        binary = root / "bin"
        binary.mkdir()
        fake = binary / "fake"
        fake.write_text(FAKE)
        fake.chmod(0o755)
        for command in ("git", "gh", "ssh", "scp", "id", "docker"):
            (binary / command).symlink_to(fake)
        env = dict(os.environ, PATH=f"{binary}:{os.environ['PATH']}", LOG=str(root / "calls"),
                   OPS=OPS, DEPLOY_SOURCE=str(DEPLOY), MANIFEST=json.dumps(MANIFEST), TOKEN_RECEIVED=str(root / "token"))
        for mode in ("unverified", "unverified-ops", "missing-artifact", "bad-manifest", "gh-unavailable", "success"):
            env["FAIL_MODE"] = mode
            destination = root / mode
            result = subprocess.run(["bash", str(DEPLOY / "prepare-release.sh"), SHA, OPS, str(destination)],
                                    env=env, text=True, capture_output=True)
            assert (result.returncode == 0) == (mode == "success"), (mode, result.stderr)
            assert (destination / "verified-revisions").exists() == (mode == "success")
        bundle = root / "success"
        assert (bundle / "verified-revisions").read_text().splitlines() == [SHA, OPS, "71", "71"]
        assert (bundle / "release/docker-compose.yml").read_text() == "services: {}\n"
        for name in ("key", "known_hosts"):
            (root / name).write_text("disposable fixture")
        env.update(DEPLOY_SSH_HOST="ec2.example.test", DEPLOY_SSH_USER="campustour-deploy",
                   DEPLOY_SSH_KEY_FILE=str(root / "key"), DEPLOY_SSH_KNOWN_HOSTS_FILE=str(root / "known_hosts"),
                   GHCR_USER="actor", GHCR_TOKEN="disposable-secret")
        for mode in ("host-key", "authentication", "upload-failure", "remote-failure", "disconnect", "success"):
            env["FAIL_MODE"] = mode
            (root / "calls").write_text("")
            result = subprocess.run(["bash", str(DEPLOY / "ssh-deploy.sh"), str(bundle), "application"],
                                    env=env, text=True, capture_output=True)
            assert (result.returncode == 0) == (mode == "success"), (mode, result.stderr)
            calls = [json.loads(line) for line in (root / "calls").read_text().splitlines()]
            assert "disposable-secret" not in json.dumps(calls) + result.stdout + result.stderr
            for name, args in calls:
                if name in ("ssh", "scp"):
                    assert "StrictHostKeyChecking=yes" in args and "BatchMode=yes" in args
                    assert "IdentitiesOnly=yes" in args and "IdentityAgent=none" in args
            if mode in ("host-key", "authentication"):
                assert len(calls) == 1 and calls[0][0] == "ssh", calls
            elif mode == "disconnect":
                assert "retained /tmp/campustour-delivery." in result.stderr
                assert not calls[-1][1][-1].startswith("rm -rf"), "Disconnected delivery deleted a possibly live bundle"
            else:
                assert calls[-1][1][-1] == "rm -rf -- '/tmp/campustour-delivery.ABCDE12345'"
        assert (root / "token").read_text() == "disposable-secret\n"
        env["DEPLOY_SSH_HOST"] = "host; touch bad"
        result = subprocess.run(["bash", str(DEPLOY / "ssh-deploy.sh"), str(bundle), "application"],
                                env=env, capture_output=True)
        assert result.returncode != 0

        # Execute the real receiver with isolated installer/deploy boundaries.
        (bundle / "ops/install-host-tools.sh").write_text("#!/bin/bash\nexit 0\n")
        (bundle / "ops/deploy-ec2.sh").write_text(
            '#!/bin/bash\n[[ -s "$CAMPUS_RELEASE_COMPOSE" && -s "$CAMPUS_RELEASE_DB_INIT_COMPOSE" ]] || exit 81\n'
            '[[ "$DB_INIT_SOURCE_SHA" == "' + MANIFEST["db_init_source_sha"] + '" && "$DB_SCHEMA_VERSION" == "1.6" ]] || exit 82\n'
            'printf "%s\\n" "$@" > "$DEPLOY_ARGS"\n'
            'if [[ ${FAIL_MODE:-} == interrupted ]]; then touch "$INTERRUPT_READY"; sleep 30; fi\n'
            'if [[ ${FAIL_MODE:-} == reader-gone ]]; then\n'
            '  for step in 1 2 3 4 5; do echo "deploy step $step"; sleep 0.2; done; touch "$DEPLOY_COMPLETED"\n'
            'fi\n'
            '[[ ${FAIL_MODE:-} != deploy-failure ]]\n')
        delivery_log = root / "log/delivery.log"
        env.update(CAMPUS_REGISTRY_TEMP_ROOT=str(root), CAMPUS_DELIVERY_LOCK=str(root / "delivery.lock"),
                   CAMPUS_DELIVERY_LOG=str(delivery_log), DEPLOY_ARGS=str(root / "deploy-args"))
        for mode in ("login-failure", "deploy-failure", "success"):
            env["FAIL_MODE"] = mode
            result = subprocess.run(["bash", str(bundle / "ops/receive-release.sh"), "sql-maintenance", "actor"],
                                    env=env, input="receiver-disposable-secret\n", text=True, capture_output=True)
            assert (result.returncode == 0) == (mode == "success"), (mode, result.stderr)
            assert not list(root.glob("campustour-registry.*")), "Receiver leaked temporary registry credentials"
            assert "receiver-disposable-secret" not in result.stdout + result.stderr
        args = (root / "deploy-args").read_text().splitlines()
        assert args == ["--sql-maintenance", SHA, MANIFEST["api_image"], MANIFEST["db_init_image"], MANIFEST["sqlserver_image"], OPS]
        log_text = delivery_log.read_text()
        assert log_text.count(f"delivery mode=sql-maintenance release={SHA} ops={OPS} run=71") == 3, log_text
        assert "receiver-disposable-secret" not in log_text
        assert oct(delivery_log.parent.stat().st_mode & 0o777) == "0o700"

        (bundle / "ops/upgrade-db-schema-ec2.sh").write_text(
            '#!/bin/bash\n[[ -s "$CAMPUS_RELEASE_DB_INIT_COMPOSE" ]] || exit 81\n'
            'printf "%s\\n" "$@" > "$SCHEMA_UPGRADE_ARGS"\n'
            '[[ ${FAIL_MODE:-} != upgrade-failure ]]\n'
        )
        env.update(FAIL_MODE="success", SCHEMA_UPGRADE_ARGS=str(root / "schema-upgrade-args"))
        result = subprocess.run(["bash", str(bundle / "ops/receive-release.sh"), "schema-upgrade", "actor"],
                                env=env, input="receiver-disposable-secret\n", text=True, capture_output=True)
        assert result.returncode == 0, result.stderr
        assert (root / "schema-upgrade-args").read_text().splitlines() == [
            MANIFEST["db_init_image"], MANIFEST["db_init_source_sha"], MANIFEST["database_schema_version"]
        ]

        # Application delivery runs the conditional schema step first; its failure stops the API deploy.
        for mode in ("upgrade-failure", "success"):
            (root / "deploy-args").unlink(missing_ok=True)
            env["FAIL_MODE"] = mode
            result = subprocess.run(["bash", str(bundle / "ops/receive-release.sh"), "application", "actor"],
                                    env=env, input="receiver-disposable-secret\n", text=True, capture_output=True)
            assert (result.returncode == 0) == (mode == "success"), (mode, result.stderr)
            assert (root / "schema-upgrade-args").read_text().splitlines() == [
                "--if-needed", MANIFEST["db_init_image"], MANIFEST["db_init_source_sha"], MANIFEST["database_schema_version"]
            ]
            assert (root / "deploy-args").exists() == (mode == "success"), mode
            assert not list(root.glob("campustour-registry.*")), "Receiver leaked temporary registry credentials"
        assert (root / "deploy-args").read_text().splitlines() == [
            SHA, MANIFEST["api_image"], MANIFEST["db_init_image"], MANIFEST["sqlserver_image"], OPS
        ]

        # A vanished SSH reader (cancelled runner, dropped connection) must not kill the deployment mid-step.
        env.update(FAIL_MODE="reader-gone", DEPLOY_COMPLETED=str(root / "deploy-completed"))
        process = subprocess.Popen(["bash", str(bundle / "ops/receive-release.sh"), "application", "actor"],
                                   env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   start_new_session=True)
        try:
            process.stdin.write(b"receiver-disposable-secret\n")
            process.stdin.close()
            process.stdout.readline()
            process.stdout.close()
            assert process.wait(timeout=20) == 0, "Receiver failed after its reader disappeared"
            for _ in range(100):
                if "deploy step 5" in delivery_log.read_text():
                    break
                time.sleep(0.05)
            assert (root / "deploy-completed").exists(), "Deployment was killed when the SSH reader disappeared"
            assert "deploy step 5" in delivery_log.read_text(), "Host delivery log lost output after the reader disappeared"
            assert not list(root.glob("campustour-registry.*"))
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        env.update(FAIL_MODE="interrupted", INTERRUPT_READY=str(root / "ready"))
        process = subprocess.Popen(["bash", str(bundle / "ops/receive-release.sh"), "application", "actor"],
                                   env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, start_new_session=True)
        try:
            process.stdin.write("receiver-disposable-secret\n")
            process.stdin.close()
            process.stdin = None
            for _ in range(100):
                if (root / "ready").exists():
                    break
                if process.poll() is not None:
                    raise AssertionError(process.communicate())
                time.sleep(0.05)
            assert (root / "ready").exists(), "Receiver never reached deploy boundary"
            os.killpg(process.pid, signal.SIGTERM)
            process.communicate(timeout=5)
            assert process.returncode != 0 and not list(root.glob("campustour-registry.*"))
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()

        # Real Git archive must exclude ignored workstation secrets from transport.
        (binary / "git").unlink()
        checkout = root / "checkout"
        source = checkout / "backend/deploy"
        source.mkdir(parents=True)
        for filename in ("prepare-release.sh", "validate-release-manifest.py"):
            shutil.copyfile(DEPLOY / filename, source / filename)
        (checkout / ".gitignore").write_text("api.env\n")
        (source / "api.env").write_text("DO_NOT_TRANSFER=disposable-secret\n")
        def git(*args):
            return subprocess.run(["git", "-C", str(checkout), *args], check=True, text=True, capture_output=True).stdout.strip()
        git("init", "--quiet")
        git("add", ".")
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture")
        ops = git("rev-parse", "HEAD")
        env.update(FAIL_MODE="success", OPS=ops)
        result = subprocess.run(["bash", str(source / "prepare-release.sh"), SHA, ops, str(root / "archive-bundle")],
                                env=env, text=True, capture_output=True)
        assert result.returncode == 0, result.stderr
        assert not (root / "archive-bundle/ops/api.env").exists(), "Ignored configuration leaked into the bundle"
    print("PASS: verified run selection, private source bundle, invalid/expired releases, pinned SSH/auth failures, upload/remote errors and stdin-only credentials (mocked CLIs).")
    print("PASS: receiver preserves SQL-maintenance mode and image/revision identity; registry credentials cleaned on login/deploy failure, TERM interruption and success.")
    print("PASS: real Git archive excludes ignored workstation credentials from the operations bundle.")


if __name__ == "__main__":
    main()
