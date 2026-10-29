# Versioned map and POI workflow (ADR-0021, ADR-0028)

**Status:** The v1.2 map/POI slice is implemented in backend source/schema and merged by PR #85; it is not physically commissioned. The ADR-0029 robot-registration/connection-confirmation addition is on PR #107 and is not merged or deployed. Database schema v1.5 is separate from SRS/SDD document versions. Apply schema changes only through the reviewed Database First process; `init-db --check-only` never upgrades an existing database.

## Roles and contract

Tour Staff is the product label for the existing persisted `STAFF` / application and JWT `Staff` role. `Tour Operator` is an assigned Staff duty, not a role implemented by this slice. `TechnicalStaff` maps from persisted `TECHNICAL_STAFF`. The versioned endpoints below grant no Admin authority. The old POI catalog routes, including `/api/admin/pois`, are retired; legacy SQL POI rows remain for existing legacy Route/Tour references. Viewer uses invitation/session and has no account.

ROS upload is a ZIP with exactly two root files: one `.yaml`/`.yml` and its referenced `.pgm`. Supported ROS map-server metadata is `image`, `mode: trinary`, `resolution`, `origin: [x,y,0]`, `negate`, `occupied_thresh` and `free_thresh`. PGM supports 8-bit P2/P5. ZIP and package entries are bounded at 32 MiB; raster dimensions are at most 8192×8192 and 32 million cells. Path traversal, directories, extra entries, unsupported keys/modes, non-zero origin yaw, invalid ranges and mismatched raster size are rejected. The package SHA-256 is computed by the server and immutable bytes/metadata are stored with the version.

For binary P5, the parser consumes the required header delimiter and, for CRLF, only its paired LF. It does not skip whitespace or comments after the raster begins; byte values such as LF, CR, space and `#` are valid first pixel values.

POI `x/y` use ROS `map` frame, meters; `yaw` uses radians, positive counter-clockwise. For a raster cell center `(column,row)`, client conversion for the supported zero-yaw origin is `x = origin_x + (column + 0.5) * resolution`, `y = origin_y + (height - row - 0.5) * resolution`. The API accepts world coordinates, not pixels, and verifies bounds and free-cell occupancy. Other transforms remain pending. Project POI YAML import is not implemented; its template/frame mapping decision remains pending and is distinct from the ROS occupancy-map YAML.

Deployment checks remain append-only manual evidence. For each physical robot, the latest recorded check across all map versions represents its current recorded deployment; POI verification requires that check to be a successful localization/display check for the exact map version and package checksum being verified. Per-version map views continue showing historical checks for that map and do not by themselves mean it is currently deployed when a later check names another map. Deployment recording and POI verification serialize on the robot's deployment-state lock, so a map change cannot commit between the current-map check and the verification record. This is backend consistency over submitted evidence, not automatic inspection of the robot.

**ADR-0028 gate before POI preparation:** a validated ZIP is not sufficient for Tour Staff to create a proposal, create another revision (including a map change), or submit a draft. For each exact map-version/physical-robot pair, use only its latest deployment check. The exact package checksum must match and both localization and display must pass; one qualifying robot is sufficient. A newer FAIL on that pair supersedes its older PASS. A new map version inherits nothing. Map list/detail responses provide `technicalCheckStatus` (`PENDING`, `FAILED`, `PASSED`), `canUseForPoiPreparation`, `preparationBlockReasonCode`, `preparationBlockReason`, and `preparationEvidence` (robot and time among the evidence fields). The backend applies the same eligibility calculation to reads and mutations. A per-map transaction lock serializes deployment evidence writes with POI create/revision/submit. Rejected mutations return 409 and commit no success writes; identical committed request retries return their original result. This historical version eligibility remains true after a robot later moves to another map; POI verification still uses that robot's latest cross-map deployment check.

This changes the previous ADR-0021 API behavior that allowed draft creation against any uploaded valid map. Existing proposal and map histories remain readable, including proposals whose map is no longer eligible for new writes. No schema change is required.

Content-only POI revisions retain their navigation fingerprint. Their status references the newest technical result for that exact fingerprint and does not create a new physical check. A submitted content-only revision with an effective PASS can be revised again; a newer FAIL supersedes an older PASS and remains visible in status and the technical queue. A changed navigation fingerprint requires a new technical result.

## Endpoint inventory

All successes use the existing `BaseResponse<T>` envelope except ZIP download. `400` means invalid request/package/pose; `401` unauthenticated; `403` role denied; `404` missing map/POI/physical robot; `409` stale rowversion, reused idempotency key with different content, not-deployed map, already-submitted/result, or other state conflict. Mutations append `AuditLogs` in the same transaction. They do not assert that software itself ran a physical robot test.

| Method and path | Actor | Request → response | State/version guard; principal errors | Audit |
|---|---|---|---|---|
| `GET /api/technical/map-areas` | TechnicalStaff | → complete persisted area catalog `{areaKey, displayName}` | Read-only lookup over `MapAreas`; independent of map list paging | — |
| `GET /api/technical/physical-robots` | TechnicalStaff | → registered robot identity, first accepted sync context, derived connection status and latest in-memory sync receipt | Database `SourceType=PHYSICAL`; no online filter; returns no credential/hash. `UNCONFIRMED`, `CONNECTED`, `DISCONNECTED`, `AWAITING_DATA` use persisted confirmation plus current RAM telemetry and existing freshness threshold. | — |
| `POST /api/technical/physical-robots` | TechnicalStaff | `{robotCode, displayName}` → `{id, robotCode, displayName}` | Trims and validates Fleet Sync v1 RobotCode (1–100 chars) and required display name (1–150); server creates an unassigned, dispatch-disabled `PHYSICAL` identity with an empty unprovisioned credential hash; duplicate code returns 409. Unique `Robots.RobotCode` protects concurrent duplicates; registration has no requestId/receipt. Audit actor/time and robot commit together. No client fields for credentials, inspection, dispatch or assignment. | `PHYSICAL_ROBOT_REGISTERED` |
| `POST /api/technical/map-versions` | TechnicalStaff | multipart `areaKey`, `areaName`, `requestId`, `package`; → `MapVersionView` | Validated ROS ZIP, server allocates next immutable area version while holding the transaction-owned area lock; new area creates its first version, existing key retains its stored name; 400/409 | `MAP_VERSION_UPLOADED` |
| `GET /api/maps/versions?areaKey=&take=` | Staff, TechnicalStaff | → up to 100 `MapVersionListItem`, including check status, POI eligibility, reason and evidence | Metadata/list only; 400 take | — |
| `GET /api/maps/versions/{id}` | Staff, TechnicalStaff | → map metadata and same backend-calculated check status, POI eligibility, reason and evidence | Existing exact version; 404 | — |
| `GET /api/maps/versions/{id}/package` | Staff, TechnicalStaff | → ZIP bytes with filename and SHA-256 ETag | Exact immutable package; 404 | — |
| `POST /api/technical/map-versions/{id}/deployment-checks` | TechnicalStaff | `{requestId, robotCode, packageSha256, localizationPassed, displayPassed, evidenceNote}` → check | Existing database robot with `SourceType=PHYSICAL` rechecked at write time and exact package checksum; evidence note required. A new PASS requires durable current-credential connection confirmation; unconfirmed PASS returns 409 `ROBOT_CONNECTION_UNCONFIRMED`. FAIL remains allowed if request checks pass. Existing idempotent replay returns its record before the new-PASS gate. | `MAP_DEPLOYMENT_CHECK_RECORDED` |
| `GET /api/technical/map-versions/{id}/deployment-checks` | TechnicalStaff | → append-only deployment-check history | Existing version; 404 | — |
| `POST /api/staff/poi-proposals` | Staff | `{requestId, draft}` → proposal with revision 1 | Exact map version eligible under ADR-0028; pose inside free map cell; starts DRAFT/NOT_CHECKED; 400/404/409 | `POI_PROPOSAL_CREATED` |
| `GET /api/staff/poi-proposals?mapVersionId=` | Staff, TechnicalStaff | → current proposals and navigation status | Optional exact map filter; capped at 100 | — |
| `GET /api/staff/poi-proposals/{id}` | Staff, TechnicalStaff | → current revision, rowversion and status | Existing proposal; 404 | — |
| `GET /api/staff/poi-proposals/{id}/history` | Staff, TechnicalStaff | → immutable revisions and verification history | Existing proposal; 404 | — |
| `PUT /api/staff/poi-proposals/{id}/draft` | Staff | `{requestId, expectedCurrentRevision, expectedRowVersion, draft}` → new current revision | Exact selected map version must currently be eligible, including on map change; stale version conflicts; a submitted revision must have an effective PASS for its exact navigation fingerprint or a result attached to that revision | `POI_PROPOSAL_REVISION_CREATED` |
| `POST /api/staff/poi-proposals/{id}/submit` | Staff | `{requestId, expectedRevisionNumber, expectedRowVersion}` → submitted revision | Current draft's exact map version must currently be eligible; submission is not POI verification; 409 ineligible/stale/already submitted | `POI_PROPOSAL_SUBMITTED` |
| `GET /api/technical/poi-verifications?mapVersionId=` | TechnicalStaff | → submitted current revisions whose latest result for the exact fingerprint is not PASS | Optional exact map filter; content-only revisions with an effective PASS are omitted; a newer FAIL supersedes an older PASS; capped at 100 | — |
| `POST /api/technical/poi-proposals/{id}/revisions/{revisionNumber}/verification` | TechnicalStaff | `{requestId, expectedRevisionNumber, expectedRowVersion, robotCode, resultCode, reached, stopped, localizationPassed, cameraPresetConfirmed, reason, evidenceNote}` → result | Must be current submitted revision and exact map must have successful deployment localization/display evidence on that physical robot. PASS requires all checks true; FAIL requires reason and a failed observation. One result per immutable revision. | `POI_TECHNICAL_VERIFIED` / `POI_TECHNICAL_REJECTED` |

Map upload, deployment-check, and POI proposal/revision/submission/verification requests that expose a `requestId` require the caller to keep it stable for retries; a committed identical retry replays its result, while reuse with different content conflicts. The Web keeps the same key for an unchanged upload/check payload and replaces it when a payload field changes. Physical robot registration contains only `robotCode` and `displayName`; it has no `requestId` or receipt. Unique `Robots.RobotCode` protects concurrent duplicates, and an existing code returns 409. SQL transaction-owned application locks serialize request retries and area version allocation; proposal row locks and SQL rowversion guard concurrent edits. Immutable version/revision/submission/check/result tables receive SELECT/INSERT only; only `PoiProposals.CurrentRevision` and `UpdatedAt` are update-granted by `smart-campus-tour-map-poi-permissions.sql`.

### Robot connection confirmation before map-check PASS (ADR-0029)

Robot registration and map creation/upload may be prepared independently. For
a new area, use this operator sequence: register the robot and create/upload
the map; obtain the uploaded version's `mapKey`; have the responsible technical
or deployment operator provision the key and configure backend `RobotContexts`
and the MiniPC; send a valid sync; physically inspect the map; record a passing
manual check; then Staff may create POIs. This is documentation sequencing, not
an API dependency between upload and setup. Do not require map PASS before
configuration or sync. The first new Fleet Sync report accepted with the
current credential and configured map/frame stores backend acceptance time plus
that report's map/frame context. Pose may be null. This records authenticated backend contact, not proof
of map-file loading, localization, NTP synchronization, or safety. The context
is historical for the current credential; it survives backend restart and
offline state, and credential rotation resets all three confirmation fields.
If storing the confirmation fails after telemetry acceptance, sync remains
successful but PASS stays blocked until a later new report saves it. The manual
map observation remains the source of localization/display evidence. No sync
status is required to record FAIL. The first accepted context belongs to the
current credential period; stored confirmation and latest in-memory online
freshness are separate. The report timestamp passing age/skew validation does
not prove NTP was independently checked. Confirmation does not prove that the
robot loaded the named map file or is safe to move. Provisioning is a separate
technical/deployment duty and does not grant a Staff Operator SQL access.

**Diagram redraw notes — pending:** For the Report 4 Robot data/class view, show
unique `RobotCode`, `SourceType=PHYSICAL`, dispatch-disabled/unassigned
registration, and the three nullable first-accepted confirmation fields as one
all-null-or-all-present constrained group. Show credential provisioning as a
separate trust boundary: rotation updates `CredentialHash` and resets that
group atomically; runtime registration inserts and Fleet Sync updates only the
confirmation group. For the Fleet Sync / map-check sequence, show current-key
authentication, accepted telemetry, conditional persistence of the first
confirmation (skipped when already confirmed), and the failure path where
telemetry remains accepted while confirmation remains absent and a later new
report may retry. Show manual physical observation and the PASS guard separately
from sync; FAIL remains recordable before confirmation. The status read should
distinguish durable confirmation from latest in-memory online freshness. These
diagrams are not yet redrawn or accepted.

## Frontend handoff

- Technical Staff upload supports new and existing areas. Existing-area options come from the full `MapAreas` lookup, show name plus key and lock stored values; duplicate new keys direct the operator to existing-area mode. The server allocates the next version under its area transaction lock and returns it in the success response.
- The map-version table presents area, area key and version separately. A row action can open the existing-area upload mode for that area. File validity remains separate from deployment/localization/display evidence.
- The deployment-check form uses the TechnicalStaff-only physical-robot database lookup, not online telemetry. Empty and failed lookups are visible; save stays disabled until a robot is selected. The command rechecks robot existence/type and exact checksum before writing. Saving records that an operator performed a check; it does not upload a map or control a robot.
- Technical Staff can register a physical robot identity with its code and display name. Registration makes it available in the existing lookup/dropdown after query invalidation; it is not evidence of a connection, readiness, map check or permission to run. The one-shot credential provisioning command and per-robot `RobotContexts` remain separately configured outside the web. Provisioning must target the same `RobotCode` used by the bridge. A deployment check remains a human-recorded observation and does not require live telemetry or a matching `RobotContexts` entry.
- `PackageSha256` is the server-computed checksum of the uploaded ZIP package. Do not compare it directly with a checksum for only the YAML or PGM member.
- Staff POI proposal screens disable versions without effective technical PASS. The exact current map version is fetched by ID if outside the version-list page. Existing POIs retain map, pose, revision and result history; an ineligible historical map stays visible in a non-editable pose preview with the backend block reason. It cannot save a revision or submit while ineligible. If eligibility changes during a write, the API's 409 refreshes map metadata while preserving local input and selection. Requests carry stable request IDs and the current revision/rowversion.
- The Technical UI consumes the verification queue with proposal ID, current revision, rowversion and revision detail, then records per-revision reach/stop/localization/camera observations, evidence or failure reason through the versioned API.
- Route preparation uses versioned Route revisions and only selectable POI revisions that are PASS for the exact map version. Legacy mutable POI/Route authoring endpoints and Admin aliases were retired under ADR-0027; legacy SQL rows remain intact for Tour projections.
- Project-defined POI YAML import, non-zero-yaw pixel transform, physical route testing, scheduling/READY, whole-route certification workflow, robot deployment control and actual hardware evidence are not claimed. Project YAML/frame mapping remains pending.
