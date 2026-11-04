# ADR-0043: M2.2 Tour orchestration scope

- **Status:** Accepted by the repository owner, 03/11/2026. Schema v1.14 implements the storage part (§ Storage); handlers and endpoints are later M2.2 slices.
- **Supplements:** ADR-0042 (command transport, lifecycle, `RobotCommands`, Start sequence), ADR-0008 (command/result semantics), ADR-0005 (backend-owned per-leg orchestration).
- **Related:** ADR-0034/0035 (Tour from a tested revision, reservation), ADR-0039 (usable robot, no Gazebo Tours), `docs/architecture.md` §3.2, §3.4–§3.6, §6.

## Context

ADR-0042 chose the transport and the command lifecycle and left open decisions that block M2.2: FRONT before the first leg (D8), which stop columns a versioned Tour uses (open decision 7), how to test without relaxing ADR-0039 (open decision 8) and the `IsDispatchEnabled` writer (open decision 9). M2.2 also needs explicit limits on dwell, release and End Early so the first navigation slice stays small.

## Decision

### D8 — No head FRONT confirmation in M2.2–M2.4

M2.2 to M2.4 are a navigation MVP: Start sends the first GoTo directly, and Next sends the next GoTo without waiting for a FRONT report. Head and camera presets are implemented in M2.5, before any real student watches a Tour.

This **deliberately revises** the "current orchestration decision" of ADR-0008 and architecture §3.2 (FRONT before the first leg and `Next → FRONT → next leg`) for M2.2–M2.4 only. Reason: no head command contract exists, the SRS does not state the FRONT sequence, and gating navigation on an unimplemented actuator would block every movement test. Head/pan presets remain a V1 requirement.

`Tours.CurrentStep` uses `NAVIGATING`, `OBSERVING` and `RETURNING_TO_END`. `PREPARING_VIEW` and `RETURNING_FRONT` are not used until M2.5.

### D9 — Versioned stop columns

Schema v1.14 adds `Tours.CurrentRevisionStopId` and `Tours.LastArrivedRevisionStopId`, both nullable FKs to `RouteRevisionStops`. For a versioned Tour the legacy `CurrentRouteStopId`/`LastArrivedRouteStopId` stay NULL; a CHECK keeps each pair to its own kind of Tour. `TourEvents` is unchanged: the target is recorded as a snapshot (map key, frame, x, y, yaw, stop order), and `TourEvents.TargetPoiId` stays NULL for versioned Tours.

Reason: versioned Tours run on immutable `RouteRevisionStops` (ADR-0034); pointing them at legacy `RouteStops` would need fake rows.

**Known gap:** `EfStudentTourViewReader` reads the legacy columns, so the student screen of a versioned Tour does not follow its progress yet. Fixed in M2.5 with the web.

### D10 — Testing without relaxing ADR-0039

The backend is tested with a fake bridge (test code that polls and reports results over the command contract). The bridge is tested with a fake backend plus Gazebo. Tours still reserve only PHYSICAL robots; ADR-0039 is not relaxed and there is no test-only Tour path.

Reason: each side is proven against the contract, and no production path exists that would let a simulated robot run a real Tour.

### D11 — `IsDispatchEnabled` writer in M2.3

The endpoint that sets `Robots.IsDispatchEnabled` is built in M2.3, together with the safety evidence it requires (ADR-0042 §6). Until then no API sets it, so every real Start fails `robotDispatchEnabled`.

### D12 — Operator advances; no automatic dwell or Hold

The Tour does not leave a POI when the dwell ends. `DwellDeadlineAt` is set for display only; the Operator presses Next. Hold is not implemented.

Reason: automatic departure needs a timer that survives restart and a Hold race design (§3.2); manual Next has neither problem.

### D13 — Release

A normal end (arrival at the end, or last POI with `EndMode = LAST_POI`) releases the robot in the same transaction: `Robots.CurrentTourId = NULL`. After End Early, or whenever `NeedsInspection = 1`, the robot stays held until a Technical Staff release-inspection: reason required, and refused while the robot has any open command (`IsOpen = 1`).

Reason: a normal arrival proves where the robot is; End Early and unknown outcomes do not (§3.2 End Early row, §6).

### D14 — End Early in M2.2 is state and commands only

End Early sets the Tour state, withdraws or cancels the open command and holds the robot. The FR-48 consequences (revoke live/fallback/Q&A, notify accepted groups) are a follow-up.

## Tour transitions in M2.2

| From | Operation / event | To | Allowed when |
|---|---|---|---|
| READY | Start (Operator) | RUNNING, `OperationalStatus = NORMAL`, `CurrentStep = NAVIGATING`, `CurrentLegKind = TO_POI` | every Start check passes (architecture §3.2) and `FleetCommands:Enabled = true` |
| RUNNING / NAVIGATING | GoTo `TERMINAL ARRIVED` on a `TO_POI` leg | `CurrentStep = OBSERVING`, `LastArrivedRevisionStopId`, new `CurrentStopVisitId`, `DwellDeadlineAt` (display) | result valid for the current leg |
| RUNNING / OBSERVING | Next (Operator) | `NAVIGATING` to the next stop, or `RETURNING_TO_END` (`EndMode = POSE`), or COMPLETED (`EndMode = LAST_POI`) | `OperationalStatus = NORMAL`, no open command, movement checks pass |
| RUNNING / RETURNING_TO_END | GoTo `TERMINAL ARRIVED` on the `TO_END` leg | COMPLETED, `EndedAt`, robot released (D13) | result valid for the current leg |
| RUNNING, NORMAL | GoTo `TERMINAL FAILED` | `OperationalStatus = NEEDS_ASSISTANCE`, `AssistanceReason = NavigationFailed` | current leg |
| RUNNING, NORMAL | GoTo `REJECTED` | `OperationalStatus = NEEDS_ASSISTANCE`, `AssistanceReason = CommandRejected`; the robot's reason is kept in the `TourEvent` | current leg; refines ADR-0042 §3, which used `NavigationFailed` |
| RUNNING, NORMAL | command becomes UNKNOWN or EXPIRED | `NEEDS_ASSISTANCE` (`CommandUnknown` or `RobotDisconnected`) | ADR-0042 §3 |
| RUNNING | backend start-up | `NEEDS_ASSISTANCE` (`BackendRestarted`) | always; nothing resumes |
| RUNNING / NEEDS_ASSISTANCE | Retry leg (Operator) | `NORMAL`, new GoTo with a new `legId` to the same target | `AssistanceReason` is `NavigationFailed` with the old GoTo terminal `FAILED`, or `CommandRejected` with the old GoTo `REJECTED` (never UNKNOWN/RECONCILED); movement checks pass |
| RUNNING (any) | End Early (Operator) | CANCELLED, `EndedAt`, `EndReason`, `NeedsInspection = 1`, robot kept | always while RUNNING |

A late result for an earlier leg is recorded as a `TourEvent` and changes no Tour state.

## Command transitions

The command lifecycle is ADR-0042 §3 unchanged (`PENDING → DELIVERED → ACCEPTED → ARRIVED | FAILED | CANCELLED`, `EXPIRED`, `REJECTED`, `UNKNOWN`, `RECONCILED`). This ADR adds no command state.

## Operations allowed per state

| Operation | Actor | Allowed |
|---|---|---|
| Start | Tour Operator | Tour READY, all Start checks pass, transport enabled |
| Next | Tour Operator | RUNNING, `NORMAL`, `OBSERVING`, robot has no open command, movement checks pass |
| End Early | Tour Operator | RUNNING (any operational status or step) |
| Retry leg | Tour Operator | RUNNING, `NEEDS_ASSISTANCE`, old GoTo FAILED (`NavigationFailed`) or REJECTED (`CommandRejected`), never UNKNOWN or RECONCILED. Movement checks must include `executionIdle` and `mapContextMatches`, so a `BUSY` or `MAP_MISMATCH` rejection cannot retry in a loop |
| Reconcile | Tour Operator | a command of the Tour in UNKNOWN → RECONCILED; the Tour stays `NEEDS_ASSISTANCE`, robot `NeedsInspection = 1`; afterwards only End Early |
| Release-inspection | Technical Staff | the Tour holding the robot is COMPLETED or CANCELLED, robot has no open command; reason required |

"Movement checks" are the subset of the Start checks that apply to a new command during a Tour: `robotNotNeedsInspection`, `robotDispatchEnabled`, `noOpenIncident`, `noUnresolvedCommand`, `telemetryFresh`, `mapContextMatches`, `executionIdle`, `robotLocalized`, `motionReady`, `operatorConsoleConnected`, `commandTransportEnabled`. The Start-only rows (READY, window, reservation, revision still schedulable, map assignment, robot not held) are left out: the Tour already holds its robot, and a later route test FAIL or a passed window must not strand a running Tour. Next on the last POI of a `LAST_POI` route creates no command, so no movement check applies.

## Storage (schema v1.14)

`dbo.RobotCommands` follows ADR-0042 §4 and names its columns as that table does, with three additions:

| Column | Why it is added |
|---|---|
| `LegKind` (`TO_POI`, `TO_END`) | A result must be applied without reading the Tour first; a `TO_END` GoTo has no stop. |
| `IsOpen` (BIT) | Filtered unique indexes cannot use `OR`/`NOT IN`, and a CHECK keeps it equal to "state is open for this kind". |
| `Outcome` | The terminal outcome on its own column; a CHECK keeps it equal to `State` for `ARRIVED`/`FAILED`/`CANCELLED` and NULL otherwise. |

`Kind` stores the wire values `GoTo`/`Cancel` (ADR-0042 §2). Open means: GoTo in `PENDING`, `DELIVERED`, `ACCEPTED` or `UNKNOWN` (UNKNOWN keeps the robot blocked on purpose); Cancel in `PENDING`, `DELIVERED` or `ACCEPTED`. The exact columns, CHECKs and indexes are in `backend/database/smart-campus-tour-schema-v1.14.sql`.

## Out of scope

Automatic dwell departure and Hold; head/camera presets and FRONT; branches; FR-48 notifications and media revocation; the student view of versioned Tours; physical dispatch (needs M2.3 evidence and the D11 writer).

## Consequences

- M2.2 can implement Start, results, Next, End Early, Retry, Reconcile, release-inspection, restart handling and the sweeper on v1.14 without another schema change.
- Versioned Tours show no progress on the student screen until M2.5.
- Every navigation test before M2.3 runs against a fake bridge or Gazebo, never a Tour on a physical robot.
