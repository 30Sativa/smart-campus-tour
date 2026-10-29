#!/usr/bin/env bash
# Mocked Docker: the automatic pre-deploy schema step changes nothing when the database
# already passes check-only, and backs up before upgrading when it does not.
set -euo pipefail
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $*" >&2; exit 1; }
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
image="ghcr.io/30sativa/smart-campus-tour/backend-db-init@sha256:$(printf 'd%.0s' {1..64})"
source_sha=$(printf '9%.0s' {1..40})

mkdir -p "$scratch/bin"
cat > "$scratch/bin/id" <<'EOF'
#!/bin/bash
echo 0
EOF
# check-only fails until upgrade-db.sh has run, unless FAKE_DB_COMPATIBLE=1.
cat > "$scratch/bin/docker" <<'EOF'
#!/bin/bash
echo "docker $*" >> "$FAKE_LOG"
if [[ $1 == image ]]; then
  [[ "$*" == *revision* ]] && echo "$FAKE_SOURCE_SHA" || echo 1.6
  exit 0
fi
[[ " $* " == *" --profile db-bootstrap "* ]] || { echo 'db-init profile missing' >&2; exit 90; }
if [[ "$*" == *"upgrade-db.sh --upgrade-to-v1.6"* ]]; then touch "$FAKE_UPGRADED"; exit 0; fi
if [[ "$*" == *"--check-only"* ]]; then
  [[ ${FAKE_DB_COMPATIBLE:-0} == 1 || -e "$FAKE_UPGRADED" ]] && exit 0
  echo 'Database schema is older than v1.6.' >&2; exit 1
fi
exit 0
EOF
chmod +x "$scratch/bin/id" "$scratch/bin/docker"

setup() {
  host="$scratch/$1"
  mkdir -p "$host/releases/old" "$host/config" "$host/state"
  : > "$host/releases/old/docker-compose.yml"; : > "$host/releases/old/release.env"
  ln -s "$host/releases/old" "$host/current"
  : > "$host/config/backend.env"; echo 'BACKUP_MODE=local' > "$host/config/backup.env"
  printf '#!/bin/bash\necho "backup $*" >> "$FAKE_LOG"\n' > "$host/backup.sh"; chmod +x "$host/backup.sh"
  : > "$host/db-init.yml"; : > "$host/log"
}
run() {
  PATH="$scratch/bin:$PATH" FAKE_LOG="$host/log" FAKE_UPGRADED="$host/upgraded" FAKE_SOURCE_SHA="$source_sha" \
    CAMPUS_DEPLOY_ROOT="$host" CAMPUS_CONFIG_DIR="$host/config" CAMPUS_STATE_DIR="$host/state" \
    CAMPUS_OPERATION_LOCK="$host/operation.lock" CAMPUS_BACKUP_SCRIPT="$host/backup.sh" \
    CAMPUS_BACKUP_ENV="$host/config/backup.env" CAMPUS_RELEASE_DB_INIT_COMPOSE="$host/db-init.yml" \
    bash deploy/upgrade-db-schema-ec2.sh "$@" "$image" "$source_sha" 1.6 > "$host/out" 2>&1
}

setup compatible
FAKE_DB_COMPATIBLE=1 run --if-needed || { cat "$host/out" >&2; fail 'compatible database was rejected'; }
grep -q 'no backup or schema change was needed' "$host/out" || fail 'compatible database did not report a no-op'
! grep -q '^backup\|upgrade-db.sh' "$host/log" || fail 'compatible database was backed up or upgraded'

setup outdated
run --if-needed || { cat "$host/out" >&2; fail 'outdated database was not upgraded'; }
grep -n '' "$host/log" | grep -q 'backup --pre-deploy --deployment-lock-held' || fail 'upgrade ran without a backup'
backup_line=$(grep -n '^backup' "$host/log" | cut -d: -f1)
upgrade_line=$(grep -n 'upgrade-db.sh' "$host/log" | cut -d: -f1)
(( backup_line < upgrade_line )) || fail 'backup did not precede the schema change'
[[ $(grep -c -- '--check-only' "$host/log") == 2 ]] || fail 'upgrade was not checked before and after'

setup first-deploy
rm "$host/current"
run --if-needed || fail 'first deploy without a current release was not skipped'
grep -q '^SKIP: no current API release' "$host/out" && [[ ! -s "$host/log" ]] || fail 'first deploy touched Docker or backups'

setup pending
touch "$host/state/deployment.pending"
run --if-needed || fail 'pending deployment did not leave recovery to deploy-ec2.sh'
grep -q '^SKIP: a pending deployment' "$host/out" && [[ ! -s "$host/log" ]] || fail 'pending deployment touched Docker or backups'
if run; then fail 'explicit upgrade ignored a pending deployment marker'; fi
grep -q 'Pending deployment' "$host/out" || fail 'explicit upgrade did not report the pending marker'

setup explicit
FAKE_DB_COMPATIBLE=1 run || { cat "$host/out" >&2; fail 'explicit upgrade failed'; }
grep -q '^backup' "$host/log" && grep -q 'upgrade-db.sh' "$host/log" || fail 'explicit upgrade did not always back up and run the upgrader'

echo 'PASS: automatic schema step is a no-op for a compatible database, backs up before upgrading an outdated one, and skips first deploys and pending recovery; explicit upgrade still always backs up.'
