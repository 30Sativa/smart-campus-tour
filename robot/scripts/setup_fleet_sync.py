#!/usr/bin/env python3
"""Interactively save credentials/configuration and optionally run the Fleet Sync probe."""

from __future__ import annotations

import getpass
import importlib.util
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

DEFAULT_URL = "https://api.fptcampustour.cloud/api/fleet/v1/sync"
ROBOT_CODE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\Z", re.ASCII)
PROBE = Path(__file__).resolve().parents[2] / "backend" / "scripts" / "fleet_sync_probe.py"


def _shell_value(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def _load_probe_module():
    """Load the shared probe from its repository-relative path, independent of cwd."""
    try:
        spec = importlib.util.spec_from_file_location("campustour_fleet_sync_probe", PROBE)
        if spec is None or spec.loader is None:
            raise ImportError
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except (ImportError, OSError):
        raise RuntimeError("Fleet Sync probe is unavailable at the expected backend/scripts path.") from None


def _write_private(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name != "nt":
        path.parent.chmod(0o700)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        if os.name != "nt":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary_name, path)
        if os.name != "nt":
            path.chmod(0o600)
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        Path(temporary_name).unlink(missing_ok=True)
        raise


def save_configuration(home: Path, url: str, robot_code: str, map_key: str,
                       frame_id: str, credential: str, overwrite: bool = False) -> tuple[Path, Path]:
    config_dir = home / ".config" / "campustour"
    env_path = config_dir / "fleet-sync.env"
    credential_path = config_dir / f"{robot_code}.credential"
    if (env_path.exists() or credential_path.exists()) and not overwrite:
        raise FileExistsError("Configuration exists; explicit overwrite confirmation is required.")

    _write_private(credential_path, credential + "\n")
    fields = {
        "FLEET_SYNC_URL": url,
        "FLEET_ROBOT_CODE": robot_code,
        "FLEET_ROBOT_MAP_KEY": map_key,
        "FLEET_ROBOT_FRAME_ID": frame_id,
        "FLEET_ROBOT_CREDENTIAL_FILE": str(credential_path),
    }
    _write_private(env_path, "".join(f"export {key}={_shell_value(value)}\n" for key, value in fields.items()))
    return env_path, credential_path


def run_probe(env_path: Path, environment: dict[str, str], runner: Callable = subprocess.run,
              confirm_fn: Callable[[str], str] = input) -> int:
    probe_environment = environment.copy()
    values: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, shell_value = line.partition("=")
        if not separator or not key.startswith("export "):
            raise ValueError("Saved setup configuration is invalid.")
        parsed = shlex.split(shell_value)
        if len(parsed) != 1:
            raise ValueError("Saved setup configuration is invalid.")
        values[key[7:]] = parsed[0]
    probe_environment.update(values)
    print("Stop the Fleet Bridge for this RobotCode before probing; the probe must not run alongside it.")
    if confirm_fn("Confirm the Fleet Bridge is stopped [y/N]: ").strip().lower() != "y":
        print("Probe cancelled. Configuration was saved.")
        return 2
    return runner([sys.executable, str(PROBE)], env=probe_environment, check=False).returncode


def main(input_fn: Callable[[str], str] = input, password_fn: Callable[[str], str] = getpass.getpass,
         home: Path | None = None, environment: dict[str, str] | None = None,
         runner: Callable = subprocess.run) -> int:
    home = home or Path.home()
    environment = os.environ.copy() if environment is None else environment
    url = input_fn(f"Fleet Sync URL [{DEFAULT_URL}]: ").strip() or DEFAULT_URL
    robot_code = input_fn("RobotCode: ").strip()
    map_key = input_fn("Configured MapKey: ").strip()
    frame_id = input_fn("Configured FrameId [map]: ").strip() or "map"
    credential = password_fn("Robot credential (input hidden): ").strip()
    if not ROBOT_CODE.fullmatch(robot_code):
        print("RobotCode must start with an ASCII letter or digit and use only letters, digits, dot, underscore or hyphen (max 100).", file=sys.stderr)
        return 2
    if not map_key or len(map_key) > 100 or not frame_id or len(frame_id) > 100:
        print("MapKey and FrameId must each contain 1 to 100 characters.", file=sys.stderr)
        return 2
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", credential, re.ASCII):
        print("Credential must be the 43-character Fleet Sync token.", file=sys.stderr)
        return 2

    try:
        url = _load_probe_module().validate_url(url)
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 2

    config_dir = home / ".config" / "campustour"
    env_path = config_dir / "fleet-sync.env"
    credential_path = config_dir / f"{robot_code}.credential"
    overwrite = False
    if env_path.exists() or credential_path.exists():
        if input_fn("Setup exists. Type OVERWRITE to replace it: ").strip() != "OVERWRITE":
            print("Existing setup retained.")
            return 2
        overwrite = True
    try:
        env_path, _ = save_configuration(home, url, robot_code, map_key, frame_id, credential, overwrite)
    except OSError:
        print("Could not save private Fleet Sync configuration; check filesystem permissions.", file=sys.stderr)
        return 1
    print(f"Saved Fleet Sync configuration to {env_path}; credential is stored separately.")
    action = input_fn("Run one Fleet Sync probe now? [y/N]: ").strip().lower()
    if action != "y":
        print("Configuration only. Source the env file before starting the Fleet Bridge.")
        return 0
    return run_probe(env_path, environment, runner, input_fn)


if __name__ == "__main__":
    sys.exit(main())
