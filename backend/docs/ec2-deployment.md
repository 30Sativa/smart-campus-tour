# Backend deployment to one EC2 host

Status: implementation for independent review; actual EC2 acceptance is required.
No AWS resources, GitHub secrets or production deployment were changed.

## 1. Architecture and review findings

### API, schema and SQL engine lifecycle (2026-10-28)

`backend/docker-compose.yml` contains the API and pinned SQL Server with its
persistent volume. The separate `backend/docker-compose.db-init.yml` exposes
the versioned database tool only for explicit operations. API deploy runs its
`--check-only` command, then changes only the API container; it cannot create a
database, change login credentials, apply a schema patch, or change the SQL
Server image. Empty-database bootstrap is an explicit `--bootstrap` operation.
Existing data uses Backend Database Schema Upgrade, not Backend SQL Maintenance.
The former takes a verified full backup under the host operation lock, applies
the ordered v1.1→v1.12 additive patches, then verifies structure and runtime
permissions. The latter continues to handle SQL Server engine/resource changes.
An existing v1.4 database must receive the v1.4→v1.5, v1.5→v1.6,
v1.6→v1.7 and v1.7→v1.8 patches and permission regrant before deploying code
that requires durable robot confirmation, credential lifecycle metadata,
versioned POI narration and database-owned robot map assignments. A v1.5
database receives the v1.5→v1.6, v1.6→v1.7 and v1.7→v1.8 patches; a v1.6
database receives the v1.6→v1.7 and v1.7→v1.8 patches; a v1.7 database
receives the v1.7→v1.8 and v1.8→v1.9 patches; a v1.8 database receives the v1.8→v1.9 and v1.9→v1.10 patches; a v1.9 database receives the v1.9→v1.10 and v1.10→v1.11 patches; a v1.10 database receives the v1.10→v1.11 and v1.11→v1.12 patches; a v1.11 database receives the v1.11→v1.12 patch. The controlled path validates the prior snapshot marker and
complete structure, applies each additive patch, reapplies the existing
permission scripts, then runs read-only `--check-only`. A v1.12 database can use
the same path to reapply grants without DDL or data backfill. Do not run the
upgrade or regrant manually on EC2 or a shared database outside the controlled
workflow and verified-backup process.

Since 2026-10-29 Backend Deploy runs this schema step automatically
(`upgrade-db-schema-ec2.sh --if-needed`) before `deploy-ec2.sh`, under the
same host lock. It first runs the release DB tool's read-only `--check-only`
against the live database; when that passes it stops with no backup or change.
Only when the check rejects the database does it take the verified backup, run
the upgrade/regrant path above and check again; a failure stops the delivery
before the API changes. It skips a first deploy (no current release) and a
pending deployment recovery. `deploy-ec2.sh` itself still never changes the
schema or grants. The manual Backend Database Schema Upgrade workflow remains
for running the step on its own. A new schema version still needs its patch
and upgrade branch added to `upgrade-db.sh` before it can be applied.

Backend Verify uses a path classifier. Web/robot/digital-twin/AI-only commits do
not start backend verification, image builds or deployment. Backend verification
and candidate API image build/smoke run independently in parallel. The DB tool
image is rebuilt only when its SQL, bootstrap, Compose or Dockerfile inputs
change; otherwise a previously verified immutable artifact is reused. A release
manifest is created only after applicable gates pass and records the API
source/digest separately from the database tool source/digest/schema version.
Backend Deploy checks for that manifest before entering the production
environment, so backend docs-only or non-backend pushes do not deploy an API.

Baseline Backend Verify run `40643877772` measured about 5m48s for backend
verification, 1m55s for Docker cache portability, and 6m13s for image
publication/smoke; these stages were sequential. Post-change wall time is
pending actual cold and warm CI runs and will be reported from their timestamps.

PR → Backend Verify → merge main → private GHCR digests + release manifest →
automatic Backend Deploy on successful push/main Backend Verify → pinned OpenSSH → EC2 Docker Compose. SQL maintenance
remains a separate manual workflow. Both use `production` and shared concurrency.
Backend Deploy also supports manual selection for recovery and rollback. Automatic runs
skip superseded main commits; each deployment independently verifies the release and
operations revision. A successful CI run is not proof of healthy EC2 deployment.
One host has promotion downtime, no failover and no automatic database restore.

For the confirmed NETSDK1064 build failure, cache regression commands and release
acceptance steps, see `backend/docs/ci-build-cache.md`.

The PR-73 baseline had useful guards but required OIDC/SSM and fetched scripts
and Compose from unauthenticated GitHub raw URLs despite the private repository.
Both CD jobs invoked the manifest validator without checking out code. The
runbook assumed public packages and AWS instance-role/S3 access. These are source
findings, not observations of a production host. The owner's AWS limitations
were reported; no AWS account inspection was performed.

Preserved: backend verification/required CI SQL tests, locked restore and warnings
as errors; Docker smoke/restore tests; GHCR publishing, BuildKit caches, pinned
bases, revision labels, SBOM/provenance and exact-digest smoke tests; 90-day
immutable manifest; ownership/locking, schema guard, candidate and promoted HTTPS
readiness, interruption recovery, API rollback and separate SQL maintenance.
SBOM is inventory evidence, not a vulnerability scanner gate.

`backend/deploy/prepare-release.sh` requires successful **push/main** Backend
Verify runs for application and operations SHAs. It downloads that run's manifest,
validates digests, fetches the application's Compose through authenticated GitHub
Contents API and copies scripts from a clean operations checkout.
`backend/deploy/ssh-deploy.sh` transfers the bundle and invokes the existing host
engine through `backend/deploy/receive-release.sh`. Manual CLI and Actions share
all this logic. EC2 never clones the private repo or fetches GitHub raw source.

The authenticated preparer verifies run identity; the bundle is not a signed
attestation. Trusted operators/workflow maintainers and deploy credentials are
the execution boundary. Never expose the key to PR jobs. SSH avoids a new IAM
provider or VPN control plane; a PR runner on production would widen execution
access and consume scarce RAM. SSM can be reconsidered separately later.

## 2. GitHub and network prerequisites

Configure these outside Git in environment **production**:

| Kind | Name | Value |
|---|---|---|
| Variable | `DEPLOY_SSH_HOST` | Reachable EC2 DNS/IPv4, without URL/user/port |
| Variable | `DEPLOY_SSH_USER` | Dedicated account, e.g. campustour-deploy |
| Variable | `DEPLOY_SSH_PORT` | Optional; defaults to 22 |
| Variable | `BACKEND_HEALTH_URL` | Optional; public readiness URL, defaults to https://api.fptcampustour.cloud/health/ready |
| Secret | `DEPLOY_SSH_PRIVATE_KEY` | Dedicated unencrypted Ed25519 private key |
| Secret | `DEPLOY_SSH_KNOWN_HOSTS` | Verified complete known_hosts line; use [host]:port for non-default port |
| Built-in | `GITHUB_TOKEN` | Automatic job token with contents:read, actions:read, packages:read; no PAT secret |

Neither workflow needs AWS_DEPLOY_ROLE_ARN, AWS_REGION, EC2_INSTANCE_ID or
id-token:write. Do not delete AWS resources/old secrets without separate review.
Keep both GHCR packages private and grant this repository Actions read access.
Publishing retains its existing package-write job token.

The host receives a short-lived job token over encrypted SSH stdin for Docker
login, using root-only temporary config under `/run`, cleaned on EXIT/TERM/HUP.
Hard kill can leave `/run/campustour-registry.*`; remove the exact stale directory
only after confirming no delivery uses it. Reboot clears /run and the job token
expires independently. Root/Docker admins can read it while deployment runs.
Never trace commands or print Docker config. Reboot/certificate operations use
retained local images; missing private images need authenticated redelivery.

GitHub [private environments and reviewer support depend on plan](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
Required reviewers in private repos are not available on Free/Pro/Team under the
documented policy. Keep environment: production and verify actual Settings/plan
eligibility. Where supported, allow main only, require reviewers, prevent
self-review/bypass. If private environment secrets/restrictions are unavailable,
Actions deployment is blocked pending a supported arrangement; use the trusted
CLI. Do not silently move credentials to repository secrets. Manual dispatch is
not independent approval. Require PR review and backend verify/image smoke checks
in branch protection, checking actual enforcement; live rules were not audited.

Standard hosted runners have changing egress IPs; GitHub
[discourages broad runner-IP allowlists](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
This change never edits security groups. Choose explicitly:

- Restricted operator IP + manual CLI is simplest. Actions can use an operator
  maintained temporary /32 rule for the actual running job's observed egress,
  removed after the window. A later job can have a different address. A separate
  trusted stable-egress runner is another option if already available (adapt
  runs-on); never install a PR runner on production.
- If public TCP 22 is chosen for hosted runners, record the larger exposure:
  key-only auth, no root/password login, restricted deploy key, rotation,
  patched sshd, monitoring/rate limiting and closing access after the window.
  Changing port is not equivalent to an IP restriction.
- Automatic deploys run unattended, so a per-job temporary /32 rule cannot work:
  they need the SSH port reachable from hosted runners whenever main changes
  (the public-22 option above) or a stable-egress runner. Required environment
  reviewers, where available, make each automatic deploy wait for approval.
- Allow clients on 443; block 1433/8080/8443. EC2 needs outbound DNS/HTTPS to
  GHCR/MCR and backup storage. No GitHub raw source connectivity is required.

## 3. Prepare EC2, TLS and SSH

Use Ubuntu 24.04 x86_64, Docker Engine + Compose v2, Python 3, jq, curl,
OpenSSH client/server, openssl, flock and AWS CLI v2 (also for non-AWS storage).
Follow [Docker's Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/).
Keep Docker admin-only. No duplicate host SQL package/service or 1433 listener;
preserve/review existing host SQL data before an operator removes it.

```bash
sudo install -d -o root -g root -m 0755 /opt/campustour/releases
sudo install -d -o root -g root -m 0700 /etc/campustour/certs
sudo install -d -o root -g root -m 0700 /var/lib/campustour
sudo install -d -o 10001 -g 0 -m 0770 /var/lib/campustour/backups
```

Create root-owned 0600 `/etc/campustour/backend.env` and api.env from
`backend/.env.example` and `backend/deploy/api.env.example`; never commit filled
files. Generate separate SA/app/JWT secrets using openssl rand -hex 32; prefix
SQL passwords with Aa1! for complexity. App password allows letters/digits/!/_/-.
Set API_HOST, WEB_ORIGIN, API_ENV_FILE, SQL_BACKUP_DIR and managed TLS paths.
Do not publish rendered Compose/inspect environments.
Swagger UI stays off in Production unless api.env enables it with its own
credential; see `backend/docs/api-documentation.md`. api.env is read only when
the API container is created.

Install a browser-trusted matching certificate pair valid for >14 days:

```bash
sudo install -d -o root -g root -m 0755 /etc/campustour/certs/releases/initial
sudo install -o 1654 -g 1654 -m 0644 FULLCHAIN_PEM /etc/campustour/certs/releases/initial/fullchain.pem
sudo install -o 1654 -g 1654 -m 0600 PRIVATE_KEY_PEM /etc/campustour/certs/releases/initial/privkey.pem
sudo ln -s /etc/campustour/certs/releases/initial /etc/campustour/certs/active
```

TLS_CERT_PATH/TLS_KEY_PATH reference files under active. UID 1654 reads API keys;
UID 10001 writes SQL backups. Configure Certbot DNS-01 and its deploy hook:
`/usr/local/sbin/campustour-refresh-certificate "$RENEWED_LINEAGE/fullchain.pem" "$RENEWED_LINEAGE/privkey.pem"`.
It queues versioned pairs, validates key/host/expiry, locks activation and checks
recreated API readiness. A two-minute reconciliation timer retries, stopping
after three failed activations for operator review. Keep the previous pair.

Create a dedicated workstation key with ssh-keygen -t ed25519 -f campustour-deploy.
On EC2 via an existing administrator session:

```bash
sudo adduser --disabled-password --gecos '' campustour-deploy
sudo install -d -o campustour-deploy -g campustour-deploy -m 0700 /home/campustour-deploy/.ssh
sudoedit /home/campustour-deploy/.ssh/authorized_keys
sudo chmod 0600 /home/campustour-deploy/.ssh/authorized_keys
sudo chown campustour-deploy:campustour-deploy /home/campustour-deploy/.ssh/authorized_keys
sudo visudo -f /etc/sudoers.d/campustour-deploy
```

Use `restrict ssh-ed25519 PUBLIC_KEY COMMENT` in authorized_keys, disabling
PTY/agent/port forwarding while allowing commands/SFTP. Sudoers:

```text
campustour-deploy ALL=(root) NOPASSWD: /usr/bin/true, /usr/bin/timeout
```

Validate with sudo visudo -cf /etc/sudoers.d/campustour-deploy. This identity is
**root-equivalent**: timeout can run a supplied root shell and the bundle installs
root services. It is not a least-privilege sandbox. Use separate admin keys;
do not add deploy to Docker group, also root-equivalent. A forced-command/root-owned
receiver adds a bootstrap/update protocol outside this chosen small-team model.

Configure sshd PasswordAuthentication no, KbdInteractiveAuthentication no,
PermitRootLogin no. Validate sshd -t and effective settings including cloud-init
drop-ins; keep the current admin session open while reloading/testing another.
Verify passwordless sudo. Obtain the host key via trusted admin/EC2 console:
sudo cat /etc/ssh/ssh_host_ed25519_key.pub and sudo ssh-keygen -lf on that file.
Construct known_hosts with the exact configured host and verified key.
ssh-keyscan alone is not authentication. Unexpected pins must fail until verified;
never use StrictHostKeyChecking=no or accept-new for delivery.

**Demo/backup limitation:** The initial deployment to an empty EC2 can proceed
without backup configuration, but every later deployment runs a verified pre-deploy
backup and is blocked while `/etc/campustour/backup.env` is missing. Automatic
triggers do not bypass this guard. Configure off-host storage (Section 4), or for
a demo host explicitly choose `BACKUP_MODE=local` (Section 4.1) and accept its
limits. Do not delete volumes, owner markers, or the backup validation as a workaround.

## 4. Off-host backup independent of AWS IAM

Use root-owned 0600 `/etc/campustour/backup.env`. Existing AWS S3 with an already
available limited instance profile can still use only BACKUP_S3_URI. For the
current account, private external S3-compatible storage such as Backblaze B2
requires no AWS IAM feature. Review provider cost/region/data policy before
provisioning; no external account is created by this change. B2 documents
[the same AWS CLI AES256 upload](https://www.backblaze.com/docs/cloud-storage-server-side-encryption-with-the-cli).

```text
BACKUP_S3_URI=s3://your-private-bucket/campustour/sql
BACKUP_S3_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com
BACKUP_S3_PROFILE=campustour-backup
```

The endpoint is an example; use the bucket's real endpoint/region. As root,
aws configure --profile campustour-backup interactively with provider key ID/secret
and region. Protect `/root/.aws/credentials` and config with 0600, parent 0700.
Limit the application key to the bucket/prefix with read/write/list/multipart
capabilities required by CLI, no delete/bucket administration. Configure lifecycle
retention (e.g. 30 daily versions) and Object Lock where available separately.
Keep recovery credentials plus app/JWT/invitation/TLS secrets in an independent
password manager. EC2 uploader must not be the sole recovery identity. No backup
secret belongs in GitHub; an EBS staging directory alone is not off-host backup.

Backups retain WITH CHECKSUM + RESTORE VERIFYONLY, AES256 encryption, object
size/SHA metadata checks and full downloaded-byte SHA verification. All object
calls use the endpoint/profile; HTTP/credential-bearing URLs are rejected.
Test the exact provider operations; arbitrary S3-compatible storage is not
assumed compatible. Failure blocks deployment and retains local .bak. Download
verification doubles transfer bytes but needs no second local backup copy.
Daily 02:00 UTC backup and five-minute checks are retained; checks fail if the
verified backup is >26 hours old. Systemd failures do not notify by themselves:
configure external alerts for backup/check, disk, OOM, TLS and provider retention.

### 4.1 Demo hosts: explicit local-only backup

Without object storage, a root-owned `/etc/campustour/backup.env` (mode 0600) may
contain only:

```text
BACKUP_MODE=local
BACKUP_LOCAL_RETAIN=7
```

Each pre-deploy and daily backup still runs `BACKUP ... WITH CHECKSUM` and
`RESTORE VERIFYONLY`, records size/SHA-256 in `backup-last-success` as
`local:<path>`, keeps the newest `BACKUP_LOCAL_RETAIN` (1–30) files named
`SmartCampusTourV11-<UTC>.bak` in `/var/lib/campustour/backups` and deletes only
older files with that exact name. No AWS CLI or credentials are needed. The
choice lives on the host, not in GitHub, so a workflow or PR cannot downgrade it.

This protects against a bad release, a failed schema guard or an operator mistake
inside SQL Server. It does **not** survive termination of the instance, loss or
corruption of the EBS volume, or anyone with root on the host; the backup
directory is also mounted into the SQL container. Deploy logs and
`campustour-check` print a WARN while it is active. Copy a backup off the host
before risky manual work (`scp` from `/var/lib/campustour/backups`), and test a
restore into a disposable database at least once.

Low-effort upgrade without changing this code: an AWS Data Lifecycle Manager
policy taking daily EBS snapshots of the instance volume adds crash-consistent,
off-instance copies. For production, set `BACKUP_MODE=s3` (or remove the line)
with the Section 4 settings; nothing else changes.

## 5. Deploy, retry and rollback

After independent review/setup, a successful **push/main** Backend Verify
(including image publication) automatically triggers Backend Deploy for that exact
revision. Superseded main revisions are skipped. For manual recovery/rollback,
dispatch Backend Deploy on main with a full SHA from a successful main Backend
Verify run. Both release and operations revisions must have successful main
verification. Failed CI never deploys; deployment failures remain visible in the
Backend Deploy workflow and must be addressed before declaring the release live. Missing/expired artifacts, unavailable
images, bad digests or mismatched image revision labels fail closed. Never
fabricate a manifest to recover a release whose 90-day artifact has expired.

Automatic deploys share the `backend-production-deploy` concurrency group with
manual deploys and SQL maintenance, so runs never overlap. GitHub keeps at most
one pending run per group: a newer queued run replaces an older pending one,
including a pending manual dispatch. When a deploy starts it skips its release
unless that SHA is still the head of main, so an older run finishing late can
never roll the API back. If the newer head then fails CI, nothing newer is
deployed; dispatch the last good SHA manually if needed. Backend Verify detects
backend-owned paths: a web-only or unrelated push does not build/publish a backend
release, and deploy preflight skips before entering the production environment
when there is no verified release artifact. An actual backend release still has
a brief API restart plus a pre-deploy backup; avoid releasing during a live tour. After the
SSH step, the workflow polls `vars.BACKEND_HEALTH_URL` (default
`https://api.fptcampustour.cloud/health/ready`) from the internet; a failure
there means DNS, security group or certificate, not a rollback.

The receiver wraps installer+deploy in a delivery lock and a 40-minute timeout
with 60-second TERM grace, alongside existing host operation locks. Host tools
are versioned/hashed separately from application rollback; installation enables
stack, backup/check and certificate units/timers. Preflight rejects unsupported
OS/architecture, duplicate SQL, <3500 MiB visible RAM, <512 MiB available memory,
<12 GiB free disk, missing protected config/TLS/staging or unknown resources.

First install persists owner/pinned-SQL markers before Docker resources; retry
accepts only owned leftovers and preserves data. The initializer creates the
reviewed v1.1 snapshot only in an empty DB and rejects unmarked/different schemas.
It never migrates/resets data. Subsequent releases verify live SQL configuration,
require off-host backup, schema guard and private candidate API readiness before
recreating only API with --no-deps. Public-certificate HTTPS/SQL readiness must
then pass. Failure before promotion leaves the current API; later failure rolls
back API only if the previous schema guard accepts. Compose up is not readiness.
Liveness is health/live (204), readiness health/ready tests SQL (200/generic 503).
Docker does not restart a running process solely because health is unhealthy.

After initial install, run seed-admin once as a trusted host admin. Read/export
INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_PASSWORD (read -s), INITIAL_ADMIN_FULL_NAME
without shell history; use sudo --preserve-env for only those names with:

```bash
docker compose --project-name campustour --env-file /etc/campustour/backend.env \
  --env-file /opt/campustour/current/release.env -f /opt/campustour/current/docker-compose.yml \
  --profile tools run --rm --no-deps seed-admin
```

Unset the variables immediately. Seeder never runs on API startup or resets an
existing password. Run sudo /usr/local/sbin/campustour-backup then campustour-check.
A truly empty first install has nothing to back up; that skip does not prove
storage works. Require this initial upload and a real isolated restore drill.

Manual CLI uses the same logic on Linux/WSL, with gh authenticated on a trusted
workstation and a clean checkout of a verified main operations commit:

```bash
OPS_SHA=$(git rev-parse HEAD)
RELEASE_SHA=FULL_40_CHARACTER_VERIFIED_APPLICATION_SHA
BUNDLE=$(mktemp -d)/bundle
bash backend/deploy/prepare-release.sh "$RELEASE_SHA" "$OPS_SHA" "$BUNDLE"
export DEPLOY_SSH_HOST=your-ec2-dns DEPLOY_SSH_USER=campustour-deploy
export DEPLOY_SSH_KEY_FILE=/secure/path/campustour-deploy
export DEPLOY_SSH_KNOWN_HOSTS_FILE=/secure/path/campustour-known-hosts
export GHCR_USER=your-github-login
export GHCR_TOKEN=$(gh auth token)
bash backend/deploy/ssh-deploy.sh "$BUNDLE" application
unset GHCR_TOKEN
```

Key/known_hosts files need mode 0600. A manual workstation token can be a PAT
with read:packages retained only on the workstation; EC2 uses temporary Docker
config for this invocation. Prefer Actions' ephemeral token when reachable.
Do not store a GitHub PAT on EC2.

For API rollback select an older successful SHA via the same workflow while
manifest/digests exist. Fresh backup/schema guards still apply; SQL data is never
rewound. Keep current/previous images and protect their GHCR digests from deletion.
Already active SHA is rejected: inspect readiness/current state after an ambiguous
successful run, rather than forcing redeploy. Normal API deploy retains SQL pin.

SQL changes require Backend SQL Maintenance or CLI mode sql-maintenance in an
approved window. Select a verified release different from current application
SHA (the existing engine refuses overwriting its active directory). Allowed SQL
settings: pinned image, internal memory 512–2048 MiB, container 1536–2560 MiB with
>=256 MiB margin, CPU 0.5–1.5. Credentials/storage/network/security remain fixed.
An engine upgrade can change database files; failure after that boundary preserves
pending state for operator review instead of unsafe downgrade.

Disconnect is not proof of rollback. The receiver writes all output to root-only
`/var/log/campustour/delivery.log` (rotated once at 10 MiB) and ignores a vanished
SSH reader, so cancelling the workflow or losing the connection no longer stops
the host deployment mid-step; it continues to success or its own rollback. A
retry while it runs fails fast on the delivery lock. Inspect
`sudo tail -n 100 /var/log/campustour/delivery.log`, `sudo campustour-check`,
host processes/locks, current link and SQL health before retry. TERM attempts cleanup; hard kill/power loss
uses existing pending-marker recovery. Application interruption restores the
previous compatible API before continuing; interrupted SQL engine maintenance
requires recovery review. Never delete a marker to make deployment pass. Remove
stale non-secret staging by exact path only after checking no process uses it.

## 6. Persistence, resource limits and recovery

Keep project campustour and named volume campustour_sqlserver-data stable; SQL
has no published port. Never use down -v, volume prune, system prune --all or data
deletion as recovery. Retain current/rollback images, release records, config and
host owner/SQL-pin state.

The candidate 4 GiB profile caps SQL at 2560 MiB (internal 2048), API 512,
initializer 192, optional seed 256. SQL + live API + candidate total 3584 MiB
before host overhead; caps are not measured usage. Candidate start requires
768 MiB MemAvailable and aborts below 512 during startup; OOM is still possible.
Measure cold SQL/bootstrap, JIT, overlapping rollout, backup and restore. Express
limits data to 10 GiB, with logs/backups additional. A 40 GiB disk can exhaust
backup headroom first: backup requires allocated data+log size +1 GiB free,
separate from the 12 GiB deployment reserve. Swap is emergency buffering, not
SQL capacity. Monitor vmstat si/so, cgroups, docker stats, CPU throttling, free
disk, restarts/OOM. Resize to 8 GiB if peak available RAM <512 MiB, persistent
swapping/restarts or workload failure occurs. Never build images on EC2.

Restore on a separate recovery machine with independent read credentials:

1. Download the exact recorded object with aws --endpoint-url ACTUAL_ENDPOINT
   --profile RECOVERY_PROFILE s3 cp s3://BUCKET/KEY ./recovery.bak (omit endpoint
   for AWS). Compare size/SHA with evidence retained separately from EC2.
2. Use an isolated pinned SQL 2022 engine, new project/volume, no public SQL
   port. Run RESTORE VERIFYONLY WITH CHECKSUM and FILELISTONLY to find actual
   logical data/log names. Restore to a new DB using reviewed MOVE paths:

   ```sql
   RESTORE DATABASE [SmartCampusTourRecovery] FROM DISK=N'BACKUP_PATH'
   WITH MOVE N'LOGICAL_DATA' TO N'NEW_DATA_PATH',
        MOVE N'LOGICAL_LOG' TO N'NEW_LOG_PATH', RECOVERY;
   DBCC CHECKDB ([SmartCampusTourRecovery]) WITH NO_INFOMSGS;
   ```

3. Validate records, recreate/rebind runtime login/user and test a known-good
   API/schema guard against restored data. SQL backup omits server logins,
   TLS/JWT/invitation keys, DNS and host markers; recover them independently.
4. Record elapsed RTO and recoverable data age. Daily full backups give nominal
   <=24-hour RPO only when successful; no point-in-time recovery/HA exists.
   Approve cutover separately; never auto-restore or WITH REPLACE on live data.

## 7. Diagnosis and acceptance before real deployment

| Failure | First checks |
|---|---|
| Missing verified release | push/main SHA, entire workflow success, artifact retention; no bypass |
| SSH host/auth/timeout | Exact host/port/pin/key, SG/sshd/sudo; never disable host verification |
| Private GHCR pull | Package Actions access, packages:read, retained exact digest |
| Preflight/readiness | OS/tools/modes/TLS/RAM/disk, current API, SQL health/schema/db-init logs |
| Backup | Endpoint/profile, staging disk/retained .bak, off-host object/hash |
| Pending SQL upgrade | Preserve state/data; review engine files/backup and isolated restore |

Read-only diagnosis as administrator:

```bash
sudo /usr/local/sbin/campustour-check
sudo systemctl status campustour-stack.service campustour-backup.timer campustour-check.timer
sudo journalctl -u campustour-backup.service --since '2 days ago'
sudo docker compose --project-name campustour --env-file /etc/campustour/backend.env \
  --env-file /opt/campustour/current/release.env -f /opt/campustour/current/docker-compose.yml ps --all
```

Before production: independently review the diff; verify environment/branch
protection eligibility, package access, key/pin/sudo/network; prepare protected
config, trusted TLS/DNS and backup/recovery identities. Rehearse initial deploy,
bad image/candidate, rollback, interrupted retry, SQL persistence, reboot and TLS
renewal on a non-production host. Measure RAM/disk/CPU/swap under cold start,
seed, rollout, traffic, backup/restore; require no OOM/restart, >=512 MiB available
RAM and staging reserve. Validate external TLS/live/ready, login/refresh/logout,
browser CORS/cookies and blocked SQL ports. Perform the first verified off-host
backup and actual restore/CHECKDB/record checks; test external alerts/retention.
Keep evidence with both SHAs, digests and measured RPO/RTO.

Failure-injection tests are not EC2 evidence. Docker smoke covers disposable
bootstrap/seed idempotency, HTTPS/login/readiness failure/recovery, SQL permissions,
backup/restore/CHECKDB, persistence and unmarked-DB refusal. It does not prove
public SSH/SG, EC2 private GHCR token pulls, provider retention/behavior, public
DNS/TLS, alerts, real 4 GiB capacity or disaster cutover. Do not claim
production-ready until these real-host acceptance results exist.
