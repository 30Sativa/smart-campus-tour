# ADR-0041: Retiring a map version instead of deleting it

- **Status:** Accepted by the repository owner, 2026-11-15, through the task brief for this change, which answers the three open questions and adds one condition. Proposed 2026-11-02. Implemented in schema v1.21, the backend and the Technical web. No physical behavior was tested by this change.
- **Related:** ADR-0021 (immutable map versions), ADR-0037 (route "Ngừng sử dụng"), ADR-0039 (one robot per area, "Map versions are never deleted"), ADR-0040 (versions are evidence other rows reference).

## Context

Technical Staff asked for a way to remove a map version, typically an old version after a new upload, or one uploaded by mistake. A delete would break what the version anchors. POI revisions hold poses in its frame. POI verifications and deployment checks name its checksum. Route revisions, route test runs and Tours point at it, and a robot can be assigned to it. Cascading would destroy evidence. Refusing whenever something references a version would refuse nearly every version.

What Staff actually need is to stop a version being chosen again while keeping its history. Routes (ADR-0037) and robots (ADR-0039) already solve this with "Ngừng sử dụng".

## Decision

1. **No delete.** Map versions stay immutable and are never deleted. This restates ADR-0039.
2. **"Ngừng sử dụng" per map version.** This action is Technical Staff only and needs a reason. It records who retired the version, when, and why. Retiring a whole area means retiring each of its versions.
3. **Refused while a robot uses it.** If an active robot is assigned the version, the action returns 409 `MAP_VERSION_ROBOT_ASSIGNED` and names the robot. Technical Staff move or clear that robot's map first, the same order as `MAP_AREA_ALREADY_ASSIGNED`.
4. **Refused while reviews are waiting (owner decision).** If a submitted POI revision or route revision on the version still waits for a Technical result, the action returns 409 `MAP_VERSION_HAS_PENDING_REVIEWS` with the list. The queue is cleared first, so no result is ever recorded on a retired version.
5. **Refused while upcoming Tours use it (owner condition).** If a `SCHEDULED` or `READY` Tour runs a route revision on the version, the action returns 409 `MAP_VERSION_HAS_UPCOMING_TOURS` with the list of Tours. Staff cancel or move those Tours first; nothing is cancelled for them.
6. **What it stops.** The version leaves every picker and is refused with 409 `MAP_VERSION_RETIRED` for anything new written on it:
   - robot map assignment;
   - a new deployment check;
   - a new POI proposal, POI revision or submission, including POI file import and its preview;
   - a new route revision or submission;
   - Tour create (owner decision), and the slots it is built from. READY and Start are not re-checked: retirement is refused while such Tours exist.
7. **The newest version can be retired (owner decision).** An area's row then shows its nearest version still in use. Older versions may stay open.
8. **What it keeps.** Existing POIs, routes, revisions, verification records, test runs, PASS results and Tours are unchanged and stay readable. The confirmation lists the routes that use the version, and shows each blocker with a link.
9. **"Mở lại"** only lifts the stop, like routes and robots.

## Implementation notes

- Schema v1.21 adds `MapVersions.RetiredAt`, `RetiredByUserId` (FK to `Users`) and `RetirementReason NVARCHAR(500)`, with `CK_MapVersions_Retirement_Complete`: all three set or all three null. The runtime gets column-level UPDATE on those three columns only.
- `POST /api/technical/map-versions/{id}/retire` (`{ reason, expectedRowVersion }`) and `/reopen` (`{ expectedRowVersion? }`) take the per-version map-preparation lock, then `UPDLOCK, HOLDLOCK` on the row, and check every condition under it. Every writer listed in 6 takes the same lock before checking `RetiredAt`, so a write either commits before the retirement reads or sees it. Audit actions are `MAP_VERSION_RETIRED` and `MAP_VERSION_REOPENED`.
- `MapVersions` has no SQL rowversion. Its only mutable state is retirement, so `rowVersion` on a map view is an opaque token of `RetiredAt`; a stale one returns 409 `MAP_VERSION_STALE`, which is how one of two simultaneous retires wins.
- `GET /api/technical/map-versions/{id}/retirement-impact` lists routes, assigned robots, waiting POIs and routes, and upcoming Tours for the confirmation dialog.
- POI submission and route submission are refused as well, although the brief listed only creation: otherwise a review could start waiting on a version after it was retired, which condition 4 exists to prevent.

## Out of scope

Deleting map packages or freeing their storage, editing a version, frame transforms between versions, and retiring a whole area in one action.
