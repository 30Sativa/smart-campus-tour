# Staff Tour Management API

Implemented scope: `docs/decisions/0018-admin-tour-management.md` and
`docs/architecture.md`. Staff management screens bind to this API; operational simulation surfaces
remain separate. No SQL schema patch, physical data seeding, dispatch or robot
operation is needed for this feature.

## Create a Tour from an existing SQL Route

1. Authenticate with the existing `POST /api/auth/login` Staff account and use
   its accessToken in `Authorization: Bearer ...` for these calls.
2. `GET /api/staff/manage/routes?isActive=true&page=1&size=20`, choose a Route, then
   `GET /api/staff/manage/routes/{routeId}` to obtain its current `version`. Its POIs
   must be active and its configuration/data/map context valid. Do not modify
   POIs/Route just to bypass validation. Physical commissioning remains separate.
3. Generate a request UUID once and POST `/api/staff/manage/tours`:

```json
{
  "requestId": "ce82b530-362e-4bc1-a2e6-7c84ae8297b1",
  "expectedRouteVersion": "<version from Route detail>",
  "configuration": {
    "name": "Campus tour",
    "description": "Tour description",
    "routeId": "<existing Route GUID>",
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
`/api/admin/tours` URLs are Staff-only compatibility aliases.

From repo root, set `SMARTCAMPUS_SCHEMA_TEST_CONNECTION` to a disposable local
SQL Server test instance with CREATE DATABASE permission, then run
`bash scripts/verify backend`. SQL tests create/drop their own databases and
exercise HTTP Route creation, Tour commands, Representative registration,
invitation/session cancellation, replay/concurrency and rollback. Without the
variable SQL tests report SKIPPED. The existing runtime POIs/Routes are untouched.

Next tasks: coordinated registered rescheduling
and participant notifications/expiry updates, READY/Finalize/Reopen, branch
preparation, and Staff/runtime readiness/Start. These are not implicitly
implemented by CRUD or the IsActive flag.
