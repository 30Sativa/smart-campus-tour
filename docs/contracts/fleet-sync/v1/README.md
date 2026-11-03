# Fleet Sync v1

`POST /api/fleet/v1/sync` is the robot-to-backend HTTPS telemetry boundary for
M0/B1. It authenticates each request as one provisioned robot, accepts one
state report, updates the backend's in-memory latest-state projection, and
returns an empty `commands` array. This version cannot issue navigation,
cancellation, or any other robot command.

## Authentication

Send `Authorization: Bearer <credential>` and `X-Robot-Code: <RobotCode>` over
HTTPS. The backend authenticates the header code against `dbo.Robots.RobotCode`
and a SHA-256 hash in the existing `CredentialHash` column. The code in JSON
must match the canonical code returned by authentication. Credentials are 32
random bytes encoded as unpadded Base64URL; only the hash is stored. A malformed,
mismatched, or unknown credential receives `401` with a generic response. This
version has no enabled/disabled flag: rotating the stored hash immediately
invalidates the previous credential. The
runtime API identity has SELECT access to Robots; provisioning uses the
separate `campus_fleet_provisioner` SQL role, which may read RobotCode and update
CredentialHash only.

Provision or rotate a credential for an existing robot row with the one-shot
API command documented in `backend/docs/fleet-sync.md`. The generated credential
is printed once to the command's stdout. Store it in the robot's protected
configuration and clear terminal history/output according to local secret
handling practice. The API never returns or logs it.

## Request

The canonical .NET/Python fixture is [`sync-request.json`](sync-request.json).
All timestamps must include a UTC offset of `Z` or `+00:00`.

| Field | Rule |
|---|---|
| `robotId` | Canonical `RobotCode`, 1–100 ASCII letters/digits/`_`/`.`/`-`; must equal the authenticated header identity. |
| `streamId` | Non-empty UUID for the current robot telemetry stream; preserve it across retries, network reconnects and backend API restarts. A new bridge process starts a new stream at sequence 1. R1 telemetry may rotate a stream in-process only when its uncertain first report expires or a complete validation rejection follows an uncertain attempt; the replacement starts at sequence 1 and keeps a timestamp floor at any report that may have been stored. An established stream with a prior ACK skips an expired or definitely rejected uncertain sequence instead of changing owner. This exception is telemetry-only and does not define command/result or durable execution semantics. |
| `seq` | Positive integer in `1..9007199254740991`; strictly increases within a stream. Gaps are allowed. An established stream may skip a report whose earlier attempt was uncertain after that report expires or receives a complete validation rejection; the next report uses the next sequence. A stream's first report must still use `1`. When the backend has a current report for a different stream, an intentional new stream must start at `1`. If the backend process has restarted and its store is empty, it accepts any valid positive sequence as the first observed report. |
| `reportedAt` | UTC wall-clock time for this report; default freshness limit 30 seconds old and 5 seconds future. These initial values are configurable, not measured operating limits. Keep the robot clock synchronized and slew corrections rather than stepping it backward. |
| `mapKey`, `frameId` | Must exactly match the mapKey/frameId of the physical robot's current database map assignment. Unassigned robots are rejected with `MAP_CONTEXT_UNCONFIGURED`; mismatches are rejected with `MAP_CONTEXT_MISMATCH`. Current robot frames use `map`. |
| `pose` | Object or `null`. `x`/`y` are finite metres within ±10,000, yaw is finite radians within `[-π, π]`, and `capturedAt` must be after the Unix epoch. An old pose is accepted and projected as stale; it is never refreshed by a newer heartbeat. |
| `status` | Execution only: `IDLE`, `NAVIGATING`, `ARRIVED`, `FAILED`, or `UNKNOWN`. Non-IDLE leg-specific statuses require `legId`; IDLE requires it to be null. |
| `localized` | Optional tri-state assessment; null/absent means unknown. Backend does not infer it from pose or connectivity. |
| `motionReady` | Optional independent safety/motion readiness claim; null/absent means unknown. It is telemetry only and never enables movement. |
| `faultCode`, `batteryPercent` | Optional observed values; battery must be finite and in `0..100`. |

Robot map contexts are deployment configuration, not schema changes. No map or
hardware context is approved by the illustrative test fixture.

## Response and errors

`200` returns the standard `BaseResponse` with `data`:

```json
{"accepted":true,"duplicate":false,"receivedAt":"2026-10-22T00:00:00+00:00","commands":[]}
```

An exact duplicate `(robotId, streamId, seq, report)` of the current latest
report is acknowledged with `accepted: true`, `duplicate: true`; it does not
update the latest state or refresh liveness. Duplicate comparison happens
after shape and timestamp validation, so an otherwise exact retry older than
the report freshness limit returns `400` and must be dropped.

| Response | Meaning and bridge action |
|---|---|
| `400` validation error | Invalid shape, timestamp, or a report outside the configured age window. Validation happens before this response's report is stored. If no earlier attempt for that `(streamId, seq)` had an uncertain outcome, rebuild the corrected/latest report at the same stream and sequence with a valid, nondecreasing `reportedAt`. If an earlier attempt may have been stored, do not edit that pair: for an established stream, skip that sequence and continue at the next one; for an uncertain first report, rotate to a new stream at sequence 1. Preserve a timestamp floor at any report that may have been stored. |
| `401` | Missing, malformed, unknown, or incorrect robot credential. Stop retrying until operator credential/configuration is corrected. |
| `409 SEQUENCE_REUSED` | This stream/sequence was already used for different content. Treat as a producer bug; do not retry with that sequence. |
| `409 OUT_OF_ORDER` | The sequence is older than the latest report, or its `reportedAt` moved backward within the current stream. Drop that report; do not retry it unchanged. Sequence gaps are allowed. |
| `409 STREAM_START_REQUIRED` | A non-retired stream ID differs from the current owner but its first report did not use `seq=1`. Keep using the current stream or perform an intentional owner change with a new stream ID at `seq=1`; do not increment this rejected report and retry it. |
| `409 STALE_STREAM` | This stream ID is in the current process's retired-stream history, or a new stream's timestamp is older than the current report. A retired stream cannot take ownership again while it remains in that history. Stop a retired stream; do not repeatedly generate stream IDs to bypass the conflict. If the response identifies only the new stream's timestamp as older, and that new seq 1 is known not to have been stored, a client may rebuild the same stream/seq with a later timestamp under a bounded repair policy. |
| `409 MAP_CONTEXT_MISMATCH` | Configured `mapKey`/`frameId` does not match. Stop and correct deployment configuration. |
| `413` | Request exceeded the 16 KiB body limit. Reduce/fix the payload; do not retry unchanged. |
| `429 RATE_LIMITED` | Per-IP fleet sync rate limit reached (default 600 requests per 60 seconds). Retry the same report after a bounded delay with jitter. See the deployment gate below before real R1 traffic. |
| `503 MAP_CONTEXT_UNCONFIGURED` | The robot has no configured map/frame context. Stop and have operations configure it. |

When a current report exists, an intentional new process stream may take
ownership only with `seq=1` and a `reportedAt` not older than the latest
accepted report. A different stream ID with another sequence gets
`409 STREAM_START_REQUIRED`. In one backend process, the last 16 replaced
stream IDs are remembered and rejected with `409 STALE_STREAM`, reducing
accidental reuse of recently replaced streams.

The latest report and retired-stream history are process-local. After a backend
restart the store is empty and the server has no sequence or ownership history
to compare. The robot must preserve its existing `streamId` and sequence across
an API restart; the first fresh, valid report for that robot is accepted at any
positive sequence and establishes a new in-memory baseline. This does not
recover reports missed while the backend was down. The restart also clears
tombstones, so a single bridge process must own each robot identity and only
one API replica may serve a fleet until ownership moves to shared state. A
replaced stream cannot reclaim ownership while it remains in the current
process's last-16 history.
Once an ID falls out of that bounded history, the server cannot distinguish it
from another new stream; a delayed process could then take ownership again if
it sends sequence 1 with a sufficiently recent timestamp. The single-bridge
owner rule is required to avoid competing processes after tombstone eviction.

For a response lost after acceptance, retry the exact same body with the same
stream ID and sequence. If it is still the latest report and passes freshness
validation, the backend returns `200` with `duplicate: true` and does not change
the latest state. Once a later sequence has been accepted, retrying the older
report returns `409 OUT_OF_ORDER`; stop retrying that sequence and continue
from the latest sequence. An exact retry older than the report freshness limit
returns `400` before duplicate detection. Keep one report in flight per robot
and retain its exact body until it is acknowledged or classified as rejected.
If an uncertain report from an already established stream expires or receives
a complete validation rejection, its sequence can be skipped: the backend
allows gaps, and the next sequence is safe whether the uncertain body was
stored or not. For an uncertain first report, sequence 1 cannot be skipped. A
complete validation rejection after an earlier uncertain attempt, or expiry
that prevents exact retry, permits R1 to rotate to a new stream at sequence 1
with a timestamp no older than the uncertain report. If every attempt is known
to have been rejected, keep the stream and sequence and build a fresh report
there. This avoids `SEQUENCE_REUSED` after a lost ACK without creating
unnecessary stream-owner changes.
Idempotency history is process-local: if the API restarts before an uncertain
request is retried, that retry may be accepted with `duplicate: false` as the
new first observation. With one report in flight, this safely rebuilds the
latest known baseline; v1 does not provide durable exactly-once delivery.

### R1 stream rotation boundary

R1 is authorized to replace a telemetry stream in the same bridge process only
when its uncertain first report expires or a complete validation rejection
arrives after that first report had an uncertain attempt. The bridge logs the
cause and old/new stream IDs and starts the replacement at sequence 1. The
trade-off is a visible stream-owner transition and a possible gap in telemetry;
the in-memory latest-state projection converges on the next accepted report.
Established streams do not rotate for one uncertain report: they skip its
sequence because v1 permits gaps. Keep one bridge owner per RobotCode; backend
stream-change signals cannot distinguish this R1 recovery from a competing
bridge process. This permission does not extend to command acceptance/results,
durable execution, or any later milestone. Those require their own durable
identity, ownership, and reconciliation contract.

SQL receives credential lookups but no pose writes. The robot's `200` response
does not wait for Staff broadcast.
Accepted and duplicate reports signal a coalescing background publisher; a
failed or timed-out send remains dirty and is retried. Staff clients also receive
the latest snapshot on connect. Age values in a projection are calculated when
it is sent and refresh at the configured interval (default five seconds); stale
flags can therefore lag by up to one interval.

The Operations Hub publishes `FleetUpdated` to Staff-role JWTs only, including
separate `syncFresh`, `poseFresh`, `executionStatus`, `localized`, and
`motionReady` fields. Connections close when the JWT expires. Disabling an
account does not revoke an already-issued JWT immediately; that remains valid
until expiry under the current authentication design.
`assignable` remains null because dispatch eligibility is not evaluated by B1.
`Live` in
the existing `connectionState` field means a recent HTTPS sync, not an open
socket.

### Deployment gate before real R1 traffic

Fleet Sync is rate-limited before robot authentication by the connection IP,
with a default shared bucket of 600 requests per 60 seconds. A trusted reverse
proxy that is not configured in ASP.NET Core forwarded-header settings makes
all robots appear to come from the proxy and share one bucket. Never trust
arbitrary forwarded headers; configure only the actual proxy addresses. Even
with the real client IP, credential failures can consume the same pre-auth
bucket used by valid reports, and all emulated robots on one host share an IP.
Before R1 runs against a real fleet, configure and test trusted proxy handling,
size limits for robot cadence plus retries, and separate abuse protection from
the authenticated per-robot reporting budget (or an equivalent tested design).
This is a deployment blocker for real R1 traffic; the default is suitable only
for controlled single-instance development and integration tests.

## M2 extension boundary

Superseded for commands by [ADR-0042](../../../decisions/0042-m2-command-transport-and-start-readiness.md) (accepted 2026-11-03): v1 `commands` is always empty; commands go through [`docs/contracts/fleet-commands/v1/`](../../fleet-commands/v1/). v1 behavior is unchanged.

The response reserves `commands` for a later versioned command envelope. M2
must define per-leg commands, command IDs, acceptance/rejection/terminal results,
result acknowledgements, durable intent/reconciliation, and restart behavior
before sending any command. Those fields are not implemented by v1, and the
robot safety prerequisites in `docs/architecture.md` §6 remain required before
physical movement through a fleet path.
