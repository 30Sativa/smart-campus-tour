#!/usr/bin/env bash
# Reconcile Docker Compose after Docker starts during an EC2 reboot.
set -euo pipefail

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
[[ $(id -u) == 0 ]] || { echo 'Run with root privileges to control the managed Docker stack.' >&2; exit 1; }
command -v flock >/dev/null || { echo 'flock is required to serialize stack startup with deploy and TLS renewal.' >&2; exit 1; }
exec 9>/run/lock/campustour-deploy.lock
flock 9
[[ -L "$ROOT/current" ]] || { echo 'No active CampusTour release; nothing to start.'; exit 0; }
release_dir=$(readlink -f "$ROOT/current")
case "$release_dir" in "$ROOT"/releases/*) ;; *) echo 'Active release link is invalid.' >&2; exit 1 ;; esac
[[ -f "$CONFIG/backend.env" && -f "$release_dir/release.env" && -f "$release_dir/docker-compose.yml" ]] || {
  echo 'Active release files are incomplete.' >&2
  exit 1
}
docker compose --project-name campustour --env-file "$CONFIG/backend.env" \
  --env-file "$release_dir/release.env" -f "$release_dir/docker-compose.yml" \
  up -d --wait --wait-timeout 300 api
echo "CampusTour release $(basename "$release_dir") is healthy."
