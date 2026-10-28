# Backend API cutover inventory

This inventory records the current feature-branch route set after the
owner-authorized cutover in [ADR-0027](../../docs/decisions/0027-versioned-map-poi-and-route-api-cutover.md).
“Retired” means the old route is no longer mapped and returns 404; it does not
mean legacy SQL rows were deleted. `Staff` is the JWT role/product label
Tour Staff. Tour Operator remains an assigned duty, not a role.

## Endpoint-by-endpoint mapping

| Method/path | Current behavior and caller | Replacement / action | State |
|---|---|---|---|
| `GET /api/admin/accounts`, `GET /api/admin/accounts/{id}`, `POST /api/admin/accounts`, account lifecycle routes | Admin account UI; manage users and supported roles | Keep unchanged; still Admin | Implemented/current |
| `GET /api/staff/manage/pois`, `GET /api/staff/manage/pois/{id}`, `POST /api/staff/manage/pois`, `PUT /api/staff/manage/pois/{id}`, activate/deactivate | Old Staff POI catalog page and legacy mutable POI workflow | Staff proposal list/detail/history/create revision/submit at `/api/staff/poi-proposals`; technical queue/result at `/api/technical/poi-verifications` and `/api/technical/poi-proposals/{id}/revisions/{revision}/verification` | Retired; web caller migrated |
| `GET /api/admin/pois`, `GET /api/admin/pois/{id}`, POI writes | Old Admin alias to POI catalog | No alias. Use the versioned POI proposal and Technical verification APIs above | Retired; routes absent |
| `POST /api/technical/map-versions`, `GET /api/maps/versions*`, package download, deployment-check records | Technical map setup/upload and deployment evidence; Staff reads map versions for POI authoring | Keep versioned contracts; upload does not deploy, deployment check is manually entered evidence | Implemented/current |
| `GET /api/staff/manage/routes`, `GET /api/staff/manage/routes/{id}` | Existing pre-execution Tour read model selects only `AuthoringMode=LEGACY` records | Keep these two Staff-only projections until Tour scheduling is migrated; do not use for versioned Route authoring | Retained legacy read |
| `POST /api/staff/manage/routes`, `PUT /api/staff/manage/routes/{id}`, `DELETE /api/staff/manage/routes/{id}`, `POST .../{id}/activate`, `POST .../{id}/deactivate` | Old mutable Route catalog UI | Versioned Route create/revision/submit/list/history under `/api/staff/routes` and `/api/routes`; manual testing under `/api/technical/route-verifications/queue` and `/api/technical/routes/{routeId}/revisions/{revisionId}/test-runs` | Retired; web caller migrated |
| `/api/admin/routes` read/write/activation aliases | Old Admin Route catalog alias | No Admin alias; versioned Route API for authoring. Legacy read is available only through the retained Staff GET paths above | Retired |
| `/api/admin/tours/*` | Old Admin URL alias for pre-execution Tour APIs | Use Staff route `/api/staff/manage/tours/*` for the existing legacy slice | Alias retired; Staff API remains partial |
| `/api/staff/manage/tours/*` | Staff creates/updates/cancels and reads the existing pre-execution Tour model | Keep only the current legacy behavior; creation/schedule change fails closed when configured duration is unavailable. No exact RouteRevision, Operator, reservation, or READY is implied | Retained partial; versioned scheduling pending |
| `/api/admin/registrations/*` | Admin aliases for registration reads and aggregate/per-row decisions | Use current Staff registration reads and per-row review at `/api/staff/manage/registrations/*` | Admin aliases retired |
| `POST /api/staff/manage/registrations/{id}/approve`, `POST .../{id}/reject` | Aggregate review of a whole legacy registration | Use `/rows/{rowId}/accept` or `/rows/{rowId}/reject` with row and registration versions | Retired |
| `POST /api/admin/registrations/{id}/roster/{rowId}/email` | Direct Admin email replacement | Representative request and Staff accept/reject at `/api/representative/.../roster-email-change-requests` and `/api/staff/manage/roster-email-change-requests` | Retired |
| Registration list/detail and per-row decision endpoints at `/api/staff/manage/registrations/*` | Staff operational review UI | Keep read and row-specific workflow | Implemented/current |

The exact routable actions and authorization are in the controllers and the
generated OpenAPI document. Do not infer that every old endpoint in a controller
was retired: Staff Tour reads/writes and Staff registration reads remain where
they serve an implemented workflow. Admin account management remains Admin-only.

## Cutover limits

- Versioned Route selection does not yet provide a scheduling/READY writer;
  legacy Tour APIs are not a substitute. See ADR-0024 and
  `admin-tour-management.md`.
- Map deployment and POI/Route checks are submitted human evidence, not robot
  command or observed hardware results.
- No database rows or schema were changed by API retirement.
- The UI still redirects old browser `/admin/*` page URLs. Those are frontend
  navigation redirects, not backend API aliases.
- Pending branch cutoff, F-14, project YAML/frame mapping, M2 transport and
  diagram redraw remain unchanged.
