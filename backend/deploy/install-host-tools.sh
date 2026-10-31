#!/usr/bin/env bash
# Install the versioned host-only operations bundle from a reviewed source commit.
set -euo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $# == 2 && "$1" =~ ^[0-9a-f]{40}$ && -d "$2" ]] || fail 'usage: install-host-tools.sh OPS_SHA LOCAL_OPERATIONS_DIRECTORY'
ops_sha=$1
[[ $(id -u) == 0 ]] || fail 'Install host tools as root.'
bundle=$(cd "$2" && pwd)
for tool in bash flock sha256sum; do command -v "$tool" >/dev/null || fail "Required host tool is missing: $tool."; done

ROOT=${CAMPUS_DEPLOY_ROOT:-/opt/campustour}
STATE=${CAMPUS_STATE_DIR:-/var/lib/campustour}
LOCK_FILE=${CAMPUS_OPERATION_LOCK:-/run/lock/campustour-operation.lock}
version_dir=$ROOT/ops/$ops_sha
mkdir -p "$ROOT/ops" "$STATE" /usr/local/sbin /etc/systemd/system "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -w 900 9 || fail 'Could not obtain the operation lock to update host tools within 15 minutes.'

stage=$(mktemp -d "$ROOT/.ops-$ops_sha.XXXXXX")
cleanup() {
  [[ -n ${stage:-} && -d "$stage" ]] || return 0
  rm -f -- "$stage"/*
  rmdir -- "$stage" 2>/dev/null || true
}
trap cleanup EXIT

scripts=(backup-sqlserver.sh check-ec2.sh stack-start.sh refresh-certificate.sh)
units=(campustour-stack.service campustour-backup.service campustour-backup.timer campustour-check.service campustour-check.timer campustour-certificate-reconcile.service campustour-certificate-reconcile.timer)
for name in "${scripts[@]}"; do
  cp -- "$bundle/$name" "$stage/$name" || fail "Could not copy $name from operations bundle $ops_sha."
  [[ -s "$stage/$name" ]] || fail "Downloaded host script $name is empty."
  bash -n "$stage/$name" || fail "Downloaded host script $name failed bash syntax validation."
  chmod 0755 "$stage/$name"
done
for name in "${units[@]}"; do
  cp -- "$bundle/systemd/$name" "$stage/$name" || fail "Could not copy systemd unit $name from operations bundle $ops_sha."
  [[ -s "$stage/$name" ]] || fail "Downloaded systemd unit $name is empty."
  chmod 0644 "$stage/$name"
done

manifest_tmp="$stage/operations-tools.json"
{
  printf '{"operations_sha":"%s","files":{' "$ops_sha"
  first=1
  for name in "${scripts[@]}" "${units[@]}"; do
    (( first == 1 )) || printf ','
    first=0
    printf '"%s":"sha256:%s"' "$name" "$(sha256sum "$stage/$name" | cut -d' ' -f1)"
  done
  printf '}}\n'
} > "$manifest_tmp"
chmod 0644 "$manifest_tmp"

if [[ -e "$version_dir" ]]; then
  [[ -d "$version_dir" && ! -L "$version_dir" ]] || fail "Operations version path is not a directory: $version_dir"
  cmp -s "$version_dir/operations-tools.json" "$manifest_tmp" ||
    fail "Operations commit $ops_sha already exists with different tool contents."
else
  mv "$stage" "$version_dir"
  stage=
fi

install_version_link() {
  local target=$1 link=$2 temp="${2}.new.$$"
  rm -f -- "$temp"
  ln -s "$target" "$temp"
  mv -Tf "$temp" "$link"
}
install_version_link "$version_dir" "$ROOT/ops/current"
install_version_link "$ROOT/ops/current/backup-sqlserver.sh" /usr/local/sbin/campustour-backup
install_version_link "$ROOT/ops/current/check-ec2.sh" /usr/local/sbin/campustour-check
install_version_link "$ROOT/ops/current/stack-start.sh" /usr/local/sbin/campustour-stack-start
install_version_link "$ROOT/ops/current/refresh-certificate.sh" /usr/local/sbin/campustour-refresh-certificate

for name in "${units[@]}"; do
  install -o root -g root -m 0644 "$version_dir/$name" "/etc/systemd/system/$name.new"
  mv -f "/etc/systemd/system/$name.new" "/etc/systemd/system/$name"
done
systemctl daemon-reload
systemctl enable campustour-stack.service
systemctl enable --now campustour-backup.timer campustour-check.timer campustour-certificate-reconcile.timer
tmp="$STATE/.operations-tools-release.$$"
printf '%s\n' "$ops_sha" > "$tmp"
chmod 0600 "$tmp"
mv -f "$tmp" "$STATE/operations-tools-release"
echo "PASS: installed host operations bundle from $ops_sha. The application release can be rolled back independently."
