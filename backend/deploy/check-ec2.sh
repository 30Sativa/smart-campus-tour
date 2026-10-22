#!/usr/bin/env bash
# Read-only host and stack snapshot. Run as root on the EC2 host.
set -euo pipefail

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
TLS_CERT=${CAMPUS_TLS_CERT_PATH:-/etc/campustour/certs/active/fullchain.pem}
MIN_FREE_GIB=${CAMPUS_MIN_FREE_GIB:-12}
MIN_AVAILABLE_MIB=${CAMPUS_MIN_AVAILABLE_MIB:-512}

fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $(id -u) == 0 ]] || fail 'Run with sudo so Docker and system service state can be inspected.'
command -v docker >/dev/null || fail 'Docker is not installed.'
command -v jq >/dev/null || fail 'jq is required.'

source /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || fail "Expected Ubuntu 24.04; found ${PRETTY_NAME:-unknown}."
[[ $(uname -m) == x86_64 ]] || fail "Expected x86_64; found $(uname -m)."
if systemctl is-active --quiet mssql-server; then
  fail 'Host SQL Server service is active. Stop and remove the duplicate host database before using the Docker SQL service.'
fi
host_sql_package_state=$(dpkg-query -W -f='${db:Status-Abbrev}' mssql-server 2>/dev/null || true)
if [[ ${host_sql_package_state:0:1} == i ]]; then
  fail 'The host SQL Server package is installed. This deployment uses the SQL container only; review existing host data before removing the package.'
fi
if ss -ltnH | awk '$4 ~ /:1433$/ { found=1 } END { exit !found }'; then
  fail 'Host port 1433 is listening. Resolve the duplicate SQL service before deployment.'
fi
systemctl is-active --quiet docker || fail 'Docker Engine is not active.'
docker_arch=$(docker info --format '{{.OSType}}/{{.Architecture}}')
case "$docker_arch" in linux/amd64|linux/x86_64) ;; *) fail "Docker server must be Linux x86_64; found $docker_arch." ;; esac
echo "Docker server: $docker_arch"
docker compose version

mem_bytes=$(awk '/^MemTotal:/ { print $2 * 1024 }' /proc/meminfo)
mem_mib=$((mem_bytes / 1024 / 1024))
available_mib=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo)
disk_path=${ROOT%/*}
[[ -d "$disk_path" ]] || disk_path=/
free_bytes=$(df -B1 --output=avail "$disk_path" | awk 'NR == 2 { print $1 }')
free_gib=$((free_bytes / 1024 / 1024 / 1024))
echo "Host RAM: ${mem_mib} MiB"
echo "Host available memory: ${available_mib} MiB"
echo "Filesystem available at $disk_path: ${free_gib} GiB"
free -h
df -h "$disk_path" /var/lib/docker 2>/dev/null || df -h "$disk_path"
swapon --show

(( mem_mib >= 3500 )) || fail 'Host exposes less than 3.5 GiB RAM; this deployment profile requires the 4 GiB EC2 class.'
(( available_mib >= MIN_AVAILABLE_MIB )) || fail "Less than $MIN_AVAILABLE_MIB MiB memory is available."
(( free_gib >= MIN_FREE_GIB )) || fail "Less than $MIN_FREE_GIB GiB disk space remains."

docker system df
containers=$(docker ps -aq --filter label=com.docker.compose.project=campustour)
if [[ -n "$containers" ]]; then
  while read -r container; do
    [[ -z "$container" ]] && continue
    docker inspect --format '{{.Name}} state={{.State.Status}} healthy={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} memory_limit={{.HostConfig.Memory}}' "$container"
  done <<<"$containers"
  running=$(docker ps -q --filter label=com.docker.compose.project=campustour)
  if [[ -n "$running" ]]; then
    docker stats --no-stream --format 'container={{.Name}} cpu={{.CPUPerc}} memory={{.MemUsage}} pids={{.PIDs}}' $running
  else
    echo 'No campustour containers are currently running.'
  fi
else
  echo 'No campustour containers are running.'
fi

if [[ -L "$ROOT/current" && -f "$CONFIG/backend.env" ]]; then
  release_dir=$(readlink -f "$ROOT/current")
  compose=(docker compose --project-name campustour --env-file "$CONFIG/backend.env" \
    --env-file "$release_dir/release.env" -f "$release_dir/docker-compose.yml")
  host=$("${compose[@]}" config --format json | jq -r '.services.api.environment.AllowedHosts' | cut -d';' -f1)
  if ! curl --silent --show-error --fail --max-time 10 --connect-to "$host:443:127.0.0.1:443" \
    "https://$host/health/ready" -o /dev/null; then
    fail 'API readiness probe failed (check API logs and SQL health separately).'
  fi
  echo 'API readiness: healthy'
  if [[ -f "$TLS_CERT" ]]; then
    openssl x509 -enddate -noout -in "$TLS_CERT"
    openssl x509 -checkend 1209600 -noout -in "$TLS_CERT" ||
      fail 'TLS certificate expires within 14 days.'
  fi
else
  echo 'No active deployment release is configured.'
fi

if [[ -f /var/lib/campustour/backup-last-success ]]; then
  IFS=$'\t' read -r backup_time backup_target backup_size < /var/lib/campustour/backup-last-success
  echo "Last verified backup: ${backup_time:-unknown} ${backup_target:-} (${backup_size:-0} bytes)"
  if [[ ${backup_time:-} =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
    backup_epoch=$(date -u -d "${backup_time:0:8} ${backup_time:9:2}:${backup_time:11:2}:${backup_time:13:2}" +%s)
    backup_age=$(( $(date -u +%s) - backup_epoch ))
    (( backup_age <= 93600 )) || fail 'Last verified off-host backup is more than 26 hours old.'
  else
    fail 'Backup success marker has an invalid timestamp.'
  fi
else
  fail 'No verified off-host backup has been recorded.'
fi
