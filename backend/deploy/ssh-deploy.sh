#!/usr/bin/env bash
# Same transport for manual CLI and workflow_dispatch. No secret command arguments.
set -euo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $# == 2 && ( $2 == application || $2 == sql-maintenance ) ]] || fail 'usage: ssh-deploy.sh BUNDLE_DIRECTORY application|sql-maintenance'
bundle=$(cd "$1" && pwd) mode=$2
[[ ${DEPLOY_SSH_HOST:-} =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail 'Invalid DEPLOY_SSH_HOST.'
[[ ${DEPLOY_SSH_USER:-} =~ ^[a-z_][a-z0-9_-]*$ ]] || fail 'Invalid DEPLOY_SSH_USER.'
port=${DEPLOY_SSH_PORT:-22}
if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  fail 'Invalid SSH port.'
fi
[[ -s ${DEPLOY_SSH_KEY_FILE:-} && -s ${DEPLOY_SSH_KNOWN_HOSTS_FILE:-} ]] || fail 'SSH identity and pinned known_hosts files are required.'
[[ -n ${GHCR_TOKEN:-} && ${GHCR_USER:-} =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || fail 'Temporary GHCR credentials are required.'
[[ -s "$bundle/verified-revisions" && -f "$bundle/ops/receive-release.sh" ]] || fail 'Prepared bundle is incomplete.'
ssh_options=(-F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes
  -o IdentityAgent=none -o GlobalKnownHostsFile=/dev/null -o UpdateHostKeys=no
  -o "UserKnownHostsFile=$DEPLOY_SSH_KNOWN_HOSTS_FILE" -i "$DEPLOY_SSH_KEY_FILE"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
target="$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST"
# Authentication, host pin and sudo checks happen before uploading or changing the stack.
remote=$(ssh "${ssh_options[@]}" -p "$port" "$target" 'sudo -n /usr/bin/true && mktemp -d /tmp/campustour-delivery.XXXXXXXXXX')
[[ "$remote" =~ ^/tmp/campustour-delivery\.[A-Za-z0-9]{10}$ ]] || fail 'Unexpected remote staging path.'
retain_stage=0
cleanup() {
  if (( retain_stage )); then
    echo "WARN: delivery connection ended ambiguously; the host deployment may still be running and was not cancelled." >&2
    echo "WARN: retained $remote. On the host inspect sudo tail -n 100 /var/log/campustour/delivery.log and sudo campustour-check before retrying." >&2
    return
  fi
  # Exact validated path, no globs. A broken connection can leave a non-secret bundle behind.
  ssh "${ssh_options[@]}" -p "$port" "$target" "rm -rf -- '$remote'" </dev/null || true
}
trap cleanup EXIT
scp "${ssh_options[@]}" -P "$port" -r "$bundle" "$target:$remote/bundle"
printf -v command 'sudo -n /usr/bin/timeout --signal=TERM --kill-after=60 2400 /usr/bin/bash %q %q %q' \
  "$remote/bundle/ops/receive-release.sh" "$mode" "$GHCR_USER"
# Token only enters encrypted SSH stdin and root-only temporary Docker config.
retain_stage=1
if printf '%s\n' "$GHCR_TOKEN" | ssh "${ssh_options[@]}" -p "$port" "$target" "$command"; then
  retain_stage=0
else
  status=$?
  # 255 is a transport failure; the server may still be reading this bundle.
  if (( status != 255 )); then retain_stage=0; fi
  exit "$status"
fi
