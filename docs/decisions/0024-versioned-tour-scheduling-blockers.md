# ADR-0024: Fail-closed Tour scheduling and readiness boundary

- Status: owner-authorized implementation boundary for the Tour scheduling follow-up, 2026-10-28
- Authority: the requested SRS v0.2 scheduling/READY scope and the explicit instruction not to persist an unverifiable schedule or reservation
- Related: ADR-0018 (legacy Tour CRUD), ADR-0020 (current business baseline), ADR-0023 (versioned Route and manual verification)

## Decision

Do not create or schedule any new Tour, change an existing Tour's scheduled time or route, assign a robot, or write a robot reservation until the backend can calculate a defensible configured route duration from the exact immutable content/configuration selected for that Tour. The owner explicitly selected a fail-closed scheduling block while this approved source is unavailable.

Current `RouteRevisionView.DurationStatus` is `INCOMPLETE_CONTENT_AUDIO_DATA`; it reports a dwell subtotal but has no approved narration/audio duration source. `RouteTestRun.MeasuredDurationSeconds` is evidence about a manual navigation test. It must not be substituted for the configured Tour duration or used to shrink/grow the reservation without a separately approved relationship between those measurements. The SRS reservation is 15 minutes before the scheduled start, the longest allowed tested-path duration, and 15 minutes after. If that interval cannot be established, the create/reschedule operation must return a specific blocker and make no Tour, reservation, audit-success or lifecycle write.

The same fail-closed rule applies to READY. The current registration model cannot report all target row-level review and email-change decisions, and there is no persisted evidence source for the assigned physical safety attendant or operational console checks. A readiness response must distinguish proven, failed and unknown checks. Any required unknown blocks READY; no default `approved=true` or `ready=true` is permitted.

## Compatibility boundary

The existing `/api/staff/manage/tours` contract and `/api/admin/tours` alias remain the legacy pre-execution API. They accept only `AuthoringMode=LEGACY` Route identities and do not claim an exact RouteRevision, Operator assignment, robot reservation or READY snapshot. New Tour creation and schedule/route changes fail closed with `TOUR_DURATION_UNAVAILABLE` until the approved duration source exists; metadata-only edits to eligible existing records and pre-Start cancellation remain separate legacy behavior. Existing `CreatedByUserId` remains attribution only.

No schema patch is added by this boundary record. The next implementation stage requires, at minimum:

1. An approved, version-bound source for configured total duration and the reservation's longest tested-path duration.
2. A row-level registration/email-decision source that can be rechecked transactionally before READY.
3. A Database First design for exact RouteRevision and Operator references, reservations, immutable READY snapshots, and safe legacy-reservation handling.
4. Reader behavior for versioned Tour routes so Representative and Viewer APIs cannot interpret empty legacy `RouteStops` as an empty itinerary.

When those dependencies are available, the implementation must use the existing `Tours` identity/lifecycle, idempotency receipts and Tour-first mutation lock convention. It must add reservation serialization per robot, optimistic version guards, audit, and append-only READY/reopen snapshots through an additive Database First patch. No shared or production database may be migrated by this ADR.

## Consequences

- Route revisions and manual PASS evidence can be read and reviewed, but they do not enable a valid target Tour schedule or READY transition by themselves.
- The legacy Tour API remains available only for its legacy Route contract; creation and schedule/route changes are blocked pending the configured-duration source.
- No target schedule/reservation happy path is claimed or exposed until every required duration source is available.
- Start, RUNNING, robot dispatch, branch requests, incidents and End Early remain outside this boundary. F-14 and M2 transport stay pending.
- Diagram changes remain with the assigned member; this ADR does not claim a redraw.
