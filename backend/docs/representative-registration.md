# Representative registration and per-row access (Wave C)

This is the backend contract for the current per-row registration slice. It
does not add a Viewer account or claim that scheduling, READY, media relay, or
robot operation is implemented. API responses use the existing `BaseResponse`
envelope unless noted.

## Representative scope

All endpoints require the `Representative` JWT role. Mutations are owner-scoped
and serialized under the parent Tour lock. The current target allows one
registration per Representative/Tour and at most ten viewing-point rows per
registration. A shared-viewing row counts once regardless of how many students
watch it. Creating a registration or adding a row is blocked from 48 hours
before the scheduled start. Existing rows in an update must include their
current `rowId`; omitting a row removes that row and revokes only its own
invitation/session. A newly added row omits `rowId` and starts `PENDING`.
One update may mix retained rows, omitted-row removals, and additions. Supplied
IDs must identify active rows in this registration; unknown or inactive IDs
are rejected. This is a stable-row diff, not whole-list replacement: keep the
IDs for rows that remain. The active-row limit remains 10, and only additions
are blocked by the 48-hour cutoff.

`GET /api/representative/registrations/{id}` returns roster rows including
`id`, `participationState`, `rowVersion`, invitation row version and allowed
row actions. `PUT /api/representative/registrations/{id}` and
`POST .../{id}/resubmit` take `{input, expectedRowVersion}`. The `input` includes
the existing `expectedTourRowVersion` and roster; use row IDs returned by the
detail endpoint. Accepted-row email changes must use the request flow below;
an accepted row cannot change its viewing-point type through roster replace.

## Row review

Staff uses `POST /api/staff/manage/registrations/{registrationId}/rows/{rowId}/accept`
or `/reject` with `requestId`, `expectedRegistrationRowVersion`,
`expectedTourRowVersion`, `expectedRowVersion`, and (for rejection) `reason`.
Only an active pending row can be decided. Acceptance creates that row's
invitation when invitation delivery is enabled. Rejection does not revoke or
change another row's invitation/session. The old registration-wide accept/reject
API is allowed only when exactly one active pending row exists; multi-row
decisions must use row endpoints.

## Email-change request and review

- Representative: `POST /api/representative/registrations/{id}/rows/{rowId}/email-change-requests`
  with `{requestId, proposedEmail, expectedTourRowVersion,
  expectedRegistrationRowVersion, expectedRowVersion}`.
- Representative list: `GET /api/representative/registrations/{id}/email-change-requests?state=PENDING`.
- Staff queue: `GET /api/staff/manage/roster-email-change-requests?state=PENDING`.
- Staff decision: `POST /api/staff/manage/roster-email-change-requests/{requestId}/accept`
  or `/reject` with `{requestId, expectedRequestRowVersion,
  expectedTourRowVersion, expectedRegistrationRowVersion, expectedRowVersion,
  reason?}`.

Only an accepted active row may request an email change. The proposed address
is reserved against other active/pending rows in the Tour. Pending and rejected
requests leave current email, invitation code and session unchanged. Accepted
requests update that row and rotate its existing invitation/session in the same
database transaction; the existing asynchronous email worker handles delivery.
No integration test sends real email. The legacy Admin direct correction URL
returns `409 LEGACY_EMAIL_CORRECTION_DISABLED`.

## Invitation, Viewer session and access boundaries

Invitations and student/Q&A access are authorized by the active accepted row,
not the registration's aggregate `APPROVED` state. A newly pending/rejected row
cannot receive an invitation. Removing one row closes/revokes only that row's
invitation/session. A copied Tour URL alone grants no access.

The join response sets a session cookie and a separate HttpOnly, Secure,
SameSite=Lax, tour-scoped device cookie. The device cookie lets the same browser
re-establish its session after a lost session cookie within two minutes; a
different browser cannot claim that recovery path. IP address is not used as
identity. Leaving clears the session cookie; the device token expires with the
invitation. This is not a Viewer account.

## Explicit blocker/limitations

Wave B has no versioned scheduling or READY writer. Wave C exposes an
`HasPendingDecisionsAsync` repository predicate for future readiness use but
does not claim lifecycle integration. SRS does not define total seat capacity;
no global capacity is invented. Staff's two-working-day review target is
observable from timestamps, but automatic due dates/escalation require an
approved institutional workday/holiday calendar. Tour creation and schedule or
route changes remain blocked with `TOUR_DURATION_UNAVAILABLE` until an
approved configured-duration source exists; manual route-test duration is not
used for scheduling.
