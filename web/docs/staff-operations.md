# Staff console (`/staff/*`) — remote tours

## Operations on the real backend (M2, 2026-11-04)

The operations console no longer has a mock data source. The simulation
(`mocks/staff-sim.ts`, `staff-mock.ts`, `staff-realtime-mock.ts`), its binding
`features/staff/staff-hooks.ts`, the "Chế độ mô phỏng" label and the screens'
mock-only components were removed. Every Tour or robot value on these screens is
read from the backend; a value the backend does not provide is said to be missing.

Two vocabularies are kept apart on every screen:

- **Tour state**: `SCHEDULED → READY → RUNNING → COMPLETED | CANCELLED`, plus
  `operationalStatus` (`NORMAL` / `NEEDS_ASSISTANCE` with a reason) and
  `currentStep` (`NAVIGATING`, `OBSERVING`, `RETURNING_TO_END`; ADR-0043 D8).
- **Robot command state** of the current leg (ADR-0042 §3): `PENDING`,
  `DELIVERED`, `ACCEPTED`, `ARRIVED`, `FAILED`, `CANCELLED`, `EXPIRED`,
  `REJECTED`, `UNKNOWN`, `RECONCILED`. A RUNNING Tour whose GoTo is still
  `PENDING` says "Chờ robot lấy lệnh, robot chưa di chuyển vì lệnh này".

| Route | Screen | Backend |
|---|---|---|
| `/staff` | Tổng quan vận hành: today's Tours, running Tours with step and command state, Tours needing assistance, robot telemetry | `GET /api/staff/manage/tours` (today, `phase=RUNNING`), Tour detail, `/hubs/operations` |
| `/staff/tours` | Buổi hôm nay: today's Tours, one next step per state | `GET /api/staff/manage/tours?from&to` |
| `/staff/tours/:id` | Redirect to the screen that fits the Tour's state | Tour detail |
| `/staff/tours/:id/start` | Kiểm tra trước khi bắt đầu: a verdict first, then only the root causes tagged by who can clear them (system limit, permission, schedule, robot, telemetry); the full list folded per group; Start and the 4 on-site confirmations in a sticky side column (confirmations shown only to the assigned Operator) | `GET …/start-checks` (polled 3 s), `POST …/start` |
| `/staff/live[/:id]` | Điều hành trực tiếp: freshness line, a situation card (what is happening and the one step it calls for: Next, Retry leg or Reconcile), Tour state, command card with the robot's own leg report, route, robot telemetry, a separate End Early panel | Tour detail `execution`/`allowedActions` (polled 3 s), `POST …/next`, `…/retry-leg`, `…/end-early`, `…/commands/{commandId}/reconcile`, `/hubs/operations` |
| `/staff/manage/tours/:id` | Tour preparation, now with **Chốt Tour (READY)** and **Mở lại** | `permissions.canMarkReady/canReopen/readyBlockers`, `POST …/ready`, `POST …/reopen` |
| `/staff/robot`, `/staff/schedule`, `/staff/history` | unchanged, already API-backed | — |

Rules the screens follow:

- Buttons follow the server: READY follows `permissions.canMarkReady`, Start
  follows `start-checks.canStart` plus the four confirmations, Next, Retry leg,
  End Early and Reconcile follow `allowedActions.next/retryLeg/endEarly/reconcile`.
  A disabled button prints the server's reason and the failing check labels.
  The browser decides nothing; the server rechecks everything under its locks.
- The situation card (`operations/situation.ts`) reads the command state before
  the assistance reason: an UNKNOWN GoTo points at Reconcile, never Retry; an
  EXPIRED or RECONCILED one leaves only End Early; Retry is shown (enabled or
  held by a movement check) only when `retryLeg` is not refused with
  `TOUR_RETRY_NOT_ALLOWED`. Any action the server allows that the card did not
  expect is still offered, so the screen cannot hide a way forward.
- Only the Tour's Operator gets controls; other Staff see the same console and
  are told who operates. End Early sits in its own panel, needs a reason, says
  what happens to the open command (withdrawn if never taken, a Cancel queued
  otherwise, an UNKNOWN one kept for Reconcile) and that it is not an Emergency
  Stop. Reconcile needs a note of what was seen on site and is offered on an
  ended Tour too, because its UNKNOWN command keeps the robot held.
- A failed poll keeps the last answer on screen with a "không cập nhật được"
  notice instead of replacing the console with an error. While the Tour or the
  start checks are older than 10 s or the last poll failed, the actions that
  make the robot move (Start, Next, Retry) are locked; End Early and Reconcile
  stay available. An open confirmation cannot be confirmed once the server
  withdraws the action or the screen falls behind.
- The Operator's console presence (`operatorConsoleConnected`, a movement check)
  is this browser's `/hubs/operations` connection, so the console says when it is
  not connected.
- A check the server did not run because a prerequisite failed (not in
  `blockedBy`) reads "Chưa kiểm tra", so root causes come first. `batteryInfo`
  is informational.
- When `commandTransportEnabled` or `robotDispatchEnabled` fails, a notice says
  the system itself does not allow robot motion yet (M2.3 safety evidence,
  ADR-0043 D11). There is no override.
- Every write sends `requestId` and, except Reconcile (it targets one command),
  `expectedRowVersion`. The request id is kept per intent (action, row version
  and, for End Early and Reconcile, the typed reason, which the server
  fingerprints), so a retry after a lost response replays instead of acting
  twice, and a changed reason is a new request. Success is announced only after the server answers
  200; a 409 shows the server's code in words (`COMMAND_TRANSPORT_DISABLED`,
  `START_PRECONDITION_FAILED`, `MOVE_PRECONDITION_FAILED`, `TOUR_COMMAND_OPEN`,
  `ROBOT_CLAIM_FAILED`, `READY_PRECONDITION_FAILED` with its blockers, `STALE_VERSION`,
  `TOUR_RETRY_NOT_ALLOWED`, `COMMAND_STATE_INVALID`). A 403 on an Operator action
  says only the assigned Operator may act.
- Telemetry comes from `FleetUpdated` on `/hubs/operations`, connected once by
  the shell with the in-memory JWT (`accessTokenFactory`). A closed connection
  restarts after 5 s. Ages keep counting between broadcasts and a lost
  connection is shown, so old values never look current. Telemetry is the
  robot's own report, not a Tour state and not proof that a command ran.
- The web page is not an Emergency Stop (web/AGENTS.md §7); the live console says so.

### Not available yet, and why

| Missing | Cause | Suggested resolution |
|---|---|---|
| Releasing a held robot after End Early or Reconcile | `POST /api/technical/physical-robots/{id}/release-inspection` exists (Technical Staff, ADR-0043 D13) but `/technical/*` has no screen for it | Add release-inspection to the Technical robots page; the Staff console only says the robot waits for a Technical Staff check |
| Ended Tours that still hold an UNKNOWN command in the overview | `TourSummary` has no execution fields, and only RUNNING Tours are read in detail | Return the execution summary in the list; until then the ended Tour's "Xem Tour" opens its console, which offers Reconcile |
| Notifying groups and revoking live/fallback/Q&A on End Early | FR-48 consequences are a follow-up (ADR-0043 D14) | The End Early dialog tells the Operator to inform groups by the usual means |
| Tour event log | No Tour event read API | `GET …/tours/{id}/events` (TourEvents) |
| Push updates of Tours | `TourUpdated`/`AssistanceRequired` hub events are planned only | Emit them on the hub; screens then refetch instead of polling |
| Start can succeed | `FleetCommands:Enabled=false`, nothing sets `IsDispatchEnabled` | M2.3 safety evidence and the D11 writer |
| Operational Twin with real pose | Needs the measured ROS map → Twin transform | Calibrate, then feed `FleetUpdated.pose` to the twin |
| Operational status in the Tour list | `TourSummary` has no execution fields | Add `operationalStatus` to the list summary; the overview currently reads each running Tour's detail |

## Staff interface update (2026-10-30)

- Navigation has three sections: operations, Tour preparation, and history.
  Creating a Tour is a page action; pending/all registrations share one navigation
  entry and retain both existing URLs with links between the views.
- The preparation overview reads the live Tour, registration-review and POI
  APIs. Summary totals use pagination metadata, not the preview row count.
  Loading/failure never becomes a zero total; sections fail independently.
- Schedule views are exclusive: week, day timeline, or list (`?view=week|day|list`).
  Selecting a week cell opens that day. History puts its searchable list before
  optional charts.
- POI summaries, rows and map markers share an explicit map-version selection.
  Empty filters and API errors are distinct. Route cards keep revision history
  collapsed and support server pagination.

## Roles

Business ownership follows ADR-0020; preparation routes follow ADR-0025/0027.
Any Staff prepares Tours, marks READY and reopens. Only the Tour's assigned
Operator (`Tours.OperatorUserId`) may Start or operate it (ADR-0042 D6); for any
other Staff the start checks report `callerIsOperator` as the root cause.
Admin never prepares, starts or operates a Tour.

## Code layout

```
src/features/administration/tours/api/tours.ts   Tour API, incl. ready/reopen/start-checks/start/next
src/features/administration/tours/TourReadyPanel.tsx   Chốt Tour / Mở lại on the preparation detail
src/features/staff/operations/hooks.ts           operation queries (polling), freshness, write mutations, per-intent request ids
src/features/staff/operations/fleet-telemetry.ts /hubs/operations FleetUpdated, connection state
src/features/staff/operations/operation-labels.ts check, step, command-state and reason vocabulary
src/features/staff/operations/operation-errors.ts structured 4xx refusals
src/features/staff/operations/OperationParts.tsx  execution, command card, telemetry, system-gate notice
src/features/staff/operations/StartCheckList.tsx  grouped server checks
src/features/staff/operations/situation.ts       what is happening and the one suggested step, from server state
src/features/staff/operations/TourActions.tsx    Next/Retry/Reconcile/End Early behind server gates and confirmations
```

`/staff/digital-twin` remains a local, labelled workbench (six simulated robots);
it sends no command and does not represent a Tour. See
`web/docs/physical-digital-twin.md` and [local patrol fleet](patrol-demo.md).
