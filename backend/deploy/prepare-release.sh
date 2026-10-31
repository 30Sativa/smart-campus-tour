#!/usr/bin/env bash
# Run on an authenticated workstation or Actions runner, never on EC2.
set -euo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $# == 3 ]] || fail 'usage: prepare-release.sh RELEASE_SHA OPS_SHA NEW_BUNDLE_DIRECTORY'
release=$1 ops=$2 destination=$3
for sha in "$release" "$ops"; do [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Expected full lowercase commit SHAs.'; done
repo=30Sativa/smart-campus-tour
source_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
[[ $(git -C "$source_root" rev-parse HEAD) == "$ops" ]] || fail 'Checkout does not match the operations revision.'
[[ -z $(git -C "$source_root" status --porcelain --untracked-files=no -- backend/deploy) ]] || fail 'Operations scripts have local modifications.'
[[ ! -e "$destination" ]] || fail 'Bundle destination already exists; use a new directory.'
find_run() {
  local response run
  response=$(gh api "/repos/$repo/actions/workflows/backend-verify.yml/runs?head_sha=$1&status=success&per_page=100")
  run=$(jq -r --arg sha "$1" '[.workflow_runs[] | select(.event == "push" and .head_branch == "main" and .head_sha == $sha and .conclusion == "success")] | sort_by(.run_number) | last | .id // empty' <<<"$response")
  [[ "$run" =~ ^[0-9]+$ ]] || fail "No successful main Backend Verify run exists for $1."
  printf '%s' "$run"
}
release_run=$(find_run "$release")
ops_run=$(find_run "$ops")
mkdir -p "$destination/ops" "$destination/release"
gh run download "$release_run" --repo "$repo" --name "backend-release-$release" --dir "$destination/release"
python3 "$source_root/backend/deploy/validate-release-manifest.py" "$destination/release/backend-release.json" "$release" /dev/null
# Authenticated Contents API works for private repositories; EC2 never fetches GitHub source.
gh api -H 'Accept: application/vnd.github.raw+json' "/repos/$repo/contents/backend/docker-compose.yml?ref=$release" > "$destination/release/docker-compose.yml"
[[ -s "$destination/release/docker-compose.yml" ]] || fail 'Release Compose file is empty.'
gh api -H 'Accept: application/vnd.github.raw+json' "/repos/$repo/contents/backend/docker-compose.db-init.yml?ref=$release" > "$destination/release/docker-compose.db-init.yml"
[[ -s "$destination/release/docker-compose.db-init.yml" ]] || fail 'Release database-tool Compose file is empty.'
# Only committed files: ignored api.env/local credentials must never enter a bundle.
git -C "$source_root" archive "$ops" backend/deploy | tar -x --strip-components=2 -C "$destination/ops"
printf '%s\n' "$release" "$ops" "$release_run" "$ops_run" > "$destination/verified-revisions"
echo "PASS: prepared release $release (run $release_run), operations $ops (run $ops_run)."
