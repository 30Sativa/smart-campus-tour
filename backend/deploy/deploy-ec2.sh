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
  [[ ${DB_INIT_SOURCE_SHA:-} =~ ^[0-9a-f]{40}$ && ${DB_SCHEMA_VERSION:-} == 1.17 ]] ||
    fail 'Database tool source SHA and schema version must come from the validated release manifest.'
}

if [[ ${1:-} == --validate-only ]]; then
  [[ $# == 6 || ( $# == 7 && $7 == --sql-maintenance ) ]] ||
    fail 'usage: deploy-ec2.sh --validate-only RELEASE_SHA API_IMAGE DB_INIT_IMAGE SQL_IMAGE OPS_SHA [--sql-maintenance]'
  validate_inputs "$2" "$3" "$4" "$5" "$6"
  echo 'PASS: deployment inputs are valid immutable image references.'
  exit 0
fi

sql_maintenance=0
if [[ ${1:-} == --sql-maintenance ]]; then
  sql_maintenance=1
  shift
fi
[[ $# == 5 ]] || fail 'usage: deploy-ec2.sh [--sql-maintenance] RELEASE_SHA API_IMAGE DB_INIT_IMAGE SQL_IMAGE OPS_SHA'
release_sha=$1
api_image=$2
db_init_image=$3
manifest_sql_image=$4
ops_sha=$5
validate_inputs "$release_sha" "$api_image" "$db_init_image" "$manifest_sql_image" "$ops_sha"

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
STATE=${CAMPUS_STATE_DIR:-/var/lib/campustour}
BACKUP_SCRIPT=${CAMPUS_BACKUP_SCRIPT:-/usr/local/sbin/campustour-backup}
BACKUP_STAGE_DIR=${CAMPUS_BACKUP_STAGE_DIR:-/var/lib/campustour/backups}
BACKUP_ENV=${CAMPUS_BACKUP_ENV:-/etc/campustour/backup.env}
OPERATION_LOCK=${CAMPUS_OPERATION_LOCK:-/run/lock/campustour-operation.lock}
API_ENV=${CAMPUS_API_ENV_FILE:-/etc/campustour/api.env}
TLS_CERT=${CAMPUS_TLS_CERT_PATH:-/etc/campustour/certs/active/fullchain.pem}
TLS_KEY=${CAMPUS_TLS_KEY_PATH:-/etc/campustour/certs/active/privkey.pem}
RELEASE_COMPOSE=${CAMPUS_RELEASE_COMPOSE:-}
PENDING_FILE=$STATE/deployment.pending
CURRENT_LINK=$ROOT/current
candidate_dir=$ROOT/releases/$release_sha
previous_sha=
update_started=0
promotion_complete=0
sql_engine_change_started=0
api_promotion_started=0
candidate_container=
stored_sql_config_hash=
stored_sql_maintenance_fingerprint=
active_sql_config_hash=
live_sql_config_hash=
desired_sql_config_hash=
candidate_sql_config_hash=

preflight() {
  [[ $(id -u) == 0 ]] || fail 'Execute this script as root.'
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
  local files=(-f "$dir/docker-compose.yml")
  # Releases installed before the DB tool split define db-init in their main file.
  [[ ! -f "$dir/docker-compose.db-init.yml" ]] || files+=(-f "$dir/docker-compose.db-init.yml")
  docker compose --project-name campustour --env-file "$CONFIG/backend.env" \
    --env-file "$dir/release.env" "${files[@]}" "$@"
}

read_current_sha() {
  local resolved
  if [[ ! -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then return 1; fi
  [[ -L "$CURRENT_LINK" ]] || fail 'Current release path exists but is not a symlink.'
  [[ -d "$CURRENT_LINK" ]] || fail 'Current release symlink is dangling or does not target a directory.'
  resolved=$(readlink -f "$CURRENT_LINK") || fail 'Could not resolve the active release symlink.'
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

atomic_write() {
  local path=$1 mode=$2 value=$3 tmp
  tmp=$(mktemp "$(dirname "$path")/.$(basename "$path").XXXXXX")
  printf '%s\n' "$value" > "$tmp"
  chmod "$mode" "$tmp"
  mv -f -- "$tmp" "$path"
}

read_release_value() {
  local path=$1 key=$2 value
  value=$(awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$path")
  printf '%s' "$value"
}

validate_sql_image() {
  [[ "$1" =~ ^mcr\.microsoft\.com/mssql/server@sha256:[0-9a-f]{64}$ ]] ||
    fail 'Managed SQL image state is not a pinned Microsoft Container Registry digest.'
}

resource_owner() {
  local kind=$1 resource=$2
  case "$kind" in
    container) docker inspect --format '{{index .Config.Labels "com.smartcampus.deployment.owner"}}' "$resource" 2>/dev/null ;;
    volume) docker volume inspect --format '{{index .Labels "com.smartcampus.deployment.owner"}}' "$resource" 2>/dev/null ;;
    network) docker network inspect --format '{{index .Labels "com.smartcampus.deployment.owner"}}' "$resource" 2>/dev/null ;;
    *) return 1 ;;
  esac
}

assert_owned_resources() {
  local owner=$1 resource actual count=0
  [[ "$owner" =~ ^[0-9a-f]{32}$ ]] || fail 'Deployment owner marker is missing or malformed.'
  for kind in container volume network; do
    case "$kind" in
      container) resources=$(docker ps -aq --filter label=com.docker.compose.project=campustour) ;;
      volume) resources=$(docker volume ls -q --filter label=com.docker.compose.project=campustour) ;;
      network) resources=$(docker network ls -q --filter label=com.docker.compose.project=campustour) ;;
    esac
    while IFS= read -r resource; do
      [[ -n "$resource" ]] || continue
      ((count += 1))
      actual=$(resource_owner "$kind" "$resource") || fail "Could not inspect $kind ownership for resource $resource."
      [[ "$actual" == "$owner" ]] || fail "Refusing to modify $kind $resource without the deployment owner marker."
    done <<<"$resources"
  done
  printf '%s\n' "$count"
}

assert_sql_healthy() {
  local dir=$1 expected_image=$2 expected_hash=${3:-} ids id count=0 state health image owner actual_hash
  ids=$(docker ps -q --filter label=com.docker.compose.project=campustour \
    --filter label=com.docker.compose.service=sqlserver)
  while IFS= read -r id; do [[ -n "$id" ]] && ((count += 1)); done <<<"$ids"
  (( count == 1 )) || fail "Expected one running managed SQL Server container; found $count."
  id=$(tr -d '\r\n' <<<"$ids")
  state=$(docker inspect --format '{{.State.Status}}' "$id")
  health=$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || true)
  image=$(docker inspect --format '{{.Config.Image}}' "$id")
  owner=$(resource_owner container "$id") || fail 'Could not inspect SQL Server container ownership.'
  actual_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
  if [[ -z "$expected_hash" ]]; then
    expected_hash=$(compose_for "$dir" config --hash sqlserver | awk '$1 == "sqlserver" { print $2; exit }')
  fi
  [[ "$owner" == "$COMPOSE_OWNER" ]] || fail 'SQL Server container has a different deployment owner.'
  [[ "$state" == running && "$health" == healthy ]] ||
    fail "SQL Server must already be running and healthy (state=$state health=${health:-unknown})."
  [[ "$image" == "$expected_image" ]] ||
    fail "SQL Server container image drift detected (expected $expected_image, found $image)."
  [[ "$expected_hash" =~ ^[0-9a-f]{64}$ && "$actual_hash" == "$expected_hash" ]] ||
    fail 'SQL Server container configuration hash differs from the managed Compose definition.'
}

sql_service_fingerprint() {
  local compose_json=$1
  jq -cS '{service:(.services.sqlserver | .image = "<pinned-sql-image>"),volume:.volumes["sqlserver-data"],database_network:.networks.database}' <<<"$compose_json"
}

sql_maintenance_fingerprint() {
  local compose_json=$1
  jq -cS '{service:(.services.sqlserver | del(.image, .environment, .mem_limit, .cpus)),volume:.volumes["sqlserver-data"],database_network:.networks.database}' <<<"$compose_json" |
    sha256sum | awk '{ print $1 }'
}

validate_sql_settings() {
  local compose_json=$1 memory_limit_mb container_limit cpu_limit memory_limit_mib
  local env_keys accept_eula sql_pid
  env_keys=$(jq -r '.services.sqlserver.environment | keys | sort | join(",")' <<<"$compose_json")
  [[ "$env_keys" == 'ACCEPT_EULA,MSSQL_MEMORY_LIMIT_MB,MSSQL_PID,MSSQL_SA_PASSWORD' ]] ||
    fail 'SQL Server environment contains an unapproved setting; only the managed password and memory setting are supported.'
  accept_eula=$(jq -r '.services.sqlserver.environment.ACCEPT_EULA // empty' <<<"$compose_json")
  sql_pid=$(jq -r '.services.sqlserver.environment.MSSQL_PID // empty' <<<"$compose_json")
  [[ "$accept_eula" == Y && "$sql_pid" == Express ]] ||
    fail 'SQL Server EULA and Express edition settings must remain managed defaults.'
  memory_limit_mb=$(jq -r '.services.sqlserver.environment.MSSQL_MEMORY_LIMIT_MB // empty' <<<"$compose_json")
  [[ "$memory_limit_mb" =~ ^[0-9]+$ ]] && (( memory_limit_mb >= 512 && memory_limit_mb <= 2048 )) ||
    fail 'SQL Server memory limit must be between 512 and 2048 MiB for the 4 GiB host profile.'
  container_limit=$(jq -r '.services.sqlserver.mem_limit // empty' <<<"$compose_json")
  if [[ "$container_limit" =~ ^([0-9]+)[mM]$ ]]; then
    memory_limit_mib=${BASH_REMATCH[1]}
  elif [[ "$container_limit" =~ ^([0-9]+)$ ]]; then
    memory_limit_mib=$((BASH_REMATCH[1] / 1024 / 1024))
  else
    fail 'SQL Server container memory limit must resolve to whole MiB.'
  fi
  (( memory_limit_mib >= 1536 && memory_limit_mib <= 2560 )) ||
    fail 'SQL Server container memory limit must be between 1536 and 2560 MiB for the 4 GiB host profile.'
  (( memory_limit_mb + 256 <= memory_limit_mib )) ||
    fail 'SQL Server internal memory must leave at least 256 MiB inside its container limit.'
  cpu_limit=$(jq -r '.services.sqlserver.cpus // empty' <<<"$compose_json")
  awk -v value="$cpu_limit" 'BEGIN { exit !(value ~ /^[0-9]+([.][0-9]+)?$/ && value >= 0.5 && value <= 1.5) }' ||
    fail 'SQL Server CPU limit must be between 0.5 and 1.5 CPUs for the 2 vCPU host profile.'
}

sql_container_config_hash() {
  local ids id count=0
  ids=$(docker ps -q --filter label=com.docker.compose.project=campustour \
    --filter label=com.docker.compose.service=sqlserver)
  while IFS= read -r id; do [[ -n "$id" ]] && ((count += 1)); done <<<"$ids"
  (( count == 1 )) || fail "Expected one running managed SQL Server container; found $count."
  id=$(tr -d '\r\n' <<<"$ids")
  docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id"
}

assert_sql_credentials_match() {
  local compose_json=$1 ids id actual_env expected_env
  ids=$(docker ps -q --filter label=com.docker.compose.project=campustour \
    --filter label=com.docker.compose.service=sqlserver)
  id=$(tr -d '\r\n' <<<"$ids")
  [[ -n "$id" ]] || fail 'SQL credentials cannot be checked because the managed SQL Server container is not running.'
  actual_env=$(docker inspect --format '{{json .Config.Env}}' "$id") ||
    fail 'Could not inspect the active SQL Server environment.'
  expected_env=$(jq -cS '.services.sqlserver.environment | del(.MSSQL_MEMORY_LIMIT_MB)' <<<"$compose_json")
  actual_env=$(jq -cS '[.[] | select(test("^(ACCEPT_EULA|MSSQL_PID|MSSQL_SA_PASSWORD)=")) | split("=") | {key:.[0],value:(.[1:] | join("="))}] | from_entries' <<<"$actual_env")
  [[ "$actual_env" == "$expected_env" ]] ||
    fail 'SQL Server credentials or fixed environment differ from the running database; credential rotation requires a separate reviewed procedure.'
}

prepare_candidate_api() {
  local dir=$1 sha=$2 host status running attempt available_mib
  candidate_container="campustour-candidate-${sha}"
  available_mib=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo)
  (( available_mib >= ${CAMPUS_CANDIDATE_START_HEADROOM_MIB:-768} )) ||
    fail "Only ${available_mib} MiB is available before candidate API startup; need at least ${CAMPUS_CANDIDATE_START_HEADROOM_MIB:-768} MiB to retain host headroom during overlapping API containers."
  if docker inspect "$candidate_container" >/dev/null 2>&1; then
    local existing_owner existing_oneoff
    existing_owner=$(resource_owner container "$candidate_container") || fail 'Could not inspect stale candidate ownership.'
    existing_oneoff=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$candidate_container")
    [[ "$existing_owner" == "$COMPOSE_OWNER" && "$existing_oneoff" == True ]] ||
      fail "Refusing to replace an unowned container named $candidate_container."
    docker rm -f "$candidate_container" >/dev/null
  fi
  local id
  id=$(compose_for "$dir" run -d --no-deps --name "$candidate_container" api)
  [[ "$id" =~ ^[0-9a-f]{12,64}$ ]] || fail 'Compose did not return a candidate API container ID.'
  for attempt in $(seq 1 60); do
    available_mib=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo)
    (( available_mib >= 512 )) ||
      fail "MemAvailable fell to ${available_mib} MiB while starting the candidate API; refusing to promote under memory pressure."
    status=$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || true)
    running=$(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null || true)
    if [[ "$status" == healthy && "$running" == true ]]; then
      resolved=$(compose_for "$dir" config --format json)
      host=$(jq -r '.services.api.environment.AllowedHosts // empty' <<<"$resolved" | cut -d';' -f1)
      [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'API_HOST is invalid in the candidate release.'
      docker exec "$id" curl --silent --show-error --insecure --fail --max-time 10 \
        --connect-to "$host:443:127.0.0.1:8443" "https://$host/health/ready" -o /dev/null ||
        fail 'Candidate API passed its container health check but failed the HTTPS database readiness probe.'
      return 0
    fi
    [[ "$running" == true ]] || fail "Candidate API exited before readiness (health=${status:-unknown})."
    [[ "$status" != unhealthy ]] || fail 'Candidate API failed its Docker readiness health check.'
    sleep 3
  done
  fail 'Candidate API did not become ready within 180 seconds.'
}

remove_candidate_api() {
  [[ -n "$candidate_container" ]] || return 0
  if docker inspect "$candidate_container" >/dev/null 2>&1; then
    local owner
    owner=$(resource_owner container "$candidate_container") || return 1
    [[ "$owner" == "$COMPOSE_OWNER" ]] || { echo 'Refusing to remove a candidate with a different owner.' >&2; return 1; }
    docker rm -f "$candidate_container" >/dev/null || return 1
  fi
  candidate_container=
}

cleanup_stale_candidates() {
  local id name owner oneoff
  local ids
  ids=$(docker ps -aq --filter label=com.docker.compose.project=campustour \
    --filter label=com.docker.compose.service=api)
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    name=$(docker inspect --format '{{.Name}}' "$id" | sed 's#^/##')
    [[ "$name" =~ ^campustour-candidate-[0-9a-f]{40}$ ]] || continue
    oneoff=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$id")
    [[ "$oneoff" == True ]] || fail "Refusing to clean candidate-named container $name without a Compose one-off marker."
    owner=$(resource_owner container "$id") || fail "Could not inspect candidate ownership for $name."
    [[ "$owner" == "$COMPOSE_OWNER" ]] || fail "Refusing to clean candidate $name with a different deployment owner."
    docker rm -f "$id" >/dev/null
    echo "Removed interrupted deployment candidate $name."
  done <<<"$ids"
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
  if ! compose_for "$old_dir" run -T --rm --no-deps db-init --check-only; then
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
  local tmp mode=${1:-application}
  tmp=$(mktemp "$STATE/.deployment-pending.XXXXXX")
  printf '%s\n%s\n%s\n0\n' "$release_sha" "$previous_sha" "$mode" > "$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$PENDING_FILE"
}

mark_sql_engine_change_started() {
  local tmp
  tmp=$(mktemp "$STATE/.deployment-pending.XXXXXX")
  printf '%s\n%s\nsql-maintenance\n1\n' "$release_sha" "$previous_sha" > "$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$PENDING_FILE"
  sql_engine_change_started=1
}

recover_pending() {
  local pending_candidate pending_previous pending_mode sql_started current
  [[ -f "$PENDING_FILE" ]] || return 0
  mapfile -t pending_state < "$PENDING_FILE"
  pending_candidate=${pending_state[0]:-}
  pending_previous=${pending_state[1]:-}
  pending_mode=${pending_state[2]:-application}
  sql_started=${pending_state[3]:-0}
  [[ "$pending_candidate" =~ ^[0-9a-f]{40}$ ]] || fail 'Interrupted deployment marker is malformed.'
  if [[ -n "$pending_previous" && ! "$pending_previous" =~ ^[0-9a-f]{40}$ ]]; then
    fail 'Interrupted deployment previous-release marker is malformed.'
  fi
  [[ "$pending_mode" == application || "$pending_mode" == sql-maintenance ]] || fail 'Interrupted deployment mode is malformed.'
  [[ "$sql_started" == 0 || "$sql_started" == 1 ]] || fail 'Interrupted SQL maintenance marker is malformed.'
  echo "Recovering interrupted deployment of $pending_candidate."
  if [[ "$pending_mode" == sql-maintenance && "$sql_started" == 1 ]]; then
    current=$(read_current_sha || true)
    if [[ "$current" == "$pending_candidate" ]] && health_probe "$pending_candidate"; then
      echo 'The maintenance release was promoted and passes readiness; clearing its completed interruption marker.'
      rm -f -- "$PENDING_FILE"
      return 0
    fi
    fail 'Interrupted SQL engine maintenance may have changed database files. Automatic rollback is unsafe; complete the documented SQL recovery review before another deployment.'
  fi
  rollback_release "$pending_previous" "$pending_candidate" ||
    fail 'Interrupted deployment could not be rolled back safely; inspect database compatibility and container health.'
  rm -f -- "$PENDING_FILE"
}

on_exit() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    remove_candidate_api || echo 'WARN: candidate API cleanup failed; inspect the owned candidate container.' >&2
  fi
  if (( status != 0 && update_started == 1 && promotion_complete == 0 )); then
    if (( sql_engine_change_started == 1 )); then
      echo 'SQL engine maintenance started; database recovery requires operator review. The backup and pending marker are preserved.' >&2
    elif (( api_promotion_started == 1 )) && rollback_release "$previous_sha" "$release_sha"; then
      rm -f -- "$PENDING_FILE"
    elif (( api_promotion_started == 0 )); then
      echo 'Candidate gates failed before API promotion; the previous API was left running.' >&2
      rm -f -- "$PENDING_FILE"
    else
      echo 'Deployment failed; checking whether the previous API release is safe to restore.' >&2
      echo 'Automatic API rollback was refused or failed. Database was not restored or reset; manual recovery is required.' >&2
    fi
  fi
  exit "$status"
}

preflight
mkdir -p "$ROOT/releases" "$STATE" "$(dirname "$OPERATION_LOCK")"
[[ -f "$CONFIG/backend.env" && -f "$API_ENV" ]] || fail 'Required backend.env or api.env is missing.'
[[ -f "$TLS_CERT" && -f "$TLS_KEY" ]] || fail 'TLS certificate or private key is missing.'
[[ -d "$BACKUP_STAGE_DIR" ]] || fail 'SQL backup staging directory is missing.'
[[ $(stat -c '%a' "$CONFIG/backend.env") == 600 ]] || fail 'backend.env must have mode 0600.'
[[ $(stat -c '%a' "$API_ENV") == 600 ]] || fail 'api.env must have mode 0600.'
[[ $(stat -c '%a' "$TLS_KEY") == 600 ]] || fail 'TLS private key must have mode 0600.'
[[ -f "$STATE/operations-tools-release" ]] || fail 'Versioned host operation tools are not installed.'
[[ $(cat "$STATE/operations-tools-release") == "$ops_sha" ]] ||
  fail 'Installed host operation tools do not match the selected operations commit.'
openssl x509 -checkend 1209600 -noout -in "$TLS_CERT" >/dev/null || fail 'TLS certificate expires within 14 days.'
certificate_key_hash=$(openssl x509 -in "$TLS_CERT" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
private_key_hash=$(openssl pkey -in "$TLS_KEY" -pubout -outform DER | sha256sum | cut -d' ' -f1)
[[ "$certificate_key_hash" == "$private_key_hash" ]] || fail 'TLS certificate does not match the configured private key.'

exec 9>"$OPERATION_LOCK"
flock -n 9 || fail 'A deployment, backup, certificate update, or maintenance operation is already running on this EC2 host.'
recover_pending

previous_sha=$(read_current_sha || true)
previous_dir=
previous_sql_image=
stored_sql_image=
if [[ -n "$previous_sha" ]]; then
  [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Current release directory name is invalid.'
  previous_dir=$ROOT/releases/$previous_sha
  [[ -f "$previous_dir/release.env" && -f "$previous_dir/docker-compose.yml" ]] || fail 'Current release files are incomplete.'
  previous_sql_image=$(read_release_value "$previous_dir/release.env" SQLSERVER_IMAGE)
  validate_sql_image "$previous_sql_image"
  COMPOSE_OWNER=$(read_release_value "$previous_dir/release.env" COMPOSE_OWNER)
  [[ -f "$STATE/deployment-owner" && $(cat "$STATE/deployment-owner") == "$COMPOSE_OWNER" ]] ||
    fail 'Current release does not match the persistent deployment owner marker.'
  [[ "$COMPOSE_OWNER" =~ ^[0-9a-f]{32}$ ]] || fail 'Current release owner marker is malformed.'
  if [[ -f "$STATE/sqlserver-image" ]]; then stored_sql_image=$(cat "$STATE/sqlserver-image"); fi
  if [[ -z "$stored_sql_image" ]]; then
    atomic_write "$STATE/sqlserver-image" 0600 "$previous_sql_image"
    stored_sql_image=$previous_sql_image
  fi
  validate_sql_image "$stored_sql_image"
  [[ "$stored_sql_image" == "$previous_sql_image" ]] ||
    fail 'Persistent SQL image state differs from the active release; inspect the SQL maintenance record before continuing.'
else
  previous_sha=
  [[ ! -f "$STATE/current-release" ]] ||
    fail 'Persistent current-release state exists but the current release symlink is missing; refusing a first-deploy path that would skip backup.'
  if [[ -f "$STATE/deployment-owner" ]]; then
    COMPOSE_OWNER=$(cat "$STATE/deployment-owner")
    [[ "$COMPOSE_OWNER" =~ ^[0-9a-f]{32}$ ]] || fail 'Deployment owner marker is malformed.'
    assert_owned_resources "$COMPOSE_OWNER" >/dev/null
  else
    initial_resources=$(docker ps -aq --filter label=com.docker.compose.project=campustour)
    initial_volumes=$(docker volume ls -q --filter label=com.docker.compose.project=campustour)
    initial_networks=$(docker network ls -q --filter label=com.docker.compose.project=campustour)
    [[ -z "$initial_resources$initial_volumes$initial_networks" ]] ||
      fail 'A campustour Compose project exists without a persistent owner marker. Preserve its data and use a reviewed adoption procedure.'
    COMPOSE_OWNER=$(openssl rand -hex 16)
    [[ "$COMPOSE_OWNER" =~ ^[0-9a-f]{32}$ ]] || fail 'Could not generate the deployment owner marker.'
    atomic_write "$STATE/deployment-owner" 0600 "$COMPOSE_OWNER"
  fi
  if [[ -f "$STATE/sqlserver-image" ]]; then
    current_sql_image=$(cat "$STATE/sqlserver-image")
    validate_sql_image "$current_sql_image"
  else
    current_sql_image=$manifest_sql_image
    atomic_write "$STATE/sqlserver-image" 0600 "$current_sql_image"
  fi
fi

if (( sql_maintenance )); then
  [[ -n "$previous_sha" ]] || fail 'SQL maintenance requires an existing managed release and a verified backup path.'
  current_sql_image=$manifest_sql_image
elif [[ -n "$previous_sha" ]]; then
  current_sql_image=$previous_sql_image
  if [[ "$manifest_sql_image" != "$current_sql_image" ]]; then
    echo "The release manifest proposes a different upstream SQL image; retaining the managed SQL pin $current_sql_image."
  fi
fi
validate_sql_image "$current_sql_image"

candidate_tmp=$(mktemp -d "$ROOT/.release-$release_sha.XXXXXX")
RELEASE_DB_INIT_COMPOSE=${CAMPUS_RELEASE_DB_INIT_COMPOSE:-}
if [[ ! -s "$RELEASE_COMPOSE" || ! -s "$RELEASE_DB_INIT_COMPOSE" ]] || \
  ! cp -- "$RELEASE_COMPOSE" "$candidate_tmp/docker-compose.yml" || \
  ! cp -- "$RELEASE_DB_INIT_COMPOSE" "$candidate_tmp/docker-compose.db-init.yml"; then
  rm -f -- "$candidate_tmp/docker-compose.yml"
  rm -f -- "$candidate_tmp/docker-compose.db-init.yml"
  rmdir "$candidate_tmp" 2>/dev/null || true
  fail 'Could not copy the Compose file from the verified application release bundle.'
fi
[[ -s "$candidate_tmp/docker-compose.yml" ]] || {
  rm -f -- "$candidate_tmp/docker-compose.yml"
  rmdir "$candidate_tmp" 2>/dev/null || true
  fail 'Release Compose file is empty.'
}
printf '%s\n' \
  "COMPOSE_PROJECT_NAME=campustour" \
  "COMPOSE_OWNER=$COMPOSE_OWNER" \
  "BACKEND_IMAGE=$api_image" \
  "DB_INIT_IMAGE=$db_init_image" \
  "DB_INIT_SOURCE_SHA=$DB_INIT_SOURCE_SHA" \
  "DB_SCHEMA_VERSION=$DB_SCHEMA_VERSION" \
  "SQLSERVER_IMAGE=$current_sql_image" \
  "API_ENV_FILE=$API_ENV" \
  "TLS_CERT_PATH=$TLS_CERT" \
  "TLS_KEY_PATH=$TLS_KEY" \
  "SQL_BACKUP_DIR=$BACKUP_STAGE_DIR" \
  "SOURCE_SHA=$release_sha" \
  "OPS_SHA=$ops_sha" > "$candidate_tmp/release.env"
chmod 0644 "$candidate_tmp/docker-compose.yml" "$candidate_tmp/docker-compose.db-init.yml" "$candidate_tmp/release.env"
if [[ -e "$candidate_dir" ]]; then
  [[ -d "$candidate_dir" && ! -L "$candidate_dir" ]] || fail 'Candidate release path is not a directory.'
  [[ "$candidate_dir" != "$previous_dir" ]] || fail 'Selected application release is already active.'
  mv -f "$candidate_tmp/docker-compose.yml" "$candidate_dir/docker-compose.yml"
  mv -f "$candidate_tmp/docker-compose.db-init.yml" "$candidate_dir/docker-compose.db-init.yml"
  mv -f "$candidate_tmp/release.env" "$candidate_dir/release.env"
  rmdir "$candidate_tmp"
else
  mv "$candidate_tmp" "$candidate_dir"
fi

candidate_config=$(compose_for "$candidate_dir" config --format json)
validate_sql_settings "$candidate_config"
candidate_sql_maintenance_fingerprint=$(sql_maintenance_fingerprint "$candidate_config")
candidate_sql_config_hash=$(compose_for "$candidate_dir" config --hash sqlserver | awk '$1 == "sqlserver" { print $2; exit }')
[[ "$candidate_sql_config_hash" =~ ^[0-9a-f]{64}$ ]] || fail 'Could not resolve the candidate SQL configuration hash.'
sql_volume=$(jq -r '.volumes["sqlserver-data"].name // empty' <<<"$candidate_config")
[[ "$sql_volume" =~ ^[A-Za-z0-9_.-]+$ ]] || fail 'Could not resolve the managed SQL data volume name.'
candidate_host=$(jq -r '.services.api.environment.AllowedHosts // empty' <<<"$candidate_config" | cut -d';' -f1)
[[ "$candidate_host" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'API_HOST is missing or invalid in resolved Compose configuration.'
openssl x509 -in "$TLS_CERT" -checkhost "$candidate_host" -noout >/dev/null ||
  fail 'Configured TLS certificate does not cover API_HOST.'
[[ $(jq -r '.services.api.image' <<<"$candidate_config") == "$api_image" ]] || fail 'Resolved API image differs from the approved digest.'
# db-init sits behind the db-bootstrap profile, which plain `config` omits.
[[ $(compose_for "$candidate_dir" --profile db-bootstrap config --format json | jq -r '.services["db-init"].image') == "$db_init_image" ]] || fail 'Resolved database-tool image differs from the approved digest.'
[[ $(jq -r '.services.sqlserver.image' <<<"$candidate_config") == "$current_sql_image" ]] || fail 'Resolved SQL Server image differs from the managed SQL pin.'
[[ $(jq -r '.services.api.labels["com.smartcampus.deployment.owner"] // empty' <<<"$candidate_config") == "$COMPOSE_OWNER" ]] ||
  fail 'Resolved Compose services do not carry the persistent deployment owner marker.'
(( $(jq '(.services.sqlserver.ports // []) | length' <<<"$candidate_config") == 0 )) || fail 'SQL Server port 1433 must remain private.'

if [[ -n "$previous_sha" ]]; then
  active_config=$(compose_for "$previous_dir" config --format json)
  active_sql_fingerprint=$(sql_service_fingerprint "$active_config")
  candidate_sql_fingerprint=$(sql_service_fingerprint "$candidate_config")
  active_sql_maintenance_fingerprint=$(sql_maintenance_fingerprint "$active_config")
  if [[ -f "$STATE/sqlserver-config-hash" ]]; then
    stored_sql_config_hash=$(cat "$STATE/sqlserver-config-hash")
    [[ "$stored_sql_config_hash" =~ ^[0-9a-f]{64}$ ]] ||
      fail 'Persistent SQL configuration hash is malformed; review the SQL maintenance record.'
  fi
  if [[ -f "$STATE/sqlserver-maintenance-fingerprint" ]]; then
    stored_sql_maintenance_fingerprint=$(cat "$STATE/sqlserver-maintenance-fingerprint")
    [[ "$stored_sql_maintenance_fingerprint" =~ ^[0-9a-f]{64}$ ]] ||
      fail 'Persistent SQL maintenance fingerprint is malformed; review the SQL maintenance record.'
  fi
  active_sql_config_hash=$(compose_for "$previous_dir" config --hash sqlserver | awk '$1 == "sqlserver" { print $2; exit }')
  if (( sql_maintenance == 0 )); then
    [[ "$active_sql_fingerprint" == "$candidate_sql_fingerprint" ]] ||
      fail 'SQL Server service configuration drift detected. Use the separate SQL maintenance workflow for an approved tuning or engine change.'
    [[ -z "$stored_sql_config_hash" || -z "$stored_sql_maintenance_fingerprint" ||
      "$active_sql_maintenance_fingerprint" == "$stored_sql_maintenance_fingerprint" ]] ||
      fail 'Active SQL configuration differs from its last accepted maintenance fingerprint.'
    assert_sql_healthy "$previous_dir" "$previous_sql_image" "$active_sql_config_hash"
  else
    [[ "$active_sql_maintenance_fingerprint" == "$candidate_sql_maintenance_fingerprint" ]] ||
      fail 'SQL maintenance changed an unapproved SQL service setting (for example credentials, storage, networking, or security options).'
    assert_sql_healthy "$previous_dir" "$previous_sql_image" "${stored_sql_config_hash:-$active_sql_config_hash}"
    if [[ -z "$stored_sql_config_hash" ]]; then
      stored_sql_config_hash=$(sql_container_config_hash)
      [[ "$stored_sql_config_hash" =~ ^[0-9a-f]{64}$ ]] ||
        fail 'Could not establish the existing managed SQL configuration baseline.'
      atomic_write "$STATE/sqlserver-config-hash" 0600 "$stored_sql_config_hash"
    fi
    assert_sql_credentials_match "$candidate_config"
  fi
  live_sql_config_hash=$(sql_container_config_hash)
  if [[ -n "$stored_sql_config_hash" && "$live_sql_config_hash" != "$stored_sql_config_hash" ]]; then
    fail 'Running SQL Server configuration no longer matches the last accepted state; inspect database state before maintenance or deployment.'
  fi
  if [[ -z "$stored_sql_config_hash" ]]; then
    stored_sql_config_hash=$active_sql_config_hash
    atomic_write "$STATE/sqlserver-config-hash" 0600 "$stored_sql_config_hash"
  fi
  if [[ -z "$stored_sql_maintenance_fingerprint" ]]; then
    stored_sql_maintenance_fingerprint=$active_sql_maintenance_fingerprint
    atomic_write "$STATE/sqlserver-maintenance-fingerprint" 0600 "$stored_sql_maintenance_fingerprint"
  fi
  [[ "$active_sql_maintenance_fingerprint" == "$stored_sql_maintenance_fingerprint" ]] ||
    fail 'Active SQL configuration differs from its last accepted maintenance fingerprint.'
  if (( sql_maintenance == 0 )); then
    [[ "$candidate_sql_maintenance_fingerprint" == "$stored_sql_maintenance_fingerprint" ]] ||
      fail 'Application deployment attempted to change the managed SQL configuration.'
  else
    [[ "$candidate_sql_maintenance_fingerprint" == "$stored_sql_maintenance_fingerprint" ]] ||
      fail 'SQL maintenance attempted to change an unapproved SQL service setting.'
  fi
  assert_owned_resources "$COMPOSE_OWNER" >/dev/null
else
  if docker volume inspect "$sql_volume" >/dev/null 2>&1; then
    volume_owner=$(resource_owner volume "$sql_volume") || fail "Could not inspect SQL volume $sql_volume."
    [[ "$volume_owner" == "$COMPOSE_OWNER" ]] ||
      fail "SQL data volume $sql_volume exists without this deployment's owner marker; it will not be adopted or deleted."
  fi
  existing_sql=$(docker ps -aq --filter label=com.docker.compose.project=campustour \
    --filter label=com.docker.compose.service=sqlserver)
  if [[ -n "$existing_sql" ]]; then
    existing_sql_count=$(awk 'NF { count++ } END { print count+0 }' <<<"$existing_sql")
    (( existing_sql_count == 1 )) || fail "Expected at most one managed SQL Server container before first-release recovery; found $existing_sql_count."
    live_sql_config_hash=$(sql_container_config_hash)
    [[ "$live_sql_config_hash" == "$candidate_sql_config_hash" ]] ||
      fail 'A first-release SQL container has configuration drift and no active release baseline; preserve its data and use a reviewed recovery procedure.'
    if [[ -f "$STATE/sqlserver-config-hash" ]]; then
      stored_sql_config_hash=$(cat "$STATE/sqlserver-config-hash")
      [[ "$stored_sql_config_hash" == "$live_sql_config_hash" ]] ||
        fail 'First-release SQL container differs from its recorded configuration; preserve its data and review database state.'
    fi
    if [[ -f "$STATE/sqlserver-maintenance-fingerprint" ]]; then
      stored_sql_maintenance_fingerprint=$(cat "$STATE/sqlserver-maintenance-fingerprint")
      [[ "$stored_sql_maintenance_fingerprint" == "$candidate_sql_maintenance_fingerprint" ]] ||
        fail 'First-release SQL configuration differs from its recorded maintenance fingerprint.'
    fi
  elif [[ -e "$STATE/sqlserver-config-hash" || -e "$STATE/sqlserver-maintenance-fingerprint" ]]; then
    fail 'SQL configuration state exists but no SQL Server container is running; inspect database and volume state before starting it.'
  fi
fi
cleanup_stale_candidates

if (( sql_maintenance == 0 )) && [[ -n "$previous_sha" ]] && [[ "$current_sql_image" != "$previous_sql_image" ]]; then
  fail 'Application deployment attempted to change the managed SQL image.'
fi
if (( sql_maintenance == 1 )) && [[ "$current_sql_image" != "$previous_sql_image" ]]; then
  echo "SQL maintenance requested: $previous_sql_image -> $current_sql_image"
fi
desired_sql_config_hash=$candidate_sql_config_hash

compose_for "$candidate_dir" pull api db-init
if [[ -z "$previous_sha" || "$current_sql_image" != "$previous_sql_image" ]]; then
  docker pull "$current_sql_image"
fi
api_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$api_image")
init_schema_version=$(docker image inspect --format '{{index .Config.Labels "org.smartcampus.database.schema-version"}}' "$db_init_image")
init_source_sha=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$db_init_image")
[[ "$api_revision" == "$release_sha" && "$init_schema_version" == "$DB_SCHEMA_VERSION" && "$init_source_sha" == "$DB_INIT_SOURCE_SHA" ]] ||
  fail 'API image source or separately versioned database-tool schema label does not match the approved manifest.'

if [[ -n "$previous_sha" ]]; then
  [[ -x "$BACKUP_SCRIPT" ]] || fail 'Pre-deployment backup program is missing; install and verify it before deploying.'
  [[ -f "$BACKUP_ENV" ]] ||
    fail "Backup configuration $BACKUP_ENV is missing; deployment is blocked. Configure off-host storage, or BACKUP_MODE=local for a demo host (backend/docs/ec2-deployment.md section 4)."
  "$BACKUP_SCRIPT" --pre-deploy --deployment-lock-held
fi

write_pending "$([[ $sql_maintenance == 1 ]] && echo sql-maintenance || echo application)"
update_started=1
trap on_exit EXIT
if [[ -z "$previous_sha" ]]; then
  compose_for "$candidate_dir" up -d --wait --wait-timeout 300 sqlserver
  assert_sql_healthy "$candidate_dir" "$current_sql_image"
  live_sql_config_hash=$(sql_container_config_hash)
  atomic_write "$STATE/sqlserver-config-hash" 0600 "$live_sql_config_hash"
  atomic_write "$STATE/sqlserver-maintenance-fingerprint" 0600 "$candidate_sql_maintenance_fingerprint"
fi
compose_for "$candidate_dir" run -T --rm --no-deps db-init --check-only
prepare_candidate_api "$candidate_dir" "$release_sha"

if (( sql_maintenance == 1 )) && [[ "$desired_sql_config_hash" != "$live_sql_config_hash" ]]; then
  mark_sql_engine_change_started
  if [[ "$current_sql_image" != "$previous_sql_image" ]]; then
    atomic_write "$STATE/sqlserver-image" 0600 "$current_sql_image"
  fi
  compose_for "$candidate_dir" up -d --wait --wait-timeout 420 sqlserver
  assert_sql_healthy "$candidate_dir" "$current_sql_image"
  compose_for "$candidate_dir" run -T --rm --no-deps db-init --check-only
  remove_candidate_api
  prepare_candidate_api "$candidate_dir" "$release_sha"
fi

remove_candidate_api
api_promotion_started=1
compose_for "$candidate_dir" up -d --no-deps --force-recreate --wait --wait-timeout 300 api
health_probe "$release_sha"
compose_for "$candidate_dir" ps --all

atomic_write "$STATE/sqlserver-config-hash" 0600 "$desired_sql_config_hash"
atomic_write "$STATE/sqlserver-maintenance-fingerprint" 0600 "$candidate_sql_maintenance_fingerprint"
set_current_link "$candidate_dir"
atomic_write "$STATE/sqlserver-image" 0600 "$current_sql_image"
atomic_write "$STATE/operations-release" 0600 "$ops_sha"
atomic_write "$STATE/current-release" 0600 "$release_sha"$'\n'"$api_image"$'\n'"$db_init_image"$'\n'"$current_sql_image"$'\n'"$ops_sha"$'\n'"$COMPOSE_OWNER"
rm -f -- "$PENDING_FILE"
promotion_complete=1
trap - EXIT
echo "PASS: application release $release_sha is healthy. API=$api_image DB_INIT=$db_init_image SQLSERVER=$current_sql_image OPS=$ops_sha"
