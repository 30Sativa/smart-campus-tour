#!/usr/bin/env python3
"""Failure-injection test for first deployment retry and foreign-volume safety.

This exercises deploy-ec2.sh with fake Docker, jq and host-capacity probes. Docker Engine
behavior is covered separately by test-deployment; this test must never be
called a real container test.
"""
from __future__ import annotations

import json
import fcntl
import os
import shutil
import subprocess
import tempfile
import textwrap
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = REPO / "backend" / "deploy" / "deploy-ec2.sh"
CHECK_SCRIPT = REPO / "backend" / "deploy" / "check-ec2.sh"

FAKE_CLI = r'''#!/usr/bin/env python3
import hashlib, json, os, shutil, sys, uuid
from pathlib import Path

name = Path(sys.argv[0]).name
args = sys.argv[1:]
# Model capacity independently of the CI runner's disk usage and concurrent jobs.
# Keep production guards executing, including their actual awk expressions.
if name == "df":
    if args != ["-B1", "--output=avail", "/"]:
        raise SystemExit("Unsupported fake df arguments: " + repr(args))
    print("Avail")
    print(os.environ["FAKE_DISK_AVAILABLE_BYTES"])
    sys.exit(0)
if name == "awk":
    real_awk = os.environ["FAKE_REAL_AWK"]
    if args[-1:] == ["/proc/meminfo"]:
        memory = ("MemTotal: " + os.environ["FAKE_MEM_TOTAL_KIB"] + " kB\n"
                  "MemAvailable: " + os.environ["FAKE_MEM_AVAILABLE_KIB"] + " kB\n")
        import subprocess
        sys.exit(subprocess.run([real_awk, *args[:-1]], input=memory, text=True).returncode)
    os.execv(real_awk, [real_awk, *args])
state_path = Path(os.environ["FAKE_DOCKER_STATE"])
fixture = Path(os.environ["FAKE_COMPOSE_FIXTURE"])
state_path.parent.mkdir(parents=True, exist_ok=True)
if state_path.exists():
    state = json.loads(state_path.read_text())
else:
    state = {"containers": {}, "volumes": {}, "networks": {}, "events": [], "next_id": 1}

def save():
    state_path.write_text(json.dumps(state))

def new_id():
    value = f"{state['next_id']:064x}"
    state["next_id"] += 1
    return value

def parse_envs():
    env = {}
    for i, arg in enumerate(args[:-1]):
        if arg == "--env-file":
            path = Path(args[i + 1])
            if path.exists():
                for line in path.read_text().splitlines():
                    if "=" in line and not line.startswith("#"):
                        key, value = line.split("=", 1)
                        env[key] = value
    compose_file = next((Path(args[i + 1]) for i, arg in enumerate(args[:-1]) if arg == "-f"), None)
    content = compose_file.read_text() if compose_file and compose_file.exists() else ""
    return env, content

def model(env, content):
    owner = env.get("COMPOSE_OWNER", "")
    sql_image = env.get("SQLSERVER_IMAGE", "")
    sql_memory = "2304m" if "TEST_SQL_DRIFT" in content else env.get("SQLSERVER_MEMORY_LIMIT", "2560m")
    sql = {
        "image": sql_image,
        "environment": {
            "ACCEPT_EULA": "Y", "MSSQL_PID": "Express",
            "MSSQL_SA_PASSWORD": env.get("SQL_SA_PASSWORD", ""),
            "MSSQL_MEMORY_LIMIT_MB": env.get("MSSQL_MEMORY_LIMIT_MB", "2048"),
        },
        "volumes": [
            {"type": "volume", "source": "campustour_sqlserver-data", "target": "/var/opt/mssql"},
            {"type": "bind", "source": env.get("SQL_BACKUP_DIR", ""), "target": "/var/opt/mssql/backup"},
        ],
        "networks": ["database"],
        "ports": [],
        "mem_limit": sql_memory,
        "cpus": env.get("SQLSERVER_CPUS", "1.25"),
        "labels": {"com.smartcampus.deployment.owner": owner},
    }
    if "TEST_UNAUTHORIZED_SQL_DRIFT" in content:
        sql["privileged"] = True
    return {
        "services": {
            "sqlserver": sql,
            "db-init": {"image": env.get("DB_INIT_IMAGE", ""), "labels": {"com.smartcampus.deployment.owner": owner}},
            "api": {
                "image": env.get("BACKEND_IMAGE", ""),
                "environment": {"AllowedHosts": env.get("API_HOST", "api.test") + ";localhost"},
                "labels": {"com.smartcampus.deployment.owner": owner},
                "volumes": [
                    {"type": "bind", "source": env.get("TLS_CERT_PATH", ""), "target": "/run/tls/fullchain.pem"},
                    {"type": "bind", "source": env.get("TLS_KEY_PATH", ""), "target": "/run/tls/privkey.pem"},
                ],
            },
        },
        "volumes": {"sqlserver-data": {"name": "campustour_sqlserver-data", "labels": {"com.smartcampus.deployment.owner": owner}}},
        "networks": {"database": {"internal": True, "labels": {"com.smartcampus.deployment.owner": owner}}},
    }

def filters_match(container, values):
    for value in values:
        if not value.startswith("label="):
            continue
        label = value[len("label="):]
        key, _, expected = label.partition("=")
        labels = {
            "com.docker.compose.project": container.get("project", ""),
            "com.docker.compose.service": container.get("service", ""),
            "com.docker.compose.oneoff": container.get("oneoff", "False"),
        }
        labels.update(container.get("labels", {}))
        if labels.get(key) != expected:
            return False
    return True

def find_container(target):
    for container in state["containers"].values():
        if target in (container["id"], container["name"]):
            return container
    return None

if name == "id":
    if args == ["-u"]:
        print("0")
        sys.exit(0)
    sys.exit(2)
if name == "jq":
    expression = " ".join(arg for arg in args if not arg.startswith("--arg"))
    normalized_expression = expression.replace("-r ", "").strip()
    try:
        document = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("Fake jq received invalid JSON.", file=sys.stderr)
        sys.exit(2)
    if "service:(.services.sqlserver" in expression:
        service = dict(document["services"]["sqlserver"])
        if "del(.image, .environment, .mem_limit, .cpus)" in expression:
            for key in ("image", "environment", "mem_limit", "cpus"):
                service.pop(key, None)
        else:
            service["image"] = "<pinned-sql-image>"
        value = {
            "service": service,
            "volume": document["volumes"]["sqlserver-data"],
            "database_network": document["networks"]["database"],
        }
        print(json.dumps(value, sort_keys=True, separators=(",", ":")))
    elif ".services.sqlserver.environment | keys | sort | join" in normalized_expression:
        print(",".join(sorted(document["services"]["sqlserver"]["environment"])))
    elif ".services.sqlserver.environment | del(.MSSQL_MEMORY_LIMIT_MB)" in normalized_expression:
        values = dict(document["services"]["sqlserver"]["environment"])
        values.pop("MSSQL_MEMORY_LIMIT_MB", None)
        print(json.dumps(values, sort_keys=True, separators=(",", ":")))
    elif "from_entries" in expression:
        values = {}
        for value in document:
            if not value.startswith("PATH=") and not value.startswith("MSSQL_MEMORY_LIMIT_MB="):
                key, _, item = value.partition("=")
                values[key] = item
        print(json.dumps(values, sort_keys=True, separators=(",", ":")))
    elif normalized_expression.startswith(".services.sqlserver.environment."):
        key = normalized_expression.removeprefix(".services.sqlserver.environment.").split()[0]
        key = key.replace("//", "").strip()
        print(document["services"]["sqlserver"]["environment"].get(key, ""))
    elif normalized_expression.startswith(".services.sqlserver.mem_limit"):
        print(document["services"]["sqlserver"].get("mem_limit", ""))
    elif normalized_expression.startswith(".services.sqlserver.cpus"):
        print(document["services"]["sqlserver"].get("cpus", ""))
    elif "(.services.sqlserver.ports // []) | length" in expression:
        print(len(document["services"]["sqlserver"].get("ports", [])))
    else:
        paths = {
            '.volumes["sqlserver-data"].name // empty': ("volumes", "sqlserver-data", "name"),
            ".services.api.environment.AllowedHosts // empty": ("services", "api", "environment", "AllowedHosts"),
            ".services.api.image": ("services", "api", "image"),
            '.services["db-init"].image': ("services", "db-init", "image"),
            ".services.sqlserver.image": ("services", "sqlserver", "image"),
            '.services.api.labels["com.smartcampus.deployment.owner"] // empty': ("services", "api", "labels", "com.smartcampus.deployment.owner"),
        }
        normalized = expression.replace("-r ", "").strip()
        keys = paths.get(normalized)
        if keys is None:
            print("Unsupported fake jq expression: " + expression, file=sys.stderr)
            sys.exit(2)
        value = document
        for key in keys:
            value = value.get(key) if isinstance(value, dict) else None
        print("" if value is None else value)
    sys.exit(0)
if name in ("systemctl", "dpkg-query"):
    if name == "systemctl" and args[-1:] == ["docker"]:
        sys.exit(0)
    sys.exit(1)
if name == "ss":
    sys.exit(0)
if name == "curl":
    sys.exit(0)
if name != "docker":
    sys.exit(2)

if args[:1] == ["info"]:
    print("linux/amd64")
    sys.exit(0)
if args[:2] == ["compose", "version"]:
    print("Docker Compose version v2.39.0")
    sys.exit(0)
compose_command = None
if args[:1] == ["compose"]:
    compose_command = next((value for value in args[1:] if value in {
        "config", "pull", "stop", "ps", "run", "up"
    }), None)
    # Like real Compose, a missing -f file makes the whole command invalid.
    for i, arg in enumerate(args[:-1]):
        if arg == "-f" and not Path(args[i + 1]).exists():
            print(f'compose file "{args[i + 1]}" is invalid: no such file or directory', file=sys.stderr)
            sys.exit(1)
if args[:1] == ["pull"]:
    sys.exit(0)
if args[:2] == ["image", "inspect"]:
    fmt = args[args.index("--format") + 1]
    target = args[-1]
    if "org.smartcampus.database.schema-version" in fmt:
        print("1.10")
    elif "revision" in fmt and "backend-db-init@" in target:
        print(os.environ["FAKE_DB_INIT_SOURCE_SHA"])
    elif "revision" in fmt:
        print(os.environ["FAKE_RELEASE_SHA"])
    elif "base.name" in fmt:
        print(os.environ["FAKE_MANIFEST_SQL_IMAGE"])
    else:
        print("sha256:" + "1" * 64)
    sys.exit(0)
if args[:2] == ["volume", "inspect"]:
    target = args[-1]
    volume = state["volumes"].get(target)
    if volume is None:
        sys.exit(1)
    if "--format" in args:
        print(volume.get("owner", ""))
    else:
        print(json.dumps(volume))
    sys.exit(0)
if args[:2] == ["network", "inspect"]:
    network = state["networks"].get(args[-1])
    if network is None:
        sys.exit(1)
    if "--format" in args:
        print(network.get("owner", ""))
    else:
        print(json.dumps(network))
    sys.exit(0)
if args[:2] == ["volume", "ls"] or args[:2] == ["network", "ls"]:
    kind = "volumes" if args[0] == "volume" else "networks"
    is_quiet = "-q" in args
    result = []
    for resource, item in state[kind].items():
        if any(v == "label=com.docker.compose.project=campustour" for v in args):
            if item.get("project") != "campustour":
                continue
        result.append(resource)
    print("\n".join(result) if is_quiet else json.dumps(result))
    sys.exit(0)
if args[:1] == ["ps"]:
    quiet_all = "-a" in args or "-aq" in args
    values = [v for v in args if v.startswith("--filter")]
    filters = []
    for i, arg in enumerate(args[:-1]):
        if arg == "--filter":
            filters.append(args[i + 1])
    result = []
    for container in state["containers"].values():
        if not quiet_all and not container.get("running"):
            continue
        if filters_match(container, filters):
            result.append(container)
    print("\n".join(c["id"] for c in result))
    sys.exit(0)
if args[:1] == ["inspect"]:
    fmt = args[args.index("--format") + 1] if "--format" in args else ""
    target = args[-1]
    container = find_container(target)
    if not container:
        sys.exit(1)
    labels = container.get("labels", {})
    if "oneoff" in fmt:
        print(container.get("oneoff", "False"))
    elif "com.smartcampus.deployment.owner" in fmt:
        print(labels.get("com.smartcampus.deployment.owner", ""))
    elif "config-hash" in fmt:
        print(labels.get("com.docker.compose.config-hash", ""))
    elif ".Config.Image" in fmt:
        print(container.get("image", ""))
    elif ".Config.Env" in fmt:
        print(json.dumps(container.get("env", [])))
    elif ".State.Health.Status" in fmt:
        print(container.get("health", "none"))
    elif ".State.Status" in fmt:
        print("running" if container.get("running") else "exited")
    elif ".State.Running" in fmt:
        print("true" if container.get("running") else "false")
    elif ".Name" in fmt:
        print("/" + container["name"])
    else:
        print(json.dumps(container))
    sys.exit(0)
if args[:2] == ["rm", "-f"]:
    for target in args[2:]:
        container = find_container(target)
        if container:
            state["containers"].pop(container["name"], None)
    save()
    sys.exit(0)
if args[:1] == ["exec"]:
    sys.exit(0)
if compose_command == "config":
    env, content = parse_envs()
    resolved = model(env, content)
    # Like real Compose, `config` omits services whose profile is not active.
    if not any(args[i:i + 2] == ["--profile", "db-bootstrap"] for i in range(len(args) - 1)):
        resolved["services"].pop("db-init")
    if "--hash" in args:
        sql_config = resolved["services"]["sqlserver"]
        payload = json.dumps(sql_config, sort_keys=True, separators=(",", ":")).encode()
        print("sqlserver " + hashlib.sha256(payload).hexdigest())
    else:
        print(json.dumps(resolved))
    sys.exit(0)
if compose_command == "pull":
    if os.environ.get("FAKE_PULL_FAIL") == "1":
        print("injected GHCR image unavailable", file=sys.stderr)
        sys.exit(71)
    sys.exit(0)
if compose_command == "stop":
    sys.exit(0)
if compose_command == "ps":
    print("NAME SERVICE STATUS")
    sys.exit(0)
if compose_command == "run":
    env, content = parse_envs()
    command_index = args.index("run")
    service = next((value for value in reversed(args[command_index + 1:]) if value in ("api", "db-init")), "")
    state["events"].append("run-" + service)
    if service == "db-init":
        if os.environ.get("FAKE_FAIL_INIT") == "1":
            save()
            print("injected candidate schema mismatch", file=sys.stderr)
            sys.exit(1)
        volume = state["volumes"].setdefault("campustour_sqlserver-data", {"owner": env.get("COMPOSE_OWNER"), "project": "campustour", "data_id": str(uuid.uuid4())})
        volume["initialized"] = True
        volume["init_count"] = volume.get("init_count", 0) + 1
        save()
        sys.exit(0)
    name_value = args[args.index("--name") + 1]
    ident = new_id()
    owner = env.get("COMPOSE_OWNER", "")
    state["containers"][name_value] = {
        "id": ident, "name": name_value, "project": "campustour", "service": "api", "running": True,
        "health": "unhealthy" if os.environ.get("FAKE_FAIL_API_HEALTH") == "1" else "healthy",
        "oneoff": "True", "image": env.get("BACKEND_IMAGE", ""),
        "labels": {"com.smartcampus.deployment.owner": owner, "com.docker.compose.oneoff": "True"},
    }
    save()
    print(ident)
    sys.exit(0)
if compose_command == "up":
    env, content = parse_envs()
    service = args[-1]
    owner = env.get("COMPOSE_OWNER", "")
    if service == "sqlserver":
        resolved = model(env, content)
        payload = json.dumps(resolved["services"]["sqlserver"], sort_keys=True, separators=(",", ":")).encode()
        config_hash = hashlib.sha256(payload).hexdigest()
        state["volumes"].setdefault("campustour_sqlserver-data", {"owner": owner, "project": "campustour", "data_id": str(uuid.uuid4())})
        state["networks"].setdefault("campustour_database", {"owner": owner, "project": "campustour"})
        state["networks"].setdefault("campustour_outbound", {"owner": owner, "project": "campustour"})
        existing = state["containers"].get("campustour-sqlserver-1")
        ident = existing["id"] if existing else new_id()
        state["containers"]["campustour-sqlserver-1"] = {
            "id": ident, "name": "campustour-sqlserver-1", "project": "campustour", "service": "sqlserver",
            "running": True, "health": "healthy", "oneoff": "False", "image": env.get("SQLSERVER_IMAGE", ""),
            "env": [f"{key}={value}" for key, value in resolved["services"]["sqlserver"]["environment"].items()] + ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
            "memory_limit": resolved["services"]["sqlserver"]["mem_limit"],
            "cpus": resolved["services"]["sqlserver"]["cpus"],
            "labels": {"com.smartcampus.deployment.owner": owner, "com.docker.compose.config-hash": config_hash},
        }
        if os.environ.get("FAKE_FAIL_SQL_UPDATE") == "1" and existing:
            state["containers"]["campustour-sqlserver-1"]["running"] = False
            state["events"].append("failed-sql-update")
            save()
            print("injected SQL engine maintenance failure", file=sys.stderr)
            sys.exit(1)
        state["events"].append("up-sqlserver")
        save()
        sys.exit(0)
    if service == "api":
        if (os.environ.get("FAKE_FAIL_API_PROMOTION") == "1" and
                env.get("SOURCE_SHA") == os.environ.get("FAKE_FAIL_PROMOTION_SHA")):
            state["events"].append("failed-up-api-" + env.get("SOURCE_SHA", ""))
            save()
            print("injected API promotion failure", file=sys.stderr)
            sys.exit(1)
        release = env.get("SOURCE_SHA", "")
        name_value = "campustour-api-1"
        ident = new_id()
        state["containers"][name_value] = {
            "id": ident, "name": name_value, "project": "campustour", "service": "api", "running": True,
            "health": "healthy", "oneoff": "False", "image": env.get("BACKEND_IMAGE", ""),
            "labels": {"com.smartcampus.deployment.owner": owner},
        }
        state["api_sha"] = release
        state["events"].append("up-api-" + release)
        save()
        sys.exit(0)
if args[:1] == ["pull"]:
    sys.exit(0)
print("Unsupported fake Docker command: " + " ".join(args), file=sys.stderr)
sys.exit(2)
'''


def run() -> None:
    if os.name != "posix":
        print("SKIP: first-deploy failure injection requires Linux.")
        return

    root_tmp = Path(tempfile.mkdtemp(prefix="campustour-first-retry-", dir="/tmp"))
    try:
        fake_bin = root_tmp / "bin"
        fake_bin.mkdir()
        cli = fake_bin / "fake-cli.py"
        cli.write_text(FAKE_CLI)
        cli.chmod(0o755)
        real_awk = shutil.which("awk")
        if real_awk is None:
            raise RuntimeError("awk is required to evaluate the production resource guards")
        for name in ("docker", "curl", "systemctl", "dpkg-query", "ss", "id", "jq", "df", "awk"):
            (fake_bin / name).symlink_to(cli)
        fixture = root_tmp / "compose.fixture"
        fixture.write_text("services: {}\n")
        db_init_fixture = root_tmp / "compose.db-init.fixture"
        db_init_fixture.write_text("services:\n  db-init: {}\n")
        host_sql_image = "mcr.microsoft.com/mssql/server@sha256:" + "e" * 64
        api_digest = "ghcr.io/30sativa/smart-campus-tour/backend@sha256:" + "b" * 64
        init_digest = "ghcr.io/30sativa/smart-campus-tour/backend-db-init@sha256:" + "d" * 64
        sha = "a" * 40
        ops_sha = "f" * 40

        def setup_host(name: str, foreign_volume: bool = False) -> dict[str, str]:
            host = root_tmp / name
            deploy_root = host / "deploy"
            config = host / "config"
            state_dir = host / "state"
            backup_dir = host / "backups"
            cert_dir = host / "certs"
            run_dir = host / "run"
            for path in (deploy_root / "releases", config, state_dir, backup_dir, cert_dir, run_dir):
                path.mkdir(parents=True, exist_ok=True)
            (config / "backend.env").write_text(
                "COMPOSE_PROJECT_NAME=campustour\nCOMPOSE_OWNER=unused\n"
                "SQL_SA_PASSWORD=Aa1!" + "a" * 64 + "\nSQL_APP_PASSWORD=" + "b" * 64 + "\n"
                "JWT_SIGNING_KEY=" + "c" * 64 + "\nAPI_HOST=api.test\nWEB_ORIGIN=https://web.test\n"
            )
            (config / "api.env").write_text("Invitation__Provider=disabled\n")
            (state_dir / "operations-tools-release").write_text(ops_sha + "\n")
            (host / "backup.sh").write_text(
                "#!/usr/bin/env bash\nset -euo pipefail\n"
                "[[ $(readlink /proc/$PPID/fd/9) == \"$CAMPUS_OPERATION_LOCK\" ]] || exit 81\n"
                "[[ ${FAKE_BACKUP_FAIL:-0} != 1 ]] || { echo 'injected backup failure' >&2; exit 82; }\n"
                "printf 'backup\\n' >> \"$FAKE_BACKUP_LOG\"\n"
            )
            (host / "backup.sh").chmod(0o755)
            (config / "backup.env").write_text("BACKUP_S3_URI=s3://campustour-test/backups\n")
            (config / "backup.env").chmod(0o600)
            key = cert_dir / "privkey.pem"
            cert = cert_dir / "fullchain.pem"
            subprocess.run(
                ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=api.test",
                 "-addext", "subjectAltName=DNS:api.test", "-keyout", str(key), "-out", str(cert)],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            key.chmod(0o600)
            (cert_dir / "active").symlink_to(cert_dir)
            (config / "backend.env").chmod(0o600)
            (config / "api.env").chmod(0o600)
            state_file = host / "docker-state.json"
            if foreign_volume:
                state_file.write_text(json.dumps({
                    "containers": {}, "volumes": {"campustour_sqlserver-data": {
                        "owner": "foreign-owner", "project": "campustour", "data_id": "keep-this-data"
                    }}, "networks": {}, "events": [], "next_id": 1
                }))
            return {
                "PATH": f"{fake_bin}:{os.environ['PATH']}",
                "FAKE_REAL_AWK": real_awk,
                "FAKE_DISK_AVAILABLE_BYTES": str(32 * 1024**3),
                "FAKE_MEM_TOTAL_KIB": str(4 * 1024**2),
                "FAKE_MEM_AVAILABLE_KIB": str(2 * 1024**2),
                "FAKE_DOCKER_STATE": str(state_file),
                "FAKE_COMPOSE_FIXTURE": str(fixture),
                "FAKE_RELEASE_SHA": sha,
                "FAKE_MANIFEST_SQL_IMAGE": host_sql_image,
                "FAKE_BACKUP_LOG": str(host / "backup.log"),
                "CAMPUS_DEPLOY_ROOT": str(deploy_root),
                "CAMPUS_CONFIG_DIR": str(config),
                "CAMPUS_STATE_DIR": str(state_dir),
                "CAMPUS_BACKUP_SCRIPT": str(host / "backup.sh"),
                "CAMPUS_BACKUP_STAGE_DIR": str(backup_dir),
                "CAMPUS_BACKUP_ENV": str(config / "backup.env"),
                "CAMPUS_API_ENV_FILE": str(config / "api.env"),
                "CAMPUS_RELEASE_COMPOSE": str(fixture),
                "CAMPUS_RELEASE_DB_INIT_COMPOSE": str(db_init_fixture),
                "CAMPUS_TLS_CERT_PATH": str(cert_dir / "active" / "fullchain.pem"),
                "CAMPUS_TLS_KEY_PATH": str(cert_dir / "active" / "privkey.pem"),
                "CAMPUS_OPERATION_LOCK": str(run_dir / "operation.lock"),
                "COMPOSE_PROJECT_NAME": "campustour",
                "COMPOSE_OWNER": "unused",
                "BACKEND_IMAGE": api_digest,
                "DB_INIT_IMAGE": init_digest,
                "DB_INIT_SOURCE_SHA": "9" * 40,
                "DB_SCHEMA_VERSION": "1.10",
                "SQLSERVER_IMAGE": host_sql_image,
                "SQL_SA_PASSWORD": "Aa1!" + "a" * 64,
                "SQL_APP_PASSWORD": "b" * 64,
                "JWT_SIGNING_KEY": "c" * 64,
                "API_HOST": "api.test",
                "WEB_ORIGIN": "https://web.test",
                "API_HTTPS_PORT": "443",
                "API_BIND_IP": "0.0.0.0",
                "SQL_BACKUP_DIR": str(backup_dir),
                "API_ENV_FILE": str(config / "api.env"),
                "TLS_CERT_PATH": str(cert_dir / "active" / "fullchain.pem"),
                "TLS_KEY_PATH": str(cert_dir / "active" / "privkey.pem"),
            }

        def invoke(
            env: dict[str, str], release_sha: str = sha, *, fail_candidate: bool = False,
            fail_init: bool = False, fail_backup: bool = False, fail_promotion: bool = False,
            sql_drift: bool = False, manifest_sql_image: str = host_sql_image,
            sql_maintenance: bool = False, unauthorized_sql_change: bool = False,
            fail_sql_update: bool = False, fail_pull: bool = False,
        ) -> subprocess.CompletedProcess[str]:
            child_env = os.environ.copy()
            child_env.update(env)
            child_env["FAKE_RELEASE_SHA"] = release_sha
            child_env["FAKE_DB_INIT_SOURCE_SHA"] = env["DB_INIT_SOURCE_SHA"]
            child_env["FAKE_MANIFEST_SQL_IMAGE"] = manifest_sql_image
            child_env["FAKE_FAIL_API_HEALTH"] = "1" if fail_candidate else "0"
            child_env["FAKE_FAIL_INIT"] = "1" if fail_init else "0"
            child_env["FAKE_BACKUP_FAIL"] = "1" if fail_backup else "0"
            child_env["FAKE_FAIL_API_PROMOTION"] = "1" if fail_promotion else "0"
            child_env["FAKE_FAIL_PROMOTION_SHA"] = release_sha
            child_env["FAKE_SQL_DRIFT"] = "1" if sql_drift else "0"
            child_env["FAKE_UNAUTHORIZED_SQL_DRIFT"] = "1" if unauthorized_sql_change else "0"
            child_env["FAKE_FAIL_SQL_UPDATE"] = "1" if fail_sql_update else "0"
            child_env["FAKE_PULL_FAIL"] = "1" if fail_pull else "0"
            fixture.write_text("TEST_SQL_DRIFT\n" if sql_drift else "TEST_UNAUTHORIZED_SQL_DRIFT\n" if unauthorized_sql_change else "services: {}\n")
            child_env["CAMPUS_RELEASE_COMPOSE"] = str(fixture)
            cmd = ["bash", str(DEPLOY_SCRIPT)]
            if sql_maintenance:
                cmd.append("--sql-maintenance")
            cmd += [release_sha, api_digest, init_digest, manifest_sql_image, ops_sha]
            return subprocess.run(cmd, cwd=REPO, env=child_env, text=True, capture_output=True)

        def set_backend_setting(env: dict[str, str], key: str, value: str) -> None:
            path = Path(env["CAMPUS_CONFIG_DIR"]) / "backend.env"
            lines = [line for line in path.read_text().splitlines() if not line.startswith(key + "=")]
            lines.append(f"{key}={value}")
            path.write_text("\n".join(lines) + "\n")

        # Reproduce the failed main runner (10 GiB), exercise rounding just below
        # 12 GiB, and retain explicit rejection tests for both RAM guards.
        for name, capacity, message in (
            ("disk-10", {"FAKE_DISK_AVAILABLE_BYTES": str(10 * 1024**3)}, "Only 10 GiB disk space remains"),
            ("disk-below-12", {"FAKE_DISK_AVAILABLE_BYTES": str(12 * 1024**3 - 1)}, "Only 11 GiB disk space remains"),
            ("ram-total", {"FAKE_MEM_TOTAL_KIB": str(3499 * 1024)}, "at least 3500 MiB is required"),
            ("ram-available", {"FAKE_MEM_AVAILABLE_KIB": str(511 * 1024)}, "at least 512 MiB headroom"),
        ):
            env = setup_host(name)
            rejected = invoke({**env, **capacity}, fail_candidate=True)
            if rejected.returncode == 0 or message not in rejected.stderr:
                raise AssertionError(f"{name} did not fail at the resource guard: {rejected.stderr}")
            if (Path(env["CAMPUS_STATE_DIR"]) / "deployment-owner").exists() or Path(env["FAKE_DOCKER_STATE"]).exists():
                raise AssertionError(f"{name} changed managed state before rejecting insufficient capacity")
        boundary_env = setup_host("disk-exactly-12")
        boundary = invoke({**boundary_env, "FAKE_DISK_AVAILABLE_BYTES": str(12 * 1024**3)}, fail_candidate=True)
        if boundary.returncode == 0 or "Candidate API failed its Docker readiness health check." not in boundary.stderr:
            raise AssertionError(f"Exactly 12 GiB must pass preflight and reach candidate readiness: {boundary.stderr}")
        print("PASS (mocked capacity): 10 GiB and just below 12 GiB rejected without state changes; exactly 12 GiB reaches candidate readiness; low total/available RAM rejected.")

        host_env = setup_host("first-deploy")
        failed = invoke(host_env, fail_candidate=True)
        if failed.returncode == 0 or "Candidate API failed its Docker readiness health check." not in failed.stderr:
            raise AssertionError(f"first deployment should fail at candidate readiness\nstdout={failed.stdout}\nstderr={failed.stderr}")
        state_path = Path(host_env["FAKE_DOCKER_STATE"])
        state = json.loads(state_path.read_text())
        volume = state["volumes"].get("campustour_sqlserver-data")
        if not volume or not volume.get("initialized") or not volume.get("data_id"):
            raise AssertionError("failed first deployment did not leave its initialized volume and data marker intact")
        owner_file = Path(host_env["CAMPUS_STATE_DIR"]) / "deployment-owner"
        owner = owner_file.read_text().strip()
        if len(owner) != 32 or not owner_file.exists():
            raise AssertionError("failed first deployment did not persist its owner marker")
        if Path(host_env["CAMPUS_DEPLOY_ROOT"], "current").exists():
            raise AssertionError("failed first deployment unexpectedly promoted a current release")
        if (Path(host_env["CAMPUS_STATE_DIR"]) / "deployment.pending").exists():
            raise AssertionError("safe first-deploy failure left a pending transaction")

        succeeded = invoke(host_env, fail_candidate=False)
        if succeeded.returncode != 0:
            raise AssertionError(f"first-deploy retry failed\nstdout={succeeded.stdout}\nstderr={succeeded.stderr}")
        current = Path(host_env["CAMPUS_DEPLOY_ROOT"], "current")
        if current.resolve() != Path(host_env["CAMPUS_DEPLOY_ROOT"], "releases", sha):
            raise AssertionError("successful retry did not atomically promote the candidate release")
        state = json.loads(state_path.read_text())
        volume_after = state["volumes"]["campustour_sqlserver-data"]
        if volume_after["data_id"] != volume["data_id"] or volume_after.get("init_count", 0) < 2:
            raise AssertionError("retry replaced the SQL volume instead of preserving and rechecking it")
        # The active release now looks like one installed before the DB tool split
        # (db-init in its main Compose file); later deploys and rollbacks must still use it.
        Path(host_env["CAMPUS_DEPLOY_ROOT"], "releases", sha, "docker-compose.db-init.yml").unlink()

        old_api_id = state["containers"]["campustour-api-1"]["id"]
        next_sha = "c" * 40
        pull_rejected = invoke(host_env, next_sha, fail_pull=True)
        if pull_rejected.returncode == 0 or "injected GHCR image unavailable" not in pull_rejected.stderr:
            raise AssertionError("unavailable image was not rejected")
        pull_state = json.loads(state_path.read_text())
        if pull_state["containers"]["campustour-api-1"]["id"] != old_api_id or current.resolve().name != sha:
            raise AssertionError("image pull failure changed the live API")
        schema_rejected = invoke(host_env, next_sha, fail_init=True)
        if schema_rejected.returncode == 0 or "injected candidate schema mismatch" not in schema_rejected.stderr:
            raise AssertionError(f"candidate schema failure was not reported\nstdout={schema_rejected.stdout}\nstderr={schema_rejected.stderr}")
        state = json.loads(state_path.read_text())
        if state["containers"]["campustour-api-1"]["id"] != old_api_id or current.resolve().name != sha:
            raise AssertionError("candidate schema rejection changed the live API or release pointer")

        readiness_sha = "d" * 40
        readiness_rejected = invoke(host_env, readiness_sha, fail_candidate=True)
        if readiness_rejected.returncode == 0 or "Candidate API failed its Docker readiness health check." not in readiness_rejected.stderr:
            raise AssertionError(f"candidate readiness failure was not reported\nstdout={readiness_rejected.stdout}\nstderr={readiness_rejected.stderr}")
        state = json.loads(state_path.read_text())
        if state["containers"]["campustour-api-1"]["id"] != old_api_id or current.resolve().name != sha:
            raise AssertionError("candidate readiness rejection changed the live API or release pointer")

        drift_sha = "2" * 40
        sql_drift = invoke(host_env, drift_sha, sql_drift=True)
        if sql_drift.returncode == 0 or "SQL Server service configuration drift detected" not in sql_drift.stderr:
            raise AssertionError(f"SQL service configuration drift was not blocked\nstdout={sql_drift.stdout}\nstderr={sql_drift.stderr}")
        state = json.loads(state_path.read_text())
        if state["containers"]["campustour-api-1"]["id"] != old_api_id or current.resolve().name != sha:
            raise AssertionError("SQL configuration drift changed the live API or release pointer")

        backup_sha = "e" * 40
        backup_failed = invoke(host_env, backup_sha, fail_backup=True)
        if backup_failed.returncode == 0 or "injected backup failure" not in backup_failed.stderr:
            raise AssertionError(f"mandatory pre-deploy backup failure was not propagated\nstdout={backup_failed.stdout}\nstderr={backup_failed.stderr}")
        state = json.loads(state_path.read_text())
        if state["containers"]["campustour-api-1"]["id"] != old_api_id or current.resolve().name != sha:
            raise AssertionError("failed mandatory backup changed the live API or release pointer")
        if (Path(host_env["CAMPUS_STATE_DIR"]) / "deployment.pending").exists():
            raise AssertionError("backup failure started a deployment transaction")

        promotion_sha = "f" * 40
        promotion_failed = invoke(host_env, promotion_sha, fail_promotion=True)
        if promotion_failed.returncode == 0 or "injected API promotion failure" not in promotion_failed.stderr:
            raise AssertionError(f"API promotion failure was not injected\nstdout={promotion_failed.stdout}\nstderr={promotion_failed.stderr}")
        state = json.loads(state_path.read_text())
        if state["api_sha"] != sha or current.resolve().name != sha:
            raise AssertionError("failed API promotion did not restore the previous API release")
        if (Path(host_env["CAMPUS_STATE_DIR"]) / "deployment.pending").exists():
            raise AssertionError("successful API rollback left a pending transaction")

        interrupted_candidate = promotion_sha
        pending_path = Path(host_env["CAMPUS_STATE_DIR"]) / "deployment.pending"
        pending_path.write_text(f"{interrupted_candidate}\n{sha}\napplication\n0\n")
        pending_before_check = pending_path.read_text()
        host_check = subprocess.run(["bash", str(CHECK_SCRIPT)], cwd=REPO, env=host_env, text=True, capture_output=True)
        if host_check.returncode == 0 or "deployment.pending" not in host_check.stderr or "did not initiate rollback" not in host_check.stderr:
            raise AssertionError(f"host check did not report the pending application marker before other checks\nstdout={host_check.stdout}\nstderr={host_check.stderr}")
        if pending_path.read_text() != pending_before_check:
            raise AssertionError("host check removed or modified deployment.pending")
        recovery_sha = "9" * 40
        recovered = invoke(host_env, recovery_sha)
        if recovered.returncode != 0:
            raise AssertionError(f"application deployment did not recover its interrupted pending marker\nstdout={recovered.stdout}\nstderr={recovered.stderr}")
        if current.resolve().name != recovery_sha or pending_path.exists():
            raise AssertionError("interrupted deployment recovery did not restore the old release and complete the new one")

        operation_lock = Path(host_env["CAMPUS_OPERATION_LOCK"])
        with operation_lock.open("w") as holder:
            fcntl.flock(holder.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            current_api_id = json.loads(state_path.read_text())["containers"]["campustour-api-1"]["id"]
            concurrent = invoke(host_env, "8" * 40)
            if concurrent.returncode == 0 or "operation is already running" not in concurrent.stderr:
                raise AssertionError(f"concurrent deployment did not fail clearly on the host lock\nstdout={concurrent.stdout}\nstderr={concurrent.stderr}")
            state = json.loads(state_path.read_text())
            if state["containers"]["campustour-api-1"]["id"] != current_api_id or current.resolve().name != recovery_sha:
                raise AssertionError("a lock-rejected deployment changed the current API")

        active_target = current.resolve()
        current.unlink()
        current.symlink_to(host_env["CAMPUS_DEPLOY_ROOT"] + "/releases/missing-release")
        dangling = invoke(host_env, "7" * 40)
        if dangling.returncode == 0 or "dangling" not in dangling.stderr:
            raise AssertionError(f"dangling current release symlink was not rejected\nstdout={dangling.stdout}\nstderr={dangling.stderr}")
        current.unlink()
        current.symlink_to(active_target)

        current.unlink()
        missing_current = invoke(host_env, "6" * 40)
        if missing_current.returncode == 0 or "Persistent current-release state exists" not in missing_current.stderr:
            raise AssertionError(f"missing current symlink bypassed the existing deployment state\nstdout={missing_current.stdout}\nstderr={missing_current.stderr}")
        current.symlink_to(active_target)

        # An ordinary app release may contain a newer SQL manifest digest, but
        # it keeps the managed engine pin until explicit SQL maintenance.
        state = json.loads(state_path.read_text())
        pinned_sql_id = state["containers"]["campustour-sqlserver-1"]["id"]
        prior_sql_ups = state["events"].count("up-sqlserver")
        future_sql_image = "mcr.microsoft.com/mssql/server@sha256:" + "7" * 64
        ordinary_sha = "5" * 40
        ordinary = invoke(host_env, ordinary_sha, manifest_sql_image=future_sql_image)
        if ordinary.returncode != 0:
            raise AssertionError(f"ordinary app deploy was blocked by a newer upstream SQL digest\nstdout={ordinary.stdout}\nstderr={ordinary.stderr}")
        state = json.loads(state_path.read_text())
        if state["containers"]["campustour-sqlserver-1"]["id"] != pinned_sql_id or state["containers"]["campustour-sqlserver-1"]["image"] != host_sql_image:
            raise AssertionError("ordinary application deployment changed the managed SQL image")
        if state["events"].count("up-sqlserver") != prior_sql_ups:
            raise AssertionError("ordinary application deployment reconciled the SQL service")
        release_sql_pin = current.joinpath("release.env").read_text()
        if f"SQLSERVER_IMAGE={host_sql_image}" not in release_sql_pin:
            raise AssertionError("ordinary release metadata did not retain the active SQL image digest")

        maintenance_sha = "4" * 40
        live_sql = state["containers"]["campustour-sqlserver-1"]
        original_sa_password = next(value.split("=", 1)[1] for value in live_sql["env"] if value.startswith("MSSQL_SA_PASSWORD="))
        original_volume_id = state["volumes"]["campustour_sqlserver-data"]["data_id"]
        backup_count_before_rejections = len(Path(host_env["FAKE_BACKUP_LOG"]).read_text().splitlines())

        set_backend_setting(host_env, "SQL_SA_PASSWORD", "Zz9!" + "z" * 64)
        credential_rejected = invoke(host_env, "3" * 40, manifest_sql_image=future_sql_image, sql_maintenance=True)
        if credential_rejected.returncode == 0 or "credentials or fixed environment differ" not in credential_rejected.stderr:
            raise AssertionError(f"SQL maintenance accepted a changed SQL credential\nstdout={credential_rejected.stdout}\nstderr={credential_rejected.stderr}")
        set_backend_setting(host_env, "SQL_SA_PASSWORD", original_sa_password)

        unauthorized = invoke(host_env, "2" * 40, manifest_sql_image=future_sql_image,
                              sql_maintenance=True, unauthorized_sql_change=True)
        if unauthorized.returncode == 0 or "unapproved SQL service setting" not in unauthorized.stderr:
            raise AssertionError(f"SQL maintenance accepted an unapproved service security change\nstdout={unauthorized.stdout}\nstderr={unauthorized.stderr}")

        set_backend_setting(host_env, "SQLSERVER_MEMORY_LIMIT", "2592m")
        oversized = invoke(host_env, "1" * 40, manifest_sql_image=future_sql_image, sql_maintenance=True)
        if oversized.returncode == 0 or "between 1536 and 2560 MiB" not in oversized.stderr:
            raise AssertionError(f"SQL maintenance accepted a container memory limit outside the 4 GiB profile\nstdout={oversized.stdout}\nstderr={oversized.stderr}")
        set_backend_setting(host_env, "SQLSERVER_MEMORY_LIMIT", "1536m")
        set_backend_setting(host_env, "MSSQL_MEMORY_LIMIT_MB", "2048")
        insufficient_headroom = invoke(host_env, "0" * 40, manifest_sql_image=future_sql_image, sql_maintenance=True)
        if insufficient_headroom.returncode == 0 or "leave at least 256 MiB" not in insufficient_headroom.stderr:
            raise AssertionError(f"SQL maintenance accepted internal memory above its container headroom\nstdout={insufficient_headroom.stdout}\nstderr={insufficient_headroom.stderr}")
        set_backend_setting(host_env, "SQLSERVER_MEMORY_LIMIT", "2304m")
        set_backend_setting(host_env, "MSSQL_MEMORY_LIMIT_MB", "1792")
        set_backend_setting(host_env, "SQLSERVER_CPUS", "2.0")
        excessive_cpu = invoke(host_env, "a" * 40, manifest_sql_image=future_sql_image, sql_maintenance=True)
        if excessive_cpu.returncode == 0 or "between 0.5 and 1.5 CPUs" not in excessive_cpu.stderr:
            raise AssertionError(f"SQL maintenance accepted a CPU limit outside the 2 vCPU profile\nstdout={excessive_cpu.stdout}\nstderr={excessive_cpu.stderr}")
        set_backend_setting(host_env, "SQLSERVER_MEMORY_LIMIT", "2304m")
        set_backend_setting(host_env, "MSSQL_MEMORY_LIMIT_MB", "1792")
        set_backend_setting(host_env, "SQLSERVER_CPUS", "1.0")
        maintenance = invoke(host_env, maintenance_sha, manifest_sql_image=future_sql_image, sql_maintenance=True)
        if maintenance.returncode != 0:
            raise AssertionError(f"explicit SQL maintenance failed\nstdout={maintenance.stdout}\nstderr={maintenance.stderr}")
        state = json.loads(state_path.read_text())
        if state["containers"]["campustour-sqlserver-1"]["image"] != future_sql_image:
            raise AssertionError("explicit SQL maintenance did not apply the selected SQL image digest")
        sql_after_maintenance = state["containers"]["campustour-sqlserver-1"]
        sql_env_after_maintenance = dict(value.split("=", 1) for value in sql_after_maintenance["env"] if "=" in value)
        if (sql_env_after_maintenance.get("MSSQL_MEMORY_LIMIT_MB") != "1792" or
                sql_after_maintenance.get("memory_limit") != "2304m" or sql_after_maintenance.get("cpus") != "1.0"):
            raise AssertionError("explicit SQL maintenance did not apply the approved SQL RAM/CPU tuning")
        if state["volumes"]["campustour_sqlserver-data"]["data_id"] != original_volume_id:
            raise AssertionError("SQL maintenance replaced the persistent SQL data volume")
        if Path(host_env["CAMPUS_STATE_DIR"], "sqlserver-image").read_text().strip() != future_sql_image:
            raise AssertionError("SQL maintenance did not persist the new managed engine pin")
        if Path(host_env["CAMPUS_STATE_DIR"], "sqlserver-config-hash").read_text().strip() != sql_after_maintenance["labels"]["com.docker.compose.config-hash"]:
            raise AssertionError("successful SQL maintenance did not persist the active configuration hash")
        backup_count_after_maintenance = len(Path(host_env["FAKE_BACKUP_LOG"]).read_text().splitlines())
        if backup_count_after_maintenance != backup_count_before_rejections + 1:
            raise AssertionError("SQL maintenance did not require exactly one verified pre-change backup")

        set_backend_setting(host_env, "SQLSERVER_MEMORY_LIMIT", "2200m")
        failed_sql_sha = "e" * 40
        failed_sql = invoke(host_env, failed_sql_sha, manifest_sql_image=future_sql_image,
                            sql_maintenance=True, fail_sql_update=True)
        if failed_sql.returncode == 0 or "injected SQL engine maintenance failure" not in failed_sql.stderr:
            raise AssertionError(f"SQL maintenance failure was not injected\nstdout={failed_sql.stdout}\nstderr={failed_sql.stderr}")
        pending_after_sql_failure = pending_path.read_text()
        if pending_after_sql_failure != f"{failed_sql_sha}\n{maintenance_sha}\nsql-maintenance\n1\n":
            raise AssertionError("failed SQL maintenance did not preserve its pending database-recovery marker")
        state_after_sql_failure = json.loads(state_path.read_text())
        if state_after_sql_failure["volumes"]["campustour_sqlserver-data"]["data_id"] != original_volume_id:
            raise AssertionError("failed SQL maintenance replaced the persistent SQL data volume")
        sql_host_check = subprocess.run(["bash", str(CHECK_SCRIPT)], cwd=REPO, env=host_env, text=True, capture_output=True)
        if sql_host_check.returncode == 0 or "sql_change_started=1" not in sql_host_check.stderr or "did not initiate rollback" not in sql_host_check.stderr:
            raise AssertionError(f"host check did not clearly report interrupted SQL maintenance\nstdout={sql_host_check.stdout}\nstderr={sql_host_check.stderr}")
        if pending_path.read_text() != pending_after_sql_failure:
            raise AssertionError("host check removed or modified the failed SQL maintenance marker")
        events_before_recovery_attempt = list(state_after_sql_failure["events"])
        attempted_recovery = invoke(host_env, "6" * 40)
        if attempted_recovery.returncode == 0 or "Automatic rollback is unsafe" not in attempted_recovery.stderr:
            raise AssertionError(f"deployment did not stop for SQL recovery review\nstdout={attempted_recovery.stdout}\nstderr={attempted_recovery.stderr}")
        state_after_recovery_attempt = json.loads(state_path.read_text())
        if state_after_recovery_attempt["events"] != events_before_recovery_attempt or pending_path.read_text() != pending_after_sql_failure:
            raise AssertionError("deployment recovery altered containers or pending state before database review")

        foreign_env = setup_host("foreign-volume", foreign_volume=True)
        foreign_state_path = Path(foreign_env["FAKE_DOCKER_STATE"])
        rejected = invoke(foreign_env, fail_candidate=False)
        foreign_state = json.loads(foreign_state_path.read_text())
        if rejected.returncode == 0 or foreign_state["volumes"]["campustour_sqlserver-data"]["data_id"] != "keep-this-data":
            raise AssertionError("deployment adopted or modified an unowned persistent volume")

        print("PASS (mocked Docker): first deploy retained SQL data; application SQL drift, changed credentials, unsafe RAM limits, and unapproved SQL changes were rejected; explicit maintenance backed up then applied approved image/RAM/CPU changes without replacing data; SQL maintenance failure preserved pending state and blocked automatic recovery; host check reported pending state without mutation; deployment and API rollback gates remained intact.")
    finally:
        shutil.rmtree(root_tmp)


if __name__ == "__main__":
    run()
