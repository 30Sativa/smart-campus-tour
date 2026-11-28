#!/usr/bin/env bash
# Run on the Actions runner: copy deploy files to the backend EC2 host and start one image there.
# Same SSH identity, host pin and sudo rule as backend/deploy/ssh-deploy.sh. No secret arguments.
set -euo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $# == 1 ]] || fail 'usage: ssh-deploy.sh IMAGE_DIGEST_REFERENCE'
image=$1
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
bash "$here/deploy-host.sh" --validate-only "$image"
[[ ${DEPLOY_SSH_HOST:-} =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail 'Invalid DEPLOY_SSH_HOST.'
[[ ${DEPLOY_SSH_USER:-} =~ ^[a-z_][a-z0-9_-]*$ ]] || fail 'Invalid DEPLOY_SSH_USER.'
port=${DEPLOY_SSH_PORT:-22}
if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then fail 'Invalid SSH port.'; fi
[[ -s ${DEPLOY_SSH_KEY_FILE:-} && -s ${DEPLOY_SSH_KNOWN_HOSTS_FILE:-} ]] || fail 'SSH identity and pinned known_hosts files are required.'
[[ -n ${GHCR_TOKEN:-} && ${GHCR_USER:-} =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || fail 'Temporary GHCR credentials are required.'
ssh_options=(-F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes
  -o IdentityAgent=none -o GlobalKnownHostsFile=/dev/null -o UpdateHostKeys=no
  -o "UserKnownHostsFile=$DEPLOY_SSH_KNOWN_HOSTS_FILE" -i "$DEPLOY_SSH_KEY_FILE"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
target="$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST"
remote=$(ssh "${ssh_options[@]}" -p "$port" "$target" 'sudo -n /usr/bin/true && mktemp -d /tmp/campustour-ai.XXXXXXXXXX')
[[ "$remote" =~ ^/tmp/campustour-ai\.[A-Za-z0-9]{10}$ ]] || fail 'Unexpected remote staging path.'
cleanup() { ssh "${ssh_options[@]}" -p "$port" "$target" "rm -rf -- '$remote'" </dev/null || true; }
trap cleanup EXIT
scp "${ssh_options[@]}" -P "$port" "$here/deploy-host.sh" "$here/docker-compose.yml" "$target:$remote/"
printf -v command 'sudo -n /usr/bin/timeout --signal=TERM --kill-after=30 600 /usr/bin/bash %q %q %q' \
  "$remote/deploy-host.sh" "$image" "$GHCR_USER"
# Token only enters encrypted SSH stdin and a root-only temporary Docker config.
printf '%s\n' "$GHCR_TOKEN" | ssh "${ssh_options[@]}" -p "$port" "$target" "$command"
