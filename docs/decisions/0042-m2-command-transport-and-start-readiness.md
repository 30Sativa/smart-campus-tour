# ADR-0042: M2 command transport, command lifecycle and Start readiness

- **Status:** Proposed, 2026-11-03. Not accepted; nothing here is implemented. Until the group accepts it, root `AGENTS.md` and ADR-0020 still treat M2 command transport as pending, and Fleet Sync v1 keeps returning `commands: []`.
- **Supplements:** ADR-0005 (backend-owned per-leg orchestration), ADR-0008 (command/result semantics, reconnect/idempotency; its transport is already superseded), ADR-0019 (HTTPS Fleet Sync, telemetry only).
- **Related:** ADR-0020 (SRS v0.2 baseline), ADR-0034/0035 (Tour from tested revision, reservation), ADR-0039 (usable robot for a Tour), `docs/architecture.md` §3.1.2, §3.2, §3.4–§3.6, §6.

Labels used below: **[SRS]** is required by `docs/requirements/campus-tour-scope.md` / the gap register; **[ADR-n]** restates an accepted decision; **[Design]** is a proposal of this ADR and becomes binding only on acceptance.

## Context

Robot `amr_01` runs a route with `robot/tools/route_test/route_test.py`, reports telemetry through Fleet Sync v1 with its own credential and map assignment (`tang-6-v1`). That proves telemetry and a script-driven Nav2 run, not that the backend can drive Nav2.

Reused without restating: per-leg ownership and `GoTo`/`Cancel` (ADR-0005); command kinds, `ACCEPTED`/`REJECTED`/`TERMINAL` phases, `ARRIVED`/`CANCELLED`/`FAILED` outcomes, arrival-beats-cancel, duplicate/busy rules, "persist intent before send" and no blind replay (ADR-0008, architecture §3.4, §3.6); robot auth scheme, stream semantics and the four state dimensions (ADR-0019, §3.1.2); Tour runtime columns and the operational rules table (§3.2); one-goal-owner and map binding (§3.5); robot-local stop on connectivity loss (§6, SRS §7).

Missing, and decided here: the command transport, the command lifecycle as persisted state, the storage model, the Start transaction, the enable guards and the READY/Start condition tables (in `docs/architecture.md` §3.2).

## Decision

### 1. Transport: a separate robot-polled command endpoint (D1)

**[Design]** Commands get their own versioned contract, [`docs/contracts/fleet-commands/v1/`](../contracts/fleet-commands/v1/). Fleet Sync v1 is not changed and stays telemetry-only.

Why not Fleet Sync v2 (commands in the sync response):

- v1 just started working with a real robot; changing it risks the only working robot path.
- v1 semantics are telemetry semantics: reports may be skipped or rotated (§3.1.2 R1 exception), state is in process memory and lost on API restart, ordering history is per process. Commands need durable rows that survive an API restart.
- A separate endpoint can be disabled on its own (§7) without touching telemetry.

Model: each robot has **at most one open movement command**. The robot pulls it. No queue, no time-limited delivery reservation, no transactional outbox: the committed `RobotCommands` row is the outbox, because nothing is pushed.

| Endpoint | Purpose |
|---|---|
| `POST /api/fleet/commands/v1/poll` | Body `{ streamId }`. Returns `{ command: null \| {...} }`: the robot's current command. |
| `POST /api/fleet/commands/v1/{commandId}/results` | Reports one phase of one command. Answered only **after** the state change and its `TourEvents` row commit; idempotent. |

Path reasoning: `/api/fleet/` keeps the robot authentication scheme and rate-limit grouping of Fleet Sync; `commands/v1` versions this contract independently, and avoids `/api/fleet/v1/commands`, which would read as "Fleet Sync v1 gained commands". Both endpoints use the Fleet Sync robot scheme unchanged (`Authorization: Bearer`, `X-Robot-Code`; ADR-0019); user JWTs are refused.

**[Design]** Poll is bound to telemetry: `streamId` must be the robot's current Fleet Sync stream, with a fresh report in the in-memory store. Otherwise `409 STREAM_NOT_CURRENT` and nothing is delivered. This keeps delivery to the one bridge process the backend can currently see, and makes a backend restart self-healing (the bridge's next sync rebuilds the store).

### 2. Envelope

Uses ADR-0008 vocabulary. Nothing about the Tour goes to the robot: no `tourId`, execution or `routeRevisionId`. No `mapChecksum` (`MapVersions.MapKey` is unique per version, `UQ_MapVersions_MapKey`). No separate correlation id (`commandId` is it). One expiry only (`acceptBy`).

```text
GoTo   { commandId, kind:"GoTo",   legId, mapKey, frameId, x, y, yaw, stopId|null, issuedAt, acceptBy }
Cancel { commandId, kind:"Cancel", legId, issuedAt }
Result { commandId, legId, streamId, reportedAt,
         phase:"ACCEPTED"|"REJECTED"|"TERMINAL",
         outcome:"ARRIVED"|"CANCELLED"|"FAILED"|null, reason|null }
```

Adjustments to the starting point, and why:

- `kind` is `GoTo`/`Cancel`, the exact ADR-0008 / §3.4 `commandKind` values, not `GOTO`/`CANCEL`.
- `x, y, yaw` are flat as in ADR-0005 and §3.1, not nested under `target`.
- `stopId` is optional metadata (ADR-0005); proposed value is `RouteRevisionStops.Id`, never a robot-local lookup key. `null` for the end leg.
- `outcome` is required only when `phase = TERMINAL`; `reason` is an UPPER_SNAKE code (e.g. `MAP_MISMATCH`, `BUSY`, `EXPIRED`, `UNKNOWN_LEG`, §3.5).
- **Refinement of §3.4:** results correlate by `commandId` (robot identity from auth), instead of `(robot, legId, commandKind)`. `legId` stays in the body and must match. The leg's terminal outcome is reported **once per leg on the GoTo command**; a `Cancel` reports only `ACCEPTED`/`REJECTED`. §3.4 shows a `TERMINAL` result on `Cancel`; this replaces that shape, not its meaning (the outcome is still the actual Nav2 outcome).

Robot rules **[ADR-0008]**: a repeated `commandId` never creates a second Nav2 goal; a different leg while busy is `REJECTED` (`BUSY`); a GoTo whose `mapKey`/`frameId` differs from the loaded map is `REJECTED` (`MAP_MISMATCH`). **[Design]** The robot rejects a GoTo received after `acceptBy` by its own clock (`EXPIRED`). Terminal results are retained and retried until acknowledged.

### 3. Command lifecycle

**[Design]** One `State` column per command row.

GoTo:

```text
PENDING  --poll, bind streamId-->        DELIVERED --ACCEPTED-->   ACCEPTED --TERMINAL--> ARRIVED | FAILED | CANCELLED
PENDING  --acceptBy passed / withdrawn--> EXPIRED      (only state that proves the robot never received it)
DELIVERED --REJECTED-->                  REJECTED
DELIVERED --TERMINAL (ACCEPTED lost)-->  ARRIVED | FAILED | CANCELLED
DELIVERED | ACCEPTED --new streamId on poll, or deadline without result--> UNKNOWN
UNKNOWN  --late valid TERMINAL-->        ARRIVED | FAILED | CANCELLED
UNKNOWN  --Operator reconciliation-->    RECONCILED   (outcome stays unknown; robot kept, NeedsInspection)
```

Cancel: `PENDING → DELIVERED → ACCEPTED | REJECTED`; `DELIVERED → UNKNOWN` on a new stream. A Cancel has no `acceptBy`: an undelivered Cancel stays deliverable.

| From | Event | To | Notes |
|---|---|---|---|
| PENDING | poll with current stream | DELIVERED | Sets `DeliveredStreamId`, `DeliveredAt`. |
| PENDING | `now > acceptBy` | EXPIRED | Checked lazily on poll/read and by a sweeper. |
| PENDING (GoTo) | Cancel requested | EXPIRED, reason `WITHDRAWN` | Same transaction; no Cancel row is created. |
| DELIVERED | `ACCEPTED` | ACCEPTED | |
| DELIVERED | `REJECTED` | REJECTED | Tour → `NEEDS_ASSISTANCE` (`NavigationFailed`). |
| DELIVERED | `TERMINAL` | outcome | Implicit acceptance; the ACCEPTED report may be lost or late. |
| DELIVERED | `now > acceptBy + clock allowance`, no result | UNKNOWN | ACK timeout. |
| ACCEPTED | `TERMINAL` | outcome | |
| ACCEPTED | leg result timeout (config) | UNKNOWN | |
| DELIVERED, ACCEPTED | poll with a different `streamId` | UNKNOWN | Not redelivered. Tour → `NEEDS_ASSISTANCE` (`CommandUnknown`). |
| UNKNOWN | `TERMINAL` from `DeliveredStreamId` | outcome | Recorded; does not advance the Tour automatically. |
| UNKNOWN | Operator reconciliation | RECONCILED | Actor/reason recorded. |

Rules:

- Repeated poll in the same stream returns the same command (same `commandId`); the robot deduplicates. A poll on a new stream never redelivers a DELIVERED/ACCEPTED command.
- Poll priority: if the robot's open GoTo has a Cancel in `PENDING`/`DELIVERED`/`ACCEPTED`, poll returns the Cancel; otherwise the open GoTo if `PENDING`/`DELIVERED`/`ACCEPTED` on this stream; otherwise `null`.
- A result is valid only from `DeliveredStreamId`, with matching `legId`, and only for an allowed transition. Exact repeat → `200 duplicate:true`. Different content for an already recorded phase → `409 RESULT_CONFLICT`. `TERMINAL` on a Cancel, or any result for PENDING/EXPIRED → `409 RESULT_PHASE_NOT_ALLOWED`. Unknown command, or another robot's → `404`.
- Cancel is its own row targeting the leg's GoTo (`TargetCommandId`). The final outcome lives on the GoTo row. Cancel losing the race with arrival gives `ARRIVED` **[ADR-0008]**.
- A late `ACCEPTED` on an UNKNOWN command is recorded as an event; state stays UNKNOWN.

Behavior in failure cases:

| Case | Behavior |
|---|---|
| Expiry | PENDING past `acceptBy` → EXPIRED. Tour → `NEEDS_ASSISTANCE` (`RobotDisconnected` if telemetry is stale, else `CommandUnknown`). Retry is a new leg (new `legId`, new command), Operator-initiated **[§3.2]**. |
| Rejected | GoTo REJECTED, Tour `NEEDS_ASSISTANCE`; no automatic retry. |
| ACK timeout | DELIVERED → UNKNOWN; robot may have started. Block new GoTo; Operator reconciles. |
| Unknown result | UNKNOWN keeps the open-GoTo slot (blocks the robot). A late valid TERMINAL resolves it; otherwise RECONCILED by the Operator, robot stays held with `NeedsInspection = 1` until on-site release **[§3.2 End Early row]**. |
| Robot loses connection | Tour `NEEDS_ASSISTANCE` (`RobotDisconnected`). Commands are not changed by staleness alone. The robot stops locally within ≤3 s **[SRS §7; physical evidence M2.3]** and reports a local interruption as `FAILED` with its own reason, never `CANCELLED` **[§6]**. Reconnect on the same stream resumes polling and result retry; nothing resumes motion. |
| Backend restart | On startup: every RUNNING Tour → `NEEDS_ASSISTANCE` (`BackendRestarted`); PENDING commands → EXPIRED; DELIVERED/ACCEPTED/UNKNOWN unchanged (late results still accepted). Dwell timers are not restored; nothing continues automatically **[§3.2]**. |
| Fleet Bridge restart | New `streamId`. On its first poll, DELIVERED/ACCEPTED → UNKNOWN. The bridge must not re-execute anything from before restart; orphan Nav2 goals are a robot-local safety concern **[§6]**. |

### 4. Storage (implemented in M2.2)

**[Design]** Reuse `dbo.Tours` for run state (each Tour runs once: `State`, `OperationalStatus`, `AssistanceReason`, `CurrentStep`, `CurrentLegId`, `CurrentLegKind`, `IsHeld`, `DwellDeadlineAt`, `StartedAt`/`EndedAt`/`EndReason`) and `dbo.TourEvents` for events/audit (it already has `CommandId`, `LegId`, target snapshot, actor, reason). Add exactly one table:

| Column | Type | Notes |
|---|---|---|
| `Id` | UNIQUEIDENTIFIER PK | The wire `commandId`. |
| `RobotId` | FK Robots | |
| `TourId` | FK Tours | Backend only; never sent. |
| `LegId` | UNIQUEIDENTIFIER | Not a FK (no leg table, §3.1.1). |
| `Kind` | VARCHAR(10) | `GoTo`, `Cancel`. |
| `TargetCommandId` | FK RobotCommands NULL | Cancel → its GoTo; NULL for GoTo. |
| `State` | VARCHAR(20) | §3 values; CHECK constraint. |
| `MapKey`, `FrameId`, `X`, `Y`, `Yaw` | NULL for Cancel | Target snapshot sent on the wire. |
| `RouteRevisionStopId` | FK NULL | Wire `stopId`; NULL for end leg/Cancel. |
| `IssuedAt`, `AcceptBy` | DATETIMEOFFSET(3) | `AcceptBy` NULL for Cancel. |
| `IssuedByUserId` | FK Users NULL | NULL when system-issued. |
| `DeliveredAt`, `DeliveredStreamId` | NULL until DELIVERED | |
| `AcceptedAt`, `CompletedAt` | NULL | `CompletedAt` = terminal/REJECTED/EXPIRED/UNKNOWN time. |
| `ReasonCode` | NVARCHAR(100) NULL | Robot or backend reason. |
| `ResolvedByUserId`, `ResolvedAt`, `ResolutionNote` | NULL | Only for RECONCILED. |
| `RowVersion` | ROWVERSION | |

Indexes:

- `UX_RobotCommands_OneOpenGoTo ON (RobotId) WHERE Kind='GoTo' AND State IN ('PENDING','DELIVERED','ACCEPTED','UNKNOWN')`: one open movement command per robot. UNKNOWN counts as open on purpose.
- `UX_RobotCommands_OneCancelPerLeg ON (LegId) WHERE Kind='Cancel' AND State IN ('PENDING','DELIVERED','ACCEPTED')`: one live or accepted Cancel per leg. A repeated Cancel request is idempotent.
- `UX_RobotCommands_OneGoToPerLeg ON (LegId) WHERE Kind='GoTo'`: a retry is a new leg.

Why not more tables:

- `TourExecution`/`ExecutionLegs`: a Tour runs once and already carries its run columns; a second run entity would duplicate them and need its own consistency rules.
- `CommandEvents`: `TourEvents` already records each command milestone with `CommandId`; a second log would diverge.
- `Mission`: explicitly not an entity (§3.2); the backend sends one leg at a time (ADR-0005).

### 5. Start sequence (M2.2)

**[Design, implementing ADR-0008 "persist intent before send" and SRS §4 "claims the robot atomically, commits, then sends the first leg"]** One transaction:

1. Lock the Tour (`UPDLOCK`), compare `expectedRowVersion` → `STALE_VERSION`; replay of the same `requestId` returns the stored receipt.
2. Re-run every Start condition (architecture §3.2) inside the transaction.
3. Lock the robot row; claim it: `Robots.CurrentTourId` from NULL to this Tour (filtered unique index `UX_Robots_CurrentTour` is the final guard), `LastAssignedAt`; `Tours.AssignedRobotId`.
4. `Tours.State` READY → RUNNING, `StartedAt`, `OperationalStatus = NORMAL`, `CurrentLegId`, `CurrentLegKind = TO_POI`, `CurrentStep`.
5. Insert the first-leg GoTo as PENDING (`UX_RobotCommands_OneOpenGoTo` guards a second one).
6. `TourEvents` (`TOUR_STARTED`, `LEG_COMMAND_ISSUED` with `CommandId` and target snapshot) and the `AuditLogs` request receipt.
7. Commit. Nothing is sent; the robot pulls the command on its next poll.

Lock order must match ADR-0039 (deployment and reservation locks taken by Tour create/deactivate); M2.2 documents the exact order with its implementation. If D8 keeps FRONT before the first leg, step 5 changes (open decision 1).

### 6. Guards

- **[Design]** `FleetCommands:Enabled`, default `false`. While false: Start is refused (`COMMAND_TRANSPORT_DISABLED`), both robot endpoints return `503 COMMAND_TRANSPORT_DISABLED`, no command row is written.
- **[Design]** Per-robot `Robots.IsDispatchEnabled` must be true for Start. Per ADR-0039 nothing sets it true today, so every Start fails this check until a writer is added. It may be set true for a physical robot only after M2.3 evidence:
  - robot stops locally on heartbeat loss within ≤3 s **[SRS §7]**, covering bridge crash and silent loss **[§6]**;
  - exactly one Nav2 goal sender: `route_test.py`, RViz and the bridge never compete **[§3.5]**;
  - the robot-reported `mapKey` matches the map actually loaded, by configuration and check, not copied from a GoTo **[§3.5]**;
  - `localized` and `motionReady` have real robot-side sources (D4).
- **[Design] D4:** `localized` and `motionReady` must be reported `true` by the robot in fresh telemetry; null/missing fails. No Operator override.
- **[Design] D3:** battery is shown, never blocks. Head FRONT and live stream checks are not part of M2.1.
- **[SRS §7] D6:** only `Tours.OperatorUserId` may Start or operate the Tour. READY/Reopen: any Staff **[SRS §2 scheduling/READY]**.

### 7. Start window (D2)

**[Design]** Start is accepted only in `[ScheduledStartAt, ScheduledStartAt + StartLateLimit]`, `StartLateLimit` configurable, default 15 minutes. **This is not an SRS requirement.** The SRS and scope say only "at/after published time" (scope §4); the schema comment on `Tours.ScheduledStartAt` gives the lower bound only. The upper bound is derived from the 15-minute after-buffer of the reservation (ADR-0034/0035). No other SRS source for an upper bound was found.

## Open decisions

1. **D8 — FRONT before the first leg.** ADR-0008 and §3.2 keep "confirm head FRONT before the first GoTo" as the current orchestration baseline, but no head command contract exists and the SRS does not state it. Decide before M2.2: keep (Start inserts a head step before the GoTo; needs the head contract) or drop for the first leg.
2. **D2 has no SRS source**, and at `T+15` the run ends at the reservation's `EndsAt` with zero buffer. What happens to a READY Tour after the window (stays READY until cancelled; no automatic transition proposed) needs confirmation.
3. **No incident source.** SRS §7 requires "no open incident", but there is no incident table or code. Proposal: until an incident store exists, the check passes with detail "chưa có incident store", because a Tour has no incidents before its single run and robot carry-over is covered by `NeedsInspection`. Group must confirm; the fail-closed alternative blocks every Start.
4. **No operator-console source.** SRS §7 requires the Operator's console connected; `FleetOperationsHub` does not track connections per user. M2.1: "chưa có nguồn → fail". Proposal for M2.2: count the Operator's open `/hubs/operations` connections in memory (single instance, ADR-0019).
5. **SRS pre-Start items outside M2.1:** FR-50 approved narration delivered to the Quest guide with receipt before Start; FR-49 camera preset; head FRONT (D8); live stream (web `StartCheck.streamLive`). All have no data source. They must be decided before M2.4 (first real POI), not silently dropped.
6. **Telemetry ≤2 s [SRS §7] vs Fleet Sync defaults.** Fleet Sync `SyncFreshness` defaults to 30 s and the bridge cadence is not measured. The Start check uses its own 2 s threshold on server receipt time; the bridge must report faster than that for the check to pass reliably. Cadence is an M2.3 measurement.
7. **Versioned stops vs legacy FKs.** `Tours.CurrentRouteStopId`/`LastArrivedRouteStopId` reference legacy `RouteStops`, and `TourEvents.TargetPoiId` references `Pois`; versioned Tours use `RouteRevisionStops`. M2.2 needs a schema decision (new nullable `RouteRevisionStops` references, or snapshot only).
8. **M2.2 simulation vs ADR-0039.** Tours may reserve only PHYSICAL robots, so a Gazebo end-to-end Start cannot use a Tour as-is. Decide: test the command endpoints with a fake bridge without Start, or a test-only path.
9. **`IsDispatchEnabled` writer.** Who enables it, with what evidence and audit, is undecided (ADR-0039 notes no writer).
10. **Web contract drift** (web change out of scope here): `StartConfirmation` lacks `attendantPresent` [SRS §7]; `StartCheck` ids differ (`groupsApproved`, `robotConnected`, `headAtFront`, `batteryMeasured`, `streamLive`); `staffApi` uses `/api/staff/tours/{id}` while the backend convention is `/api/staff/manage/tours/{id}`; `confirmRobotReady` contradicts D4; its header comment "never reserved earlier" predates ADR-0034 reservations.
11. **ADR-0008 refinements to accept explicitly:** correlation by `commandId`; leg outcome only on the GoTo command; the added `RECONCILED` state for Operator closure without a robot outcome.
12. **Pending markers.** Accepting this ADR still requires updating root `AGENTS.md` ("M2 transport ... pending") and ADR-0020 ("M2 command transport is unselected"). Not changed here.

## Consequences

- Fleet Sync v1 is unchanged; its reserved `commands` array is expected to stay empty if this ADR is accepted.
- M2.1 can implement READY/Reopen and a Start preflight that always refuses, with no schema change. M2.2 adds `RobotCommands` (schema v1.14), the Start transaction, both robot endpoints and a fake/Gazebo bridge.
- The single-API-instance limit of ADR-0019 applies to poll stream binding and console tracking.
- No code, schema, ROS interface or web file is changed by this ADR.
