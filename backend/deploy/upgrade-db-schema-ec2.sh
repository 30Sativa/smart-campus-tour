#!/usr/bin/env bash
# Explicit application-schema upgrade on the existing host; never changes API or SQL engine.
set -Eeuo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $(id -u) == 0 ]] || fail 'Run the schema upgrader as root.'
[[ $# == 3 ]] || fail 'usage: upgrade-db-schema-ec2.sh DB_INIT_IMAGE DB_INIT_SOURCE_SHA SCHEMA_VERSION'
db_init_image=$1 source_sha=$2 schema_version=$3
[[ "$db_init_image" =~ ^ghcr\.io/30sativa/smart-campus-tour/backend-db-init@sha256:[0-9a-f]{64}$ ]] || fail 'DB tool must be an immutable approved digest.'
[[ "$source_sha" =~ ^[0-9a-f]{40}$ && "$schema_version" == 1.4 ]] || fail 'DB tool provenance or schema version is invalid.'

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
STATE=${CAMPUS_STATE_DIR:-/var/lib/campustour/state}
LOCK=${CAMPUS_OPERATION_LOCK:-/run/lock/campustour-operation.lock}
BACKUP=${CAMPUS_BACKUP_SCRIPT:-/usr/local/sbin/campustour-backup}
BACKUP_ENV=${CAMPUS_BACKUP_ENV:-/etc/campustour/backup.env}
CURRENT=$(readlink -f "$ROOT/current")
[[ -d "$CURRENT" && -f "$CURRENT/release.env" && -f "$CURRENT/docker-compose.yml" ]] || fail 'A managed current API release is required.'
[[ -x "$BACKUP" && -s "$BACKUP_ENV" ]] || fail 'A verified backup program and backup configuration are required.'
[[ -f "$CONFIG/backend.env" ]] || fail 'Protected backend configuration is missing.'
[[ ! -e "$STATE/pending-deployment" ]] || fail 'Pending deployment recovery requires operator review before schema upgrade.'
[[ ! -e "$STATE/pending-sql-maintenance" ]] || fail 'Pending SQL maintenance recovery requires operator review before schema upgrade.'

exec 9>"$LOCK"
flock -n 9 || fail 'A deploy, backup or maintenance operation is active.'
# The pre-upgrade backup must be new and verified while the shared operation lock is held.
"$BACKUP" --pre-deploy --deployment-lock-held

# The profile keeps db-init defined when a pre-split current API release still depends on it.
DB_INIT_IMAGE=$db_init_image docker compose \
  --project-name campustour --profile db-bootstrap \
  --env-file "$CONFIG/backend.env" \
  --env-file "$CURRENT/release.env" \
  -f "$CURRENT/docker-compose.yml" \
  -f "${CAMPUS_RELEASE_DB_INIT_COMPOSE:?Verified release DB Compose is required}" \
  pull db-init

tool_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$db_init_image")
tool_schema=$(docker image inspect --format '{{index .Config.Labels "org.smartcampus.database.schema-version"}}' "$db_init_image")
[[ "$tool_revision" == "$source_sha" && "$tool_schema" == "$schema_version" ]] || fail 'Pulled DB tool labels do not match the verified manifest.'

compose=(docker compose --project-name campustour --profile db-bootstrap --env-file "$CONFIG/backend.env" --env-file "$CURRENT/release.env" \
  -f "$CURRENT/docker-compose.yml" -f "$CAMPUS_RELEASE_DB_INIT_COMPOSE")
# The image entrypoint is init-db.sh (bootstrap/check only); the upgrader is a separate script in the same tool.
DB_INIT_IMAGE=$db_init_image "${compose[@]}" run -T --rm --no-deps --entrypoint /bin/bash db-init /deployment/upgrade-db.sh --upgrade-to-v1.4
DB_INIT_IMAGE=$db_init_image "${compose[@]}" run -T --rm --no-deps db-init --check-only
echo "PASS: application database schema is compatible at v$schema_version; API image, SQL Server engine and persistent volume were not changed."
