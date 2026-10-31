# Backend build cache and release acceptance

## Confirmed incident: 2026-10-24

[Backend Verify run 40098608213](https://github.com/30Sativa/smart-campus-tour/actions/runs/40098608213)
checked out commit `b24171e719281628c2ccd98a256a84ce9c3a08a2`.
Job `120886055130` (Verify backend) succeeded. Job `120887928699`
(Publish verified backend images) failed before any API image was published:

- Buildx created a new docker-container builder with `keep-state: false`.
- The build imported `type=gha,scope=backend-api` layer cache.
- At 13:42:42 UTC, step `#25`, `dotnet restore ... --locked-mode`, was `CACHED`.
- Source copy `#26` and publish `#27` executed. At 13:42:58 UTC, publish
  `--no-restore` failed with NETSDK1064 for Microsoft.AspNetCore.OpenApi 10.0.12.
- Initializer publication, exact-digest validation/smoke tests and release
  artifact upload were skipped. Backend Deploy's successful-upstream gate
  correctly rejects this failed run.

The previous Dockerfile restored packages into a BuildKit cache mount at
`/root/.nuget/packages`, shared by restore and publish. Only the restore
metadata under `obj/` was part of the resulting image layer. Imported layers
could therefore supply `project.assets.json` without its package files. A
source-only change reruns publish, which cannot recover packages with
`--no-restore`. This is a cache portability defect, not evidence of a missing
NuGet release or a broken Swagger implementation.

Docker explicitly documents that [cache mounts are not preserved by the GitHub
Actions cache](https://docs.docker.com/build/ci/github-actions/cache/#cache-mounts).
The log establishes a new builder, cached restore and missing package at
publish; it does not contain a directory listing of the failed mount. The
conclusion follows from those observations and the Dockerfile/export semantics.
There is no evidence here of NuGet network failure, a lock conflict or Linux
path-length exhaustion; restore did not run in the failed build.

## Build invariant and fix

`backend/Dockerfile` now restores into the ordinary build-stage filesystem.
Packages and restore metadata travel together in the cached restore layer.
Project files, lock files and `backend/Directory.Build.props` are copied before
restore; source follows, so source-only edits still reuse restore. Publish
retains `--no-restore`; restore retains `--locked-mode` and NuGet auditing.
No project/package version or lock content changes.

Only `/app/publish` is copied to the runtime stage. The SDK and global package
folder remain outside the runtime image. Existing digest resolution, non-root
runtime, secret exclusions, SBOM/provenance and exact-image smoke gates remain.
External intermediate cache size increases because it now contains packages;
cache availability affects speed, not the presence of required build inputs.
Deleting Actions caches, disabling caching, or exporting mounts separately is
not required. Changing the restore instruction invalidates its old cache key.

There is no repository NuGet.config or central Directory.Packages.props.
Explicit PackageReferences plus committed per-project lock files define the
dependency graph; Directory.Build.props enables lock files and high/critical
NuGet audit failures. CI selects SDK 10.0.402 through backend/global.json;
the image resolver selects the matching SDK image and pins its resolved digest.
Base tags are resolved per run, so a later run can receive a patched base;
the release manifest records the actual immutable references.

`db-init` is an independent SQL Server stage. It contains shell/SQL inputs and
does not execute .NET restore/publish, so it does not share this defect. Its
job step was skipped because the preceding API step failed. PR and main builds
both consume the affected production Dockerfile. The preview Dockerfile uses
implicit restore/publish in one RUN; the SignalR harness uses ordinary-layer
restore. Neither has the split cache-mount defect. Their broader reproducibility
differences are outside this fix. SQL maintenance consumes verified manifests;
it cannot select a failed build without its release artifact.

## Regression checks

On a Linux Docker host, from the repository root:

```bash
bash backend/scripts/resolve-base-images /tmp/campustour-bases
SDK_IMAGE=$(sed -n 's/^sdk=//p' /tmp/campustour-bases) bash backend/scripts/test-docker-build-cache
```

The regression builds the real `build` target on two isolated docker-container
builders: a cold build/export, a warm build after a source-only change, and
an imported-cache build on a fresh builder after another source-only change.
The last two assert from BuildKit plain logs that restore was cached and publish
executed. A successful build that reran restore cannot falsely pass this check.
Local `mode=max` export tests the intermediate-layer portability invariant
without registry writes; actual Actions GHA import/export is still exercised by
the normal API build. No SQL container or production host is involved.
Only disposable context files/builders are changed; builders/cache are cleaned
on exit. PR and main image jobs run this check only when API cache-relevant
inputs change. Database-tool Dockerfile changes exercise their own image build
and SQL smoke path, not this .NET restore-cache regression. Backend verification
and candidate image build/smoke run in parallel when independent; the final
release manifest waits for all applicable gates. Existing runtime/initializer
and exact-release Compose smoke tests continue to verify the final images.
Backend verification also checks script syntax without requiring Docker.

Local verification for this patch (Ubuntu 24.04 WSL, SDK 10.0.402):

- PASS: `bash scripts/verify backend`, exit 0; warnings-as-errors build with
  zero warnings, 154 unit tests and 122 integration tests passed. The 126
  SQL-dependent tests were SKIPPED without a disposable SQL connection. CI still
  requires them through SMARTCAMPUS_REQUIRE_SQL_TESTS.
- PASS: isolated cold locked restore downloaded OpenAPI 10.0.12. Detaching the
  package directory while retaining restore metadata reproduced NETSDK1064;
  restoring that directory made Release publish with `--no-restore` succeed.
  All four copied lock files retained their hashes. This was a .NET experiment,
  not a container build.
- PASS: Bash syntax, ShellCheck, workflow YAML parsing and step-form checks;
  mocked CLI fixtures accepted cached-restore/executed-publish events, rejected
  uncached restore or cached publish, and propagated a failed fresh build.
- SKIPPED: actual Docker builds/cache matrix, Compose SQL smoke/restore tests,
  GHCR publication and EC2 acceptance. Docker Desktop's Linux engine pipe was
  absent; no attempt was made to start/repair it or change the host environment.
  The new Actions gates must confirm these real BuildKit cases before promotion.

## Safe promotion and remaining operational gates

1. Review this change on a feature branch, then integrate through `develop`.
   Require Backend Verify and the image cache/Compose checks before the reviewed
   `develop` to `main` PR. A human approves and merges; do not push to main.
2. Observe the new push/main Backend Verify, including both published images,
   exact-digest Compose smoke tests and `backend-release-<SHA>` upload. A retry
   of the old commit still uses the old Dockerfile and is not a durable repair.
3. Observe Backend Deploy triggered by that successful workflow_run. The job
   validates push/main/same repository/success, skips a superseded SHA, validates
   successful application and operations revisions, downloads the manifest and
   uses pinned SSH. Do not bypass production environment review/restrictions.
4. An authorized host operator can read `/var/lib/campustour/current-release`
   and the active API image/revision, comparing them with the release manifest.
   The source SHA and API digest should match the new release. Readiness alone
   cannot establish image identity. Check Backend Deploy's public HTTPS probe
   and `/var/log/campustour/delivery.log` if delivery fails.
5. To make Swagger visible, the operator must already have configured
   `ApiDocumentation__Enabled=true` and valid Basic credentials in the root-only
   host API env file. Follow `backend/docs/api-documentation.md`. A successful
   code deployment with the default disabled setting intentionally returns 404.
   With it enabled, expect documentation 401 without credentials, OpenAPI 200
   with credentials, and readiness 200. Never print the password in CI logs.

No additional CD source blocker was identified in this review. In particular,
the initializer jq key uses bracket syntax and is covered by real-jq checks.
Live environment secrets, environment approval rules, GHCR package read access,
SSH ingress from changing hosted-runner IPs, known-host pins, disk/TLS state,
backup configuration and pending host operation locks were not inspected.
They can independently block delivery. A required environment reviewer means
the automatic trigger still waits for approval. Pre-deploy backup remains
mandatory on an existing host; SQL image/configuration drift remains gated by
the separate maintenance path. Concurrent/superseded releases can be skipped;
if the newest main fails verification, the existing release remains active.
Release artifacts expire after 90 days and can prevent older manual recovery.
See `backend/docs/ec2-deployment.md` for the existing recovery procedures.
