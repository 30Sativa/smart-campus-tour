# ADR-0021: Versioned map packages and per-POI technical verification

- **Status:** Accepted for this implementation slice by the repository owner, 2026-10-27; physical behavior remains unverified.
- **Supersedes:** The applicable *target ownership* portions of ADR-0014 and the static-map-only target in its occupancy-map addendum. The existing Admin POI endpoints remain current implementation and are an authorization/ownership gap; this ADR does not silently change their behavior or migrate existing `Pois`.
- **Scope:** Add versioned ROS occupancy-map package upload, manual deployment-check records, Tour Staff POI proposals/revisions, and Technical Staff verification records. Whole-route tests, route authoring/scheduling, runtime commands, frontend workspaces, and project POI YAML import are outside this slice.

## Context

The current v1.1 schema stores mutable `Pois` and `Routes` with a text map key/frame. It has no map package/version, deployment check, staff proposal, or technical result tables. Existing Admin POI CRUD and the fixed `map2-v1`/`map2-v2` web assets are current code, not the SRS v0.2 target. New APIs must implement the target roles without treating an upload, form submission, or a stored assertion as a physical robot test.

The robot repository contains Nav2 occupancy maps as a ROS map-server YAML file referencing a PGM raster. Current examples use `mode: trinary`, positive `resolution` in meters/pixel, a three-number `[x, y, yaw]` origin, `negate`, `occupied_thresh`, and `free_thresh`. The supported Nav2 configuration ignores non-zero origin yaw; this slice therefore accepts only zero origin yaw. Project POI-import YAML is a separate, pending schema/frame-mapping decision and is not accepted as a map package.

## Decision

1. **Roles.** Use persisted `STAFF` / application and JWT `Staff`, displayed in product text as “Tour Staff — Nhân viên phụ trách tham quan”. Do not add `TourStaff` or `Operator`. `TechnicalStaff` is unchanged. Only Tour Staff proposes/edits POI revisions; only Technical Staff uploads maps, records manual deployment checks, and writes POI verification results. Admin has no authorization on these new endpoints. Tour Operator remains an assigned Tour Staff duty; assignment is not implemented here.
2. **Immutable package contract.** Upload a ZIP containing exactly one root-level ROS occupancy-map `.yaml`/`.yml` and its referenced root-level `.pgm`. The parser accepts the repository's trinary fields, validates safe filenames, metadata, raster bounds and checksum, and retains the original package bytes. No SLAM, robot deployment, arbitrary archive paths, image-only coordinate inference, non-zero origin yaw, or remote deploy API is added. Use bounded archive/raster sizes documented in the API contract.
3. **Coordinates.** Proposal poses are in ROS frame `map`, meters and radians; yaw is counter-clockwise. For supported zero-origin-yaw rasters, a cell-center click at `(column,row)` maps to `x = origin_x + (column + 0.5) * resolution`, `y = origin_y + (height - row - 0.5) * resolution`. The server accepts world coordinates only, checks extent and free occupancy, and does not trust client pixel coordinates. Non-zero origin yaw and other frame transforms remain unsupported/pending; the web client owns pixel-to-world conversion using returned metadata.
4. **Persistence.** Add `MapAreas`, immutable `MapVersions` (including validated metadata, SHA-256 and package bytes), append-only `MapDeploymentChecks`, `PoiProposals`, immutable `PoiProposalRevisions`, and append-only `PoiVerificationRecords`. A navigation fingerprint covers map-version ID, world pose and camera preset. Text-only edits create a content revision but keep the same navigation fingerprint, so a prior exact passing navigation result remains traceable without a fabricated new test; movement/map/camera changes produce a different fingerprint and require a fresh result. Old revisions/results remain queryable. One failing POI does not change any other proposal or map state.
5. **Manual evidence.** Deployment and POI checks record the authenticated Technical Staff actor, UTC time, exact map/POI revision and checksum/fingerprint, structured observed outcomes, and a required bounded evidence/reason note. These are auditable human-entered results, not proof that the backend executed a physical test. POI success requires reach, stop, localization and the requested camera-preset confirmation all true; a rejection requires at least one failed observation and a reason. Whole-route testing remains a later gate.
6. **Concurrency and retry.** Use SQL transactions and row locks for per-area map version allocation and proposal current-revision mutations. Mutating requests carry a request ID; retrying an identical request returns the already-created result, while reusing the key with different content conflicts. A stale expected revision conflicts. Unique keys are the final race guard. No independently committed repository writes or external side effect is introduced.
7. **Database First.** Preserve v1.1 snapshot/hash unchanged. Author an additive v1.1→v1.2 SQL upgrade, a full v1.2 snapshot for empty databases, runtime least-privilege grants and fresh-schema tests; then scaffold entities from the disposable v1.2 database and review generated output. Never run this change on a shared/production DB. Existing Admin POI data and API are not rewritten by this additive schema.
8. **Status.** API/database behavior implemented by this slice is distinguished from robot commissioning and test evidence. Map deployment remains a manual record. Project POI YAML import, arbitrary map-frame transforms, route revisions/RouteTestRun, route scheduling/READY, physical robot verification, and frontend integration remain pending/not implemented.

## Consequences

Staff and Technical Staff get server-enforced endpoints for the target proposal and verification flow, with exact-version history and controlled package delivery. Existing `Pois` and Admin endpoints remain available only as a legacy implementation gap until a separately reviewed migration retires or scopes them; they are not evidence of target authorization. Map-package storage is in SQL for this single-instance slice, bounded by upload limits. A future object store migration must preserve immutable checksum/version semantics. Recorded results need real physical acceptance before any route is declared operational; individual POI checks never certify an entire route.

## API contract summary

| Method/path | Actor | Purpose |
|---|---|---|
| `POST /api/technical/map-versions` | Technical Staff | Multipart map ZIP, area key, request ID; creates immutable next version. |
| `GET /api/maps/versions` | Staff, Technical Staff | List authorized map metadata by area. |
| `GET /api/maps/versions/{id}` | Staff, Technical Staff | Read metadata, validation and upload/deployment state. |
| `GET /api/maps/versions/{id}/package` | Staff, Technical Staff | Download the exact validated ZIP for map display/client parsing. |
| `POST /api/technical/map-versions/{id}/deployment-checks` | Technical Staff | Record robot, matching checksum, localization/display result and evidence. |
| `GET /api/technical/map-versions/{id}/deployment-checks` | Technical Staff | Read append-only deployment history. |
| `POST /api/staff/poi-proposals` | Tour Staff (`Staff`) | Create an unverified draft tied to a map version and request ID. |
| `GET /api/staff/poi-proposals` | Tour Staff | List own/manageable proposals and current status. |
| `GET /api/staff/poi-proposals/{id}` | Tour Staff, Technical Staff | Read current revision and verification status. |
| `GET /api/staff/poi-proposals/{id}/history` | Tour Staff, Technical Staff | Read immutable revisions and results. |
| `PUT /api/staff/poi-proposals/{id}/draft` | Tour Staff | Create the next draft revision with expected current revision/request ID. |
| `POST /api/staff/poi-proposals/{id}/submit` | Tour Staff | Submit current draft; submission itself is not verification. |
| `GET /api/technical/poi-verifications` | Technical Staff | List submitted POI revisions awaiting a result. |
| `POST /api/technical/poi-proposals/{id}/revisions/{revision}/verification` | Technical Staff | Record one exact-revision pass/rejection and structured observations. |
