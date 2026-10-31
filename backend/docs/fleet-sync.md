# Backend Fleet Sync (M0/B1)

The wire contract and shared fixtures live in
[`docs/contracts/fleet-sync/v1/`](../../docs/contracts/fleet-sync/v1/). The
endpoint is telemetry-only; it accepts `POST /api/fleet/v1/sync` over HTTPS and
always returns `commands: []`.

## Configure and provision a robot

Technical Staff first registers the physical robot identity in the web console
using the same `RobotCode` that its bridge will send. Registration creates only
an unassigned database identity; it does not connect to ROS 2, mark the robot
online/ready, pass a map check, or enable dispatch. Technical Staff issues or
rotates the Fleet Sync credential from the robot management panel. The existing
one-shot CLI remains available to an operator with the separate provisioner
role. Technical Staff assigns an uploaded map version to the physical robot in
the web console; MapKey and FrameId are taken from that version and are never
typed independently. The MiniPC bridge must use those exact values. A first valid, new Fleet Sync report
accepted under that credential stores its BE acceptance time and reported
map/frame as the durable connection confirmation. Pose may be null. This is
backend-contact evidence only: the timestamp age/skew window does not prove NTP,
and the report does not prove map-file loading, localization or safety.

A new manual deployment-check PASS requires that persisted confirmation; FAIL
remains available before it. The check itself remains a human observation of
exact package checksum, localization and display. Existing PASS/FAIL history is
preserved on credential rotation, which atomically resets confirmation. A
confirmation survives API restart and offline periods. Latest sync receipt
continues to live in RAM only; after restart its status is `AWAITING_DATA`, and
when no first confirmation exists it is `UNCONFIRMED`. A confirmation-write
error does not fail an already accepted sync, but PASS remains blocked until a
later new report persists it.

When deploying a new map version to a robot, assign that version in the
Technical Staff web console, copy its MapKey and FrameId to the MiniPC, restart
or reconfigure the bridge as needed, and rerun the Fleet Sync probe. After
deploying this release, remove any `FleetSync__RobotContexts__*` entries from
`/etc/campustour/api.env`; they are deprecated and ignored. The robot page
compares the database assignment with the latest recorded deployment check;
it does not change check eligibility or prove that the robot loaded the map file.

## Registration-to-map-check walkthrough

Robot registration and map preparation may start independently. For a new area,
use this order as an operator guide, not an API prerequisite:

1. Register the PHYSICAL identity with RobotCode and display name, and create
   the map with robot tools. Registration does not require the robot online.
2. Upload the immutable map version and obtain its `mapKey` and `frameId`.
3. The responsible technical/deployment operator issues the credential and
   assigns the uploaded map version in the web console, then configures the
   MiniPC with the credential and copied MapKey/FrameId. Provisioning
   responsibility does not grant Staff Operator SQL access.
4. Start Fleet Sync. A valid accepted report under the current key records the
   first confirmation for that credential period. The saved map/frame are
   historical context; an accepted timestamp does not prove NTP was checked.
5. Observe the map physically and record the manual exact-package check. A new
   PASS requires persisted connection confirmation; an observed FAIL remains
   available before it. Sync does not prove the robot loaded the map file or is
   safe to move.
6. Continue to Staff POI creation only after map technical eligibility passes.
   Keep POI verification, route testing and Tour readiness as separate rules;
   connection confirmation does not make a robot ready or dispatchable.

Issue and rotation are available only to Technical Staff. Admin can view safe
metadata and append-only audit history and revoke as an emergency action;
Staff sees connection status only. A secret is shown once in the issue/rotation
response and is never available from GET or audit history. Rotation and
revocation invalidate the previous credential and clear first accepted
confirmation atomically. The MiniPC credential file remains an operator-managed
deployment step; the web app does not install a secret on the robot.

The v1.8 runtime role has column-scoped Robot UPDATE for credential metadata,
first-accepted fields and the three map assignment columns, plus append-only
audit access. It does not
have whole-table Robot UPDATE/DELETE. The separate `campus_fleet_provisioner`
role has only the Robot columns required by the shared CLI lifecycle service
and append-only audit access. Do not add the API runtime login to that role.
Existing v1.4-v1.7 databases must complete the controlled Database First
upgrade/regrant and pass `init-db.sh --check-only` before promoting an API build
that requires v1.8. Take the approved backup first; do not run this path casually
against shared/production databases.

Run from `backend/` with a protected provisioning connection string in
`FleetProvisioning:ConnectionString` (for example the environment variable
`FleetProvisioning__ConnectionString`):

```powershell
$env:FleetProvisioning__ConnectionString = '<least-privilege provisioning connection string>'
dotnet .\src\SmartCampus.Api\bin\Debug\net10.0\SmartCampus.Api.dll --provision-fleet-robot robot_test_01
```

The command requires an existing PHYSICAL Robot row, issues a credential when
none is active or rotates the active credential, and clears the first-sync
confirmation fields in the same SQL update. It appends the same audit action
with source `CLI`, prints the generated credential once as JSON, and exits
without starting the API. Keep the output out of logs and place the secret
directly in the robot's protected configuration. The application runtime has
SELECT/INSERT on Robots and column-level UPDATE for lifecycle and confirmation
fields; it cannot update the full table or DELETE. Runtime never receives a
provisioning connection string. Database First schema v1.6 introduced the nullable
credential hash, lifecycle metadata and confirmation columns. `PackageSha256` in map
checks is the checksum of the uploaded ZIP, not an individual YAML or PGM file.

## Run the probe

Use the Python standard library only. The probe uses the shared v1 fixture
shape, fills a fresh timestamp and sequence, sends `pose: null` and
`status: UNKNOWN` (it is not a robot pose source), verifies TLS with the system
CA store, and reads the token from a private file rather than argv or an
environment variable. Run it from a checkout on the MiniPC before starting the
ROS node. Do not run it while another bridge owns the same robot identity: a
new probe stream takes ownership of the in-memory projection.

```powershell
$env:FLEET_SYNC_URL = 'https://localhost/api/fleet/v1/sync'
$env:FLEET_ROBOT_CODE = 'robot_test_01'
$env:FLEET_ROBOT_MAP_KEY = 'test-campus-map-v1'
$env:FLEET_ROBOT_FRAME_ID = 'map'
$env:FLEET_ROBOT_CREDENTIAL_FILE = 'C:\path\to\private\robot.credential'
python .\scripts\fleet_sync_probe.py
```

On the MiniPC, create the credential file from the one-time provisioning
output using the operator's approved secret-handling process and set its mode
to `0600`. The URL, RobotCode, mapKey and frameId must match the deployed API
configuration; the values above are for a local example only. An accepted
probe validates Python HTTPS/TLS, authentication, map context and rate-limit
reachability from that host. It does not validate ROS, TF or hardware state.

On Ubuntu MiniPC, load those non-secret settings from its private environment
file and run from the repository root:

```bash
cd ~/smart-campus-tour
set -a
source "$HOME/.config/campustour/fleet-sync.env"
set +a
python3 backend/scripts/fleet_sync_probe.py
```

The file sets the URL, RobotCode, approved mapKey/frameId and the path of the
private credential file. Keep the token itself out of this shell environment.

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
