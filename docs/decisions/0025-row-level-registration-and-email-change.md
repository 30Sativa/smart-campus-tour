# ADR-0025: Row-level registration decisions and email changes

- Status: owner-authorized backend implementation boundary, 2026-10-28
- Authority: Report 3 SRS v0.2 aligned to Phiếu v1.9; Wave C scope
- Related: ADR-0010, ADR-0011, ADR-0018, ADR-0020, ADR-0024

## Decision

Represent participation and review per roster viewing-point row. A row is
`PENDING`, `ACCEPTED`, `REJECTED` or `REMOVED`; access is effective only for an
active accepted row and its own invitation. A shared-screen row is one viewing
point, not a count of the students watching it. Limit each registration to ten
viewing-point rows. Enforce one registration per Representative/Tour and the
48-hour cutoff for new registrations or added rows.

Roster updates carry stable `RowId` values for existing rows. An unchanged
accepted row retains its identity, decision, invitation and session. A new row
starts pending. Removing a row deactivates and revokes only its own invitation
and sessions. Direct email replacement of an accepted row is rejected; the
owner Representative creates an email-change request and Staff accepts/rejects
it. Pending/rejected requests preserve the old address and access. Acceptance
updates only that row and rotates its invitation/session transactionally.

Staff review decisions are per row. The legacy registration-wide review route
is compatible only for a registration with exactly one active pending row; it
must not imply approval of all rows. A registration aggregate may summarize
accepted/pending/rejected state, but it is not the access gate. Viewer accounts
are not created. Same-browser recovery uses a tour-scoped device token and a
two-minute reconnect window; IP address alone is not an identity proof.

## Data and API

Database First v1.4 adds row participation/review fields, append-only
`RosterEmailChangeRequests`, and `BrowserSessions.DeviceTokenHash`. The
additive v1.3-to-v1.4 patch backfills prior aggregate decisions and does not
change an existing shared database automatically. `backend/database/README.md`
describes installation and the disposable SQL test boundary.

Representative APIs edit only owned registrations and rows. Staff review APIs
decide one row at a time. The old Admin direct email-correction endpoint
remains route-compatible but always returns `LEGACY_EMAIL_CORRECTION_DISABLED`.
Email delivery continues through the existing asynchronous worker; automated
tests do not send real mail.

## Explicit limits and non-claims

- SRS does not define total Tour seat capacity and the current Tour schema has
  no capacity setting. Do not invent a global capacity or count students behind
  a shared viewing point as separate rows.
- The two-working-day review target has no institutional working-day/holiday
  calendar. Pending timestamps are retained for tracking; do not auto-approve,
  auto-reject, or calculate a due date until that calendar is approved.
- A pending-row/email predicate is available for future readiness checks, but
  Wave B exposes no versioned scheduling/READY writer. This ADR does not claim
  lifecycle integration.
- No media relay, Start, dispatch, approved-bank Q&A/global admission queue,
  Tour runtime or frontend workspace is implemented by this slice.
- Wave B has no approved configured-duration source. New Tour scheduling and
  schedule/route changes therefore fail closed with `TOUR_DURATION_UNAVAILABLE`
  per ADR-0024. Manual `MeasuredDurationSeconds` is not a configuration source.
- F-14, branch cutoff, project YAML/frame mapping and M2 command transport
  remain pending.

## Consequences

Representative edits, row review, email review, invitation changes and access
readers use the existing Tour-first lock and transaction boundary. Stable row
identity prevents an unrelated pending change from silently replacing an
already accepted Viewer. Screens/diagrams and frontend integration remain
separate work; no diagram is marked complete.
