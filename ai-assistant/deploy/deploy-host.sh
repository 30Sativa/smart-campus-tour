#!/usr/bin/env bash
# Runs as root on the backend EC2 host. Starts one immutable ai-assistant image next to the API.
# The GHCR token arrives on stdin only and lives in a root-only temporary Docker config.
set -euo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }

image_pattern='^ghcr\.io/30sativa/smart-campus-tour/ai-assistant@sha256:[0-9a-f]{64}$'
if [[ ${1:-} == --validate-only ]]; then
  [[ $# == 2 && $2 =~ $image_pattern ]] || fail 'Image must be ghcr.io/30sativa/smart-campus-tour/ai-assistant@sha256:<digest>.'
  echo 'PASS: ai-assistant image reference is an approved immutable digest.'
  exit 0
fi
[[ $# == 2 ]] || fail 'usage: deploy-host.sh IMAGE_DIGEST_REFERENCE GHCR_USER   (token on stdin)'
image=$1 registry_user=$2
[[ "$image" =~ $image_pattern ]] || fail 'Image must be ghcr.io/30sativa/smart-campus-tour/ai-assistant@sha256:<digest>.'
[[ "$registry_user" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || fail 'Invalid registry user.'
[[ $(id -u) == 0 ]] || fail 'Run as root.'

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=${CAMPUS_AI_ROOT:-/opt/campustour-ai}
ENV_FILE=${AI_ASSISTANT_ENV_FILE:-/etc/campustour/ai-assistant.env}
NETWORK=campustour_outbound

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE is missing; create it from ai-assistant/deploy/ai-assistant.env.example."
[[ $(stat -c '%a' "$ENV_FILE") == 600 ]] || fail "$ENV_FILE must have mode 0600."
grep -Eq '^AI_SERVICE_KEY=.{16,}$' "$ENV_FILE" || fail "$ENV_FILE needs AI_SERVICE_KEY with at least 16 characters."
docker network inspect "$NETWORK" >/dev/null 2>&1 ||
  fail "Docker network $NETWORK does not exist; deploy the backend first."

umask 077
credentials=$(mktemp -d /run/campustour-ai-registry.XXXXXXXXXX)
trap 'rm -rf -- "$credentials"' EXIT
export DOCKER_CONFIG="$credentials"
docker login ghcr.io --username "$registry_user" --password-stdin >/dev/null
docker pull --quiet "$image" >/dev/null

install -d -m 0755 "$ROOT"
install -m 0644 "$here/docker-compose.yml" "$ROOT/docker-compose.yml"
printf 'AI_ASSISTANT_IMAGE=%s\nAI_ASSISTANT_ENV_FILE=%s\n' "$image" "$ENV_FILE" > "$ROOT/release.env.tmp"
chmod 0644 "$ROOT/release.env.tmp"
mv -f "$ROOT/release.env.tmp" "$ROOT/release.env"

# restart: unless-stopped brings it back after a reboot; Docker keeps the external network.
docker compose --env-file "$ROOT/release.env" -f "$ROOT/docker-compose.yml" \
  up -d --force-recreate --wait --wait-timeout 120 ai-assistant ||
  fail 'ai-assistant did not become healthy; inspect: docker logs campustour-ai-ai-assistant-1'

# Same path the API uses: resolve the alias on the backend network and read /health.
api=$(docker ps -q --filter label=com.docker.compose.project=campustour --filter label=com.docker.compose.service=api | head -n 1)
if [[ -n "$api" ]]; then
  docker exec "$api" curl --silent --show-error --fail --max-time 10 http://ai-assistant:8090/health -o /dev/null ||
    fail 'ai-assistant is healthy but the API container cannot reach http://ai-assistant:8090.'
  echo 'PASS: API container reaches http://ai-assistant:8090/health.'
else
  echo 'WARN: no running API container; skipped the API-to-assistant reachability check.'
fi
echo "PASS: ai-assistant $image is running."
