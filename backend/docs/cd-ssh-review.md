# Backend CD review — 2026-10-24

Branch: `feature/codex/be-ssh-deployment`, based on fetched origin/main.
State: ready for independent source review, **not production-ready**.
No PR merge, AWS resource change, GitHub secret change or production
deployment was performed. Docker Desktop/container execution was omitted at
the owner's request after its local startup error; it was not repaired.

## Decision and source findings

Use manual workflow_dispatch → verified release bundle → OpenSSH → existing
EC2 deployment engine, with private GHCR and temporary registry authentication.
The [operating runbook](ec2-deployment.md) gives exact configuration, bootstrap,
initial/later deploy, rollback and isolated restore steps.

GitHub metadata confirmed this repository is private and
[PR 73](https://github.com/30Sativa/smart-campus-tour/pull/73) is merged.
Source review found OIDC/SSM in both CD jobs, unauthenticated raw source downloads
on EC2, public-package assumptions in documentation and missing checkout before
running the manifest validator. Existing host schema/readiness/ownership/backup
guards were retained, not replaced with compose up success.

The change removes AWS credential configuration, SSM command generation/polling
and EC2 raw-source downloads. It adds authenticated source preparation, strict
SSH host pins, stdin-only temporary GHCR auth and shared CLI/Actions execution.
Operations source is archived from Git, excluding ignored local env/credentials.
Application Compose and operations scripts retain separate verified identities.

Existing CI, SQL integration requirement, Docker smoke tests, GHCR publication,
BuildKit caches, pinned digests and release manifests are unchanged. Deployment
locking, schema/readiness gates, pending-marker recovery, API rollback, SQL
maintenance and SQL volume safeguards remain. An additional delivery lock
serializes installer+deploy, and ambiguous SSH disconnect preserves the bundle
for the possibly still-running process. Operations tools remain independent of
application rollback.

Backup uses the existing AWS CLI/object verification path with an optional
HTTPS S3-compatible endpoint + dedicated local credential profile. This can use
an independent provider such as B2 without AWS IAM. Credentials stay root-only
on the host, separate recovery credentials stay outside it; provider retention
and real restore remain operator responsibilities. No storage account was created.

## Verification evidence

| Check | Result and limit |
|---|---|
| `bash scripts/verify backend` | PASS, exit 0 on Linux/WSL, .NET SDK 10.0.402; build 0 warnings/errors |
| Unit tests | 154 passed, zero skipped/failed |
| Integration tests | 114 passed, 126 skipped, zero failed; SQL/container prerequisites absent |
| Release/transport tests in verify | PASS with mocked GitHub/SSH/Docker boundaries: successful push/main selection for both revisions, PR-only runs excluded, unverified operations/release rejected, unavailable artifact/API and invalid manifest rejected |
| SSH transport failure injection | PASS: auth/host-key fail before upload; upload/remote failure returns nonzero; ambiguous disconnect retains staging; secrets absent from arguments/output |
| Receiver | PASS: exact revision/image/mode forwarding; temporary Docker credentials removed after login/deploy failure, TERM interruption and success |
| Real Git archive | PASS: ignored disposable api.env excluded from operations bundle |
| Real OpenSSH handshake | PASS with isolated loopback sshd: intended identity connects; wrong identity and mismatched host pin fail through deployment client before upload |
| Existing deployment engine failure injection | PASS with mocked Docker: failed first install/retry preserves data, unavailable image leaves serving API, schema/readiness/backup reject, promotion rollback, pending-marker recovery, concurrency and SQL drift/maintenance guards |
| Backup failure injection | PASS with mocked SQL/object store: upload failure retains backup; endpoint/profile reach upload/HEAD/download; corrupt download fails without success marker; success removes staging; HTTP endpoint rejected |
| Existing certificate/operation locks | PASS: renewal queue/reconciliation, shared/exclusive coordination, inherited lock and exit release |
| Workflow YAML/inline shell | PASS: both parse, manual-only triggers, production environment and inline Bash syntax |
| ShellCheck | PASS for new preparation/transport/receiver and changed installer |
| Final diff whitespace | `git diff --check` PASS |
| Docker smoke/real SQL | NOT RUN this turn, per owner direction; unchanged CI tests remain enabled |
| EC2 / actual GHCR and object provider | NOT RUN; no production credentials or infrastructure operations used |

The obsolete test of generated SSM shell commands was removed because that
transport no longer exists. It was replaced by executable shared-path tests;
immutable-input and backup-option rejection assertions were retained. Existing
Docker/state-machine scenarios were adapted from fake raw download to local
bundle Compose, retaining their drift/readiness/rollback assertions and adding
unavailable-image coverage. No check was disabled to obtain PASS.

Reproduce optional actual SSH handshake on a disposable Linux machine with
openssh-server installed and its /run/sshd privilege-separation directory present:
`sudo python3 backend/scripts/test-ssh-handshake.py`. It starts only a temporary
loopback listener with disposable keys and removes it afterwards. The standard
backend verify uses the portable mocked-boundary suite without requiring root.

## Changed files

| Area | Repository paths |
|---|---|
| CD entry points | `.github/workflows/backend-deploy.yml`, `.github/workflows/backend-sql-maintenance.yml` |
| Shared source/transport/receiver | `backend/deploy/prepare-release.sh`, `backend/deploy/ssh-deploy.sh`, `backend/deploy/receive-release.sh` |
| Existing engine/host tools/backup | `backend/deploy/deploy-ec2.sh`, `backend/deploy/install-host-tools.sh`, `backend/deploy/backup-sqlserver.sh` |
| Verification/tests | `backend/scripts/verify`, `backend/scripts/test-deploy-ec2.sh`, `backend/scripts/test-deploy-first-retry.py`, `backend/scripts/test-backup-upload-failure.sh`, `backend/scripts/test-ssh-deployment.py`, `backend/scripts/test-ssh-handshake.py` |
| Documentation | `backend/docs/ec2-deployment.md`, `backend/docs/cd-ssh-review.md`, `docs/architecture.md` |

## Operator actions before use and remaining risks

1. Independently review/merge through normal branch protection; wait for the
   main release's complete Backend Verify/image publication/smoke success.
2. Check GitHub plan eligibility for production environment secrets/restrictions.
   Required reviewers in private repos are plan-dependent; manual dispatch is
   not proof of independent approval. Keep production environment and use the
   trusted-workstation route if Actions environment support is unavailable.
3. Configure DEPLOY_SSH_HOST, DEPLOY_SSH_USER, optional DEPLOY_SSH_PORT;
   DEPLOY_SSH_PRIVATE_KEY and DEPLOY_SSH_KNOWN_HOSTS. GITHUB_TOKEN is automatic.
   Grant repository Actions read access to both private GHCR packages.
4. Prepare EC2 tools, protected configuration, trusted TLS, separate SSH deploy
   identity and verified host pin. Deploy sudo capability is explicitly
   root-equivalent, not a sandbox. Keep PR jobs away from deploy credentials.
5. Choose SSH connectivity deliberately: restricted operator IP/manual CLI,
   temporary real runner /32, separate stable-egress runner, or explicitly
   accepted public SSH exposure. No security group changes happen automatically.
6. Configure independent off-host object storage/profile, encryption, retention,
   recovery identity and alerts. Verify actual upload/HEAD/download behavior,
   then restore/check records from an independent machine. A mock is not storage
   evidence and VERIFYONLY alone is not an actual recovery drill.
7. Rehearse full delivery/rollback/interruption/SQL persistence/TLS renewal/reboot
   on non-production EC2. Measure real 4 GiB peaks during candidate overlap,
   startup/backup/restore; resize if headroom/latency/OOM requirements fail.

SQL maintenance still requires a selected verified application SHA different
from the active release; selecting the active SHA is intentionally rejected by
the existing release-directory guard. SQL file downgrade is never automatic.
Rollback relies on retained images and the 90-day manifest. Daily full backup
has nominal <=24-hour RPO only when successful, no PITR; RTO is unmeasured.
Public DNS/TLS, browser flow, GHCR job-token pull from EC2, provider lifecycle,
external alerts and actual disaster cutover all remain unverified.
