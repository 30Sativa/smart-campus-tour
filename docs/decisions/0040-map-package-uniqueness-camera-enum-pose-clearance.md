# ADR-0040: Map package uniqueness, camera preset enum and pose clearance

- **Status:** Accepted by the repository owner, 2026-11-01, through the task brief for this change. No physical behavior was tested by this change.
- **Related:** ADR-0021 (map package and POI verification), ADR-0023 (route revisions), ADR-0038 (pose-capture import).

## Context

Three inputs were looser than the system needs. The same package could be uploaded again as a new version of its area, which fills the version list with maps that differ in nothing. A camera preset was any identifier, although the robot has three. A pose only had to land on one free cell, so a POI could sit against a wall where the robot cannot fit.

## Decision

### Map package uniqueness

1. A package whose SHA-256 equals an existing version in the same `AreaKey` returns 409 `MAP_PACKAGE_DUPLICATE`, "Gói này đã được tải lên ở <tên khu vực> · v<N>."
2. `UX_MapVersions_Area_PackageSha256` on `(AreaKey, PackageSha256)` is the final guard. The area lock serializes uploads, so the application check normally answers first.
3. A retry with the same `requestId` still returns the original version, because that check runs first.
4. The same package in a different area stays allowed. An area is a place, and two places can share a file.
5. The upgrade stops with a message listing each area, its versions and the SHA-256 if duplicates exist. It deletes and rewrites nothing, because versions are immutable evidence that other rows reference. Choosing which version stays is a reviewed data change.

### Camera preset enum

1. POI create, revision and draft accept only `FRONT`, `LEFT` and `RIGHT`, in any case, stored upper case. Anything else returns 422 `POI_CAMERA_PRESET_INVALID`, "Hướng camera chỉ được là Phía trước, Bên trái hoặc Bên phải."
2. History is not rewritten, and the column has no check constraint, because older revisions may hold other values. Reading them keeps working.
3. A new revision of such a POI must pick a valid value. Pose files cannot choose a preset (ADR-0038), so a new capture of such a POI is refused per file with the same code until Staff has picked one.

### Pose clearance

1. `Maps:PoiClearanceMeters`, default 0.30, is the free radius around a pose. It must be above 0 and at most 5, checked at startup.
2. `MapPackageValidator.EnsureClearPosition` is the one check for a written pose: the existing single-cell check, then every cell the circle touches must be inside the map and free. Failure returns 422 `POSE_CLEARANCE_INSUFFICIENT`, "Điểm quá sát vật cản (cần trống bán kính 0,30 m)."
3. POI create, revision and draft, POI import preview and import, and route start and end poses all call it. Import preview shows the error per file.
4. A cell counts by its nearest point, not its center, and touching at exactly the radius counts. So the circle drawn on the map is exactly what is checked, and a coarse map cannot hide a wall the circle reaches. Past the map edge counts as not free.
5. The radius comes from the API (`poiClearanceMeters` on a map version) so the pose picker draws the same circle and shows the same message before submit. The server stays the authority.

### What is not checked

Existing PASS evidence is not revoked, so only a newly written pose is checked:

1. A POI revision that keeps its predecessor's map and X/Y, and a route revision that keeps a start or end pose from its current revision on the same map, run the single-cell check only. Otherwise Staff could not add narration to a POI whose PASS still stands, and ADR-0038 relies on that content edit.
2. Recording a verification writes no pose and keeps the single-cell check.
3. Yaw is not part of it. The circle is the same however the robot faces.

## Database

Schema v1.13 with `patches/upgrade-v1.12-to-v1.13-map-package-uniqueness.sql`. The index needs no new grant, so the permission scripts are unchanged and the upgrade reapplies them as usual.

## Out of scope

Rewriting older camera values, re-checking poses already stored, inflating obstacles by the robot's real footprint, and path clearance between poses. The radius is a floor for where a pose may sit, not proof the robot can reach it: the POI check and whole-route test run stay required.
