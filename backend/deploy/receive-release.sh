#!/usr/bin/env bash
# Executed as root from the authenticated, reviewed bundle. Deploy key is root-equivalent.
set -euo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $(id -u) == 0 ]] || fail 'Run the receiver as root.'
[[ $# == 2 && ( $1 == application || $1 == sql-maintenance ) && $2 =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || fail 'Invalid receiver arguments.'
mode=$1 registry_user=$2
bundle=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
mapfile -t revisions < "$bundle/verified-revisions"
release=${revisions[0]:-} ops=${revisions[1]:-}
for sha in "$release" "$ops"; do [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Malformed bundle revision.'; done
for run in "${revisions[2]:-}" "${revisions[3]:-}"; do [[ "$run" =~ ^[0-9]+$ ]] || fail 'Missing verification run identity.'; done
umask 077
credentials=$(mktemp -d "${CAMPUS_REGISTRY_TEMP_ROOT:-/run}/campustour-registry.XXXXXXXXXX")
cleanup() { rm -f -- "$credentials/config.json" "$credentials/images"; rmdir -- "$credentials"; }
trap cleanup EXIT
trap 'exit 143' TERM HUP
trap 'exit 130' INT
export DOCKER_CONFIG="$credentials"
python3 "$bundle/ops/validate-release-manifest.py" "$bundle/release/backend-release.json" "$release" "$credentials/images"
# The parser only emits validated image references. Do not source a downloaded file.
api=$(sed -n 's/^api_image=//p' "$credentials/images")
initializer=$(sed -n 's/^db_init_image=//p' "$credentials/images")
sql=$(sed -n 's/^sqlserver_image=//p' "$credentials/images")
docker login ghcr.io --username "$registry_user" --password-stdin
# Serialize the installer + deploy pair as well as the inner operation locks.
exec 7>"${CAMPUS_DELIVERY_LOCK:-/run/lock/campustour-delivery.lock}"
flock -n 7 || fail 'Another delivery is active; inspect it before retrying.'
bash "$bundle/ops/install-host-tools.sh" "$ops" "$bundle/ops"
export CAMPUS_RELEASE_COMPOSE="$bundle/release/docker-compose.yml"
options=()
[[ "$mode" != sql-maintenance ]] || options+=(--sql-maintenance)
bash "$bundle/ops/deploy-ec2.sh" "${options[@]}" "$release" "$api" "$initializer" "$sql" "$ops"
