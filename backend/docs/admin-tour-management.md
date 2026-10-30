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
Existing legacy Tours keep their legacy Route. READY snapshots stay blocked by
[ADR-0024](../../docs/decisions/0024-versioned-tour-scheduling-blockers.md).

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
and open sessions closed atomically. It does not send cancellation email or
robot commands, release robot ownership, or grant post-Start fallback rights.
No hard DELETE endpoint exists. RUNNING, terminal and anomalous execution rows
must use later lifecycle/operational workflows instead of this cancellation API.

Matching committed retries replay before stale-version/state checks. A new
requestId with an old RowVersion conflicts. Key reuse for another payload,
action or Tour also conflicts. Audit stores hashes and changed field names,
not raw input text/rosters/access codes. Mutations use the existing Tour-first
lock convention; reference/availability reads and access revocation stay in
their transaction. No external email HTTP is inside that transaction.

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
and operational safety-console evidence also has no current source, so READY
must remain blocked/unknown for those checks. No target reservation, READY,
Finalize/Reopen or Start endpoint is currently available. Branch preparation,
coordinated registered rescheduling and participant notification/expiry updates
remain separate work.

## Versioned Tour handoff status

| Check | Current evidence | Status for target scheduling |
|---|---|---|
| Exact submitted RouteRevision and latest navigation result | `/api/routes/{routeId}/revisions` returns immutable revision and PASS/FAIL source evidence | Readable, but current Tour cannot persist the selected revision |
| Configured total path duration | Route view reports `INCOMPLETE_CONTENT_AUDIO_DATA`; only dwell subtotal is known | **Blocked**; do not substitute measured navigation-test duration |
| Explicit assigned Operator | User can be validated as one active `Staff` role, but Tour has no Operator field or API | **Unavailable** |
| Robot interval and overlap | No versioned reservation table or interval query; legacy Tours have no reservation duration/robot link suitable for exclusion | **Unknown**; do not claim a conflict-free slot |
| Registration-row/email decisions | Current registration is aggregate; there is no row email-change request workflow | **Unknown** when deciding READY |
| Safety attendant/operations-console preflight | No persisted check source in backend | **Unknown**; READY must remain blocked |

Target role/action boundary: Tour scheduling, configuration, readiness and
pre-Start cancellation belong to `Staff` (product label Tour Staff). The assigned
Operator is an explicitly selected active Staff account; CreatedByUserId cannot
stand in for that assignment. Admin has no routine Tour-management permission;
F-14 remains pending. Technical Staff, Representatives and Viewers have no Tour
scheduling action. Start and assigned-Operator runtime actions are outside this
slice and have no endpoint. These are target boundaries, not claims that the
versioned API is implemented.
