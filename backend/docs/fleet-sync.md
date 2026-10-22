# Backend Fleet Sync (M0/B1)

The wire contract and shared fixtures live in
[`docs/contracts/fleet-sync/v1/`](../../docs/contracts/fleet-sync/v1/). The
endpoint is telemetry-only; it accepts `POST /api/fleet/v1/sync` over HTTPS and
always returns `commands: []`.

## Configure and provision a robot

For each provisioned `RobotCode`, configure its approved map/frame context in
deployment secrets/configuration. Example environment variables for a local
test robot:

```powershell
$env:FleetSync__RobotContexts__robot_test_01__MapKey = 'test-campus-map-v1'
$env:FleetSync__RobotContexts__robot_test_01__FrameId = 'map'
```

Apply `backend/database/fleet-credential-provisioning-permissions.sql` with a
database administrator, then assign a separate provisioning login to
`campus_fleet_provisioner`. Do not add the API runtime login to this role. The
role reads `Robots.RobotCode` and updates only `Robots.CredentialHash`.

Run from `backend/` with a protected provisioning connection string in
`FleetProvisioning:ConnectionString` (for example the environment variable
`FleetProvisioning__ConnectionString`):

```powershell
$env:FleetProvisioning__ConnectionString = '<least-privilege provisioning connection string>'
dotnet .\src\SmartCampus.Api\bin\Debug\net10.0\SmartCampus.Api.dll --provision-fleet-robot robot_test_01
```

The command requires an existing Robot row, rotates its credential, updates no
other column, prints the generated credential once as JSON, and exits without
starting the API. Keep the output out of logs and place the secret directly in
the robot's protected configuration. The application runtime credential stays
on the normal read-only Robot permission and never receives a provisioning
connection string. The SQL snapshot and EF model remain unchanged.

## Run the probe

Use the Python standard library only. The probe loads the shared fixture, fills
fresh timestamps and sequence, verifies TLS with the system CA store, and reads
the credential from an environment variable rather than a command-line
argument:

```powershell
$env:FLEET_SYNC_URL = 'https://localhost/api/fleet/v1/sync'
$env:FLEET_ROBOT_CODE = 'robot_test_01'
$env:FLEET_ROBOT_CREDENTIAL = '<provisioned secret>'
python .\scripts\fleet_sync_probe.py
```

For a local development certificate, install/trust the development CA in the
OS trust store first; the probe deliberately does not disable TLS validation.
The API setting defaults are 30 seconds for report age, 5 seconds for allowed
future skew, 30 seconds for sync freshness, 5 seconds for pose freshness, and a
5 second Staff projection refresh interval. The sync endpoint also allows 600
requests per client IP per 60 seconds by default; tune it with
`FleetSync:RateLimit:PermitLimit` and `FleetSync:RateLimit:WindowSeconds` to
match the bridge cadence while retaining headroom. Operations projection sends
use a 2 second timeout and retry failed updates after 1 second by default.
These values are starting values for B1,
not validated robot safety or operating thresholds.

B1's latest state and replaced-stream history are in process memory. Run one
backend API replica and one bridge process per robot identity. The API rejects
the last 16 replaced stream IDs; once an old ID falls out of that bounded
history, the API cannot identify a delayed process using it as retired. A
second API instance also cannot coordinate stream ownership until a shared
store is implemented.

## Before real R1 traffic

The current rate limiter runs before robot authentication and keys its bucket
by the connection IP. When the API sits behind a reverse proxy, configure
ASP.NET Core forwarded headers for the actual trusted proxy IPs and place that
middleware before rate limiting. Do not accept forwarded IP headers from
untrusted clients. Without this configuration, all robots behind the proxy
share one 600-request bucket. Credential failures also consume that bucket, so
an unauthenticated client can starve valid telemetry. Emulators on one host
also share an IP bucket; the default 600 requests per minute supports at most
about ten robots reporting once per second before retries or other overhead.

Before R1 uses real robots, operations must test the deployed proxy chain,
expected report cadence plus retries, and a rate-limit policy that separates
pre-auth abuse protection from authenticated per-robot capacity (or an
equivalent tested design). Until then the current per-IP limiter is a blocker
for real R1 traffic. B1 controlled integration remains valid with its current
single-instance test setup.
