# Versioned map and POI workflow (ADR-0021)

**Status:** implemented in backend source/schema and merged to `main` by PR #85; not yet physically commissioned. Apply v1.2 only through the reviewed Database First process. Do not use `init-db` as an upgrade path.

## Roles and contract

Tour Staff is the product label for the existing persisted `STAFF` / application and JWT `Staff` role. `Tour Operator` is an assigned Staff duty, not a role implemented by this slice. `TechnicalStaff` maps from persisted `TECHNICAL_STAFF`. The versioned endpoints below grant no Admin authority. The old POI catalog routes, including `/api/admin/pois`, are retired; legacy SQL POI rows remain for existing legacy Route/Tour references. Viewer uses invitation/session and has no account.

ROS upload is a ZIP with exactly two root files: one `.yaml`/`.yml` and its referenced `.pgm`. Supported ROS map-server metadata is `image`, `mode: trinary`, `resolution`, `origin: [x,y,0]`, `negate`, `occupied_thresh` and `free_thresh`. PGM supports 8-bit P2/P5. ZIP and package entries are bounded at 32 MiB; raster dimensions are at most 8192×8192 and 32 million cells. Path traversal, directories, extra entries, unsupported keys/modes, non-zero origin yaw, invalid ranges and mismatched raster size are rejected. The package SHA-256 is computed by the server and immutable bytes/metadata are stored with the version.

For binary P5, the parser consumes the required header delimiter and, for CRLF, only its paired LF. It does not skip whitespace or comments after the raster begins; byte values such as LF, CR, space and `#` are valid first pixel values.

POI `x/y` use ROS `map` frame, meters; `yaw` uses radians, positive counter-clockwise. For a raster cell center `(column,row)`, client conversion for the supported zero-yaw origin is `x = origin_x + (column + 0.5) * resolution`, `y = origin_y + (height - row - 0.5) * resolution`. The API accepts world coordinates, not pixels, and verifies bounds and free-cell occupancy. Other transforms remain pending. Project POI YAML import is not implemented; its template/frame mapping decision remains pending and is distinct from the ROS occupancy-map YAML.

Deployment checks remain append-only manual evidence. For each physical robot, the latest recorded check across all map versions represents its current recorded deployment; POI verification requires that check to be a successful localization/display check for the exact map version and package checksum being verified. Per-version map views continue showing historical checks for that map and do not by themselves mean it is currently deployed when a later check names another map. Deployment recording and POI verification serialize on the robot's deployment-state lock, so a map change cannot commit between the current-map check and the verification record. This is backend consistency over submitted evidence, not automatic inspection of the robot.

Content-only POI revisions retain their navigation fingerprint. Their status references the newest technical result for that exact fingerprint and does not create a new physical check. A submitted content-only revision with an effective PASS can be revised again; a newer FAIL supersedes an older PASS and remains visible in status and the technical queue. A changed navigation fingerprint requires a new technical result.

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
| `PUT /api/staff/poi-proposals/{id}/draft` | Staff | `{requestId, expectedCurrentRevision, expectedRowVersion, draft}` → new current revision | Stale version conflicts; a submitted revision must have an effective PASS for its exact navigation fingerprint or a result attached to that revision; navigation fingerprint changes need a new result | `POI_PROPOSAL_REVISION_CREATED` |
| `POST /api/staff/poi-proposals/{id}/submit` | Staff | `{requestId, expectedRevisionNumber, expectedRowVersion}` → submitted revision | Current draft only; submission is not verification; 409 stale/already submitted | `POI_PROPOSAL_SUBMITTED` |
| `GET /api/technical/poi-verifications?mapVersionId=` | TechnicalStaff | → submitted current revisions whose latest result for the exact fingerprint is not PASS | Optional exact map filter; content-only revisions with an effective PASS are omitted; a newer FAIL supersedes an older PASS; capped at 100 | — |
| `POST /api/technical/poi-proposals/{id}/revisions/{revisionNumber}/verification` | TechnicalStaff | `{requestId, expectedRevisionNumber, expectedRowVersion, robotCode, resultCode, reached, stopped, localizationPassed, cameraPresetConfirmed, reason, evidenceNote}` → result | Must be current submitted revision and exact map must have successful deployment localization/display evidence on that physical robot. PASS requires all checks true; FAIL requires reason and a failed observation. One result per immutable revision. | `POI_TECHNICAL_VERIFIED` / `POI_TECHNICAL_REJECTED` |

All mutations require caller-generated stable `requestId`; identical retry returns its result and different-content key reuse conflicts. SQL transaction-owned application locks serialize request retries and area version allocation; proposal row locks and SQL rowversion guard concurrent edits. Immutable version/revision/submission/check/result tables receive SELECT/INSERT only; only `PoiProposals.CurrentRevision` and `UpdatedAt` are update-granted by `smart-campus-tour-map-poi-permissions.sql`.

## Frontend handoff

- The Technical Staff map-upload view and map-version browser now call the versioned API. The UI shows package validation separately from manual robot deployment/localization/display evidence.
- The Technical Staff map-upload view and map-version browser call the versioned APIs. The UI shows package validation separately from manual robot deployment/localization/display evidence; upload is not deployment.
- Staff POI proposal screens select an exact map version, download the corresponding ZIP, parse its root ROS YAML/PGM for a map preview, and convert a clicked cell center to world coordinates using the supported zero-yaw origin. They create immutable revisions, submit them, and show status/history. Requests carry stable request IDs and the current revision/rowversion.
- The Technical UI consumes the verification queue with proposal ID, current revision, rowversion and revision detail, then records per-revision reach/stop/localization/camera observations, evidence or failure reason through the versioned API.
- Route preparation uses versioned Route revisions and only selectable POI revisions that are PASS for the exact map version. Legacy mutable POI/Route authoring endpoints and Admin aliases were retired under ADR-0027; legacy SQL rows remain intact for Tour projections.
- Project-defined POI YAML import, non-zero-yaw pixel transform, physical route testing, scheduling/READY, whole-route certification workflow, robot deployment control and actual hardware evidence are not claimed. Project YAML/frame mapping remains pending.
