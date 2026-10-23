#!/usr/bin/env bash
# Queue every renewal durably, then activate it while holding the shared operation lock.
set -Eeuo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }
mode=hook
if [[ $# == 1 && $1 == --reconcile ]]; then
  mode=reconcile
elif [[ $# == 2 ]]; then
  CERT_SOURCE=$1
  KEY_SOURCE=$2
else
  fail 'usage: refresh-certificate.sh FULLCHAIN_PEM PRIVATE_KEY_PEM | --reconcile'
fi
[[ $(id -u) == 0 ]] || fail 'Run as root from the certificate renewal hook or systemd reconciliation service.'

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
STATE=${CAMPUS_STATE_DIR:-/var/lib/campustour}
CERT_ROOT=${CAMPUS_TLS_CERT_ROOT:-/etc/campustour/certs}
ACTIVE_LINK=$CERT_ROOT/active
PENDING_ROOT=$CERT_ROOT/pending
PENDING_LINK=$PENDING_ROOT/current
CURRENT_LINK=$ROOT/current
OPERATION_LOCK=${CAMPUS_OPERATION_LOCK:-/run/lock/campustour-operation.lock}
QUEUE_LOCK=${CAMPUS_CERT_QUEUE_LOCK:-/run/lock/campustour-certificate-queue.lock}

for tool in docker jq curl openssl sha256sum flock install; do
  command -v "$tool" >/dev/null || fail "Required host tool is missing: $tool."
done
mkdir -p "$CERT_ROOT/releases" "$PENDING_ROOT" "$(dirname "$OPERATION_LOCK")"
chmod 0700 "$PENDING_ROOT"
queued_dir=
activation_started=0
activation_attempts=0
cleanup() {
  [[ -n "$queued_dir" && -d "$queued_dir" ]] || return 0
  rm -f -- "$queued_dir/fullchain.pem" "$queued_dir/privkey.pem"
  rmdir -- "$queued_dir" 2>/dev/null || true
}
on_exit() {
  local status=$? next tmp
  trap - EXIT
  cleanup
  if (( status != 0 && activation_started == 1 && activation_attempts < 3 )); then
    next=$((activation_attempts + 1))
    tmp=$(mktemp "$pending_dir/.attempts.XXXXXX")
    printf '%s\n' "$next" > "$tmp"
    chmod 0600 "$tmp"
    mv -f -- "$tmp" "$pending_dir/attempts"
    echo "WARN: certificate activation attempt $next of 3 failed; the pending renewal remains queued." >&2
  fi
  exit "$status"
}
trap cleanup EXIT

validate_pair() {
  local cert=$1 key=$2 cert_fingerprint key_fingerprint
  openssl x509 -in "$cert" -noout >/dev/null || fail 'Renewed certificate is not a valid X.509 PEM file.'
  openssl pkey -in "$key" -noout >/dev/null || fail 'Renewed private key is not a valid PEM private key.'
  openssl x509 -in "$cert" -checkend 1209600 -noout >/dev/null || fail 'Renewed certificate expires within 14 days.'
  cert_fingerprint=$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
  key_fingerprint=$(openssl pkey -in "$key" -pubout -outform DER | sha256sum | cut -d' ' -f1)
  [[ "$cert_fingerprint" == "$key_fingerprint" ]] || fail 'Renewed certificate does not match the supplied private key.'
}

if [[ "$mode" == hook ]]; then
  [[ -r "$CERT_SOURCE" && -r "$KEY_SOURCE" ]] || fail 'Renewed certificate or private key is unreadable.'
  queued_dir=$(mktemp -d "$PENDING_ROOT/.incoming.XXXXXX")
  chmod 0700 "$queued_dir"
  install -o root -g root -m 0644 "$CERT_SOURCE" "$queued_dir/fullchain.pem"
  install -o root -g root -m 0600 "$KEY_SOURCE" "$queued_dir/privkey.pem"
  validate_pair "$queued_dir/fullchain.pem" "$queued_dir/privkey.pem"
  printf '0\n' > "$queued_dir/attempts"
  chmod 0600 "$queued_dir/attempts"
  queue_name="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  queued_final=$PENDING_ROOT/$queue_name
  [[ ! -e "$queued_final" ]] || fail 'Certificate queue path already exists.'
  mv "$queued_dir" "$queued_final"
  queued_dir=
  exec 8>"$QUEUE_LOCK"
  flock -x 8
  new_link=$PENDING_ROOT/.current.$$
  ln -s "$queued_final" "$new_link"
  mv -Tf "$new_link" "$PENDING_LINK"
  flock -u 8
  exec 8>&-
  echo "Queued renewed certificate pair $queue_name for activation."
else
  [[ -L "$PENDING_LINK" ]] || { echo 'No pending certificate renewal.'; exit 0; }
fi

exec 9>"$OPERATION_LOCK"
if ! flock -n 9; then
  echo 'WARN: deployment or backup holds the operation lock; the renewed certificate remains queued for the reconciliation timer.' >&2
  exit 0
fi

[[ -L "$PENDING_LINK" ]] || { echo 'No pending certificate renewal remains.'; exit 0; }
pending_dir=$(readlink -f "$PENDING_LINK") || fail 'Could not resolve the pending certificate pair.'
case "$pending_dir" in "$PENDING_ROOT"/*) ;; *) fail 'Pending certificate path is outside its managed queue.' ;; esac
activation_started=1
if [[ -f "$pending_dir/attempts" ]]; then activation_attempts=$(cat "$pending_dir/attempts"); fi
[[ "$activation_attempts" =~ ^[0-3]$ ]] || fail 'Pending certificate retry marker is malformed.'
(( activation_attempts < 3 )) || fail 'Certificate activation exhausted three attempts; inspect the pending pair and systemd journal before retrying.'
trap on_exit EXIT
[[ -f "$pending_dir/fullchain.pem" && -f "$pending_dir/privkey.pem" ]] || fail 'Pending certificate pair is incomplete.'
[[ -L "$CURRENT_LINK" ]] || fail 'No managed API release is active.'
[[ -f "$CONFIG/backend.env" ]] || fail 'Backend environment file is missing.'
release_dir=$(readlink -f "$CURRENT_LINK")
case "$release_dir" in "$ROOT"/releases/*) ;; *) fail 'Active release link is outside its managed release directory.' ;; esac
[[ -f "$release_dir/release.env" && -f "$release_dir/docker-compose.yml" ]] || fail 'Active release configuration is incomplete.'
compose=(docker compose --project-name campustour --env-file "$CONFIG/backend.env" \
  --env-file "$release_dir/release.env" -f "$release_dir/docker-compose.yml")
resolved=$("${compose[@]}" config --format json)
host=$(jq -r '.services.api.environment.AllowedHosts // empty' <<<"$resolved" | cut -d';' -f1)
[[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'API_HOST is missing or invalid in resolved Compose configuration.'
configured_cert=$(jq -r '.services.api.volumes[] | select(.target == "/run/tls/fullchain.pem") | .source' <<<"$resolved")
configured_key=$(jq -r '.services.api.volumes[] | select(.target == "/run/tls/privkey.pem") | .source' <<<"$resolved")
[[ "$configured_cert" == "$ACTIVE_LINK/fullchain.pem" && "$configured_key" == "$ACTIVE_LINK/privkey.pem" ]] ||
  fail 'Active Compose release does not use the managed atomic certificate directory.'
validate_pair "$pending_dir/fullchain.pem" "$pending_dir/privkey.pem"
openssl x509 -in "$pending_dir/fullchain.pem" -checkhost "$host" -noout >/dev/null ||
  fail 'Renewed certificate does not cover API_HOST.'
[[ ! -e "$ACTIVE_LINK" || -L "$ACTIVE_LINK" ]] || fail 'Certificate active path exists and is not a symlink.'

previous_dir=
if [[ -L "$ACTIVE_LINK" ]]; then
  previous_dir=$(readlink -f "$ACTIVE_LINK") || fail 'Could not resolve the active certificate release.'
  case "$previous_dir" in "$CERT_ROOT"/releases/*) ;; *) fail 'Active certificate link is outside its release directory.' ;; esac
fi
release_name="$(date -u +%Y%m%dT%H%M%SZ)-$$"
new_dir=$CERT_ROOT/releases/$release_name
[[ ! -e "$new_dir" ]] || fail 'Certificate release directory already exists.'
mkdir "$new_dir"
chmod 0755 "$new_dir"
install -o 1654 -g 1654 -m 0644 "$pending_dir/fullchain.pem" "$new_dir/fullchain.pem"
install -o 1654 -g 1654 -m 0600 "$pending_dir/privkey.pem" "$new_dir/privkey.pem"
new_link=$CERT_ROOT/.active.$$
ln -s "$new_dir" "$new_link"
mv -Tf "$new_link" "$ACTIVE_LINK"

restore_previous_certificate() {
  [[ -n "$previous_dir" ]] || { echo 'No previous certificate pair exists to restore.' >&2; return 1; }
  local link=$CERT_ROOT/.active.rollback.$$
  ln -s "$previous_dir" "$link"
  mv -Tf "$link" "$ACTIVE_LINK"
  echo 'Restoring the previous certificate pair and API container.' >&2
  "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 240 api ||
    echo 'WARN: previous API container did not become healthy after certificate restore.' >&2
}

if ! "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 240 api; then
  restore_previous_certificate || true
  fail 'API did not become healthy after certificate renewal; the pending pair remains for retry.'
fi
if ! curl --silent --show-error --fail --max-time 15 --connect-to "$host:443:127.0.0.1:443" \
  "https://$host/health/ready" -o /dev/null; then
  restore_previous_certificate || true
  fail 'Public HTTPS readiness failed after renewal; the pending pair remains for retry.'
fi

exec 8>"$QUEUE_LOCK"
flock -x 8
latest_pending=$(readlink -f "$PENDING_LINK" 2>/dev/null || true)
if [[ "$latest_pending" == "$pending_dir" ]]; then
  rm -f -- "$PENDING_LINK"
fi
flock -u 8
exec 8>&-
rm -f -- "$pending_dir/fullchain.pem" "$pending_dir/privkey.pem"
rm -f -- "$pending_dir/attempts"
rmdir -- "$pending_dir" 2>/dev/null || true
activation_started=0
trap - EXIT
echo "PASS: certificate release $release_name is active and API readiness passed."
