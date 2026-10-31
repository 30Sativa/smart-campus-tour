# ADR-0018: Backend Admin Tour management before execution

> Scoped succession, 2026-10-27: [ADR-0020](0020-srs-v02-business-baseline-and-technical-staff.md). Admin Tour management remains current implementation. Target scheduling/READY belongs to Staff with explicit assignment and buffered reservation. CreatedByUserId remains attribution. Durable retries and current transaction evidence are retained. No new advisor approval is recorded.


Date: 2026-10-19. Status: owner-authorized implementation scope, not advisor
approval. Extends ADR-0017; no schema change or runtime implementation.

## Decision

All Admin accounts may manage Tours; CreatedByUserId is attribution, not an
ownership restriction. Create uses an active, data-valid Route and active POIs,
checks its aggregate revision, and creates SCHEDULED with RouteId equal to
ActiveRouteId, no robot or execution state. A future schedule is required for
create or a changed schedule. Unchanged past schedules do not prevent metadata
correction on an otherwise editable SCHEDULED Tour. Inputs use UTC-normalized
millisecond precision, matching DATETIMEOFFSET(3).

Metadata is editable only before execution while SCHEDULED. Schedule and Route
changes additionally require no registrations (including historical ones),
allowed branches, operational history or runtime references. Rescheduling an
already registered Tour needs the coordination/notification/expiry workflow
in scope section 4; that workflow is deferred, not silently omitted while
allowing its data change. No existing invitation expiry is rewritten here.
When a pre-registration Tour changes Route, append a configuration-only
TOUR_ROUTE_CHANGED TourEvent pointing at the old Route so ADR-0017 preserves
its itinerary. This event asserts no arrival, navigation or physical test.

Use Cancel, never hard DELETE: even creation has append-only Tour audit
references. Cancel is allowed from SCHEDULED or READY before Start, without
robot ownership, execution fields or operational/branch-request history.
It stores CANCELLED, EndedAt and a reason; retains registration decisions,
rosters, routes, variants and history; revokes invitations and closes their
sessions atomically. Pending SUBMITTED registrations become CANCELLED with
timestamps/audit so the existing review queue has no impossible work; prior
APPROVED/REJECTED/CANCELLED decisions remain unchanged. It sends no robot/email command and does not offer the
post-Start fallback entitlement. Future cancellation notifications remain
separate work. RUNNING/terminal Tours are read-only here. Finalize/Reopen,
branch authoring and Staff runtime actions are not included.

## Consistency and retries

Tour mutation transactions use read committed isolation and the same parent
Tour UPDLOCK as registration/invitation writers. Selected Route roots and POIs
are locked through commit using the existing Route repository; no parallel
Route model or repository is created. Tour commands have a feature-specific
transaction wrapper so SQL deadlock/key conflicts are rolled back and
reported as 409 without changing other feature pipelines. Existing Tour writers
remain Tour-first. Future Start/READY writers must use this parent lock too.

Every mutation has a UUID requestId. A transaction-owned application lock
serializes (Admin, requestId) across Tour commands. Append-only AuditLogs hold
the original action, resource and canonical payload hash. Identical committed
retries return the original result before current versions/state/time checks;
reuse for another payload/action/resource conflicts. Create returns its original
server-generated Tour ID even after later edits/cancellation. No-op updates do
not append an audit row; retrying them may require a fresh version after another
writer changes the Tour. Updates/cancellation require SQL RowVersion. No
idempotency table, hidden startup seed or automatic mutation retry is added.
