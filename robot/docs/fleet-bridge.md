# R1 ROS Fleet Bridge

The `fleet_bridge` ROS 2 Humble package sends telemetry to the Backend Fleet
Sync v1 endpoint. It observes TF only; execution status remains `UNKNOWN`
because R1 has no authoritative execution-state source or backend leg ID. It
does not create a navigation ActionClient, subscribe to Nav2 action status,
publish velocity, or accept a Backend command. The response's empty
`commands` array is not consumed as an instruction channel. The opt-in Fleet Commands
v1 receiver is described in `robot/ros2_ws/src/fleet_bridge/README.md`.

The implementation follows [ADR-0019](../../docs/decisions/0019-https-fleet-sync.md)
and the wire contract in
[`docs/contracts/fleet-sync/v1/`](../../docs/contracts/fleet-sync/v1/).

## Data mapping

| Fleet Sync field | ROS source / rule |
|---|---|
| `pose` | Latest TF `map -> base_footprint`; x/y in metres and normalized quaternion yaw in radians. `capturedAt` is the TF header stamp, never the report time. Missing, invalid, mismatched-frame or future TF produces `null`. Old valid TF retains its old timestamp so the Backend can project it stale. |
| `status` | Always `UNKNOWN`. An empty or terminal action status array does not prove that the robot is idle, and R1 does not have a backend-approved `legId` for leg-specific status. |
| `localized` | `null`. TF availability and a fresh map pose do not prove AMCL convergence. The current stack has no explicit localization-ready signal, and no covariance threshold is approved. |
| `motionReady` | `null`; R1 does not have an approved robot-local safety/readiness signal. |
| `faultCode` | `null`; no structured fleet fault source is wired into this contract. |
| `batteryPercent` | `null`; the MiniPC status snapshot records that battery telemetry is not available. |
| connectivity | Not included as a robot claim. The Backend derives `syncFresh` from receipt of accepted reports. The bridge logs connection/retry transitions without logging its bearer token or request headers. |

`mapKey` is deployment configuration supplied by `FLEET_ROBOT_MAP_KEY`; it is
copied from the map version assigned to this robot in the Technical Staff web
console, not inferred from a map filename. `frameId` defaults to the currently
used global frame `map` and can be set with `FLEET_ROBOT_FRAME_ID`. It must
equal the configured TF `map_frame`; the node stops at startup if they differ.
Both values must exactly match the robot's current database assignment or the
Backend rejects Fleet Sync reports.

The same node also sends a separate Mini PC diagnostics report (CPU, RAM, disk,
CPU temperature, sensor topic rates and the `stm32_bridge` IMU diagnostic) to
`POST /api/fleet/v1/diagnostics` every 10 s on its own thread. It is on by
default, observation only and independent of Fleet Sync retries; sources and
parameters are in `robot/ros2_ws/src/fleet_bridge/README.md`.

## Runtime and retry behavior

- A ROS timer samples TF every 0.2 seconds by default. A lock-protected latest
  snapshot is read by the HTTPS worker; the timer never performs network I/O.
- Reports are sent every 2 seconds by default (30/minute for one robot), below
  the Backend's initial 600-per-IP-per-minute limit with room for retries.
  This is not enough evidence for the EC2 deployment gate described below.
- Each HTTPS request has a 5 second timeout by default. This leaves time for a
  modest backend/network delay while remaining well inside the 30 second report
  freshness window. EC2 latency has not been measured; check the deployed
  endpoint and rate-limit policy before changing this value.
- One worker thread owns one request at a time. A network error, HTTP
  exception, timeout, malformed/partial `200`, `408`, `425` or `5xx` means the
  outcome may be unknown; it keeps the exact serialized report, stream ID and
  sequence. Backoff is exponential, jittered and capped. `429` is a definite
  pre-controller rejection, so it also retries the same body without marking
  that attempt as possibly stored. A prior uncertain attempt remains uncertain.
- A `200` accepted or exact-duplicate response acknowledges the body and
  advances sequence. API restart does not change the running process stream or
  sequence. A new bridge process uses a new stream at sequence 1, as ADR-0019
  requires.
- A new stream always begins at sequence 1. If an uncertain report expires or
  receives a complete `400`, an established stream skips that sequence because
  v1 permits gaps; the next report stays on the same stream. An uncertain
  first report cannot be skipped, so R1 rotates to one replacement stream at
  sequence 1 and keeps a timestamp floor at the possibly accepted report. If
  all attempts were definitely rejected, the bridge keeps the same stream and
  sequence and builds a fresh body. This avoids editing a possibly stored
  `(streamId, seq)` while avoiding unnecessary owner changes. The bridge keeps
  no queue of old snapshots.
- A complete `400` response proves that attempt failed validation before this
  API stored it. With no earlier uncertain attempt, the bridge rebuilds the
  latest snapshot at the same stream and sequence. If an earlier attempt was
  uncertain, it skips the sequence on an established stream, or rotates only
  when the uncertain report was that stream's first report. Timestamp-related
  repairs use bounded exponential backoff; the worker stops after eight
  consecutive validation repairs.
- A fresh stream rejected with `STALE_STREAM` specifically because its
  timestamp is older than the current owner can retry the same stream/sequence
  with a later wall-clock sample. A retired-stream conflict is fatal and does
  not mint more IDs. The current v1 response uses the same error code for both
  cases and exposes the distinction only in its human-readable message; if
  that message changes, the client fails closed and requires operator review.
  `OUT_OF_ORDER` on an acknowledged stream drops the known
  rejected report and advances; the same conflict before a stream's first ACK
  is fatal because skipping its required sequence 1 is unsafe.
- If the system clock moves slightly behind an ACKed or possibly stored
  report, the worker pauses HTTPS until UTC catches up to the timestamp floor.
  If the floor is more than 10 seconds ahead of system time, it reports fatal
  `CLOCK_STEP_BACKWARD` and exits nonzero instead of waiting silently through
  a large time step. The 10 second default is the Backend's 5 second maximum
  future skew plus a 5 second margin; keep it aligned if Backend freshness
  settings change. The worker never sends a lower `reportedAt` value.
- `401`, `SEQUENCE_REUSED`, `STREAM_START_REQUIRED`, retired `STALE_STREAM`,
  `MAP_CONTEXT_MISMATCH`, `MAP_CONTEXT_UNCONFIGURED`, `413`, redirects and
  other non-retryable errors stop the sender. The worker exposes a fatal event;
  the ROS executor then shuts down and the process exits nonzero.
- The worker retains at most one request body. ROS callbacks continue to
  update the latest TF snapshot while the network is slow or unavailable.

TLS uses Python's system CA store and hostname verification. Remote plain HTTP,
URL-embedded credentials, redirects and any TLS verification bypass are not
supported. HTTP is accepted only on loopback for an offline mock server. The
credential value is read from a separate private file at startup; the file
must be regular and mode `0600` (or stricter) on Linux. No credential value is
passed as a ROS parameter or command-line argument.

## Backend and MiniPC prerequisites

Before sending any R1 traffic to EC2, all of these gates must be satisfied:

1. Confirm the Fleet Sync API revision is deployed and healthy at the exact
   HTTPS endpoint. The repository documents M0/B1 code, not proof of the
   current EC2 deployment.
2. A PHYSICAL `Robot` row must already exist. Technical Staff issues or rotates
   its key in the web robot management panel; an authorized operator may use
   the existing one-shot CLI fallback with the separate provisioning role.
   Securely transfer the one-time token into a private MiniPC file. The
   probe/node never provisions credentials. Admin can revoke an exposed key but
   cannot issue or rotate one.
3. Operations must set the exact approved `RobotCode -> mapKey/frameId`
   context in Backend deployment configuration. Do not use the illustrative
   `test-campus-map-v1` value for the physical map unless operations approved
   it.
4. Backend must remain a single API replica and one bridge process must own
   each robot identity, because telemetry and replaced-stream history are in
   process memory.
5. The current limiter is pre-authentication and keyed by connection IP at
   600 requests/60 seconds by default. Before EC2 traffic, operations must
   configure trusted forwarded headers for the actual proxy, test the real
   proxy chain and expected cadence/retries, and add separate pre-auth abuse
   protection plus authenticated per-robot capacity (or an equivalent tested
   policy). Until then real R1 traffic is blocked by ADR-0019 and the Backend
   Fleet Sync deployment guide.
6. MiniPC must have native ROS 2 Humble and the existing native overlay built.
   Start from the checked-in environment with `robot/scripts/source-minipc`;
   the node inherits current DDS domain/RMW/isolation settings and makes no
   DDS or Nav2 configuration changes. Do not launch it from the Docker debug
   profile on the physical robot.
7. Confirm the TF frame names read-only on the current MiniPC before relying
   on pose telemetry. R1 reports execution `UNKNOWN` and does not use a Nav2
   action status topic. The launch defaults to namespace `robot_01`; survey
   the live graph read-only and override `robot_namespace` if the deployed
   namespace differs. No runtime snapshot in this repository proves the ROS
   graph still has these exact names.
8. Before either the Python HTTPS preflight or the ROS node, run the NTP gate
   from the repository root:

   ```bash
   python3 robot/scripts/check_fleet_time_sync.py
   ```

   With chrony installed, the gate reads `chronyc -c tracking` and requires a
   valid nonzero, non-local reference ID, stratum 1–15, `Leap status: Normal`,
   an absolute system offset no greater than 2 seconds, a reference measurement
   no older than 30 minutes (at most 5 seconds in the future), and root
   distance `Root delay / 2 + Root dispersion` no greater than 1 second. The
   30-minute age allows the common 1024-second chrony poll interval plus a
   missed poll; the independent 1-second root-distance bound catches stale or
   poor-quality sources before the Fleet Sync timestamp limits (30 seconds
   stale, 5 seconds future) are reached. The 2-second offset plus the
   1-second root-distance maximum bounds the estimated absolute clock error
   at 3 seconds, leaving 2 seconds of margin against Fleet Sync's future
   allowance. CSV mode uses epoch timestamps and seconds, avoiding
   locale-dependent human-readable fields.

   If chrony is not installed, the gate checks systemd-timesyncd's
   `NTPSynchronized` status and latest `NTPMessage` through
   `timedatectl show-timesync --all`. It applies the same offset, reference-age,
   reference-ID and root-distance bounds and also requires a current server,
   an accepted packet, and a synchronized NTP leap/mode/stratum. A systemd
   version that does not expose the required message fields fails closed; the
   `NTPSynchronized=yes` flag alone is not sufficient. The gate is read-only
   and does not enable, reconfigure, or restart a time service.

   Do not start the bridge while NTP is unsynchronized or during a pending
   clock step. If the gate fails, fix time synchronization and rerun it before
   proceeding.

## Offline Python HTTPS preflight

Run the existing Backend standard-library probe from the repository checkout
on the MiniPC before launching the ROS package. The probe sends one report with
`pose: null`, `status: UNKNOWN` and the configured map context. This proves the
Python TLS/network/authentication path without inventing a pose. Do not run it
while the bridge is already active for that RobotCode: its new process stream
would take Backend ownership.

The probe documentation and command are in
[`backend/docs/fleet-sync.md`](../../backend/docs/fleet-sync.md). The
credential file must be private; the probe reads its path from
`FLEET_ROBOT_CREDENTIAL_FILE` and does not accept the credential as an
environment value or argv. Use a disposable/local provisioned identity for a
mock Backend, or run it against EC2 only after all deployment gates above pass.

## Build and launch (for a later authorized stationary test)

This is a future operator procedure, not authorization to run it in the
current implementation session. It does not launch Nav2 or send a goal.

First complete the read-only MiniPC survey and confirm which checkout and
overlay the active service uses. Run the time gate above before the Python
HTTPS preflight and again immediately before launch. After the code audit and
explicit approval to stage the package, use the repository's supported native build entry point;
`build-native` rebuilds the full ROS workspace, so compare its source and
dependency versions with the recorded robot baseline before invoking it:

```bash
cd ~/smart-campus-tour
bash robot/scripts/build-native
```

Then run the Python HTTPS preflight in
[`backend/docs/fleet-sync.md`](../../backend/docs/fleet-sync.md). After it is
accepted, source the overlay and launch only Fleet Bridge under explicit
authorization for a stationary MiniPC test:

```bash
source robot/scripts/source-minipc
set -a
source "$HOME/.config/campustour/fleet-sync.env"
set +a
ros2 launch fleet_bridge fleet_bridge.launch.py robot_namespace:=robot_01
```

`robot_namespace` defaults to `robot_01`; pass the read-only surveyed
namespace if it differs. The worker timeout is 5 seconds and shutdown waits
up to timeout plus one second for the in-flight HTTPS request. A large
`CLOCK_STEP_BACKWARD` fatal after launch means stop the test, verify NTP and
Backend ordering time, and get operator review before restarting; do not
continually mint streams to bypass a future timestamp already accepted by the
Backend.

The private shell environment file contains only configuration such as:

```bash
FLEET_SYNC_URL=https://<approved-host>/api/fleet/v1/sync
FLEET_ROBOT_CODE=<provisioned-RobotCode>
FLEET_ROBOT_MAP_KEY=<MapKey-copied-from-Technical-web>
FLEET_ROBOT_FRAME_ID=<FrameId-copied-from-Technical-web>
FLEET_ROBOT_CREDENTIAL_FILE=<absolute-private-file-path>
```

Store the token itself in the separate file referenced by
`FLEET_ROBOT_CREDENTIAL_FILE`, with Linux mode `0600`. Neither file belongs in
Git. To stop the observer, use Ctrl-C. Confirm the Backend receives new
sequence numbers and accurate `pose.capturedAt`; a missing/stale TF must appear
as a null/old pose, and unknown localization/battery/motion readiness must
remain null. Do not send a navigation goal or velocity command as part of this
test.

Setup order: register the physical RobotCode, issue its Fleet Sync credential,
assign the uploaded map version in the Technical Staff web console, copy its
MapKey/FrameId into the MiniPC environment file, then run the probe. After the
Backend release that stores assignments in SQL, remove old
`FleetSync__RobotContexts__*` entries from `/etc/campustour/api.env`.

## Verification boundaries

| Evidence | What it can show |
|---|---|
| Offline unit tests and local mock HTTP server | Contract shape, transform conversion with synthetic messages, stale/missing TF handling, stream/sequence/retry/error behavior, TLS validation settings, private credential-file checks, bounded single-flight storage and redirect refusal. |
| ROS runtime on a sourced Humble development environment | Package installation, launch argument/environment binding, `tf2_ros` API compatibility and subscriptions on a local graph. This has not been run in this session. |
| Authorized MiniPC stationary observation | Actual TF/action topic names and freshness, TLS trust/network path to the deployed Backend, credential permissions and accepted projection while the robot stays still. No goal or `/cmd_vel` is needed. |
| Movement/hardware behavior | Not part of R1. This package has no command path; physical localization accuracy and AMCL convergence still require existing robot procedures. |

Ask Claude's independent audit to focus on the worker state machine against the
contract's duplicate and stale-report rules, credential/TLS handling, ROS
Humble launch compatibility and namespace/topic assumptions, and confirmation
that no command path exists. The implementation is not ready for EC2 or
MiniPC deployment until that review and the Backend deployment gates pass.
