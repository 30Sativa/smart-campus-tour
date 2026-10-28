#!/usr/bin/env bash
# Classify only backend-owned changes. Output is consumed by backend CI jobs.
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: detect-ci-changes.sh BASE_SHA HEAD_SHA' >&2; exit 2; }
base=$1 head=$2
[[ "$base" =~ ^[0-9a-f]{40}$ && "$head" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'Expected full base and head commit SHAs.' >&2
  exit 2
}

backend_changed=false release_needed=false database_tool_changed=false cache_test_needed=false
while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  case "$path" in
    backend/*|scripts/verify|scripts/verify.*|docs/architecture.md|docs/requirements/*|docs/decisions/*|.github/workflows/backend-*.yml)
      backend_changed=true ;;
  esac
  case "$path" in
    backend/*)
      if [[ "$path" != backend/docs/* && "$path" != *.md ]]; then release_needed=true; fi ;;
  esac
  case "$path" in
    .github/workflows/backend-*.yml)
      release_needed=true ;;
  esac
  case "$path" in
    backend/database/*.sql|backend/database/patches/*.sql|backend/deploy/init-db.sh|backend/deploy/upgrade-db.sh|backend/Dockerfile.db-init|backend/docker-compose.db-init.yml)
      database_tool_changed=true ;;
  esac
  case "$path" in
    backend/Dockerfile|backend/.dockerignore|backend/global.json|backend/Directory.Build.props|backend/Directory.Build.targets|backend/src/*/*.csproj|backend/src/*/packages.lock.json|backend/tests/*/*.csproj|backend/tests/*/packages.lock.json|backend/scripts/resolve-base-images|backend/scripts/test-docker-build-cache|.github/workflows/backend-verify.yml)
      cache_test_needed=true ;;
  esac
done < <(git diff --name-only "$base" "$head")

if [[ -n ${GITHUB_OUTPUT:-} ]]; then
  {
    printf 'backend_changed=%s\n' "$backend_changed"
    printf 'release_needed=%s\n' "$release_needed"
    printf 'database_tool_changed=%s\n' "$database_tool_changed"
    printf 'cache_test_needed=%s\n' "$cache_test_needed"
  } >> "$GITHUB_OUTPUT"
else
  printf 'backend_changed=%s\nrelease_needed=%s\ndatabase_tool_changed=%s\ncache_test_needed=%s\n' \
    "$backend_changed" "$release_needed" "$database_tool_changed" "$cache_test_needed"
fi
