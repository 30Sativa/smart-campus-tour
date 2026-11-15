# ADR-0060: POI narration as its own versioned content, approved by a second Staff

Date: 2026-11-15
Status: accepted by the owner (task brief 15/11/2026); implemented in backend, web in a later PR
Partially supersedes: ADR-0031 (where narration is stored and when it is required)

## Context

ADR-0031 put narration text and the fallback video URL on each POI revision and refused to submit a revision without
narration (`POI_NARRATION_REQUIRED`). That forced the wrong order of work: Staff had to write the tour script before
Technical Staff had even checked that the robot can reach the point, every wording fix created a new POI revision in the
navigation history, and nothing recorded that anyone other than the author had read the text. `campus-tour-scope.md`
§2 and §3 give Staff the job of approving narration ("Content/Q&A/fallback approval", "Staff approves narration text");
the gap register line FR-28/29/30 lists "version/approve/withdraw content" as missing. The owner should check that
reading against the original SRS: the scope document is the source used here, not the SRS text itself.

## Decision

### Narration belongs to the POI, not to a navigation revision

A new table, `PoiNarrationRevisions`, holds the narration of a POI proposal (`ProposalId`), numbered 1, 2, 3… per
proposal. Each row has `NarrationText` (1–4000 characters, required), an optional HTTPS `FallbackVideoUrl` (up to
2048 characters, same rule as before) and one state:

| State | Meaning |
|---|---|
| `DRAFT` | Being written. Edited in place; every edit stamps `LastEditedByUserId/LastEditedAt`. |
| `APPROVED` | Read and accepted by a Staff who is not the last editor. Never edited. |
| `SUPERSEDED` | Was approved; a newer version has since been approved. |
| `DISCARDED` | A draft dropped without approval. |

A POI has at most one `DRAFT` and at most one `APPROVED` (filtered unique indexes). To change approved wording, Staff
creates a new draft; approving it moves the previous approved row to `SUPERSEDED` in the same transaction.
`ApprovedByUserId/ApprovedAt` are set exactly on `APPROVED` and `SUPERSEDED` rows (CHECK).

Narration does not depend on the POI's technical result. It can be written and approved whenever the POI exists and is
not discarded (ADR-0051); the map need not be eligible and the POI need not be submitted or passed. The intended working
order is POI → technical check → narration, but the backend does not enforce it.

POI create/revise requests, their validator and the revision read model no longer carry narration. Submit no longer
checks it (`POI_NARRATION_REQUIRED` is gone from submit). Pose import no longer copies it to the new revision. The two
old columns on `PoiProposalRevisions` stay (the v1.21 snapshot is immutable) but nothing writes them.
`PoiNavigationFingerprint` is unchanged.

### Approval rule: a second Staff

Only the Staff role writes or approves narration. The approver must differ from the draft's `LastEditedByUserId`,
otherwise 409 `NARRATION_SELF_APPROVAL_FORBIDDEN`; the database repeats this as a CHECK
(`ApprovedByUserId <> LastEditedByUserId`). There is no automatic approval and no setting that allows self-approval. A
Staff who created a draft may approve it after another Staff edited it last.

This "approver differs from the last editor" rule is a **design proposal of this ADR, not an SRS requirement**. It
gives every approved text a second reader; the owner may relax or tighten it later.

### API

All under `api/staff/poi-proposals/{id}/narrations` (see `docs/architecture.md` §3.0.3):

- `GET` lists every version, newest first. Staff and TechnicalStaff.
- `PUT …/draft` `{ requestId, expectedRowVersion?, narrationText, fallbackVideoUrl? }` creates the draft when there is
  none (`expectedRowVersion` must be absent) or edits the current one (`expectedRowVersion` required). A mismatch either
  way is 409 `STALE_VERSION`. Staff only.
- `POST …/{revisionNumber}/approve` `{ requestId, expectedRowVersion }`. Staff only.
- `POST …/{revisionNumber}/discard` `{ requestId, expectedRowVersion }`. Staff only.

Approve or discard of a row that is not `DRAFT` is 409 `NARRATION_NOT_DRAFT`; a discarded POI is 409
`POI_PROPOSAL_DISCARDED`. Every write takes the POI proposal row lock used by revise/submit/verify/discard, inside the
existing `IPoiMutationCommand` serializable transaction, so two approvals of the same draft give exactly one success.
Writes do not change the POI proposal's own rowversion.

Retries: each write stores a receipt `(actor, requestId, SHA-256 of the request)` in `PoiNarrationRequestReceipts`.
The same request id with the same content returns the narration version's current view; with different content it is
409 `IDEMPOTENCY_CONFLICT`. Each write adds one audit row: `POI_NARRATION_DRAFT_CREATED`, `POI_NARRATION_DRAFT_EDITED`,
`POI_NARRATION_APPROVED`, `POI_NARRATION_DISCARDED`.

`PoiProposalView` gains `narration { approved: { revisionNumber, approvedByName, approvedAt } | null, draft:
{ revisionNumber, lastEditedByUserId, lastEditedByName, lastEditedAt, rowVersion } | null }` so the list can show
"Duyệt bởi … lúc …" and whether a draft waits.

### Routes use approved narration only

`SaveRouteRevision` requires, for every selected POI, a current `APPROVED` narration, otherwise 409
`POI_NARRATION_NOT_APPROVED` ("POI {tên} chưa có thuyết minh đã duyệt."). It snapshots that text and video into
`RouteRevisionStops` as before and records `RouteRevisionStops.NarrationRevisionId` (FK, NULL on older rows).
`ConfigurationFingerprint` and `SameNavigation` are unchanged, so approving new wording and saving a new route revision
still inherits the earlier route test run. Existing route revisions and Tours keep their snapshot; nothing updates them.

### Schema v1.22

The brief named this v1.21; `main` already used v1.21 for map retirement (ADR-0041), so this is v1.22:
`patches/upgrade-v1.21-to-v1.22-poi-narration-approval.sql` and `smart-campus-tour-schema-v1.22.sql`.

- `PoiNarrationRevisions` as above, with `RowVersion`, FKs to `PoiProposals` and `Users`, `UQ (ProposalId,
  RevisionNumber)`, `UX_PoiNarrationRevisions_Draft` and `UX_PoiNarrationRevisions_Approved` (filtered unique on
  `ProposalId`), and CHECKs for state, approval columns, self-approval, non-blank text and HTTPS video.
- `PoiNarrationRequestReceipts` (append-only): `UQ (ActorUserId, RequestId)`.
- `RouteRevisionStops.NarrationRevisionId` nullable with `FK_RouteRevisionStops_NarrationRevisionId`.
- Runtime grants: SELECT/INSERT on both tables, column UPDATE on the mutable narration columns only, never DELETE.
- Data move: for each POI, the newest revision that has narration becomes one `DRAFT` row created and last edited by
  that revision's author. **No `APPROVED` row is created**: the old text was never approved by anyone. After upgrade
  every POI needs a second Staff's approval before it can join a new route revision.

## Consequences

- Staff can write narration after the technical check and fix wording without new POI revisions.
- Every narration used by a new route revision was read by someone other than its last editor.
- After the upgrade, saving any new route revision is blocked until narration is approved for its POIs; existing
  revisions and Tours are unaffected.
- A Staff working alone cannot approve. A demo needs two Staff accounts.
- Out of scope: web screens (next PR), audio upload and duration, Q&A bank approval, withdrawing an approved
  narration, updating existing route revisions or Tours, the legacy `Pois` table, READY/Start changes.
