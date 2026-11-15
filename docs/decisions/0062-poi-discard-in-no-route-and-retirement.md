# ADR-0062: Discard a POI no route uses; retire one that a route uses

Date: 2026-11-15
Status: accepted by the owner (task brief 15/11/2026); implemented in backend and web; schema v1.23
Amends: ADR-0051 (discard rule). Related: ADR-0023 (versioned routes), ADR-0034 (Tours run an exact route revision),
ADR-0041 (map retirement), ADR-0060 (narration), ADR-0061 (one stop per POI)

## Context

ADR-0051 let Staff soft-discard only a POI proposal that never passed technical verification, on the reasoning that
only a passed revision can be a route stop. A POI that once passed but that no route ever used (a test point, a
duplicate import that someone checked) stayed in the list for good, and a POI that a route uses had no way to leave
the working list at all.

`SaveRouteRevision` did not look at `DiscardedAt`. That was harmless while a discarded POI could not have a PASS, but
it would let a route pick a discarded POI once discard is widened.

## Decision

1. **Discard** (`POST /api/staff/poi-proposals/{id}/discard`, unchanged request) is allowed when no revision of the
   proposal is a stop in any `RouteRevisionStops` row, of any route revision, retired routes included. No separate Tour
   check: a Tour always points at a route revision. A never-passed POI cannot be a stop, so the ADR-0051 case is a
   subset. Otherwise 409 `POI_PROPOSAL_IN_ROUTE` (this replaces `POI_PROPOSAL_HAS_PASS`, which no longer occurs).
   Still a soft discard; history stays.
2. **Retire / reactivate** ("Ngưng dùng" / "Dùng lại") for a POI that once passed and cannot be discarded:
   - Schema v1.23: `PoiProposals.RetiredAt DATETIMEOFFSET(3) NULL`, `RetiredByUserId UNIQUEIDENTIFIER NULL`,
     `FK_PoiProposals_RetiredByUserId`, `CK_PoiProposals_Retirement_Complete` (both null or both set), column-only
     runtime grant. Patch `upgrade-v1.22-to-v1.23-poi-retirement.sql` retires nothing.
   - `POST /api/staff/poi-proposals/{id}/retire` and `/reactivate`, body `{ requestId, expectedRowVersion }`, Staff only.
     Retire needs `canRetire` (passed once, not discarded, not retired, not discardable), else 409 `POI_NOT_RETIRABLE`.
     A stale rowversion is 409 `STALE_VERSION`; a request for a POI already in the requested state returns its view
     unchanged, as discard does. Audited `POI_PROPOSAL_RETIRED` / `POI_PROPOSAL_REACTIVATED`.
   - While retired: create revision, submit, record verification, narration save/approve/discard return 409
     `POI_RETIRED`; the verification queue leaves it out; a pose import for its source id is refused like a discarded
     one (`POI_RETIRED` in the file result). The Staff list still shows it, labelled.
   - Saved routes and Tours change nothing.
3. **Route save** refuses a stop whose POI is discarded (409 `POI_PROPOSAL_DISCARDED`) or retired (409 `POI_RETIRED`,
   "POI {tên} đã ngưng dùng. Bỏ khỏi tuyến hoặc dùng lại POI.").
4. **Locking.** Discard and retire take the proposal row lock (`UPDLOCK, HOLDLOCK, ROWLOCK`) that every POI writer
   takes, and check route use under it. `SaveRouteRevision` now takes the same row lock on each stop's proposal, one at
   a time in Guid order like the pose import, *before* the map-preparation lock (the order the POI writers already
   use: area, proposals, map), and checks `DiscardedAt` / `RetiredAt` under it. So a concurrent discard and route save
   serialize: either the route commits first and the discard sees its stop, or the discard commits first and the save
   sees it.
5. Read model: proposal views add `canRetire`, `retiredAt`, `canReactivate` at the end; `canDiscard` follows rule 1.

## Choices made in implementation (not in the brief)

- Retire/reactivate idempotency follows discard: it is state-based, not a stored receipt per `requestId`. The
  `requestId` takes the per-user request lock and is written into the audit data. A retry after the POI moved to
  another state and back gets `STALE_VERSION`, never a second effect.
- A retired POI cannot be discarded (`canDiscard` is false while retired); in practice it is always in a route.
- The web shows "Ngưng dùng" POIs only under the "Tất cả" and "Ngưng dùng" filters, not under their check-state filter.

## Follow-up (owner's web test, 15/11/2026; separate PR after #335 was merged)

- `GetPoiHistoryQuery` labelled each revision only by a result recorded on that exact revision, so a content-only
  save (for example a new description) read "Bản nháp" in the history while the list said "Đạt". It now uses the
  effective result per (proposal, navigation fingerprint), like `ListPoiProposalsQuery` and the read-model loader.
- Web only: the POI page is split into "Vị trí & camera", "Thuyết minh" and "Lịch sử" tabs (`?tab=`), with a header
  that states navigation, narration and route use; the description field is labelled as an internal note; the
  narration tab separates the version in use, the version being written and the approval box. No API change.

## Consequences

- Nothing updates an existing route revision or Tour; Staff removes the stop and saves a new route revision.
- `POI_PROPOSAL_HAS_PASS` disappears from the discard contract; clients that matched it see `POI_PROPOSAL_IN_ROUTE`.
- The navigation fingerprint and narration rules (ADR-0060) are unchanged.
