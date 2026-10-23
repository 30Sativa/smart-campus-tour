#!/usr/bin/env bash
# Verify the flock modes used by deployment and backup cannot overlap or deadlock.
set -euo pipefail

for tool in flock bash sleep; do command -v "$tool" >/dev/null || { echo "Required test tool: $tool" >&2; exit 1; }; done
scratch=$(mktemp -d)
case "$scratch" in /tmp/*|/var/tmp/*) ;; *) echo 'Unexpected lock-test directory; refusing cleanup.' >&2; exit 1 ;; esac
trap 'rm -rf -- "$scratch"' EXIT
operation_lock=$scratch/operation.lock
backup_lock=$scratch/backup.lock

expect_lock_failure() {
  if "$@" >/dev/null 2>&1; then
    echo 'FAIL: conflicting operation unexpectedly acquired its lock.' >&2
    exit 1
  fi
}

# Deployment's exclusive lock blocks a scheduled backup's shared lock.
flock -x "$operation_lock" sleep 3 &
holder=$!
sleep 0.2
expect_lock_failure flock -s -n "$operation_lock" -c true
wait "$holder"

# Scheduled backup uses shared operation coordination plus one exclusive backup lock.
flock -s "$operation_lock" flock -x "$backup_lock" sleep 3 &
holder=$!
sleep 0.2
expect_lock_failure flock -x -n "$operation_lock" -c true
expect_lock_failure flock -s -n "$operation_lock" flock -x -n "$backup_lock" -c true
wait "$holder"

# A pre-deploy backup child can inherit an exclusive operation lock without reopening it.
(
  exec 9>"$operation_lock"
  flock -n -x 9
  if bash -c '
    target=$(readlink "/proc/$PPID/fd/9" 2>/dev/null || true)
    if [[ -z "$target" ]]; then
      echo "SKIP: this kernel does not expose the parent lock descriptor through /proc." >&2
      exit 77
    fi
    [[ "$target" == "$1" ]] || { echo "FAIL: inherited fd 9 points to $target, expected $1." >&2; exit 1; }
  ' _ "$operation_lock"; then
    :
  else
    status=$?
    [[ $status == 77 ]] || exit "$status"
  fi
)

# A killed lock owner releases the kernel lock automatically; no stale pid file is needed.
flock -x "$operation_lock" bash -c 'kill -KILL $$' >/dev/null 2>&1 || true
flock -n -x "$operation_lock" -c true

echo 'PASS: exclusive/shared operation-lock exclusion, backup serialization, inherited descriptor check where /proc permits, and process-exit lock release were verified.'
