# ADR-0008: SignalR production fleet transport with a Python compatibility gate

**Status: accepted architecture decision; production acceptance gate pending.**

## Context

ADR-0005 assigns POI targets, robot assignment, and tour progression to the
backend. The physical robot executes one navigation leg at a time. Its planned
Python/ROS 2 Humble `fleet_bridge` and the external .NET Fleet Emulator need
the same bidirectional contract, with connections initiated by each robot.

The ASP.NET Core/.NET 10 backend already registers SignalR for the separate
development-only SimulationPreview path. The web has a SignalR factory and an
unwired operations contract. The Fleet Emulator references the official .NET
SignalR client but only has a runnable scaffold. No production fleet Hub,
operations Hub, fleet bridge, machine authentication, or tour orchestration is
implemented. Python client compatibility has not been demonstrated.

## Decision

### Transport and Hub boundaries

Choose **SignalR JSON Hub Protocol over TLS** for both the physical
`fleet_bridge` and Fleet Emulator. Production use is conditional on the
Python client passing the ASP.NET Core/.NET 10 compatibility checkpoint below.
This is a transport decision with an acceptance gate, not a compatibility claim.

Keep three separate boundaries:

| Hub | Responsibility |
|---|---|
| `/hubs/fleet` | Physical robot and Fleet Emulator communicate with the backend through the same machine contract. |
| `/hubs/operations` | Backend publishes projections to Staff Web / Operational Digital Twin. |
| `/hubs/simulation` | Existing development-only Gazebo SimulationPreview. |

Robots initiate outbound fleet connections. Browsers do not use the fleet Hub;
robots do not use the operations Hub. Different paths require different auth
policies; path separation alone does not enforce authorization. Keep
`gazebo_preview_bridge` and `/api/simulation/pose` unchanged and separate from
production. Do not use Gazebo ground truth as physical localization.

Application owns orchestration and a fleet gateway boundary. SignalR Hubs and
the thin adapter using their `IHubContext` belong in Api; Application does not
depend on SignalR, and Infrastructure must not reference Api to access a Hub.

### Navigation fleet MVP

Backend-to-robot commands are `GoTo` and `Cancel`. Robot-to-backend reports are
`ReportState` and `ReportCommandResult`. The conceptual shapes and required /
optional fields are recorded in `docs/architecture.md` Section 3. They are not
implemented DTOs; final binding, validation limits, and acknowledgement encoding
must be specified before implementation.

No manual drive, raw `/cmd_vel`, cloud E-stop, or Head command is part of this
MVP. Head/pan presets remain a V1 requirement, but their contract is separate
work and must not block navigation transport. Confirmed FRONT before first/next
legs, including `Next -> FRONT -> next leg`, is the **current Remote Tour
orchestration decision** reflected in the schema/web contract and mock. No
independently verified business source establishes that specific sequence as a
Capstone requirement. Retain it as the implementation baseline. A separate head
contract/controller patch must precede completion of this orchestration flow.
Its method names, ROS interface, and hardware implementation are not selected
by this navigation ADR.

`ReportState.status` is one of `IDLE`, `NAVIGATING`, `ARRIVED`, `FAILED`,
`UNKNOWN`. `UNKNOWN` means the bridge/robot cannot determine execution state;
it does not mean the backend lost its connection. Connection/freshness and
execution are separate concerns. There is no `CANCELLED` execution status.

Cancellation still requires the terminal outcome of the exact `legId`:

```text
Cancel(legId) -> ACCEPTED -> Nav2 terminal result
             -> ReportCommandResult(TERMINAL, actual outcome) -> IDLE
```

`ReportCommandResult` distinguishes `ACCEPTED`, `REJECTED`, and `TERMINAL`
phases; a terminal outcome is `ARRIVED`, `CANCELLED`, or `FAILED`. These outcomes
describe the leg, not the tour business state. If arrival wins the race with
cancel, report `ARRIVED`, never manufacture `CANCELLED`. A send, an acceptance,
or an `IDLE` report is not proof of cancellation. A timeout with no confirmed
terminal result requires reconciliation, not an invented outcome. There is one
logical terminal outcome per leg, not a promise of one network transmission:
retrying an unacknowledged result remains mandatory. A local interruption and
a backend-requested cancel must retain their distinct cause; the exact mapping
of local interruption reasons is part of the robot fail-safe contract before
physical integration. Do not invent a backend Cancel when none was received.

### State, coordinates, and ROS mapping

`ReportState` identifies the robot, process stream, and sequence, with separate
`reportedAt` and `pose.capturedAt` timestamps. Pose may be null; when present it
must carry its capture timestamp. A fresh report must not make an old pose
fresh. `mapKey` and `frameId` preserve coordinate context;
optional localization, fault, and measured battery information must not be
fabricated. Latest state belongs in memory/a cache abstraction. SQL stores
meaningful business state/events, not high-frequency pose samples. No cache
product or new database schema is selected here.

Production pose comes from TF `map -> base_footprint`, combining AMCL's
`map -> odom` with EKF's `odom -> base_footprint`. `/amcl_pose` is not the sole
fleet pose source. Check transform freshness; the existence of TF alone does
not prove good localization. This decision does not change TF naming or add
multi-robot TF isolation.

Map `GoTo` directly to Nav2 `NavigateToPose` using the backend target and its
map/frame context. Keep `GoToStop.action` and `bus_stops.yaml` for local/manual
development tests, not as the production boundary. There is one production
navigation-goal owner: do not let the fleet bridge, local stop navigator, and
RViz goals compete. Commands never publish `/cmd_vel` directly; the existing
Nav2-to-mode-manager motion path remains in control.

### Physical and emulated clients

Both clients use the same external schema, command semantics, reconnect rules,
and identity model. An emulated robot has its own identity/connection; the
emulator cannot call backend use cases directly. Retain `Robot.SourceType` and
dispatch eligibility so emulator robots cannot serve real tours. Shared fleet
semantics do not make synthetic results evidence of physical safety.

Research implementation and benchmark execution are **deferred until the
production Remote Tour end-to-end path works**. The Capstone documents and
their research methodology remain unchanged. Research-related architecture
decisions are frozen for this milestone; research rates, metrics, load targets,
measurement clients, SLOs, and measurement pipelines must not constrain or gate
production transport. This ADR does not reconcile or redefine those items.

Choose and record configurable operational update rates during
production integration; do not infer them from ROS internal rates or the
preview's 10 Hz limit. Send execution/fault changes promptly and bound buffering.
Intermediate poses may use latest-state delivery; terminal results must be
retained independently.

### Reconnect and idempotency

- Retry initial connection failures as well as reconnecting established
  connections, using bounded backoff with jitter.
- Keep one current connection per robot. A valid replacement supersedes the old
  connection; reject old-connection reports, and do not let its later disconnect
  callback remove the replacement.
- Order state by `(robotId, streamId, seq)`. Keep the stream across network
  reconnects within a process; use a new stream on process restart. Bind the
  stream to the authenticated current connection and reconcile before dispatch.
- Duplicate `GoTo` for the same leg and target does not create another Nav2 goal.
  The same `legId` with a different target is rejected. A busy robot rejects a
  different leg rather than automatically preempting or queueing it.
- `Cancel` is idempotent and affects only its leg. A late duplicate `GoTo` must
  not revive a canceled leg, including when cancellation arrives first.
- Retain terminal results across reconnect and resend until the backend confirms
  it has processed them. The backend handles duplicate results idempotently;
  neither SignalR delivery nor pose coalescing supplies this business guarantee.
- Reconnect reports the current execution snapshot before new dispatch. Restart
  or lost execution information requires reconciliation/`UNKNOWN`, never blind
  replay. Backend loss of contact marks connection state separately and does
  not prove that Nav2 stopped. Production requires a robot-local stop/inhibit
  on backend connectivity loss beyond a validated `T_loss`, with no automatic
  resume. The detection budget and recovery mechanism must be specified and
  tested before physical fleet commands are enabled.
  Idempotency held only in bridge memory does not authorize replay after a
  process restart. Reconcile ownership and actual execution first.

Before any physical fleet-command test, specify and hardware-test robot-local
loss detection and motion inhibition, including silent network loss, bridge
crash, and orphan Nav2 goals. The current Nav2-input and serial watchdogs do not
observe backend connectivity. A bridge-only detector cannot cover its own
crash. Transport timeout measurements inform, but do not alone determine, a
safe loss/stop budget. Do not prescribe unconditional cancel-all at startup or
claim a successful cancel guarantees a measured physical stop. Local motion
inhibition must still work if Nav2 cancellation is delayed or fails. Reconnect
does not clear the inhibition or authorize a new leg by itself. See
`docs/architecture.md` Section 6 for the physical acceptance prerequisites.

These rules do not introduce distributed consensus or an exactly-once transport.

### Authentication stages

A local-only compatibility spike may bootstrap with a dummy/local identity.
Passing the checkpoint nevertheless requires valid credentials, invalid
credential rejection, authenticated reconnect, and backend restart tests.

Outside that local spike, before enabling navigation commands require TLS,
per-robot machine credentials, and a fleet-machine authorization policy. Bind
reported identity to the authenticated robot; browser/user credentials cannot
report state on its behalf. Operations uses a separate user authorization
policy. Reuse the existing `Robot.CredentialHash` concept; credential lifecycle
details belong to the later auth implementation. No PKI, mTLS, or device
management platform is required for this MVP.

### Python compatibility checkpoint (next step after documentation merge)

Use a small, local Python client and ASP.NET Core/.NET 10 test Hub. The following
evidence is required to pass; a clean reconnect on a developer laptop alone is
insufficient:

1. **Runtime parity:** use the Humble base image selected by `robot/Dockerfile`;
   record its resolved image digest, OS, actual Python version (the expected
   Humble baseline is Python 3.10), .NET runtime, pinned candidate client version,
   and reproducible installation commands. No production Dockerfile change is
   needed for the spike.
2. **TLS/auth:** connect over HTTPS/WSS with certificate verification enabled;
   reject an invalid certificate and invalid credentials. Verify credentials
   reach negotiation and WebSocket connection as applicable, and are obtained
   again on reconnect. Authentication failures must not cause a tight retry
   loop. Do not log credentials or token-bearing query strings. A short-lived
   token exchange is not mandated; test the credential mechanism selected for
   the spike and record its lifecycle.
3. **Two-way messages:** invoke `ReportState`, receive a backend dummy command,
   and send `ReportCommandResult`. Do not require server-to-client invocation
   return values; results can travel as separate client-to-server invocations.
4. **Initial failure and loss detection:** start before the backend; then test
   clean disconnect, backend process kill/restart, and silent traffic loss
   without an orderly socket close. Record keepalive/timeouts and observed
   detection/reconnect delays. Test authenticated recovery without duplicating
   handlers or command execution. This measures transport behavior, not a
   hardware fail-safe or an accepted `T_loss`.
5. **Result acknowledgement:** observe invocation completion/error in Python,
   with the test handler completing only after the simulated processing boundary.
   Drop the acknowledgement after processing, reconnect, resend the same result,
   and demonstrate one logical processing effect. If invocation completion is
   unavailable, demonstrate an explicit correlated application acknowledgement
   instead and record that binding before bridge implementation. A transport
   send/receipt is not a durable business acknowledgement. The spike does not
   prove SQL persistence; the later backend must acknowledge after required
   state/event commit, including idempotent replay.
6. **Offline send and bounded buffering:** exercise sends during disconnection,
   delayed receiver processing, and reconnect. Record rejection/queue behavior,
   declared buffer bounds and overload handling. Pose samples may be dropped
   according to the chosen delivery profile; an unacknowledged terminal result
   must not be discarded or silently replaced by an idle heartbeat.
7. **Representative payloads:** test nested and null pose, string enums, UTC
   timestamps, map/frame and leg IDs, valid/invalid payloads, and integer
   sequences through Python/.NET/JSON. Numeric `seq` uses the JavaScript-safe
   range `1..9007199254740991`; do not assume every int64 round-trips exactly in
   the eventual browser. Pin fixtures/binding for the spike without pretending
   they are already production DTO implementations.
8. **Soak:** run `ReportState` at a declared configurable test rate for at least
   30 minutes with repeated disconnect/reconnect. This rate is a compatibility
   test input, not a production/research frequency requirement. Record message
   counts, queue depth, memory samples, callback thread/executor context, and
   sequence continuity within a
   stream. State buffer/memory acceptance bounds before running and investigate
   sustained growth after warm-up; do not demand literally constant RSS. Network
   reconnect retains the stream; process restart starts a new stream. This is
   one-client compatibility evidence, not fleet-load capacity validation.

The checkpoint needs no ROS nodes, TF, Nav2, or hardware. Record the test setup,
versions, limits, evidence, and pass/fail for every item. No Python library is
selected or added by this ADR. **Python SignalR compatibility with ASP.NET
Core/.NET 10 remains unproven; pass this gate before implementing the production
fleet bridge.** If it fails, review the transport for both physical bridge and
Fleet Emulator; no fallback implementation is preselected. If a confirmed
project scope mandates SignalR/Python, changing it also requires the project's
scope-change process, not only an implementation substitution.

### Application orchestration is separate work

A working FleetHub does not complete tour orchestration. Application must own:

```text
Tour/dispatch -> derive current leg -> persist execution intent/current leg
             -> external send -> reconcile result -> TourEvent / dwell
             -> decide next leg
```

The existing `UnitOfWorkBehavior` commits after the handler returns. Sending
`GoTo` first and committing afterward is not atomic with the robot. A later
orchestration implementation must make intent durable before external send and
reconcile ambiguous outcomes. This ADR does not add a distributed transaction
or change the current commit pipeline.

## Consequences

SignalR fits the current ASP.NET backend and .NET Emulator without adding a
broker, while Hub separation keeps the browser independent of robot protocol.
The Python compatibility gate is the principal unresolved transport risk.
REST polling, raw WebSocket, MQTT, and gRPC remain alternatives if the decision
must be revisited; no alternative client or broker is introduced now.

An initial single backend process with per-robot latest state is sufficient as
the implementation baseline, not a fleet-capacity claim. Multiple backend
instances would require connection routing and shared-state/scale-out design;
separate Hubs alone do not provide that. Exact freshness thresholds, clock-skew
limits, localization-readiness criteria, final DTO encoding, result
acknowledgements, and restart recovery must be resolved in the relevant later
patches. Research implementation/benchmark execution are deferred and impose
no production constraints or acceptance gates. Official research scope remains
unchanged; research architecture decisions are frozen for this milestone.

The production implementation order is:

1. Documentation and Python compatibility checkpoint.
2. Fleet Hub/registry, result acknowledgement, machine auth/TLS, and a small
   protocol test client. A fleet-scale Emulator or benchmark is not required.
3. Physical bridge mapping and robot-local fail-safe design; validate first in
   one Gazebo stack, then on hardware before enabling physical fleet operation.
4. Separate rotating-head contract/controller and confirmed FRONT gating under
   the current orchestration decision, before completing that flow. Head
   integration may be prepared independently of the navigation transport.
5. Application persistence/orchestration: Start, per-leg execution, POI visits,
   Hold/Next, End Early, recovery, and backend-restart handling.
6. Operations projection, Staff API/frontend, media availability and remote
   viewer integration to establish the production end-to-end path.

After the production end-to-end path works, revisit deferred Fleet Emulator /
research implementation and benchmarking in a separate task under the unchanged
Capstone scope. No Hub, ROS interface, dependency, auth code, schema,
frontend, Emulator code, or preview behavior is changed by this documentation.
