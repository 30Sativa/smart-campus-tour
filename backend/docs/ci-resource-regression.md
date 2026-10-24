# Backend CI resource and publishing regression — 2026-10-24

## Evidence and classification

- [Main Backend Verify 40069422367](https://github.com/30Sativa/smart-campus-tour/actions/runs/40069422367)
  at b2e607953c0e41a4e6d3f319055eff47b386b0c2 failed in the mocked deployment
  state-machine test: real runner disk free was 10 GiB, below the 12 GiB host
  deployment reserve. SQL service readiness passed, but backend build/xUnit tests
  had not started. Publishing was skipped and the run has no release artifact.
- [PR-75 Backend Verify 40069408213](https://github.com/30Sativa/smart-campus-tour/actions/runs/40069408213)
  failed with the same 10 GiB preflight message before merge. This was not a
  main-only code regression. Require actual successful checks before future
  merges; this change does not edit branch rules or override any check.
- Web Verify and AI Assistant Verify passed on that main commit. Robot and
  firmware workflows have path filters and were not applicable to PR 75.
- Earlier main runs [39981634997](https://github.com/30Sativa/smart-campus-tour/actions/runs/39981634997)
  and [39973256535](https://github.com/30Sativa/smart-campus-tour/actions/runs/39973256535)
  passed backend verification but failed image publishing at base-digest
  resolution, exit 255, before either build/push or manifest creation. GHCR
  login passed; these logs do not establish a registry authentication failure.

The immediate trigger is environmental capacity; the defect is incomplete test
isolation: fake Docker/jq were combined with real df and /proc/meminfo readings.
This does not show EC2 is short of disk or that candidate readiness is broken.
The production 12 GiB reserve is retained for image pulls and SQL backup staging;
an actual EC2 below that reserve must still reject deployment. Backup also
performs its independent database-sized free-space check.

Publishing has a separate pipeline defect: the main resolver piped Buildx output
into awk that exited at the first Digest line under pipefail. A long manifest
can leave the producer writing to a closed pipe. A controlled large-output
producer reproduces exit 255 with the original command. This supports a broken
pipe explanation for the historical logs, but those logs alone do not prove
the producer's internal error. The old PR resolver already consumed full output.

## Fix and regression scope

`backend/scripts/test-deploy-first-retry.py` now supplies disk and RAM fixtures
through test-only df/awk wrappers in its child PATH. Only /proc/meminfo input is
substituted; the real awk binary evaluates the production expressions. Other
awk calls execute normally. Default fixture capacity is 32 GiB disk, 4 GiB total
RAM and 2 GiB available RAM. No production override, disabled guard, broad
runner cleanup, additional runner allocation or skipped test was introduced.

The same real deployment preflight rejects 10 GiB and one byte below 12 GiB
without creating managed state, accepts exactly 12 GiB through to the expected
candidate-readiness failure, and rejects insufficient total/available RAM.
Existing schema/readiness/backup/rollback/ownership/interruption/SQL-maintenance
scenarios still run using deterministic capacity.

Both PR and main now call `backend/scripts/resolve-base-images`, using the prior
PR strategy: capture successful complete Buildx output, then extract/validate
the first immutable digest. The SDK/runtime/SQL tags and repositories remain
unchanged. A failed producer, missing digest or mutable reference still fails
closed. `backend/scripts/test-base-image-resolution.py` exercises output much
larger than a pipe buffer, multiple digest lines and all rejection cases; it is
part of the normal backend verify entry point.

Main-only publication, package permissions, BuildKit caches, exact-image smoke,
manifest-after-smoke and successful-main release authorization remain unchanged.
A passing PR cannot publish or deploy a production release. After human review
and merge, the new main run must succeed through publication and manifest
creation before its SHA can be deployed; this repair does not make the failed
b2e6079 SHA a verified release. No merge, deploy, main rerun or package mutation
is performed as part of this repair.

Local validation uses Linux/WSL and the normal `scripts/verify backend` entry
point. Local Docker Desktop is excluded at the owner's direction; real SQL and
Compose validation run in the PR's existing GitHub Actions jobs. PR checks,
including image smoke and all applicable workflows, are reported separately
from mocked failure injection. Production EC2 capacity, SSH, registry pulls
from EC2 and actual backup-provider recovery remain outside CI evidence.
