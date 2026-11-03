# Staff Tour Management API

Implemented scope: legacy pre-execution behavior in
`docs/decisions/0018-admin-tour-management.md` and `docs/architecture.md`.
Every endpoint below currently requires the `Staff` JWT role (product label:
Tour Staff); the former `/api/admin/tours` alias is retired under ADR-0027. New Tours are
created from one exact tested RouteRevision with a robot reservation and an
assigned Operator; see [ADR-0034](../../docs/decisions/0034-tour-from-tested-route-revision.md). Start slots, the 72-hour
lead time and the reservation formula are in [ADR-0035](../../docs/decisions/0035-tour-slots-lead-time-and-measured-reservation.md);
slots are configured in `Tours:StartSlots`, and typed times in
`Tours:CustomStartEarliest` and `Tours:CustomStartLatest` ([ADR-0036](../../docs/decisions/0036-tour-custom-start-time.md)).
Existing legacy Tours keep their legacy Route and cannot be marked READY. READY and
Reopen follow [ADR-0042](../../docs/decisions/0042-m2-command-transport-and-start-readiness.md);
no immutable READY snapshot is stored: the Tour already pins its exact revision.

## Create a Tour from a tested Route revision

1. Authenticate with the existing `POST /api/auth/login` Staff account and use
   its accessToken in `Authorization: Bearer ...` for these calls.
2. `GET /api/routes` and pick a revision that is submitted with `verificationStatus` PASS.
   `GET /api/technical/physical-robots` and `GET /api/staff/manage/tours/operators`
   supply the robot and Operator. Physical commissioning remains separate.
3. Generate a request UUID once and POST `/api/staff/manage/tours`:

```json
{
  "requestId": "ce82b530-362e-4bc1-a2e6-7c84ae8297b1",
  "configuration": {
    "name": "Campus tour",
    "description": "Tour description",
    "routeRevisionId": "<revision with an effective PASS run>",
    "robotCode": "<physical robot code>",
    "operatorUserId": "<active Staff user from /operators>",
    "scheduledStartAt": "2026-12-01T09:00:00+07:00",
    "fallbackVideoUrl": null
  }
}
```

Use an actual future date when executing; the example is not an operational
schedule. Keep the requestId and same payload for uncertain retries. HTTP 200
returns BaseResponse data `{id}`. Identical committed retries return the original
ID; changing the payload while retaining a consumed key returns 409. Keys are
scoped to the authenticated Staff, so retry under the same account.

4. `GET /api/staff/manage/tours/{id}` returns `data.tour` (including base64 rowVersion),
   `data.route`, `data.activeRoute`, usage and permissions. New state is SCHEDULED;
   routeId = activeRouteId, no assigned robot or running step. Representative
   `GET /api/representative/tours` and `/tours/{id}` now read it without changes
   to their existing registration flow. Creating a Tour is not READY or Start.

## Update, cancel and retries

PUT `/api/staff/manage/tours/{id}` with a fresh requestId, expectedRowVersion from
`data.tour.rowVersion`, optional expectedRouteVersion, and the full configuration
shape above. Existing Tour state must be SCHEDULED with no execution/ownership
or operational history. Route changes require the destination Route's version
and recheck its data/availability. No registration history or allowed branch may
exist when changing Route or schedule. Metadata can still be corrected on a
registered SCHEDULED Tour. A changed schedule must be future; an unchanged past
schedule may remain during metadata correction. UTC milliseconds are persisted.

Changing Route before registration retains an explicit old-Route history
reference; its old itinerary cannot become silently editable. No-op PUTs do
not change version or add audit receipts. For successful real changes, retain
requestId/payload for retries; reload detail for the committed RowVersion.

POST `/api/staff/manage/tours/{id}/cancel`:

```json
{
  "requestId": "ba62deee-c176-44b4-aedc-6b7667f921bd",
  "expectedRowVersion": "<data.tour.rowVersion>",
  "reason": "Reason for cancellation"
}
```

Only SCHEDULED/READY before Start and without runtime/robot/operational use.
Registration decisions/rosters/history remain. Pending SUBMITTED registrations
become CANCELLED with timestamps/audit, so they leave the existing review queue;
prior APPROVED/REJECTED/CANCELLED decisions stay unchanged. Invitation rights are revoked
and open sessions closed atomically. The same commit queues a notice on
AuditLogs (`TOUR_CANCEL_NOTICE_REQUESTED`, registration ids only); the invitation
email worker sends one email per distinct contact address of the registrations that
were SUBMITTED or APPROVED, then records `TOUR_CANCEL_NOTICE_SENT` with the recipient
count and one `TOUR_CANCEL_NOTICE_FAILED` per failed recipient. A claim interrupted by
a restart is reported, never resent. With email disabled the commit records
`TOUR_CANCEL_NOTICE_FAILED`/`EMAIL_DISABLED`. It does not send robot commands, release
robot ownership, or grant post-Start fallback rights.
No hard DELETE endpoint exists. RUNNING, terminal and anomalous execution rows
must use later lifecycle/operational workflows instead of this cancellation API.

## READY and Reopen (ADR-0042)

POST `/api/staff/manage/tours/{id}/ready` with `{requestId, expectedRowVersion}`
moves a SCHEDULED Tour to READY. Any Staff may call it; Admin, Technical Staff and
Representative get 403. Under the Tour lock (then the map preparation, robot
deployment and robot reservation locks, in the order Tour create uses) it checks
every row of the READY conditions table in `docs/architecture.md` §3.2:
SCHEDULED with no execution state, robot ownership or operational history (the
Cancel/Edit test), an exact RouteRevision with Operator, an active
single-role Staff Operator, the revision still schedulable (submitted, effective
PASS, POI evidence, map gate; route deactivation does not count, ADR-0037), an
active reservation, the ADR-0039 robot rule, no pending row or email-change
decision, and a start still in the future. Any failure is 409
`READY_PRECONDITION_FAILED` with every failing condition:

```json
{ "errors": { "code": "READY_PRECONDITION_FAILED",
  "blockers": [ { "code": "PENDING_DECISIONS", "message": "Còn dòng đăng ký ..." } ] } }
```

Codes: `TOUR_STATE_INVALID`, `ROUTE_VERSION_REQUIRED`, `OPERATOR_REQUIRED`, the
create-time revision codes (`ROUTE_NOT_SUBMITTED`, `ROUTE_TEST_PASS_REQUIRED`,
`POI_VERIFICATION_STALE`, map gate codes), `RESERVATION_MISSING`,
`ROBOT_NOT_READY_FOR_ROUTE`, `PENDING_DECISIONS`, `START_TIME_PASSED`. Only root
causes are listed: a legacy Tour reports only `ROUTE_VERSION_REQUIRED`, a Tour
without a reservation only `RESERVATION_MISSING` (the robot check is skipped);
state, pending decisions and start time are always reported. Success writes a
`TOUR_READY` TourEvent (actor) and the request receipt in the same commit. READY
does not claim the robot, set `Robots.CurrentTourId`, start the Tour or send a command.

POST `/api/staff/manage/tours/{id}/reopen` with `{requestId, expectedRowVersion, reason}`
returns a READY Tour without execution state to SCHEDULED; another state is 409
`TOUR_STATE_INVALID`, a blank reason 400. It writes a `TOUR_REOPENED` TourEvent
(actor, reason) and the receipt; reservation, registrations and invitations are
unchanged. READY/Reopen events are not operational history, so a reopened Tour
stays editable and cancellable.

While READY, Representative create/replace/resubmit/cancel, Staff row review and
aggregate approve/reject, email-change request/review and Tour metadata PUT are
refused with `TOUR_LOCKED`; invitation support and Viewer access follow
`InvitationPolicy` and still work. Both endpoints use the receipt rules below.
`GET /api/staff/manage/tours/{id}` adds `permissions.canMarkReady`, `canReopen` and
`readyBlockers` (same list, evaluated without locks).

Matching committed retries replay before stale-version/state checks. A new
requestId with an old RowVersion conflicts. Key reuse for another payload,
action or Tour also conflicts. Audit stores hashes and changed field names,
not raw input text/rosters/access codes. Mutations use the existing Tour-first
lock convention; reference/availability reads and access revocation stay in
their transaction. No external email HTTP is inside that transaction.

## Start preflight (M2.1, ADR-0042): always refused

M2.1 has no command transport. These endpoints read the Start conditions table of
`docs/architecture.md` §3.2 from real data and never start a Tour.

GET `/api/staff/manage/tours/{id}/start-checks` (any Staff) returns
`{checks: [{id, passed, source, detail}], canStart, blockedBy}`, evaluated now
without locks. `source` is `DB`, `TELEMETRY` (in-memory Fleet Sync store),
`CONFIG` or `CONSOLE`. It includes `callerIsOperator` (is the viewer the Tour's
Operator) and leaves out the four on-site confirmations. `callerIsOperator` is
independent: for another Staff it is a root cause in `blockedBy`, and every other
check is still evaluated in full. `canStart` belongs to the caller: true only when
every returned check passed, so false for any Staff who is not the Operator, and
always false while `FleetCommands:Enabled` is false.

POST `/api/staff/manage/tours/{id}/start` with
`{requestId, expectedRowVersion, confirmation: {robotPlaced, areaClear, attendantPresent, previewChecked}}`:

- Caller is not `Tours.OperatorUserId` → 403 (a legacy Tour has no Operator, so nobody).
- RowVersion differs → 409 `STALE_VERSION`.
- Any failing check → 409 `START_PRECONDITION_FAILED` with `errors.checks` and `errors.blockedBy`.
- Every check passes except `commandTransportEnabled` → 409 `COMMAND_TRANSPORT_DISABLED` with the checks.

```json
{ "errors": { "code": "START_PRECONDITION_FAILED",
  "checks": [ { "id": "reservationActive", "passed": false, "source": "DB", "detail": "Tour chưa giữ robot ..." },
              { "id": "telemetryFresh", "passed": false, "source": "TELEMETRY", "detail": "Chưa kiểm tra vì reservationActive chưa đạt." } ],
  "blockedBy": [ "reservationActive", "commandTransportEnabled" ] } }
```

Start runs inside the Tour transaction and takes the READY lock order (Tour, map
preparation, robot deployment, robot reservations), then always throws, so nothing
commits: no State, StartedAt, `CurrentTourId`, `AssignedRobotId`, TourEvent,
receipt or command. `requestId` is required but no receipt is stored in M2.1. The
refusal is logged with Tour id, actor id, code and `blockedBy` only.

Follow-up M2.2: Start thật phải có receipt requestId (TourRequestReceipt) để chống
Start lặp, theo SRS §4 (ADR-0042 §5 step 1: a replay of the same `requestId`
returns the stored receipt).

Root causes: a check that needs another check's input runs only when that check
passed; otherwise it is `passed: false` with detail "Chưa kiểm tra vì <id> chưa đạt"
and is not in `blockedBy`. Without an active reservation no robot or telemetry
check runs; without fresh telemetry the other telemetry checks do not run.
`batteryInfo` is informational and always passes.

Configuration section `FleetCommands`: `Enabled` (default false),
`MaxTelemetryAgeSeconds` (2), `StartLateLimitMinutes` (15). `Enabled = true`
stops startup ("M2.1 chưa có command transport"). `operatorConsoleConnected` has
no source yet (`IOperatorConsolePresence` returns unknown) and always fails;
`robotDispatchEnabled` always fails because nothing sets `IsDispatchEnabled`.

## List and verification

GET `/api/staff/manage/tours?search=&state=SCHEDULED&from=<instant>&to=<instant>&page=1&size=20`.
Date bounds are inclusive schedule instants. Sort supports `name`,
`scheduledStartAt` and `createdAt`, with an optional `-` prefix for descending
order. Expansion is rejected; detail already
contains its Route contract. Summary counts mean persisted registration and
invitation records, not attendance. Staff accounts may manage all Tours;
Admin and Representative roles cannot use this Staff API. Former
`/api/admin/tours` is no longer routed. Use the Staff endpoints listed above.

From repo root, set `SMARTCAMPUS_SCHEMA_TEST_CONNECTION` to a disposable local
SQL Server test instance with CREATE DATABASE permission, then run
`bash scripts/verify backend`. SQL tests create/drop their own databases and
exercise HTTP Route creation, Tour commands, Representative registration,
invitation/session cancellation, replay/concurrency and rollback. Without the
variable SQL tests report SKIPPED. The existing runtime POIs/Routes are untouched.

The versioned Tour flow is blocked until a reliable configured route-duration
source is available for the 15-minute-buffer reservation and the existing
registration path can report row-level and email-change decisions. Current
versioned Route views return `INCOMPLETE_CONTENT_AUDIO_DATA`; measured route-test
duration is not substituted for configured total duration. Physical attendant
and operational safety-console evidence also has no current source; ADR-0042 makes
them Start checks, not READY checks. The M2.1 Start endpoint always refuses;
no Finalize endpoint exists. Branch preparation,
coordinated registered rescheduling and participant notification/expiry updates
remain separate work.

## Versioned Tour handoff status

| Check | Current evidence | Status for target scheduling |
|---|---|---|
| Exact submitted RouteRevision and latest navigation result | `/api/routes/{routeId}/revisions` returns immutable revision and PASS/FAIL source evidence | Readable, but current Tour cannot persist the selected revision |
| Configured total path duration | Route view reports `INCOMPLETE_CONTENT_AUDIO_DATA`; only dwell subtotal is known | **Blocked**; do not substitute measured navigation-test duration |
| Explicit assigned Operator | User can be validated as one active `Staff` role, but Tour has no Operator field or API | **Unavailable** |
| Robot interval and overlap | No versioned reservation table or interval query; legacy Tours have no reservation duration/robot link suitable for exclusion | **Unknown**; do not claim a conflict-free slot |
| Registration-row/email decisions | `HasPendingDecisionsAsync`: active PENDING rows and PENDING email-change requests | READY refuses with `PENDING_DECISIONS` |
| Safety attendant/operations-console preflight | Attendant is an on-site Start confirmation; console presence has no source | `attendantPresent` is a Start confirmation; `operatorConsoleConnected` fails until a source exists |

Target role/action boundary: Tour scheduling, configuration, readiness and
pre-Start cancellation belong to `Staff` (product label Tour Staff). The assigned
Operator is an explicitly selected active Staff account; CreatedByUserId cannot
stand in for that assignment. Admin has no routine Tour-management permission;
F-14 remains pending. Technical Staff, Representatives and Viewers have no Tour
scheduling action. Start is preflight-only and always refused (M2.1);
assigned-Operator runtime actions have no endpoint. These are target boundaries, not claims that the
versioned API is implemented.
