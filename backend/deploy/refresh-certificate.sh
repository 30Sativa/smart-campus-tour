#!/usr/bin/env bash
# Atomically activate a renewed certificate pair, recreate only the API, then verify TLS and readiness.
set -Eeuo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $# == 2 ]] || fail 'usage: refresh-certificate.sh FULLCHAIN_PEM PRIVATE_KEY_PEM'
[[ $(id -u) == 0 ]] || fail 'Run as root from the certificate renewal deploy hook.'

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
CONFIG=${CAMPUS_CONFIG_DIR:-/etc/campustour}
CERT_ROOT=${CAMPUS_TLS_CERT_ROOT:-/etc/campustour/certs}
ACTIVE_LINK=$CERT_ROOT/active
CURRENT_LINK=$ROOT/current
LOCK_FILE=/run/lock/campustour-deploy.lock
CERT_SOURCE=$1
KEY_SOURCE=$2

for tool in docker jq curl openssl sha256sum flock; do
  command -v "$tool" >/dev/null || fail "Required host tool is missing: $tool."
done
[[ -r "$CERT_SOURCE" && -r "$KEY_SOURCE" ]] || fail 'Renewed certificate or private key is unreadable.'
[[ -L "$CURRENT_LINK" ]] || fail 'No managed API release is active.'
[[ -f "$CONFIG/backend.env" ]] || fail 'Backend environment file is missing.'

exec 9>"$LOCK_FILE"
flock -n 9 || fail 'A deployment or certificate update is already active.'

release_dir=$(readlink -f "$CURRENT_LINK")
case "$release_dir" in "$ROOT"/releases/*) ;; *) fail 'Active release link is outside the release directory.' ;; esac
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

mkdir -p "$CERT_ROOT/releases" /run/lock
[[ ! -e "$ACTIVE_LINK" || -L "$ACTIVE_LINK" ]] || fail 'Certificate active path exists and is not a symlink.'
previous_dir=
if [[ -L "$ACTIVE_LINK" ]]; then
  previous_dir=$(readlink -f "$ACTIVE_LINK") || fail 'Could not resolve the active certificate release.'
  case "$previous_dir" in "$CERT_ROOT"/releases/*) ;; *) fail 'Active certificate link is outside its release directory.' ;; esac
fi

stage=$(mktemp -d "$CERT_ROOT/.renewal.XXXXXX")
cleanup() {
  [[ -z ${stage:-} || ! -d "$stage" ]] && return 0
  rm -f -- "$stage/fullchain.pem" "$stage/privkey.pem"
  rmdir -- "$stage"
}
trap cleanup EXIT
install -o 1654 -g 1654 -m 0644 "$CERT_SOURCE" "$stage/fullchain.pem"
install -o 1654 -g 1654 -m 0600 "$KEY_SOURCE" "$stage/privkey.pem"
openssl x509 -in "$stage/fullchain.pem" -noout >/dev/null || fail 'Renewed certificate is not a valid X.509 PEM file.'
openssl pkey -in "$stage/privkey.pem" -noout >/dev/null || fail 'Renewed private key is not a valid PEM private key.'
openssl x509 -in "$stage/fullchain.pem" -checkhost "$host" -noout >/dev/null || fail 'Renewed certificate does not cover API_HOST.'
openssl x509 -in "$stage/fullchain.pem" -checkend 1209600 -noout >/dev/null || fail 'Renewed certificate expires within 14 days.'
cert_fingerprint=$(openssl x509 -in "$stage/fullchain.pem" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
key_fingerprint=$(openssl pkey -in "$stage/privkey.pem" -pubout -outform DER | sha256sum | cut -d' ' -f1)
[[ "$cert_fingerprint" == "$key_fingerprint" ]] || fail 'Renewed certificate does not match the supplied private key.'

release_name="$(date -u +%Y%m%dT%H%M%SZ)-$$"
new_dir=$CERT_ROOT/releases/$release_name
[[ ! -e "$new_dir" ]] || fail 'Certificate release directory already exists.'
chmod 0755 "$stage"
mv "$stage" "$new_dir"
stage=
new_link=$CERT_ROOT/.active.$$
ln -s "$new_dir" "$new_link"
mv -Tf "$new_link" "$ACTIVE_LINK"

restore_previous_certificate() {
  local link=$CERT_ROOT/.active.rollback.$$
  if [[ -n "$previous_dir" ]]; then
    ln -s "$previous_dir" "$link"
    mv -Tf "$link" "$ACTIVE_LINK"
    echo 'Restoring the previous certificate pair and API container.' >&2
    "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 240 api ||
      echo 'WARN: the previous API container could not be restored automatically.' >&2
  else
    echo 'No previous certificate pair exists to restore.' >&2
  fi
}

if ! "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 240 api; then
  restore_previous_certificate
  fail 'API did not become healthy after certificate renewal.'
fi
if ! curl --silent --show-error --fail --max-time 15 --connect-to "$host:443:127.0.0.1:443" \
  "https://$host/health/ready" -o /dev/null; then
  restore_previous_certificate
  fail 'Public-certificate HTTPS readiness probe failed after renewal.'
fi
echo "PASS: certificate release $release_name is active and API readiness passed."
