# Admin Route Management

Authorized change: `docs/decisions/0017-admin-route-management.md` supersedes
seed-only Route/dwell preparation in ADR-0009/0012. No SQL schema change is
needed. The live catalog at `/admin/routes` uses the real Admin API, SQL Server
and TanStack Query; failed requests display an error and never use demo data.
The existing Tour editor, Staff, Student and simulation Route mocks remain
with their legitimate consumers. A live Route does not yet appear in the
mock Tour selector. There is no Tour/robot runtime in this feature.

## First Route from existing POIs

1. Run the backend with its existing local SQL/JWT configuration, and run
   `npm run dev` from `web/`. Set `VITE_API_BASE_URL` using the usual ignored
   local environment configuration. Sign in as Admin.
2. Open `/admin/pois`. Check the actual three POIs' map/frame and poses. Do not
   change map or coordinates just to make a Route pass. POIs may remain
   inactive while preparing a Route draft; activation is a separate action.
   Saving a Route adds RouteStop references and therefore locks those POIs'
   geometry under the existing POI policy, even while the Route is inactive.
   If still tuning physical waypoints, finish that work first, remove the POI
   from every editable unused Route before tuning it, or create a new POI.
   Never bypass a historical/operating reference lock to adjust geometry.
3. Open `/admin/routes`, choose **Tạo tuyến**, enter a name. In the POI list,
   **Dùng làm Start** copies that POI's existing map/frame/x/y/yaw into the
   Route Start fields. This is a coordinate snapshot, not a StartPoiId link.
   Alternatively enter a surveyed Start pose. No physical coordinates or
   dwell durations are fabricated by the form.
4. Add the existing POIs, reorder with up/down, and enter each stop's positive
   dwell and head holds (Nhìn trước/trái/phải). Holds must total no more than
   dwell. Each POI occurs once. POIs must match the Route map/frame exactly.
   Search and page through the catalog as it grows.
5. Choose **Kết thúc tại POI cuối**, or enter all three surveyed End coordinates.
   Save. The new Route is inactive. Detail separately shows data issues and
   availability blockers; neither is a physical-safety certificate.
6. Review the full itinerary, map, Start/End, POI transitions, dwell and head
   behavior with the technical team on the robot. CRUD does not navigate or
   record a verification flag. Activate the POIs and choose **Cho phép sử dụng**
   when the catalog should permit new Tour selection. IsActive is only that
   selection flag. Future Tour readiness must check commissioning separately.

## Editing, history and concurrency

Unreferenced Routes can change metadata and configuration, or be deleted with
confirmation. Stop replacement is atomic; new stop identities are generated
only when an unreferenced itinerary changes. A metadata-only save keeps stop
identities and no-op saves produce no audit/version change.

Any Tour state, variant (including inactive), history or execution stop
reference freezes the itinerary and prohibits deletion. Use **Sao chép thành
tuyến mới**, which submits a normal create with a fresh Route/stop identity;
it does not copy Tours/variants or carry over availability. Metadata and
availability remain editable except during READY/RUNNING base/active/enabled
branch use. Deactivation preserves existing Tour references and configuration.

Every mutation requires the detail's opaque `expectedVersion`. A stale save
returns 409 and retains the form draft. Reload explicitly before editing with
the current version; the app does not auto-retry a mutation or replace a draft
with background data. SQL serializable transactions combine usage checks,
POI consistency, stop replacement, ordinary UnitOfWork save and append-only
audit. Root update locks serialize same-version edits. Related SQL deadlock/
reference races return conflict and roll back. Details and usage are advisory
until the server rechecks during a write. Public contract: `docs/architecture.md`.

## Verification and remaining work

From repo root, set `SMARTCAMPUS_SCHEMA_TEST_CONNECTION` to a disposable local
SQL Server test instance (CREATE DATABASE permission), then run
`bash scripts/verify backend web`. Use Git Bash on Windows. Existing databases
are never modified by these tests; see `backend/database/README.md`.

Tests create GUID-named databases, apply the v1.1 snapshot and test-only users,
POIs, Tours and variants, then drop their own database. They never modify the
existing runtime POIs. Coverage includes real HTTP/SQL CRUD, ordering, schema
precision, missing/mismatched/inactive POIs, auth, stale/concurrent writes,
Tour/variant locks and rollback on audit failure. Without the SQL environment
variable those integration checks report SKIPPED. UI tests cover real API
binding, order/payload, retained conflict draft, copy and errors.

Next Admin Tour Management: connect its Route selector to these live APIs,
revalidate/lock availability and selected Route/POIs with scheduling/READY,
coordinate that lock order with existing Tour-first writers, and enforce
commissioning/narration/branch readiness without changing referenced Routes.
Add live Tour commands and their concurrency tests in that separate task.
Variant authoring/import and robot commissioning remain separate work.
