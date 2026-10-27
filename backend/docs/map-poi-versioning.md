# Versioned map and POI workflow (ADR-0021)

**Status:** implemented in backend source/schema on `feature/codex/be-map-poi-validation`; not yet merged or physically commissioned. Apply v1.2 only through the reviewed Database First process. Do not use `init-db` as an upgrade path.

## Roles and contract

Tour Staff is the product label for the existing persisted `STAFF` / application and JWT `Staff` role. `Tour Operator` is an assigned Staff duty, not a role implemented by this slice. `TechnicalStaff` maps from persisted `TECHNICAL_STAFF`. The new endpoints below grant no Admin authority. Existing `/api/admin/pois` remains a legacy implementation gap and is not silently changed here. Viewer uses invitation/session and has no account.

ROS upload is a ZIP with exactly two root files: one `.yaml`/`.yml` and its referenced `.pgm`. Supported ROS map-server metadata is `image`, `mode: trinary`, `resolution`, `origin: [x,y,0]`, `negate`, `occupied_thresh` and `free_thresh`. PGM supports 8-bit P2/P5. ZIP and package entries are bounded at 32 MiB; raster dimensions are at most 8192×8192 and 32 million cells. Path traversal, directories, extra entries, unsupported keys/modes, non-zero origin yaw, invalid ranges and mismatched raster size are rejected. The package SHA-256 is computed by the server and immutable bytes/metadata are stored with the version.

POI `x/y` use ROS `map` frame, meters; `yaw` uses radians, positive counter-clockwise. For a raster cell center `(column,row)`, client conversion for the supported zero-yaw origin is `x = origin_x + (column + 0.5) * resolution`, `y = origin_y + (height - row - 0.5) * resolution`. The API accepts world coordinates, not pixels, and verifies bounds and free-cell occupancy. Other transforms remain pending. Project POI YAML import is not implemented; its template/frame mapping decision remains pending and is distinct from the ROS occupancy-map YAML.

## Endpoint inventory

All successes use the existing `BaseResponse<T>` envelope except ZIP download. `400` means invalid request/package/pose; `401` unauthenticated; `403` role denied; `404` missing map/POI/physical robot; `409` stale rowversion, reused idempotency key with different content, not-deployed map, already-submitted/result, or other state conflict. Mutations append `AuditLogs` in the same transaction. They do not assert that software itself ran a physical robot test.

| Method and path | Actor | Request → response | State/version guard; principal errors | Audit |
|---|---|---|---|---|
| `POST /api/technical/map-versions` | TechnicalStaff | multipart `areaKey`, `areaName`, `requestId`, `package`; → `MapVersionView` | Validated ROS ZIP, next immutable area version; 400/409 | `MAP_VERSION_UPLOADED` |
| `GET /api/maps/versions?areaKey=&take=` | Staff, TechnicalStaff | → up to 100 `MapVersionListItem` | Metadata/list only; 400 take | — |
| `GET /api/maps/versions/{id}` | Staff, TechnicalStaff | → map metadata and latest recorded deployment check | Existing exact version; 404 | — |
| `GET /api/maps/versions/{id}/package` | Staff, TechnicalStaff | → ZIP bytes with filename and SHA-256 ETag | Exact immutable package; 404 | — |
| `POST /api/technical/map-versions/{id}/deployment-checks` | TechnicalStaff | `{requestId, robotCode, packageSha256, localizationPassed, displayPassed, evidenceNote}` → check | Existing physical robot and exact package checksum; evidence note required; 400/404/409 | `MAP_DEPLOYMENT_CHECK_RECORDED` |
| `GET /api/technical/map-versions/{id}/deployment-checks` | TechnicalStaff | → append-only deployment-check history | Existing version; 404 | — |
| `POST /api/staff/poi-proposals` | Staff | `{requestId, draft}` → proposal with revision 1 | Exact map version; pose inside free map cell; starts DRAFT/NOT_CHECKED; 400/404 | `POI_PROPOSAL_CREATED` |
| `GET /api/staff/poi-proposals?mapVersionId=` | Staff, TechnicalStaff | → current proposals and navigation status | Optional exact map filter; capped at 100 | — |
| `GET /api/staff/poi-proposals/{id}` | Staff, TechnicalStaff | → current revision, rowversion and status | Existing proposal; 404 | — |
| `GET /api/staff/poi-proposals/{id}/history` | Staff, TechnicalStaff | → immutable revisions and verification history | Existing proposal; 404 | — |
| `PUT /api/staff/poi-proposals/{id}/draft` | Staff | `{requestId, expectedCurrentRevision, expectedRowVersion, draft}` → new current revision | Stale version conflicts; a submitted revision must first receive a result; movement/map/camera fingerprint changes need a new result | `POI_PROPOSAL_REVISION_CREATED` |
| `POST /api/staff/poi-proposals/{id}/submit` | Staff | `{requestId, expectedRevisionNumber, expectedRowVersion}` → submitted revision | Current draft only; submission is not verification; 409 stale/already submitted | `POI_PROPOSAL_SUBMITTED` |
| `GET /api/technical/poi-verifications?mapVersionId=` | TechnicalStaff | → submitted, not-yet-passed current revision queue | Optional exact map filter; capped at 100 | — |
| `POST /api/technical/poi-proposals/{id}/revisions/{revisionNumber}/verification` | TechnicalStaff | `{requestId, expectedRevisionNumber, expectedRowVersion, robotCode, resultCode, reached, stopped, localizationPassed, cameraPresetConfirmed, reason, evidenceNote}` → result | Must be current submitted revision and exact map must have successful deployment localization/display evidence on that physical robot. PASS requires all checks true; FAIL requires reason and a failed observation. One result per immutable revision. | `POI_TECHNICAL_VERIFIED` / `POI_TECHNICAL_REJECTED` |

All mutations require caller-generated stable `requestId`; identical retry returns its result and different-content key reuse conflicts. SQL transaction-owned application locks serialize request retries and area version allocation; proposal row locks and SQL rowversion guard concurrent edits. Immutable version/revision/submission/check/result tables receive SELECT/INSERT only; only `PoiProposals.CurrentRevision` and `UpdatedAt` are update-granted by `smart-campus-tour-map-poi-permissions.sql`.

## Frontend handoff

- Add a Technical Staff map-upload view and map-version browser; upload a ZIP assembled from the robot's ROS YAML + PGM, never an image alone. Show upload validation separately from manual robot deployment/localization/display evidence.
- Add a Staff map picker using returned resolution/origin/dimensions and the documented cell-center conversion; post world coordinates and camera preset. Editing creates a new revision with returned `rowVersion` and current revision number.
- Add submission and status/history display. A submitted POI is still unverified until Technical Staff records a result. A failure is per revision/POI; revise and resubmit.
- Add a Technical queue that displays map key/version/checksum and physical robot, and records reach/stop/localization/camera observations, evidence, or failure reason.
- Never expose upload/verification actions to Admin in these new screens. Existing Admin POI UI/endpoints are legacy and require a separately scoped migration.
- No project YAML import, pixel-to-world transform for nonzero origin yaw, route testing, scheduling/READY, whole-route certification, robot deployment control, or actual hardware evidence is included. No frontend was changed by this backend slice.
