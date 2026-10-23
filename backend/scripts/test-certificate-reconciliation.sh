#!/usr/bin/env bash
# Exercise the actual certificate hook's durable queue and later activation without Docker or EC2.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

for tool in bash openssl flock; do command -v "$tool" >/dev/null || { echo "Required test tool: $tool" >&2; exit 1; }; done

scratch=$(mktemp -d)
case "$scratch" in /tmp/*|/var/tmp/*) ;; *) echo 'Unexpected test scratch directory; refusing cleanup.' >&2; exit 1 ;; esac
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/bin" "$scratch/config" "$scratch/certs/releases/initial" "$scratch/deploy/releases" "$scratch/run"

openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj '/CN=api.test' \
  -addext 'subjectAltName=DNS:api.test' -keyout "$scratch/certs/releases/initial/privkey.pem" \
  -out "$scratch/certs/releases/initial/fullchain.pem" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj '/CN=api.test' \
  -addext 'subjectAltName=DNS:api.test' -keyout "$scratch/renewed.key" \
  -out "$scratch/renewed.pem" >/dev/null 2>&1
chmod 0600 "$scratch/certs/releases/initial/privkey.pem" "$scratch/renewed.key"
ln -s "$scratch/certs/releases/initial" "$scratch/certs/active"
release_sha=$(printf 'a%.0s' {1..40})
mkdir -p "$scratch/deploy/releases/$release_sha"
printf 'COMPOSE_OWNER=%s\n' "$(printf 'b%.0s' {1..32})" > "$scratch/deploy/releases/$release_sha/release.env"
printf 'name: campustour-test\n' > "$scratch/deploy/releases/$release_sha/docker-compose.yml"
ln -s "$scratch/deploy/releases/$release_sha" "$scratch/deploy/current"
printf 'COMPOSE_PROJECT_NAME=campustour\n' > "$scratch/config/backend.env"
chmod 0600 "$scratch/config/backend.env"

cat > "$scratch/bin/jq" <<'JQ'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "-r .services.api.environment.AllowedHosts // empty") printf 'api.test;localhost\n' ;;
  *'select(.target == "/run/tls/fullchain.pem")'*) printf '%s/fullchain.pem\n' "$TEST_ACTIVE_LINK" ;;
  *'select(.target == "/run/tls/privkey.pem")'*) printf '%s/privkey.pem\n' "$TEST_ACTIVE_LINK" ;;
  *) echo "Unsupported jq expression in certificate test: $*" >&2; exit 1 ;;
esac
JQ
cat > "$scratch/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [[ "$1" == compose && " $* " == *' config --format json '* ]]; then
  printf '{"services":{"api":{"environment":{"AllowedHosts":"api.test;localhost"},"volumes":[{"target":"/run/tls/fullchain.pem","source":"%s/fullchain.pem"},{"target":"/run/tls/privkey.pem","source":"%s/privkey.pem"}]}}}\n' \
    "$TEST_ACTIVE_LINK" "$TEST_ACTIVE_LINK"
fi
DOCKER
cat > "$scratch/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CURL_LOG"
exit 0
CURL
cat > "$scratch/bin/id" <<'ID'
#!/usr/bin/env bash
[[ "$*" == -u ]] || exit 2
printf '0\n'
ID
cat > "$scratch/bin/install" <<'INSTALL'
#!/usr/bin/env bash
set -euo pipefail
mode=0644
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|-g) shift 2 ;;
    -m) mode=$2; shift 2 ;;
    *) break ;;
  esac
done
[[ $# == 2 ]] || { echo 'Mock install expected a source and destination.' >&2; exit 2; }
cp -- "$1" "$2"
chmod "$mode" "$2"
INSTALL
chmod 0755 "$scratch/bin/jq" "$scratch/bin/docker" "$scratch/bin/curl" "$scratch/bin/id" "$scratch/bin/install"

test_env=(
  "PATH=$scratch/bin:$PATH"
  "DOCKER_LOG=$scratch/docker.log"
  "CURL_LOG=$scratch/curl.log"
  "TEST_ACTIVE_LINK=$scratch/certs/active"
  "CAMPUS_DEPLOY_ROOT=$scratch/deploy"
  "CAMPUS_CONFIG_DIR=$scratch/config"
  "CAMPUS_STATE_DIR=$scratch/state"
  "CAMPUS_TLS_CERT_ROOT=$scratch/certs"
  "CAMPUS_OPERATION_LOCK=$scratch/run/operation.lock"
  "CAMPUS_CERT_QUEUE_LOCK=$scratch/run/certificate-queue.lock"
)

run_refresh() {
  env "${test_env[@]}" bash backend/deploy/refresh-certificate.sh "$@"
}

flock -x "$scratch/run/operation.lock" sleep 3 &
holder=$!
sleep 0.2
run_refresh "$scratch/renewed.pem" "$scratch/renewed.key"
wait "$holder"
[[ -L "$scratch/certs/pending/current" ]] || { echo 'Renewal was lost while the operation lock was busy.' >&2; exit 1; }

# Reconciliation applies the queued pair after the deployment releases its lock.
run_refresh --reconcile
[[ ! -e "$scratch/certs/pending/current" && ! -L "$scratch/certs/pending/current" ]] || {
  echo 'Successfully activated certificate remained queued.' >&2
  exit 1
}
active_dir=$(readlink -f "$scratch/certs/active")
[[ "$active_dir" == "$scratch/certs/releases/"* ]] || { echo 'Active certificate is outside the managed release tree.' >&2; exit 1; }
openssl x509 -in "$active_dir/fullchain.pem" -checkhost api.test -noout >/dev/null
cert_fingerprint=$(openssl x509 -in "$active_dir/fullchain.pem" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
key_fingerprint=$(openssl pkey -in "$active_dir/privkey.pem" -pubout -outform DER | sha256sum | cut -d' ' -f1)
[[ "$cert_fingerprint" == "$key_fingerprint" ]] || { echo 'Activated certificate and key do not match.' >&2; exit 1; }
grep -q -- '--no-deps --force-recreate --wait' "$scratch/docker.log" || {
  echo 'Certificate activation did not recreate only the API service.' >&2
  exit 1
}
echo 'PASS: lock contention queued the renewal; reconciliation activated the matching certificate and API readiness passed.'
