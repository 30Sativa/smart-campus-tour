#!/usr/bin/env bash
# Controlled, single-host image deployment. This script never builds images or changes the database schema.
set -Eeuo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }

validate_inputs() {
  local release_sha=$1 api_image=$2 db_init_image=$3 sqlserver_image=$4 ops_sha=$5
  [[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Release commit must be a 40-character lowercase SHA.'
  [[ "$ops_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Deployment script commit must be a 40-character lowercase SHA.'
  [[ "$api_image" =~ ^ghcr\.io/30sativa/smart-campus-tour/backend@sha256:[0-9a-f]{64}$ ]] ||
    fail 'API image must use the approved GHCR repository and an immutable sha256 digest.'
  [[ "$db_init_image" =~ ^ghcr\.io/30sativa/smart-campus-tour/backend-db-init@sha256:[0-9a-f]{64}$ ]] ||
    fail 'Database initializer image must use the approved GHCR repository and an immutable sha256 digest.'
  [[ "$sqlserver_image" =~ ^mcr\.microsoft\.com/mssql/server@sha256:[0-9a-f]{64}$ ]] ||
    fail 'SQL Server image must be a pinned Microsoft Container Registry digest.'
}

if [[ ${1:-} == --validate-only ]]; then
  [[ $# == 6 ]] || fail 'usage: deploy-ec2.sh --validate-only RELEASE_SHA API_IMAGE DB_INIT_IMAGE SQL_IMAGE OPS_SHA'
  validate_inputs "$2" "$3" "$4" "$5" "$6"
  echo 'PASS: deployment inputs are valid immutable image references.'
  exit 0
fi

[[ $# == 5 ]] || fail 'usage: deploy-ec2.sh RELEASE_SHA API_IMAGE DB_INIT_IMAGE SQL_IMAGE OPS_SHA'
release_sha=$1
api_image=$2
db_init_image=$3
sqlserver_image=$4
ops_sha=$5
validate_inputs "$release_sha" "$api_image" "$db_init_image" "$sqlserver_image" "$ops_sha"

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
STATE=${CAMPUS_STATE_DIR:-/var/lib/campustour}
BACKUP_SCRIPT=${CAMPUS_BACKUP_SCRIPT:-/usr/local/sbin/campustour-backup}
BACKUP_STAGE_DIR=${CAMPUS_BACKUP_STAGE_DIR:-/var/lib/campustour/backups}
BACKUP_ENV=${CAMPUS_BACKUP_ENV:-/etc/campustour/backup.env}
API_ENV=${CAMPUS_API_ENV_FILE:-/etc/campustour/api.env}
TLS_CERT=${CAMPUS_TLS_CERT_PATH:-/etc/campustour/certs/active/fullchain.pem}
TLS_KEY=${CAMPUS_TLS_KEY_PATH:-/etc/campustour/certs/active/privkey.pem}
RAW_BASE=https://raw.githubusercontent.com/30Sativa/smart-campus-tour
PENDING_FILE=$STATE/deployment.pending
CURRENT_LINK=$ROOT/current
candidate_dir=$ROOT/releases/$release_sha
previous_sha=
update_started=0
promotion_complete=0

preflight() {
  [[ $(id -u) == 0 ]] || fail 'SSM Run Command must execute this script as root.'
  source /etc/os-release
  [[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || fail "Expected Ubuntu 24.04; found ${PRETTY_NAME:-unknown}."
  [[ $(uname -m) == x86_64 ]] || fail "Expected x86_64; found $(uname -m)."
  systemctl is-active --quiet docker || fail 'Docker Engine is not active.'
  command -v docker >/dev/null && command -v jq >/dev/null && command -v curl >/dev/null &&
    command -v flock >/dev/null && command -v ss >/dev/null || fail 'Required host tools are missing (docker, jq, curl, flock, ss).'
  if systemctl is-active --quiet mssql-server; then
    fail 'Host SQL Server service is active. Resolve the duplicate SQL service before deployment.'
  fi
  local host_sql_package_state
  host_sql_package_state=$(dpkg-query -W -f='${db:Status-Abbrev}' mssql-server 2>/dev/null || true)
  if [[ ${host_sql_package_state:0:1} == i ]]; then
    fail 'The host SQL Server package is installed. This deployment uses the SQL container only; review existing host data before removing the package.'
  fi
  if ss -ltnH | awk '$4 ~ /:1433$/ { found=1 } END { exit !found }'; then
    fail 'Host port 1433 is already listening. Resolve the duplicate SQL service before deployment.'
  fi
  local mem_mib available_mib free_gib disk_path
  mem_mib=$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)
  (( mem_mib >= 3500 )) || fail "Only ${mem_mib} MiB RAM is visible; at least 3500 MiB is required for the 4 GiB profile."
  available_mib=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo)
  (( available_mib >= 512 )) || fail "Only ${available_mib} MiB is currently available; deployment requires at least 512 MiB headroom."
  disk_path=/
  free_gib=$(($(df -B1 --output=avail "$disk_path" | awk 'NR == 2 { print $1 }') / 1024 / 1024 / 1024))
  (( free_gib >= 12 )) || fail "Only ${free_gib} GiB disk space remains; at least 12 GiB is required for image pulls and backup staging."
  docker info --format '{{.OSType}}/{{.Architecture}}' | grep -Eq '^linux/(amd64|x86_64)$' ||
    fail 'Docker Engine must run Linux on x86_64.'
  docker compose version >/dev/null
}

compose_for() {
  local dir=$1
  shift
  docker compose --project-name campustour --env-file "$CONFIG/backend.env" \
    --env-file "$dir/release.env" -f "$dir/docker-compose.yml" "$@"
}

read_current_sha() {
  local resolved
  [[ -L "$CURRENT_LINK" ]] || return 1
  resolved=$(readlink -f "$CURRENT_LINK") || return 1
  case "$resolved" in "$ROOT"/releases/*) ;; *) fail 'Active release link is outside the release directory.' ;; esac
  basename "$resolved"
}

set_current_link() {
  local target=$1 temp_link=$ROOT/.current.$$
  if [[ -z "$target" ]]; then
    if [[ -L "$CURRENT_LINK" ]]; then
      rm -- "$CURRENT_LINK"
    elif [[ -e "$CURRENT_LINK" ]]; then
      fail 'Refusing to replace a non-symlink current path.'
    fi
    return
  fi
  [[ -d "$target" ]] || fail "Release directory does not exist: $target"
  if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
    fail 'Refusing to replace a non-symlink current path.'
  fi
  ln -s "$target" "$temp_link"
  mv -Tf "$temp_link" "$CURRENT_LINK"
}

health_probe() {
  local sha=$1 dir=$ROOT/releases/$1 resolved host
  resolved=$(compose_for "$dir" config --format json)
  host=$(jq -r '.services.api.environment.AllowedHosts // empty' <<<"$resolved" | cut -d';' -f1)
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'API_HOST is missing or invalid in resolved Compose configuration.'
  curl --silent --show-error --fail --max-time 15 --connect-to "$host:443:127.0.0.1:443" \
    "https://$host/health/ready" -o /dev/null
}

rollback_release() {
  local old_sha=$1 failed_sha=$2 old_dir
  if [[ -z "$old_sha" ]]; then
    echo 'No previous release exists; stopping the candidate API.' >&2
    if [[ -d "$ROOT/releases/$failed_sha" ]]; then
      compose_for "$ROOT/releases/$failed_sha" stop api >/dev/null || true
    fi
    set_current_link ''
    return 0
  fi
  [[ "$old_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Previous release marker is invalid.' >&2; return 1; }
  old_dir=$ROOT/releases/$old_sha
  [[ -f "$old_dir/docker-compose.yml" && -f "$old_dir/release.env" ]] || {
    echo "Previous release files are missing: $old_dir" >&2
    return 1
  }
  echo "Checking schema compatibility with previous release $old_sha before application rollback."
  if ! compose_for "$old_dir" run -T --rm --no-deps db-init; then
    echo 'Previous release database guard rejected the current database; application rollback is unsafe.' >&2
    return 1
  fi
  if ! compose_for "$old_dir" up -d --no-deps --force-recreate --wait --wait-timeout 240 api; then
    echo 'Previous API image failed its Docker readiness check.' >&2
    return 1
  fi
  if ! health_probe "$old_sha"; then
    echo 'Previous API image did not pass its HTTPS readiness probe.' >&2
    return 1
  fi
  set_current_link "$old_dir"
  echo "PASS: API rolled back to release $old_sha; database was left unchanged."
}

write_pending() {
  local tmp
  tmp=$(mktemp "$STATE/.deployment-pending.XXXXXX")
  printf '%s\n%s\n' "$release_sha" "$previous_sha" > "$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$PENDING_FILE"
}

recover_pending() {
  local pending_candidate pending_previous
  [[ -f "$PENDING_FILE" ]] || return 0
  read -r pending_candidate pending_previous < <(tr '\n' ' ' < "$PENDING_FILE")
  [[ "$pending_candidate" =~ ^[0-9a-f]{40}$ ]] || fail 'Interrupted deployment marker is malformed.'
  if [[ -n "$pending_previous" && ! "$pending_previous" =~ ^[0-9a-f]{40}$ ]]; then
    fail 'Interrupted deployment previous-release marker is malformed.'
  fi
  echo "Recovering interrupted deployment of $pending_candidate."
  rollback_release "$pending_previous" "$pending_candidate" ||
    fail 'Interrupted deployment could not be rolled back safely; inspect database compatibility and container health.'
  rm -f -- "$PENDING_FILE"
}

on_exit() {
  local status=$?
  trap - EXIT
  if (( status != 0 && update_started == 1 && promotion_complete == 0 )); then
    echo 'Deployment failed; checking whether the previous API release is safe to restore.' >&2
    if rollback_release "$previous_sha" "$release_sha"; then
      rm -f -- "$PENDING_FILE"
    else
      echo 'Automatic API rollback was refused or failed. Database was not restored or reset; manual recovery is required.' >&2
    fi
  fi
  exit "$status"
}

preflight
mkdir -p "$ROOT/releases" "$STATE" /run/lock
[[ -f "$CONFIG/backend.env" && -f "$API_ENV" ]] || fail 'Required backend.env or api.env is missing.'
[[ -f "$TLS_CERT" && -f "$TLS_KEY" ]] || fail 'TLS certificate or private key is missing.'
[[ -d "$BACKUP_STAGE_DIR" ]] || fail 'SQL backup staging directory is missing.'
[[ $(stat -c '%a' "$CONFIG/backend.env") == 600 ]] || fail 'backend.env must have mode 0600.'
[[ $(stat -c '%a' "$API_ENV") == 600 ]] || fail 'api.env must have mode 0600.'
[[ $(stat -c '%a' "$TLS_KEY") == 600 ]] || fail 'TLS private key must have mode 0600.'
openssl x509 -checkend 1209600 -noout -in "$TLS_CERT" >/dev/null || fail 'TLS certificate expires within 14 days.'
certificate_key_hash=$(openssl x509 -in "$TLS_CERT" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
private_key_hash=$(openssl pkey -in "$TLS_KEY" -pubout -outform DER | sha256sum | cut -d' ' -f1)
[[ "$certificate_key_hash" == "$private_key_hash" ]] || fail 'TLS certificate does not match the configured private key.'

exec 9>/run/lock/campustour-deploy.lock
flock -n 9 || fail 'Another deployment is already running on this EC2 host.'
recover_pending

if previous_sha=$(read_current_sha); then
  [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Current release directory name is invalid.'
else
  previous_sha=
  if [[ -n "$(docker ps -aq --filter label=com.docker.compose.project=campustour)" ]]; then
    fail 'A campustour Compose project already exists without a managed current release. Back it up and migrate it through a reviewed procedure first.'
  fi
fi

candidate_tmp=$(mktemp -d "$ROOT/.release-$release_sha.XXXXXX")
mkdir -p "$candidate_tmp"
if ! curl --fail --location --silent --show-error --max-time 30 \
  "$RAW_BASE/$release_sha/backend/docker-compose.yml" -o "$candidate_tmp/docker-compose.yml"; then
  rmdir "$candidate_tmp" 2>/dev/null || true
  fail 'Could not download the Compose file from the release source commit.'
fi
[[ -s "$candidate_tmp/docker-compose.yml" ]] || {
  rm -f -- "$candidate_tmp/docker-compose.yml"
  rmdir "$candidate_tmp" 2>/dev/null || true
  fail 'Release Compose file is empty.'
}
printf '%s\n' \
  "COMPOSE_PROJECT_NAME=campustour" \
  "BACKEND_IMAGE=$api_image" \
  "DB_INIT_IMAGE=$db_init_image" \
  "SQLSERVER_IMAGE=$sqlserver_image" \
  "API_ENV_FILE=$API_ENV" \
  "TLS_CERT_PATH=$TLS_CERT" \
  "TLS_KEY_PATH=$TLS_KEY" \
  "SQL_BACKUP_DIR=$BACKUP_STAGE_DIR" \
  "SOURCE_SHA=$release_sha" > "$candidate_tmp/release.env"
chmod 0644 "$candidate_tmp/docker-compose.yml" "$candidate_tmp/release.env"
if [[ -e "$candidate_dir" ]]; then
  if [[ ! -d "$candidate_dir" || -L "$candidate_dir" ]]; then
    rm -f -- "$candidate_tmp/docker-compose.yml" "$candidate_tmp/release.env"
    rmdir "$candidate_tmp" 2>/dev/null || true
    fail 'Candidate release path is not a directory.'
  fi
  mv -f "$candidate_tmp/docker-compose.yml" "$candidate_dir/docker-compose.yml"
  mv -f "$candidate_tmp/release.env" "$candidate_dir/release.env"
  rmdir "$candidate_tmp"
else
  mv "$candidate_tmp" "$candidate_dir"
fi

candidate_config=$(compose_for "$candidate_dir" config --format json)
if [[ -z "$previous_sha" ]]; then
  sql_volume=$(jq -r '.volumes["sqlserver-data"].name // empty' <<<"$candidate_config")
  [[ "$sql_volume" =~ ^[A-Za-z0-9_.-]+$ ]] || fail 'Could not resolve the managed SQL data volume name.'
  if docker volume inspect "$sql_volume" >/dev/null 2>&1; then
    fail "SQL data volume $sql_volume already exists without a managed current release. Preserve it, take and verify a backup, then follow the reviewed adoption procedure."
  fi
fi
candidate_host=$(jq -r '.services.api.environment.AllowedHosts // empty' <<<"$candidate_config" | cut -d';' -f1)
[[ "$candidate_host" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'API_HOST is missing or invalid in resolved Compose configuration.'
openssl x509 -in "$TLS_CERT" -checkhost "$candidate_host" -noout >/dev/null ||
  fail 'Configured TLS certificate does not cover API_HOST.'
[[ $(jq -r '.services.api.image' <<<"$candidate_config") == "$api_image" ]] || fail 'Resolved API image differs from the approved digest.'
[[ $(jq -r '.services.db-init.image' <<<"$candidate_config") == "$db_init_image" ]] || fail 'Resolved initializer image differs from the approved digest.'
[[ $(jq -r '.services.sqlserver.image' <<<"$candidate_config") == "$sqlserver_image" ]] || fail 'Resolved SQL Server image differs from the approved digest.'
(( $(jq '(.services.sqlserver.ports // []) | length' <<<"$candidate_config") == 0 )) || fail 'SQL Server port 1433 must remain private.'
docker pull "$api_image"
docker pull "$db_init_image"
docker pull "$sqlserver_image"
api_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$api_image")
init_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$db_init_image")
init_sql_image=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.base.name"}}' "$db_init_image")
[[ "$api_revision" == "$release_sha" && "$init_revision" == "$release_sha" ]] ||
  fail 'API and database initializer images do not match the requested source commit.'
[[ "$init_sql_image" == "$sqlserver_image" ]] || fail 'Database initializer was built from a different SQL Server image digest.'

if [[ -n "$previous_sha" ]]; then
  previous_sql_image=$(awk -F= '$1 == "SQLSERVER_IMAGE" { print substr($0, index($0, "=") + 1); exit }' \
    "$ROOT/releases/$previous_sha/release.env")
  [[ "$previous_sql_image" == "$sqlserver_image" ]] ||
    fail 'SQL Server image digest changed. SQL CU upgrades require a separate reviewed maintenance window.'
  compose_for "$ROOT/releases/$previous_sha" up -d --wait --wait-timeout 240 sqlserver
  [[ -x "$BACKUP_SCRIPT" ]] || fail 'Pre-deployment backup program is missing; install and verify it before deploying.'
  [[ -f "$BACKUP_ENV" ]] || fail 'Off-host backup configuration is missing; deployment is blocked.'
  "$BACKUP_SCRIPT" --pre-deploy
fi

compose_for "$candidate_dir" pull api db-init sqlserver
write_pending
update_started=1
trap on_exit EXIT
compose_for "$candidate_dir" up -d --wait --wait-timeout 300 api
health_probe "$release_sha"
compose_for "$candidate_dir" ps --all

set_current_link "$candidate_dir"
printf '%s\n%s\n%s\n%s\n' "$release_sha" "$api_image" "$db_init_image" "$sqlserver_image" \
  > "$STATE/current-release.tmp"
chmod 0600 "$STATE/current-release.tmp"
mv -f "$STATE/current-release.tmp" "$STATE/current-release"
rm -f -- "$PENDING_FILE"
promotion_complete=1
trap - EXIT
echo "PASS: release $release_sha is healthy. API=$api_image DB_INIT=$db_init_image SQLSERVER=$sqlserver_image"
