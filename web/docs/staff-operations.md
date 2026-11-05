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
| `/staff/live[/:id]` | Điều hành trực tiếp: Tour state, command card, route, robot telemetry, Next | Tour detail `execution`/`allowedActions` (polled 3 s), `POST …/next`, `/hubs/operations` |
| `/staff/manage/tours/:id` | Tour preparation, now with **Chốt Tour (READY)** and **Mở lại** | `permissions.canMarkReady/canReopen/readyBlockers`, `POST …/ready`, `POST …/reopen` |
| `/staff/robot`, `/staff/schedule`, `/staff/history` | unchanged, already API-backed | — |

Rules the screens follow:

- Buttons follow the server: READY follows `permissions.canMarkReady`, Start
  follows `start-checks.canStart` plus the four confirmations, Next follows
  `allowedActions.next`. A disabled button prints the server's reason and the
  failing check labels. The browser decides nothing; the server rechecks
  everything under its locks.
- A check the server did not run because a prerequisite failed (not in
  `blockedBy`) reads "Chưa kiểm tra", so root causes come first. `batteryInfo`
  is informational.
- When `commandTransportEnabled` or `robotDispatchEnabled` fails, a notice says
  the system itself does not allow robot motion yet (M2.3 safety evidence,
  ADR-0043 D11). There is no override.
- Every write sends `requestId` and `expectedRowVersion`. The request id is kept
  while the row version is unchanged, so a retry after a lost response replays
  instead of acting twice. Success is announced only after the server answers
  200; a 409 shows the server's code in words (`COMMAND_TRANSPORT_DISABLED`,
  `START_PRECONDITION_FAILED`, `MOVE_PRECONDITION_FAILED`, `TOUR_COMMAND_OPEN`,
  `ROBOT_CLAIM_FAILED`, `READY_PRECONDITION_FAILED` with its blockers, `STALE_VERSION`).
  A 403 on Start/Next says only the assigned Operator may act.
- Telemetry comes from `FleetUpdated` on `/hubs/operations`, connected once by
  the shell with the in-memory JWT (`accessTokenFactory`). A closed connection
  restarts after 5 s. Ages keep counting between broadcasts and a lost
  connection is shown, so old values never look current. Telemetry is the
  robot's own report, not a Tour state and not proof that a command ran.
- The web page is not an Emergency Stop (web/AGENTS.md §7); the live console says so.

### Not available yet, and why

| Missing | Cause | Suggested resolution |
|---|---|---|
| End Early, Retry leg, Reconcile | No endpoints yet (ADR-0043 lists them for M2.2) | Add `POST …/end-early`, `…/retry-leg`, `…/commands/{id}/reconcile` with the same `allowedActions` pattern; the console shows them disabled with a reason until then |

Releasing a held robot is no longer missing: the Technical robots page
(`/technical/robots`) marks robots with `needsInspection` or a holding Tour as
"Chờ kiểm tra tại chỗ" and offers "Trả robot về sử dụng" in the robot's detail
dialog, behind a confirmation with a required note of what was checked on site.
It calls `POST /api/technical/physical-robots/{id}/release-inspection`
(Technical Staff only, ADR-0043 D13) and is disabled while the holding Tour has
not ended. The Staff console only says the robot waits for that check.
| Marking the current stop on the route | `execution.currentRevisionStopId` is a `RouteRevisionStops.Id`, but the revision stop view has no `id` | Add `id` to `RouteRevisionStopView`, or return the stop order in `execution` |
| Tour event log | No Tour event read API | `GET …/tours/{id}/events` (TourEvents) |
| Push updates of Tours | `TourUpdated`/`AssistanceRequired` hub events are planned only | Emit them on the hub; screens then refetch instead of polling |
| Operator console presence | `operatorConsoleConnected` always fails (no source) | Count the Operator's `/hubs/operations` connections (ADR-0042 open decision 4) |
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
src/features/staff/operations/hooks.ts           operation queries (polling) and Start/Next mutations
src/features/staff/operations/fleet-telemetry.ts /hubs/operations FleetUpdated, connection state
src/features/staff/operations/operation-labels.ts check, step, command-state and reason vocabulary
src/features/staff/operations/operation-errors.ts structured 4xx refusals
src/features/staff/operations/OperationParts.tsx  execution, command card, telemetry, system-gate notice
src/features/staff/operations/StartCheckList.tsx  grouped server checks
```

`/staff/digital-twin` remains a local, labelled workbench (six simulated robots);
it sends no command and does not represent a Tour. See
`web/docs/physical-digital-twin.md` and [local patrol fleet](patrol-demo.md).
