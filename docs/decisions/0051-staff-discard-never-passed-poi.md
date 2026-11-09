# ADR-0051: Staff discard a POI proposal that never passed verification

Date: 2026-11-09
Status: accepted by the owner (09/11/2026, soft discard chosen over hard delete); implemented

## Context

ADR-0021 made POI proposals append-only and ADR-0027 retired the legacy POI catalog with its activate/deactivate routes.
That left Tour Staff no way to remove a POI typed in by mistake, a duplicate pose import, or a test point: the list on
the POI management screen only grows. The runtime role has SELECT/INSERT on the POI tables and column UPDATE on
`CurrentRevision`/`UpdatedAt` only, and `PoiImportReceipts` references proposals and revisions, so a hard delete would
reverse the append-only decision and break import receipts. Route revisions reference exact POI revisions, but only
revisions with an effective PASS (`SubmitRouteRevision`), so a proposal that never passed is in no Route, Tour or
execution history.

## Decision

### Rule

Tour Staff may **discard** a POI proposal when no revision of it has ever had a PASS result. Draft, waiting for
technical verification, and needs-fix proposals qualify. A proposal with any PASS, even one superseded by a later move or
FAIL, cannot be discarded (409 `POI_PROPOSAL_HAS_PASS`), because a Route revision may still use that passing revision.
Retiring passed POIs is a separate decision that must reconcile Route selection and scheduled Tours.

Discard is soft. Nothing is deleted; revisions, submissions, results, import receipts and audit rows stay. The proposal
leaves the Staff list (`GET /api/staff/poi-proposals`) and the technical verification queue. `GET .../{id}` and
`GET .../{id}/history` still read it, with `discardedAt` set. There is no restore in this slice.

After a discard, revise, submit, technical verification and a re-import of the same source id answer 409
`POI_PROPOSAL_DISCARDED`. The source id stays reserved by `UX_PoiProposals_Source`; the robot operator renames the
capture id to create a new POI.

### API

`POST /api/staff/poi-proposals/{id}/discard`, Staff only, body `{ expectedRevisionNumber, expectedRowVersion }`.
It takes the same proposal row lock (UPDLOCK, HOLDLOCK) as revise, submit, verify and import, inside the existing
`IPoiMutationCommand` transaction, so a PASS recorded concurrently either commits first and blocks the discard, or waits
and then finds the proposal discarded. A stale version answers 409 `STALE_VERSION`. Repeating the request after it
succeeded returns the discarded proposal unchanged, so a retried call is safe without a request id. Each discard writes
one `POI_PROPOSAL_DISCARDED` audit row.

`PoiProposalView` gains `canDiscard` (no PASS on any revision and not discarded) and `discardedAt`, so the screen offers
the action only where the server will accept it.

### Schema v1.20

One additive patch, `upgrade-v1.19-to-v1.20-poi-discard.sql`, plus the v1.20 snapshot:

- `PoiProposals.DiscardedAt DATETIMEOFFSET(3) NULL` and `PoiProposals.DiscardedByUserId UNIQUEIDENTIFIER NULL`,
  `FK_PoiProposals_DiscardedByUserId` to `Users`, and `CK_PoiProposals_Discard_Complete` (both set or both null).
- Runtime grant: `UPDATE (DiscardedAt, DiscardedByUserId)` on `PoiProposals`, in
  `smart-campus-tour-runtime-permissions.sql`. The check-only gate refuses a runtime without it, or with table-wide
  UPDATE or DELETE on `PoiProposals`, or DELETE on `PoiProposalRevisions`.

No existing row changes. The bootstrap check reports v1.19 as `UPGRADE_REQUIRED` and v1.20 as `READY`.

## Consequences

- Staff can clean up mistakes without Technical Staff or a database operator, and history stays complete.
- The schema version is v1.20, on top of v1.19 (ADR-0050, short-notice Tours).
- Not covered: discarding or retiring a POI that ever passed, restore, and bulk discard.
