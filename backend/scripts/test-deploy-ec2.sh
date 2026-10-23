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
bash deploy/deploy-ec2.sh --validate-only "$sha" "$api" "$db_init" "$sql" "$ops_sha" >/dev/null
bash deploy/deploy-ec2.sh --validate-only "$sha" "$api" "$db_init" "$sql" "$ops_sha" --sql-maintenance >/dev/null

installer_url="https://raw.githubusercontent.com/30Sativa/smart-campus-tour/$ops_sha/backend/deploy/install-host-tools.sh"
script_url="https://raw.githubusercontent.com/30Sativa/smart-campus-tour/$ops_sha/backend/deploy/deploy-ec2.sh"
printf -v remote_command 'set -eu; installer=$(mktemp); script=$(mktemp); trap '\''rm -f "$installer" "$script"'\'' 0; curl --fail --location --silent --show-error --max-time 45 %q -o "$installer"; chmod 0700 "$installer"; bash "$installer" %q; curl --fail --location --silent --show-error --max-time 45 %q -o "$script"; chmod 0700 "$script"; bash "$script" %q %q %q %q %q' \
  "$installer_url" "$ops_sha" "$script_url" "$sha" "$api" "$db_init" "$sql" "$ops_sha"
printf '%s\n' "$remote_command" | sh -n
[[ "$remote_command" == *"/$ops_sha/backend/deploy/deploy-ec2.sh"* ]] || {
  echo 'FAIL: remote deployment script is not pinned to the operations commit.' >&2
  exit 1
}
[[ "$remote_command" == *"bash \"\$script\" $sha $api $db_init $sql $ops_sha"* ]] || {
  echo 'FAIL: application and operations revisions were not kept separate.' >&2
  exit 1
}

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
if output=$(bash deploy/backup-sqlserver.sh --unexpected-argument 2>&1); then
  echo 'FAIL: backup script accepted an unknown mode.' >&2
  exit 1
fi
[[ "$output" == *'usage: backup-sqlserver.sh [--pre-deploy] [--deployment-lock-held]'* ]] || {
  echo 'FAIL: backup script did not reject an unknown mode before host operations.' >&2
  exit 1
}
echo 'PASS: deployment inputs reject mutable references and backup rejects unknown modes.'
