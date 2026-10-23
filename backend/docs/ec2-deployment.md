# Backend deployment to one EC2 host

This runbook describes the repository's single-host production path. It uses
GitHub Actions to verify/build immutable images, GitHub Container Registry
(GHCR) to store them, and GitHub OIDC plus AWS Systems Manager (SSM) Run
Command to deploy them. EC2 runs Docker Compose with the API and SQL Server;
SQL has no host-published port. Kestrel terminates HTTPS directly on host port
443. The design has deployment downtime and no failover.

The scripts and workflows are implemented, but this repository has not been
connected to a real AWS account or production GitHub environment. Do not call a
release production-ready until the real-host and backup acceptance checks in
Section 8 pass.

## 1. Architecture and release gates

`Backend Verify` runs for every PR and push to `main`/`develop`. It pins .NET
SDK 10.0.402, builds with warnings as errors, runs unit and non-SQL integration
tests, and requires the SQL integration suite against a disposable SQL Server.
On PRs, a second job builds the API and database-initializer images and runs the
disposable Docker Compose smoke/restore test. On `main`, image publication runs
only after backend verification succeeds. It publishes the API and initializer
to GHCR, resolves the .NET SDK, ASP.NET runtime, and SQL Server base tags to
digests, builds from those digests, validates revision/base labels, smoke-tests
the exact published image digests, then stores image and base references in a
90-day release-manifest artifact. Buildx GitHub cache scopes are separate for
API and initializer; they speed builds but are not release identity. NuGet
lockfiles plus `--locked-mode` validate package content, and restore blocks
known high/critical NuGet advisories (NU1903/NU1904). Image SBOM/provenance are
published, but there is no operating-system/base-image CVE scanner gate yet;
SBOM is inventory evidence, not proof that the image is vulnerability-free.
PR jobs have no GHCR write permission, and deployment pulls only the digests in
the successful manifest. Runtime package installation of `curl` still uses
Ubuntu's live package repository, so a future rebuild from the same source may
produce a different image digest; the deployed artifact remains pinned and
traceable.

Application deployment is a manual `workflow_dispatch` on `main`, with a
40-character successful main commit SHA. Configure the GitHub `production`
environment to require a human reviewer. The deploy job retrieves the release
manifest from that exact successful workflow run. It runs the deployment code
and installs the host operations bundle from the current, separately verified
operations commit; it downloads only the Compose file from the selected
application commit. The host records both revisions. Selecting an older
application SHA therefore does not restore older deployment or backup safety
scripts.

For an existing release, deployment verifies the live SQL container, compares
the canonical SQL service, volume, and database-network configuration, takes a
mandatory verified pre-deploy backup, then runs the candidate initializer with
`--no-deps` and starts a private candidate API container without publishing the
production port. A rejected schema or readiness gate leaves the current API
container in place. Promotion recreates only the API with `--no-deps`; Compose
cannot reconcile SQL or the initializer during that step. A failed promotion
attempts an API-only rollback after the previous initializer confirms the
current schema is still compatible.

The ordinary application workflow retains the SQL image digest already stored
in host state and the active release. A later upstream tag digest does not
upgrade SQL or block an API release. SQL engine and resource changes run only
through the separate `Backend SQL Maintenance` workflow, which uses the
selected verified release digest and requires a verified off-host backup.
Maintenance permits a pinned SQL image change, `MSSQL_MEMORY_LIMIT_MB`, the
container memory limit, and the SQL CPU limit. On the 4 GiB profile, the
validator allows SQL memory from 512 to 2048 MiB, a container limit from 1536
to 2560 MiB, at least 256 MiB between those limits, and 0.5 to 1.5 CPUs.
Credentials, data volume, network, exposed ports, security options, and other
SQL service settings remain fixed; credential rotation needs a separate
reviewed procedure. A SQL image upgrade or resource update can interrupt
service and an engine upgrade can alter database files. SQL image/data-file
downgrade is not automatic. The recovery plan restores the backup to a
separate SQL instance/volume and requires an operator cutover after validation.

The deploy path does not use SSH, GitHub repository secrets for AWS keys, or
build tools on EC2. SSM is preferred over SSH because it avoids opening inbound
22 for automation and uses short-lived OIDC credentials. SSH can remain a
separate administrator access method if needed; do not expose SQL port 1433.

## 2. AWS and GitHub prerequisites

Complete these settings outside the repository before dispatching a deploy:

1. Publish packages `ghcr.io/30sativa/smart-campus-tour/backend` and
   `.../backend-db-init`, associate them with this repository, and make them
   public. EC2 then pulls without a long-lived registry password. Protect
   package write permissions to the repository's Actions workflow.
2. Create a GitHub environment named `production`, require reviewer approval,
   and prevent unreviewed deployment branches. Add repository/environment
   variables `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, and `EC2_INSTANCE_ID`.
3. Create an AWS IAM role with GitHub OIDC trust restricted to audience
   `sts.amazonaws.com` and subject
   `repo:30Sativa/smart-campus-tour:environment:production`. Permit that role
   to send `AWS-RunShellScript` only to the intended EC2 instance and read the
   resulting command invocation. Use the narrowest resource scope supported by
   the SSM actions. No AWS access key belongs in GitHub secrets.
4. Attach an EC2 instance profile that makes the host an SSM managed node and
   grants `s3:PutObject`/`s3:GetObject` only to the backup bucket prefix. The
   host needs outbound HTTPS/DNS access to SSM, GHCR, GitHub raw content, and
   S3, or the matching VPC endpoints. Choose private networking where
   available. Do not grant the instance profile broad account access.
5. Use a private S3 bucket with versioning, Block Public Access, and a lifecycle
   retention policy (for example 30 days of daily backups). The backup script
   requests SSE-S3 (`AES256`), stores the local SHA-256 as object metadata, checks
   the uploaded size, downloads the object as a stream, and compares its
   SHA-256 with the local backup before recording success. This doubles S3
   transfer bytes for each verified backup but uses no additional staging disk.
   Retention and restore tests are separate controls.
6. Use an Ubuntu Server 24.04 x86_64 EC2 instance. Inbound security group rules
   should allow TCP 443 from intended clients; do not allow 1433, 8080, or 8443.
   SSM needs outbound connectivity. Termius SSH access is not needed by the
   deployment workflow.

Configure the `Protect main` ruleset outside this repo: require pull requests,
at least one approval, dismiss stale approvals after new commits, require the
`Verify backend` and `Build and smoke-test backend images` checks, and disable
administrative bypass unless there is a documented break-glass owner. Those
check names remain present because backend CI has no path filters. As checked
on 2026-10-23, the active ruleset exists but has no required-status-check rule;
add both check names in GitHub Settings → Rules → Rulesets → `Protect main` →
Edit rules → Require status checks to pass. This repository does not change
branch protection automatically.

The chosen instance `c7i-flex.large` is 2 vCPU / 4 GiB and `c7i-flex.xlarge` is
4 vCPU / 8 GiB. The 4 GiB configuration below is a candidate that must pass
measured acceptance; use 8 GiB if the 4 GiB host has OOM events, less than
512 MiB `MemAvailable` during cold start/seed/restore/soak, or sustained memory
pressure. The 8 GiB option increases cost but gives SQL and Ubuntu more
operating headroom. C7i-flex provides a 40% baseline CPU level and can exceed
that level up to 100% for 95% of a 24-hour window; sustained high utilization
can reduce the available burst. Record CPU utilization and container throttling
alongside memory. If startup, restore, or representative traffic is CPU-bound,
consider a regular C7i size or a larger Flex size. See AWS's
[C7i-flex sizes and performance](https://aws.amazon.com/ec2/instance-types/c7i/).

## 3. Host preparation and secrets

Install Docker Engine and the Compose v2 plugin using the official
[Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Also
install AWS CLI v2, `jq`, `curl`, `openssl`, and `flock`. Keep Docker access
restricted to administrators. Do not install SQL Server on the Ubuntu host;
the Compose SQL container is the only SQL service. Before first deployment,
verify that the `mssql-server` package is absent, its service is inactive, and
host port 1433 is not listening. If SQL is already installed, preserve and
review its data before an operator removes it.

Create persistent paths and grant the SQL container access to the backup
staging directory (the SQL Server Linux image runs as UID 10001):

```bash
sudo install -d -o root -g root -m 0755 /opt/campustour/releases
sudo install -d -o root -g root -m 0700 /etc/campustour/certs
sudo install -d -o root -g root -m 0700 /var/lib/campustour
sudo install -d -o 10001 -g 0 -m 0770 /var/lib/campustour/backups
```

Create `/etc/campustour/backend.env` from `backend/.env.example` and
`/etc/campustour/api.env` from `backend/deploy/api.env.example` using an editor
on the host. Never copy filled files into the repository. Set ownership to
`root:root`, mode `0600`; set the config directory to `0700`. Generate separate
values for `SQL_SA_PASSWORD`, `SQL_APP_PASSWORD`, and `JWT_SIGNING_KEY`, for
example:

```bash
openssl rand -hex 32
```

For SQL passwords, prefix the random hex with `Aa1!` to satisfy SQL complexity.
The app password accepts only letters, digits, `!`, `_`, and `-`. Configure
`API_HOST`, `WEB_ORIGIN`, `TLS_CERT_PATH`, `TLS_KEY_PATH`, `SQL_BACKUP_DIR`,
and an absolute `API_ENV_FILE=/etc/campustour/api.env`. The first verified
release pins the selected SQL image digest in `/var/lib/campustour/sqlserver-image`;
ordinary application releases preserve that engine pin. Set
`TLS_CERT_PATH=/etc/campustour/certs/active/fullchain.pem`
and `TLS_KEY_PATH=/etc/campustour/certs/active/privkey.pem`; the deploy and
renewal scripts require these exact managed paths.

Configure `/etc/campustour/backup.env` with one non-secret setting:

```text
BACKUP_S3_URI=s3://your-private-bucket/campustour/sql
```

It must be owned by root with mode `0600`. The backup process uses the EC2
instance profile, not static AWS keys. Docker administrators can inspect
container environment and are part of the trusted host-admin boundary. Never
paste `docker compose config` or `docker inspect` output into a public issue.

Install the initial browser-trusted certificate under a versioned directory;
the active symlink lets later renewal switch the certificate and key together:

```bash
sudo install -d -o root -g root -m 0755 /etc/campustour/certs/releases
sudo install -d -o root -g root -m 0755 /etc/campustour/certs/releases/initial
sudo install -o 1654 -g 1654 -m 0644 FULLCHAIN_PEM /etc/campustour/certs/releases/initial/fullchain.pem
sudo install -o 1654 -g 1654 -m 0600 PRIVATE_KEY_PEM /etc/campustour/certs/releases/initial/privkey.pem
sudo ln -s /etc/campustour/certs/releases/initial /etc/campustour/certs/active
```

The API container runs as UID 1654, so the private key is readable by that UID
and not by other users. The deployment rejects a certificate that expires
within 14 days. Configure your DNS provider's Certbot DNS-01 plugin and use
this Certbot deploy hook after renewal:

```text
/usr/local/sbin/campustour-refresh-certificate "$RENEWED_LINEAGE/fullchain.pem" "$RENEWED_LINEAGE/privkey.pem"
```

The hook stores each renewed pair in a root-only queue before trying the
operation lock. If deployment or backup holds the lock, the hook exits with the
pair retained; `campustour-certificate-reconcile.timer` retries every two
minutes. Activation validates hostname, expiry, and key match, switches an
atomic versioned certificate pair, recreates only the API, and checks HTTPS
readiness. On failure it restores the prior pair and API, then stops automatic
activation after three failed attempts for operator review. Keep active and
previous certificate releases until a later cleanup review. Do not put private
keys in Docker images or Git.

## 4. Install host operations and perform the first deploy

The deployment workflow installs an immutable, versioned operations bundle
from the current verified `main` commit before running a release. The bundle
contains the backup, health-check, stack-start, certificate-reconciliation
scripts, and systemd units. Stable host command links point to the selected
bundle; `/var/lib/campustour/operations-tools-release` records its commit. The
application release and its Compose file remain separately versioned. The
workflow enables the stack service and backup, health-check, and certificate
reconciliation timers. Do not copy operational scripts from an older app
release over the current bundle.

After GitHub/AWS prerequisites are configured and reviewed, dispatch `Backend
Deploy` on branch `main` with the SHA shown by a successful `Backend Verify`
run. The workflow is manual by design. Both the selected application release
and current operations commit must have successful verification runs, and the
release manifest must still be retained. The host rejects an unsupported
Ubuntu/architecture, a host SQL service/1433 listener, fewer than 3500 MiB
visible RAM, less than 512 MiB available memory, less than 12 GiB free disk,
missing TLS/config/backup paths, unknown Docker resources, or SQL service
configuration drift.

For the first release, the deployment writes a persistent random owner marker
before creating Docker resources. Compose applies that marker to its containers,
networks, and SQL volume. The initializer creates the reviewed v1.1 schema only
when the database is empty and records its canonical hash; it does not migrate,
drop, reset, or adopt an unmarked database. A failed first attempt can be retried
when every leftover resource carries the saved owner marker; the SQL volume is
preserved and initialization is safely re-evaluated. Resources without the
marker remain unowned and require a reviewed adoption procedure. Never remove
the marker or volume to make retry pass.

After the first release, create the initial Admin through the one-shot seed
service. Run as a trusted host administrator, read the password without echo,
then pass the exported values to Compose; unset them immediately. The seeder
does not run on normal API startup and will not reset an existing password.
Confirm `https://API_HOST/health/live` returns 204 and
`https://API_HOST/health/ready` returns 200 with the valid public certificate.
The API runs with no SDK and no production OpenAPI/SimulationPreview exposure.

## 5. What the host runs and resource limits

Compose runs SQL Server 2022 Express, a one-shot initializer, and the API.
SQL's network is internal and has no published port. The API connects over
that network and also has outbound access for configured invitation delivery.
There is no duplicate host SQL service. The persistent named volume
`campustour_sqlserver-data` stores SQL data/log files; the bind-mounted backup
directory is staging only. Keep Compose project name `campustour` stable.
Never run `docker compose down -v`, `docker volume prune`, or delete the SQL
volume as a cleanup step.

The current 4 GiB candidate sets SQL Server's internal memory limit to 2048 MiB
and container limit to 2560 MiB; API container to 512 MiB; initializer to 192
MiB; and optional seed service to 256 MiB. In steady state, SQL + API container
limits total 3072 MiB. During seed this can reach 3328 MiB; during bootstrap
SQL + initializer can reach 2752 MiB. These are hard caps, not measured usage.
During an existing-release rollout, SQL + the serving API + the private API
candidate can reach 3584 MiB by container limits. The deployment requires at
least 768 MiB `MemAvailable` before starting that candidate and aborts if the
host falls below 512 MiB while it starts; these checks reduce risk but cannot
guarantee the kernel will not OOM-kill a process. Include this overlapping API
phase in the EC2 acceptance measurements.
The host nominally has 4096 MiB, but usable memory is lower after kernel,
Docker, filesystem cache, and host services. SQL Server needs at least 2 GiB to
start, Express buffer pool is capped at about 1410 MiB, and the rest of SQL
process memory is additional. Cold SQL startup, schema transaction, SQL health
checks, backups, API JIT, and restore all have different peaks. Check
`MemAvailable`, cgroup limits, `docker stats`, OOM state, and swap-in under each
phase before accepting this instance size. Set limits only from observed
headroom; do not raise the SQL limit to its container maximum without a host
memory budget.

Treat swap as an emergency buffer, not usable SQL capacity. If the Ubuntu image
has no swap, a 1 GiB host swapfile with low swappiness can give the kernel a
short window to preserve host services during a transient peak; keep the
`vm.swappiness=10` and keep the 12 GiB deployment free-space reserve after
creating it. Monitor `vmstat 1`
(`si`/`so`) and reject the 4 GiB profile if swap-in/out continues under normal
traffic or restore. A swapfile does not compensate for an undersized memory
budget.

The 40 GiB gp3 volume holds Ubuntu, Docker layers, SQL data/log, logs, and a
temporary full backup on the same filesystem. The deployment keeps at least 12
GiB free before pulls; the backup script separately requires allocated database
size plus 1 GiB free for staging. A 10 GiB Express data database can therefore
outgrow the safe backup headroom on a 40 GiB disk. Monitor actual disk use and
expand EBS before that point. Keep SQL data below an operational alert threshold
such as 7 GiB and verify free staging space after every restore drill. SQL
Express enforces the documented 10 GiB database data limit.

Keep the current and previous release records and rollback images during the
agreed rollback window. The host does not prune old images automatically. After
that window, review exact release SHAs and image digests before removing stale
release files or images; confirm that current and rollback images are retained
or can be pulled from GHCR. Never use `docker system prune --all`, volume prune,
or an unreviewed cleanup command as routine maintenance.

## 6. Deployment, health and recovery behavior

Each release uses image digests, not `latest` tags. Application deployment,
SQL maintenance, backup, and certificate activation coordinate through
`/run/lock/campustour-operation.lock`; deployment and maintenance take it
exclusively, while scheduled backups take it shared and serialize with a
separate backup lock. Pre-deploy backup inherits the deployment lock instead
of reacquiring it. A scheduled backup never starts or recreates SQL: it fails
clearly when the existing container is not healthy. `flock` releases locks on
process exit. GitHub Actions also prevents concurrent production workflows.

Before API promotion, the deployment compares the live and candidate SQL
service, named-volume, and database-network definitions, checks the current
SQL container's Compose config hash, runs the candidate initializer with
`--no-deps`, and waits for a private candidate API to pass Docker and HTTPS
database readiness. It recreates only the API after these gates pass. The
initializer accepts only the existing reviewed v1.1 snapshot and does not run
EF migrations. A future schema change needs a separately reviewed
expand/contract migration and restore plan.

The host stores the last accepted SQL Compose config hash and a redacted
maintenance fingerprint under `/var/lib/campustour`. Ordinary application
deployments require the active hash and SQL service settings to match that
baseline. SQL maintenance compares all non-tunable service settings with that
baseline, verifies the current container credentials still match the requested
configuration, takes the required backup, and then recreates only the SQL
service if its pinned image or approved limits changed. The named SQL data
volume is never removed or automatically restored. On an older host without a
baseline, a maintenance run can initialize it only when the running SQL
container still matches the active Compose configuration; if it does not,
first deploy the current release without changing SQL settings, inspect the
host state, and retry maintenance after that baseline is recorded.

`GET /health/live` is a process liveness check (204). `GET /health/ready` tests
SQL connectivity with a three-second timeout (200 when connected, generic 503
otherwise). Docker restarts containers after process exit/reboot according to
their restart policy, but does not restart an unhealthy process solely because
the health state is `unhealthy`. The API Docker healthcheck uses loopback TLS;
the host deployment probe validates the configured certificate and SQL-ready
route. Neither endpoint is an end-to-end business workflow test.

On first deployment the host writes its owner marker and SQL digest before
creating Docker resources. If startup or bootstrap fails, the retry accepts
only resources carrying that same owner marker; it preserves the SQL volume and
re-evaluates the initializer without resetting data. A resource without the
marker remains foreign and blocks deployment. If a later API candidate fails a
schema or readiness gate, the old API stays in place. A failure after API
promotion attempts rollback only after the previous initializer confirms the
current database is compatible. Database restore is never automatic.

Every existing-release deployment must create a local checksummed backup,
pass `RESTORE VERIFYONLY`, upload to S3, verify object size and SHA-256 by
streaming the uploaded object back, and only then proceed. The streaming check
uses no extra disk but doubles transfer bytes. The local staged copy is removed
only after verification. A failed backup blocks deployment and preserves the
local backup for diagnosis.

Before each scheduled backup, free disk must be at least the allocated SQL
database data+log size plus 1 GiB. The daily 02:00 UTC timer records a local
success marker only after `BACKUP ... WITH CHECKSUM`, `RESTORE VERIFYONLY`, S3
upload, size, and streamed SHA-256 confirmation. Configure S3 lifecycle retention separately. `campustour-check`
runs every five minutes and fails when the last verified backup is older than
26 hours; systemd records failure but does not notify anyone by itself. Add a
CloudWatch/SNS or equivalent alert for failed backup/check services, low disk,
low memory, OOM, and certificate expiry.

For an emergency API rollback, dispatch the older successful SHA while its
manifest artifact is still available. The workflow takes a fresh backup before
replacing an existing release and still uses the current operations bundle.
An upstream SQL tag changing does not affect normal API deployment: the active
SQL digest stays pinned in host state. Use `Backend SQL Maintenance` during an
approved window to apply a different manifest digest. The script backs up,
checks application/schema readiness against the existing SQL engine, then
changes the SQL image or approved memory/CPU limits and rechecks readiness
before API promotion. SQL Server may upgrade database files when it starts;
after this boundary the script preserves a pending marker and requires operator
review instead of attempting an unsafe image downgrade. `campustour-check`
reports any `deployment.pending` marker and fails without removing it or
initiating rollback. Confirm SQL health, the active release, initializer/schema
compatibility, and backup state before an operator resolves the marker. Restore
the backup to a separate SQL instance and
volume, run `RESTORE VERIFYONLY` and `DBCC CHECKDB`, validate app compatibility,
then perform a reviewed cutover. Never restore over the live database as a
routine rollback.

## 7. Failure diagnosis

Keep these failure classes separate:

| Signal | Likely area | First checks |
|---|---|---|
| `Backend Verify` fails before image build | CI or code/tests | SQL service readiness log, `dotnet test` output, uploaded TRX artifact |
| PR image smoke fails | Dockerfile, Compose, SQL bootstrap, TLS, permissions or restore | job logs; reproduce with `bash backend/scripts/test-deployment` on disposable Docker host |
| `image-release` fails | GHCR permissions, base image pull/build or image smoke | Actions logs; ensure packages are linked and `GITHUB_TOKEN` has package write permission |
| SSM command is undeliverable | OIDC/IAM, instance profile, SSM agent or network | GitHub role trust, SSM managed-node status, command invocation and endpoint connectivity |
| remote preflight rejects | host configuration/capacity | SSM stdout, OS, Docker, duplicate SQL listener, RAM, free disk, cert and file modes |
| `/health/live` is not 204 | API process/TLS/container | `docker compose ps`, API logs, certificate and Docker health state |
| live is 204 but `/health/ready` is 503 | SQL connectivity/database | SQL container health/logs, private network, connection config, DB-init exit code, disk |
| API restarts or OOM | host/container memory or application | `docker inspect` OOM/restart count, `docker stats`, `free -h`, kernel OOM log |
| backup timer fails | database, local staging, IAM/S3 or SQL | `systemctl status campustour-backup.service`, journal, `df -h`, instance role and S3 object |

Useful read-only host checks:

```bash
sudo /usr/local/sbin/campustour-check
sudo systemctl status campustour-stack.service campustour-backup.timer campustour-check.timer
sudo journalctl -u campustour-backup.service --since '2 days ago'
sudo docker compose --project-name campustour --env-file /etc/campustour/backend.env \
  --env-file /opt/campustour/current/release.env \
  -f /opt/campustour/current/docker-compose.yml ps --all
```

Do not publish output that contains rendered Compose environment, API secrets,
SQL credentials, or private-key material.

## 8. Acceptance before calling production ready

Run these checks on the actual EC2 instance before accepting the 4 GiB profile:

1. Verify Ubuntu 24.04 x86_64, expected instance memory/CPU, encrypted gp3
   volume, Docker/Compose version, SSM access, no host `mssql-server`, and no
   listener on 1433. Confirm the only reachable application port is 443.
2. Measure a cold boot and first SQL startup, empty-database bootstrap, first
   API startup, initial Admin seed, an existing-release deployment with both
   API containers overlapping, one full backup, and a restore drill. Record
   `MemAvailable`, `docker stats`, cgroup usage, CPU utilization/throttling,
   disk use, swap activity, elapsed time, restart counts, and OOM state at each
   phase.
3. Run representative application traffic with fewer than 10 users and a
   concurrent-request peak agreed by the project. Require no OOM/restart,
   stable SQL/API health, at least 512 MiB peak `MemAvailable`, and adequate
   disk for image pulls plus database-sized backup staging. If this fails, move
   to 8 GiB or increase disk before proceeding.
4. From outside EC2, validate the browser-trusted TLS chain and hostname,
   `/health/live` 204, `/health/ready` 200, login/refresh/logout and the
   frontend CORS/cookie flow. Confirm inbound 1433/8080/8443 are blocked.
5. Run a backup, download that S3 object into a disposable SQL instance,
   `RESTORE VERIFYONLY`, restore under a new database name, run `DBCC CHECKDB`,
   and validate representative records. Confirm retention and recovery access.
6. Deploy a known-good image, then an intentionally bad candidate in a
   non-production rehearsal. Verify the failed candidate is detected, API
   rollback succeeds only when the previous schema guard passes, and the
   database volume/data remain unchanged.
7. Confirm systemd startup after reboot, scheduled backup, health-check
   results, monitoring/alerts, certificate-renewal hook, and a written operator
   recovery procedure. Keep evidence and source SHA with the deployment record.

The repository's Docker smoke test exercises compose startup, seed/init
idempotency, HTTPS login/cookie, live/readiness behavior, runtime SQL
permissions, a checksummed backup, `RESTORE VERIFYONLY`, a restore to a separate
database name, `DBCC CHECKDB`, persistence through container recreation, and
refusal of an unmarked database. It does not prove actual EC2 RAM/disk behavior,
AWS permissions, DNS/public TLS, S3 lifecycle, external alerts, or production
recovery. Do not claim those checks passed based only on CI.
