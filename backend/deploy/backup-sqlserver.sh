#!/usr/bin/env bash
# Full, checksummed SQL backup to encrypted off-host S3 storage.
set -euo pipefail

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
OPERATION_LOCK=${CAMPUS_OPERATION_LOCK:-/run/lock/campustour-operation.lock}
BACKUP_LOCK=${CAMPUS_BACKUP_LOCK_FILE:-/run/lock/campustour-backup.lock}
BACKUP_ENV=${CAMPUS_BACKUP_ENV:-/etc/campustour/backup.env}
STAGE_DIR=${CAMPUS_BACKUP_STAGE_DIR:-/var/lib/campustour/backups}
STATE_FILE=${CAMPUS_BACKUP_STATE_FILE:-/var/lib/campustour/backup-last-success}
DATABASE=SmartCampusTourV11

fail() { echo "FAIL: $*" >&2; exit 1; }
mode=scheduled
deployment_lock_held=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pre-deploy) [[ "$mode" == scheduled ]] || fail 'Duplicate --pre-deploy option.'; mode=pre-deploy ;;
    --deployment-lock-held) deployment_lock_held=1 ;;
    *) fail 'usage: backup-sqlserver.sh [--pre-deploy] [--deployment-lock-held]' ;;
  esac
  shift
done
[[ $deployment_lock_held == 0 || $mode == pre-deploy ]] ||
  fail '--deployment-lock-held is valid only with --pre-deploy.'
[[ $(id -u) == 0 ]] || fail 'Run as root so SQL Server and Docker credentials stay out of command arguments.'
command -v docker >/dev/null || fail 'Docker is not installed.'
command -v aws >/dev/null || fail 'AWS CLI is not installed.'
command -v jq >/dev/null || fail 'jq is required to validate Compose configuration.'
command -v flock >/dev/null || fail 'flock is required to serialize backups.'

[[ -L "$ROOT/current" ]] || fail 'No active release is configured.'
release_dir=$(readlink -f "$ROOT/current")
case "$release_dir" in "$ROOT"/releases/*) ;; *) fail 'Active release link is outside the release directory.' ;; esac
[[ -f "$CONFIG/backend.env" && -f "$release_dir/release.env" && -f "$release_dir/docker-compose.yml" ]] ||
  fail 'Active release configuration is incomplete.'
[[ -f "$BACKUP_ENV" ]] || fail 'Backup settings file is missing.'
[[ -d "$STAGE_DIR" && -w "$STAGE_DIR" ]] || fail 'Backup staging directory is missing or not writable.'

# Parse a single non-secret bucket setting without evaluating an env file as shell code.
backup_uri=${BACKUP_S3_URI:-}
if [[ -z "$backup_uri" ]]; then
  while IFS='=' read -r name value; do
    [[ "$name" == BACKUP_S3_URI ]] && { backup_uri=$value; break; }
  done < "$BACKUP_ENV"
fi
[[ "$backup_uri" =~ ^s3://([A-Za-z0-9.-]{3,63})(/([A-Za-z0-9._/-]+))?/?$ ]] ||
  fail 'BACKUP_S3_URI must be a plain s3://bucket/prefix value.'
bucket=${BASH_REMATCH[1]}
prefix=${BASH_REMATCH[3]:-}
[[ "$prefix" != *'..'* ]] || fail 'Backup prefix may not contain parent-directory segments.'

mkdir -p "$(dirname "$OPERATION_LOCK")"
if (( deployment_lock_held )); then
  inherited_lock=$(readlink "/proc/$PPID/fd/9" 2>/dev/null || true)
  [[ "$inherited_lock" == "$OPERATION_LOCK" ]] ||
    fail 'The deployment lock was not inherited; refusing to bypass operation coordination.'
else
  exec 9>"$OPERATION_LOCK"
  if [[ "$mode" == scheduled ]]; then
    flock -s -n 9 || fail 'A deployment, maintenance operation, or certificate update is active.'
  else
    flock -x -n 9 || fail 'A deployment, maintenance operation, or certificate update is active.'
  fi
fi
mkdir -p "$(dirname "$BACKUP_LOCK")"
exec 8>"$BACKUP_LOCK"
flock -n 8 || fail 'Another backup is already running.'
echo "Starting $mode SQL Server backup."
compose=(docker compose --project-name campustour --env-file "$CONFIG/backend.env" \
  --env-file "$release_dir/release.env" -f "$release_dir/docker-compose.yml")
resolved=$("${compose[@]}" config --format json)
configured_stage=$(jq -r '.services.sqlserver.volumes[] | select(.target == "/var/opt/mssql/backup") | .source' <<<"$resolved")
[[ "$configured_stage" == "$STAGE_DIR" ]] || fail 'Compose backup mount does not match the configured host staging directory.'

sql_container_ids=$(docker ps -q --filter label=com.docker.compose.project=campustour \
  --filter label=com.docker.compose.service=sqlserver)
[[ $(wc -l <<<"$sql_container_ids" | tr -d ' ') == 1 && -n "$sql_container_ids" ]] ||
  fail 'Expected exactly one running managed SQL Server container; backup will not start or recreate it.'
sql_container_id=$(tr -d '\r\n' <<<"$sql_container_ids")
sql_container_health=$(docker inspect --format '{{.State.Health.Status}}' "$sql_container_id" 2>/dev/null || true)
[[ "$sql_container_health" == healthy ]] ||
  fail "SQL Server is not healthy (state: ${sql_container_health:-unknown}); backup will not start or recreate it."
if ! exists=$("${compose[@]}" exec -T sqlserver /bin/bash -c \
  'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID(CAST(0x53006d00610072007400430061006d0070007500730054006f0075007200560031003100 AS nvarchar(128))) IS NULL THEN 0 ELSE 1 END"' 2>/dev/null); then
  fail 'Could not query SQL Server to determine whether a database backup is required.'
fi
exists=$(printf '%s' "$exists" | tr -d '[:space:]')
[[ "$exists" == 0 || "$exists" == 1 ]] || fail 'SQL Server returned an unexpected database-existence result.'
if [[ "$exists" == 0 ]]; then
  echo 'SKIP: SmartCampusTourV11 does not exist yet; there is no database content to back up.'
  exit 0
fi

if ! size_mib=$("${compose[@]}" exec -T sqlserver /bin/bash -c \
  'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT CEILING(SUM(CONVERT(decimal(20,2), size)) * 8 / 1024) FROM SmartCampusTourV11.sys.database_files"' 2>/dev/null); then
  fail 'Could not estimate the allocated database and transaction-log size.'
fi
size_mib=$(printf '%s' "$size_mib" | tr -d '[:space:]')
[[ "$size_mib" =~ ^[0-9]+$ ]] || fail 'SQL Server returned an invalid database size.'
free_kib=$(df -Pk "$STAGE_DIR" | awk 'NR == 2 { print $4 }')
required_kib=$(((size_mib + 1024) * 1024))
[[ "$free_kib" =~ ^[0-9]+$ ]] || fail 'Could not determine free space on the backup filesystem.'
(( free_kib >= required_kib )) || fail "Backup needs about $((size_mib / 1024 + 1)) GiB including safety margin; staging disk has less free space."

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
file_name="${DATABASE}-${timestamp}.bak"
file_path="$STAGE_DIR/$file_name"
object_key=${prefix:+$prefix/}$file_name
target="s3://$bucket/$object_key"
sql_path="/var/opt/mssql/backup/$file_name"
[[ ! -e "$file_path" ]] || fail 'Backup filename collision; refusing to overwrite a previous backup.'

"${compose[@]}" exec -T sqlserver /bin/bash -c \
  'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -l 60 -Q "$1" -o /dev/null' \
  -- "BACKUP DATABASE [$DATABASE] TO DISK=N'$sql_path' WITH CHECKSUM, INIT; RESTORE VERIFYONLY FROM DISK=N'$sql_path' WITH CHECKSUM;"
[[ -s "$file_path" ]] || fail "SQL Server completed without creating a non-empty backup at $file_path."

local_sha256=$(sha256sum "$file_path" | cut -d' ' -f1)
if ! aws s3 cp "$file_path" "$target" --sse AES256 --metadata "sha256=$local_sha256" --only-show-errors; then
  fail "S3 upload failed; local backup retained at $file_path."
fi
remote_size=$(aws s3api head-object --bucket "$bucket" --key "$object_key" --query ContentLength --output text)
[[ "$remote_size" =~ ^[0-9]+$ && "$remote_size" -gt 0 ]] || fail "S3 did not confirm a non-empty backup at $target. Local copy retained."
local_size=$(stat -c '%s' "$file_path")
[[ "$remote_size" == "$local_size" ]] || fail "S3 object size does not match the local backup. Local copy retained at $file_path."
remote_metadata_sha=$(aws s3api head-object --bucket "$bucket" --key "$object_key" --query 'Metadata.sha256' --output text)
[[ "$remote_metadata_sha" == "$local_sha256" ]] || fail "S3 object metadata does not match the local SHA-256. Local copy retained at $file_path."
if ! remote_sha256=$(aws s3 cp "$target" - --only-show-errors | sha256sum | cut -d' ' -f1); then
  fail "Could not download the uploaded S3 backup for end-to-end SHA-256 verification. Local copy retained at $file_path."
fi
[[ "$remote_sha256" == "$local_sha256" ]] || fail "Downloaded S3 backup SHA-256 differs from the local backup. Local copy retained at $file_path."

state_tmp=$(mktemp /var/lib/campustour/.backup-state.XXXXXX)
printf '%s\t%s\t%s\t%s\n' "$timestamp" "$target" "$remote_size" "$local_sha256" > "$state_tmp"
chmod 0600 "$state_tmp"
mv -f "$state_tmp" "$STATE_FILE"
if ! rm -f -- "$file_path"; then
  echo "WARN: Remote backup verified; local staging copy remains at $file_path." >&2
fi
echo "PASS: Full backup and RESTORE VERIFYONLY completed; S3 download SHA-256 verified for $target ($remote_size bytes)."
