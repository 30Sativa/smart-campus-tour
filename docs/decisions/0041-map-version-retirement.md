# ADR-0041: Retiring a map version instead of deleting it

- **Status:** Proposed, 2026-11-02. Pending owner approval. Not implemented: no API, schema or web change exists for it yet.
- **Related:** ADR-0021 (immutable map versions), ADR-0037 (route "Ngừng sử dụng"), ADR-0039 (one robot per area, "Map versions are never deleted"), ADR-0040 (versions are evidence other rows reference).

## Context

Technical Staff asked for a way to remove a map version, typically an old version after a new upload, or one uploaded by mistake. A delete would break what the version anchors. POI revisions hold poses in its frame. POI verifications and deployment checks name its checksum. Route revisions, route test runs and Tours point at it, and a robot can be assigned to it. Cascading would destroy evidence. Refusing whenever something references a version would refuse nearly every version.

What Staff actually need is to stop a version being chosen again while keeping its history. Routes (ADR-0037) and robots (ADR-0039) already solve this with "Ngừng sử dụng".

## Proposed decision

1. **No delete.** Map versions stay immutable and are never deleted. This restates ADR-0039.
2. **"Ngừng sử dụng" per map version.** This action is Technical Staff only and needs a reason. It records who retired the version, when, and why. Retiring a whole area means retiring each of its versions; the web may offer that as one action.
3. **Refused while a robot uses it.** If an active robot is assigned the version, the action returns 409 and names the robot. Technical Staff move or clear that robot's map first, the same order as `MAP_AREA_ALREADY_ASSIGNED`.
4. **What it stops.** The version leaves every picker and is refused with 409 `MAP_VERSION_RETIRED` for anything new written on it:
   - robot map assignment;
   - a new deployment check;
   - a new POI proposal or POI revision, including POI file import;
   - a new route revision.
5. **What it keeps.** Existing POIs, routes, revisions, verification records, test runs, PASS results and Tours are unchanged and stay readable. The confirmation lists the routes and the SCHEDULED/READY Tours that use the version, with links, and cancels none of them.
6. **"Mở lại"** only lifts the stop, like routes and robots.

## Open questions for the owner

- Submitted POI revisions and route revisions already waiting for a Technical result on the version: should a result still be recordable, or should retirement require that queue to be empty first?
- Should Tour create refuse a route whose revision uses a retired version, or should Staff stop the route separately under ADR-0037? This proposal leaves Tour create unchanged.
- Should the newest version of an area be retirable while older versions stay open?

## Out of scope

Deleting map packages or freeing their storage, editing a version, and frame transforms between versions.
