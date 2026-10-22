#!/usr/bin/env bash
# Input validation only; this test does not contact AWS or Docker.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

sha=$(printf 'a%.0s' {1..40})
digest=$(printf 'b%.0s' {1..64})
api="ghcr.io/30sativa/smart-campus-tour/backend@sha256:$digest"
db_init="ghcr.io/30sativa/smart-campus-tour/backend-db-init@sha256:$digest"
sql="mcr.microsoft.com/mssql/server@sha256:$digest"
bash deploy/deploy-ec2.sh --validate-only "$sha" "$api" "$db_init" "$sql" "$sha" >/dev/null

script_url="https://raw.githubusercontent.com/30Sativa/smart-campus-tour/$sha/backend/deploy/deploy-ec2.sh"
printf -v remote_command 'set -eu; script=$(mktemp); trap '\''rm -f "$script"'\'' 0; curl --fail --location --silent --show-error --max-time 45 %q -o "$script"; chmod 0700 "$script"; bash "$script" %q %q %q %q %q' \
  "$script_url" "$sha" "$api" "$db_init" "$sql" "$sha"
printf '%s\n' "$remote_command" | sh -n

expect_rejected() {
  if bash deploy/deploy-ec2.sh --validate-only "$@" >/dev/null 2>&1; then
    echo 'FAIL: deployment validation accepted an invalid release reference.' >&2
    exit 1
  fi
}
expect_rejected "${sha}x" "$api" "$db_init" "$sql" "$sha"
expect_rejected "$sha" "ghcr.io/30sativa/smart-campus-tour/backend:latest" "$db_init" "$sql" "$sha"
expect_rejected "$sha" "$api" "ghcr.io/30sativa/smart-campus-tour/backend-db-init:sha256:$digest" "$sql" "$sha"
expect_rejected "$sha" "$api" "$db_init" "mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04" "$sha"
if output=$(bash deploy/backup-sqlserver.sh --unexpected-argument 2>&1); then
  echo 'FAIL: backup script accepted an unknown mode.' >&2
  exit 1
fi
[[ "$output" == *'usage: backup-sqlserver.sh [--pre-deploy]'* ]] || {
  echo 'FAIL: backup script did not reject an unknown mode before host operations.' >&2
  exit 1
}
echo 'PASS: deployment inputs reject mutable references and backup rejects unknown modes.'
