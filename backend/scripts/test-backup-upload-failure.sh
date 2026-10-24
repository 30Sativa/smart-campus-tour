#!/usr/bin/env bash
# Verify an S3 upload failure blocks success and retains the local backup.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

for tool in bash python3 flock; do command -v "$tool" >/dev/null || { echo "Required test tool: $tool" >&2; exit 1; }; done
scratch=$(mktemp -d)
case "$scratch" in /tmp/*|/var/tmp/*) ;; *) echo 'Unexpected backup-test directory; refusing cleanup.' >&2; exit 1 ;; esac
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/bin" "$scratch/deploy/releases" "$scratch/config" "$scratch/backups" "$scratch/run" "$scratch/state"

release_sha=$(printf 'a%.0s' {1..40})
release_dir=$scratch/deploy/releases/$release_sha
mkdir -p "$release_dir"
printf 'SQLSERVER_IMAGE=mcr.microsoft.com/mssql/server@sha256:%064d\n' 1 > "$release_dir/release.env"
printf 'services: {}\n' > "$release_dir/docker-compose.yml"
ln -s "$release_dir" "$scratch/deploy/current"
printf 'COMPOSE_PROJECT_NAME=campustour\n' > "$scratch/config/backend.env"
printf 'BACKUP_S3_URI=s3://campustour-test/backups\n' > "$scratch/config/backup.env"

cat > "$scratch/bin/id" <<'ID'
#!/usr/bin/env bash
[[ "$*" == -u ]] || exit 2
printf '0\n'
ID
cat > "$scratch/bin/jq" <<'JQ'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == *'/var/opt/mssql/backup'* ]] || { echo "Unexpected jq expression: $*" >&2; exit 2; }
printf '%s\n' "$TEST_BACKUP_DIR"
JQ
cat > "$scratch/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == ps && " $* " == *' -q '* ]]; then
  printf '0123456789abcdef0123456789abcdef01234567\n'
  exit 0
fi
if [[ "$1" == inspect ]]; then
  printf 'healthy\n'
  exit 0
fi
if [[ "$1" == compose && " $* " == *' config --format json '* ]]; then
  printf '{"services":{"sqlserver":{"volumes":[{"target":"/var/opt/mssql/backup","source":"%s"}]}}}\n' "$TEST_BACKUP_DIR"
  exit 0
fi
if [[ "$1" == compose && " $* " == *' exec -T sqlserver '* ]]; then
  command_text="$*"
  if [[ "$command_text" == *'CASE WHEN DB_ID('* ]]; then
    printf '1\n'
  elif [[ "$command_text" == *'SUM(CONVERT(decimal(20,2), size))'* ]]; then
    printf '1024\n'
  elif [[ "$command_text" == *'BACKUP DATABASE '* ]]; then
    filename=$(printf '%s' "$command_text" | sed -n "s#.*BACKUP DATABASE.*N'/var/opt/mssql/backup/\\([^']*\\)'.*#\\1#p")
    [[ -n "$filename" ]] || { echo 'Could not extract disposable backup filename.' >&2; exit 2; }
    printf 'disposable backup payload\n' > "$TEST_BACKUP_DIR/$filename"
  else
    echo "Unexpected SQL fixture command: $command_text" >&2
    exit 2
  fi
  exit 0
fi
echo "Unexpected fake Docker command: $*" >&2
exit 2
DOCKER
cat > "$scratch/bin/aws" <<'AWS'
#!/usr/bin/env bash
set -euo pipefail
if [[ ${TEST_PROVIDER:-0} == 1 ]]; then
  [[ "$1" == --endpoint-url && "$2" == https://s3.example.test && "$3" == --profile && "$4" == campustour-backup ]] || exit 89
  shift 4
fi
if [[ "$1" == s3 && "$2" == cp ]]; then
  if [[ ${TEST_BACKUP_RESULT:-failure} == failure ]]; then
    echo 'injected S3 upload failure' >&2
    exit 42
  fi
  if [[ "$4" == - ]]; then
    if [[ ${TEST_BACKUP_RESULT:-} == corrupt ]]; then printf 'corrupted bytes'; else cat "$TEST_REMOTE_OBJECT"; fi
  else
    cp "$3" "$TEST_REMOTE_OBJECT"
  fi
  exit 0
fi
if [[ "$1" == s3api && "$2" == head-object ]]; then
  if [[ "$*" == *ContentLength* ]]; then
    stat -c '%s' "$TEST_REMOTE_OBJECT"
  else
    sha256sum "$TEST_REMOTE_OBJECT" | cut -d' ' -f1
  fi
  exit 0
fi
echo "Unexpected fake AWS command: $*" >&2
exit 2
AWS
chmod 0755 "$scratch/bin/id" "$scratch/bin/jq" "$scratch/bin/docker" "$scratch/bin/aws"

set +e
PATH="$scratch/bin:$PATH" \
  CAMPUS_DEPLOY_ROOT="$scratch/deploy" \
  CAMPUS_CONFIG_DIR="$scratch/config" \
  CAMPUS_BACKUP_ENV="$scratch/config/backup.env" \
  CAMPUS_BACKUP_STAGE_DIR="$scratch/backups" \
  CAMPUS_BACKUP_STATE_FILE="$scratch/state/backup-last-success" \
  CAMPUS_OPERATION_LOCK="$scratch/run/operation.lock" \
  CAMPUS_BACKUP_LOCK_FILE="$scratch/run/backup.lock" \
  TEST_BACKUP_DIR="$scratch/backups" \
  BACKUP_S3_URI=s3://campustour-test/backups \
  bash deploy/backup-sqlserver.sh --pre-deploy
status=$?
set -e
[[ $status != 0 ]] || { echo 'FAIL: backup reported success despite an injected S3 upload failure.' >&2; exit 1; }
compgen -G "$scratch/backups/*.bak" >/dev/null || {
  echo 'FAIL: local backup was removed after the failed upload.' >&2
  exit 1
}
[[ ! -e "$scratch/state/backup-last-success" ]] || {
  echo 'FAIL: failed upload wrote a successful-backup marker.' >&2
  exit 1
}
echo 'PASS: S3 upload failure propagated, retained the local SQL backup, and did not write the success marker.'

# Same backup flow using an independent S3-compatible endpoint/profile.
printf '%s\n' 'BACKUP_S3_URI=s3://campustour-test/backups' \
  'BACKUP_S3_ENDPOINT_URL=https://s3.example.test' 'BACKUP_S3_PROFILE=campustour-backup' > "$scratch/config/backup.env"
export PATH="$scratch/bin:$PATH" CAMPUS_DEPLOY_ROOT="$scratch/deploy" CAMPUS_CONFIG_DIR="$scratch/config"
export CAMPUS_BACKUP_ENV="$scratch/config/backup.env" CAMPUS_BACKUP_STAGE_DIR="$scratch/backups"
export CAMPUS_BACKUP_STATE_FILE="$scratch/state/backup-last-success" CAMPUS_OPERATION_LOCK="$scratch/run/operation.lock"
export CAMPUS_BACKUP_LOCK_FILE="$scratch/run/backup.lock" TEST_BACKUP_DIR="$scratch/backups"
export TEST_PROVIDER=1 TEST_REMOTE_OBJECT="$scratch/object"
for result in corrupt success; do
  # Remove only disposable fixtures from this test; production never does this on failure.
  find "$scratch/backups" -maxdepth 1 -type f -name '*.bak' -delete
  export TEST_BACKUP_RESULT=$result
  if bash deploy/backup-sqlserver.sh --pre-deploy; then
    [[ "$result" == success ]] || { echo 'Corrupt remote bytes were accepted.' >&2; exit 1; }
    [[ -s "$CAMPUS_BACKUP_STATE_FILE" ]] || exit 1
    ! compgen -G "$scratch/backups/*.bak" >/dev/null || exit 1
  else
    [[ "$result" == corrupt ]] || exit 1
    compgen -G "$scratch/backups/*.bak" >/dev/null || exit 1
    [[ ! -e "$CAMPUS_BACKUP_STATE_FILE" ]] || exit 1
  fi
done
printf 'BACKUP_S3_ENDPOINT_URL=http://s3.example.test\n' >> "$scratch/config/backup.env"
if bash deploy/backup-sqlserver.sh --pre-deploy >/dev/null 2>&1; then
  echo 'Insecure backup endpoint accepted.' >&2; exit 1
fi
echo 'PASS: non-AWS endpoint/profile used for upload, HEAD and download; corrupt bytes retained locally; success cleaned staging; HTTP rejected (mocked object store).'
