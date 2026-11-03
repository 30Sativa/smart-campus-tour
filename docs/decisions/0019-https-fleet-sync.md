# ADR-0019: HTTPS fleet telemetry sync with a Staff operations projection

**Status: Selected by the task owner for M0/B1 implementation. Group/advisor confirmation of deployment map contexts and operational thresholds remains pending. Physical motion readiness and M2 command semantics are not approved by this ADR.**

**Scoped supersession:** ADR-0032 replaces only the `FleetSync:RobotContexts`
configuration source for each RobotCode's current map/frame context. Fleet Sync
transport, credential, telemetry-only and readiness boundaries below remain.

## Context

ADR-0005 makes the backend authoritative for POI targets, robot assignment, and
tour progression. It remains the ownership decision. ADR-0008 selected
SignalR JSON Hub Protocol for robot-to-backend communication, pending a Python
compatibility checkpoint. The S2/S2B harness records that checkpoint as
BLOCKED. That is evidence about the tested client/runtime setup, not proof that
SignalR cannot work.

For the first physical integration slice, robots need to authenticate and
report state reliably, while the Staff console needs an authorized live view.
This task selects report-and-reconcile over HTTPS for robot telemetry. It does
not implement navigation, cancellation, tour runtime, or the ROS Fleet Bridge.

## Decision

### Transport and ownership

- A robot initiates HTTPS `POST /api/fleet/v1/sync` reports. The endpoint
  accepts telemetry and returns reconciliation metadata with an empty
  `commands` array. It cannot send GoTo, Cancel, E-stop, or `/cmd_vel`.
  Proposed supersession: see ADR-0042 (a separate command endpoint; the `commands` array would stay empty). v1 behavior is unchanged.
- The backend remains authoritative for POI/map context, assignment, and tour
  progression. A future ROS 2 Fleet Bridge translates backend-approved
  per-leg work; it does not own the tour state machine.
- SignalR remains the browser-facing transport at `/hubs/operations`. The
  development-only `/hubs/simulation` preview is unchanged. No production
  `/hubs/fleet` is introduced.
- ADR-0008 is superseded only for robot-to-backend transport. Its command/result
  semantics remain M2 design material until updated and implemented. The
  Python SignalR compatibility harness remains historical evidence and is not
  an acceptance gate for HTTPS sync.

### Identity, credentials, and permissions

- Each robot uses `Authorization: Bearer <credential>` and `X-Robot-Code`.
  The backend resolves the code from `dbo.Robots`, verifies the credential, and
  treats the database code as the authenticated identity. The JSON `robotId`
  must match it.
- Provisioning creates a 32-byte cryptographically random credential, encoded
  as unpadded Base64URL. Store `SHA-256(UTF-8(credential))` in the existing
  `Robot.CredentialHash` column and compare hashes in constant time. High
  credential entropy makes a separate pepper unnecessary for this v1 scheme.
- The original implementation gave the runtime API read-only Robot access and
  gave a separate one-shot provisioning role `SELECT(RobotCode)` plus
  `UPDATE(CredentialHash)`. [ADR-0029](0029-robot-connection-confirmation-before-map-pass.md)
  adds only three runtime confirmation-column updates and three matching
  provisioner reset-column updates; neither principal can update/delete the
  whole Robots table or change dispatch/tour state. Provisioning still updates
  an existing row and does not create Robot records.
- The credential is emitted once by operator provisioning, never returned by
  the API and never included in application logs. Existing Robot credentials
  must be reprovisioned if they do not use this hash format.

### Sync contract and reconciliation

The versioned JSON contract is in
[`docs/contracts/fleet-sync/v1/`](../contracts/fleet-sync/v1/), with request
and response fixtures shared by .NET tests and the Python probe.

- Each report carries a process `streamId`, increasing browser-safe `seq`, UTC
  `reportedAt`, configured `mapKey`/`frameId`, nullable pose with its own UTC
  `capturedAt`, execution status, optional localization assessment, optional
  motion readiness, and observed fault/battery fields.
- The server rejects malformed/future/stale report timestamps, invalid
  coordinates/status/sequence, unconfigured robot map context, and mismatched
  map/frame values. Old pose samples can be accepted as telemetry but stay
  marked stale; a new heartbeat does not refresh `pose.capturedAt`.
- An exact retry of the latest report is acknowledged idempotently and does
  not refresh liveness. Reused sequence numbers with changed content,
  out-of-order samples, and retired streams are rejected. A robot bridge
  process restart creates a new stream at sequence 1 when its report timestamp
  is not older than the current state. A backend API restart is different: its
  in-memory projection and ordering history are empty, so the first valid
  report for a robot is accepted at any positive sequence. The bridge must
  preserve its stream ID and sequence across an API restart; the first accepted
  report creates a new ordering baseline and does not recover missed reports.
  Exact-retry deduplication is also process-local; after an API restart, an
  uncertain retry may be accepted as the first observation with
  `duplicate: false`. The bridge keeps one report in flight and retains its
  exact body until it receives a response.
  The store remembers the last 16 replaced stream IDs for each robot in the
  current process and rejects them with `STALE_STREAM`. A new, non-retired
  stream that arrives while another stream is current must start at sequence 1
  or receives `STREAM_START_REQUIRED`. This bounded history does not prove
  exclusive ownership when multiple bridge processes use one robot identity;
  after an ID is evicted, a delayed process could take ownership again with
  sequence 1 and a recent timestamp. It logs stream changes.
- Latest telemetry lives in a thread-safe in-memory store. Robot credential
  lookup reads SQL on sync requests, but high-frequency pose/state reports are
  not written to SQL. ADR-0029 separately stores only first accepted
  connection-confirmation context for the current credential. A backend restart
  clears the telemetry projection and tombstones; each
  robot's first valid report then rebuilds its baseline at its current positive
  sequence. This is a single-process B1 baseline, not multi-instance shared
  state or durable replay.
- The Fleet Sync endpoint is rate-limited before robot authentication by
  connection IP to 600 requests per 60 seconds by default. Malformed
  credentials are rejected before the SQL lookup. The current bucket is shared
  by clients behind one proxy and by emulators on one host, and credential
  failures can consume it. Before real R1 traffic, operations must configure
  trusted forwarded headers for the actual proxy, test per-robot cadence plus
  retries, and provide separate pre-auth abuse protection and authenticated
  per-robot capacity (or an equivalent tested policy).
- The Operations Hub accepts Staff-role JWTs at connect time and closes
  connections at token expiry. Deactivation does not immediately revoke an
  already-issued JWT under the existing API authentication design.

Initial configurable B1 defaults are 30 seconds maximum report age, 5 seconds
maximum future skew, 30 seconds sync freshness, 5 seconds pose freshness, and a
5 second freshness projection interval. Fleet sync is capped at 600 requests
per IP per 60 seconds; operations broadcasts time out after two seconds and
retry after one second. These are initial software defaults;
they are not measured network limits, a validated `T_loss`, or hardware
safety thresholds. Deployment must configure each RobotCode's approved
map/frame context. The test fixture map is illustrative only.

### State dimensions and operations projection

Keep four state dimensions separate:

1. **Connectivity:** `syncFresh` is derived from the server receipt time of a
   successful, new report. HTTPS has no persistent robot socket; `Live` in the
   legacy UI field means recent sync only.
2. **Execution:** the robot-reported `status` describes `IDLE`, `NAVIGATING`,
   `ARRIVED`, `FAILED`, or `UNKNOWN`. Backend contact loss does not rewrite it.
3. **Localization:** `localized` is nullable and robot-reported. Pose presence
   or map/frame validity does not imply localization.
4. **Safety/motion readiness:** `motionReady` is an independent nullable
   telemetry claim. Unknown stays unknown. B1 does not use it to authorize any
   command, and cloud freshness is not the robot-local stop mechanism.

`/hubs/operations` requires a Staff-role JWT at connection time and closes the
connection when that token expires. Account deactivation does not immediately
revoke an already-issued token; it remains valid until expiry. The Hub sends the
current `FleetUpdated` projection to newly connected Staff clients, receives
coalesced background updates after accepted reports, and refreshes age values
at the configured interval. Freshness flags update on threshold changes, with
stale detection delayed by at most one interval. The projection contains no
credential/hash and uses the existing
Staff `AmrStatus` compatible field names plus explicit `syncFresh`,
`poseFresh`, `executionStatus`, and `motionReady` values. User JWTs cannot
authenticate to the robot sync endpoint; robot credentials cannot join the
Staff Hub.

## Consequences

### Scoped implementation addition (ADR-0029)

The accepted-report path now stores only the first accepted report context for
the current robot credential (`FirstAcceptedSyncAt`, `FirstAcceptedMapKey`,
`FirstAcceptedFrameId`). Report acceptance still requires configured
RobotCode/mapKey/frameId and the existing report timestamp window; that window
does not prove fleet-wide NTP. Pose remains optional and may be null. High-rate
latest telemetry remains in process memory. The durable confirmation survives
API restart/offline periods and resets atomically when the separate credential
provisioner rotates the key. It is connection evidence only and does not prove
map-file loading, localization, or safety. See [ADR-0029](0029-robot-connection-confirmation-before-map-pass.md).

Positive:

- Robot reporting uses a standard outbound HTTPS request and does not depend on
  Python SignalR library compatibility.
- Authentication binds a report to a provisioned Robot row. The runtime retains
  SELECT/INSERT for registration and only column-level UPDATE for the three
  first-connection confirmation fields.
- The Staff Hub receives one safe projection with separate sync, pose,
  execution, localization, and motion-readiness information.
- In-memory replacement means high-frequency pose updates do not write SQL.

Costs and limits:

- The robot bridge must retry HTTPS requests and retain the exact report,
  stream ID, and sequence across network reconnects until the response is
  known. A new robot bridge process uses a new stream at sequence 1. An API
  restart leaves the bridge stream unchanged; its first report may continue at
  N+1 because the API's previous ordering state was process-local.
  A complete validation rejection may be rebuilt at the same sequence only
  when no earlier attempt could have been stored. If an uncertain report on
  an established stream expires or receives a complete validation rejection,
  the bridge skips that sequence and continues on the same stream because v1
  allows sequence gaps. An uncertain first report cannot be skipped; after a
  complete validation rejection or expiry, R1 may rotate to a replacement
  stream at sequence 1 and preserve a timestamp floor at the possibly accepted
  report. This also recovers an unacknowledged startup report after long
  connectivity loss. The rotation is an R1 telemetry-only exception: it can
  create a visible stream-owner transition and telemetry gap, so the warning
  log records the cause, old/new stream IDs and sequence. Backend owner-change
  signals cannot distinguish this recovery from a second bridge process; keep
  one bridge owner per RobotCode. This decision does not apply to command/result
  delivery or durable execution in later milestones.
- Credential rotation requires the separate provisioning permission and a
  secure transfer back to the robot. The credential is not recoverable from
  SQL.
- The B1 store is per process and is lost on backend restart. Multiple API
  instances need shared state and routing before they can serve one robot
  consistently. Robot stream ownership also cannot be coordinated across
  multiple API instances in B1; run one replica per fleet until M2 adds a
  shared ownership/state store.
- Per-report authentication reads the Robot credential hash from SQL. The
  request path performs no telemetry DML, but its read rate should be measured
  during R1 integration.
- This slice does not establish robot-local motion inhibition, TF quality,
  localization readiness, stopping distance, or safe command recovery.

## Open decisions before later milestones

- The project group/advisor still needs to confirm the transport choice for the
  complete robot integration and review business scope at Review 2.
- Operations must supply an approved map/frame context and select report,
  heartbeat, clock-skew, and stale-display thresholds based on the actual
  bridge/network environment.
- R1 must implement the ROS Fleet Bridge and verify TLS, credential handling,
  bridge and API restart, retries, report ordering, and exclusive bridge
  ownership per robot identity without sending movement goals. Until a shared
  ownership store exists, run a single backend API replica and one bridge
  process per robot identity. Real R1 traffic is blocked until trusted reverse
  proxy headers and fair rate-limit budgets are configured and exercised;
  otherwise robots may share a proxy-wide bucket and unauthenticated requests
  can exhaust the same bucket as valid telemetry.
- Before production operations, define credential revoke/decommission and
  rotation procedures; B1 supports rotation but has no explicit disabled state
  or overlap window. Define immediate Staff-session revocation if account
  deactivation must terminate existing Hub connections before JWT expiry.
- Define the production Nav2 goal owner when RViz/teleoperation and the fleet
  bridge could both submit goals; they must not compete for navigation control.
- Before physical GoTo in M2, specify and hardware-test robot-local liveness
  detection, inhibition, Nav2 cancellation/reconciliation, terminal result
  acknowledgements, durable intent, and no-auto-resume recovery per
  `docs/architecture.md` §6.
