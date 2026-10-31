#!/usr/bin/env bash
# Input validation only; this test does not contact AWS or Docker.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

sha=$(printf 'a%.0s' {1..40})
ops_sha=$(printf 'c%.0s' {1..40})
digest=$(printf 'b%.0s' {1..64})
api="ghcr.io/30sativa/smart-campus-tour/backend@sha256:$digest"
db_init="ghcr.io/30sativa/smart-campus-tour/backend-db-init@sha256:$digest"
sql="mcr.microsoft.com/mssql/server@sha256:$digest"
export DB_INIT_SOURCE_SHA=$ops_sha
export DB_SCHEMA_VERSION=1.12
bash deploy/deploy-ec2.sh --validate-only "$sha" "$api" "$db_init" "$sql" "$ops_sha" >/dev/null
bash deploy/deploy-ec2.sh --validate-only "$sha" "$api" "$db_init" "$sql" "$ops_sha" --sql-maintenance >/dev/null

expect_rejected() {
  if bash deploy/deploy-ec2.sh --validate-only "$@" >/dev/null 2>&1; then
    echo 'FAIL: deployment validation accepted an invalid release reference.' >&2
    exit 1
  fi
}
expect_rejected "${sha}x" "$api" "$db_init" "$sql" "$sha"
expect_rejected "$sha" "$api" "$db_init" "$sql" "${ops_sha}x"
expect_rejected "$sha" "ghcr.io/30sativa/smart-campus-tour/backend:latest" "$db_init" "$sql" "$sha"
expect_rejected "$sha" "$api" "ghcr.io/30sativa/smart-campus-tour/backend-db-init:sha256:$digest" "$sql" "$sha"
expect_rejected "$sha" "$api" "$db_init" "mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04" "$sha"
unset DB_INIT_SOURCE_SHA
if bash deploy/deploy-ec2.sh --validate-only "$sha" "$api" "$db_init" "$sql" "$ops_sha" >/dev/null 2>&1; then
  echo 'FAIL: deployment validation accepted a release without database-tool provenance.' >&2
  exit 1
fi
if output=$(bash deploy/backup-sqlserver.sh --unexpected-argument 2>&1); then
  echo 'FAIL: backup script accepted an unknown mode.' >&2
  exit 1
fi
[[ "$output" == *'usage: backup-sqlserver.sh [--pre-deploy] [--deployment-lock-held]'* ]] || {
  echo 'FAIL: backup script did not reject an unknown mode before host operations.' >&2
  exit 1
}
echo 'PASS: deployment inputs reject mutable references and backup rejects unknown modes.'
