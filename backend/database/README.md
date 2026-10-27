# CampusTour database snapshots

## v1.2 versioned map/POI slice (ADR-0021)

`smart-campus-tour-schema-v1.2.sql` is the full snapshot for a newly created
database. `patches/upgrade-v1.1-to-v1.2-map-poi.sql` is an additive patch for
an explicitly recognized v1.1 database and preserves existing rows; take and
verify a full backup before the normal reviewed deployment process. The patch
is idempotent for the v1.2 schema marker and rejects unknown/unmarked schemas.
Neither file should be run against a shared or production database outside its
approved change window. v1.1 and its recognized hashes remain unchanged.

After v1.2 schema installation and the existing `campus_tour_app` role setup,
apply `smart-campus-tour-map-poi-permissions.sql`. It grants read/insert for
immutable map, deployment, revision, submission and verification records, plus
only the current revision pointer fields on `PoiProposals`; it grants no
update/delete on immutable result tables. Re-scaffold from a disposable v1.2
database with `backend/scripts/scaffold-db`, then review generated output and
the documented one-to-many corrections. Integration tests use a disposable
SQL database when `SMARTCAMPUS_SCHEMA_TEST_CONNECTION` is set.

## Status

- `backend/database/smart-campus-tour-schema-v1.1.sql` now matches the generated EF entities and was applied to the local `SmartCampusTourV11` database on SQL Server `localhost,1433` under `docs/decisions/0012-v1-1-schema-and-operation-scope.md`.
- The local DB was created empty. v1.1 is not an ALTER migration and did not migrate v1.0 or production data.
- `backend/database/smart-campus-tour-permissions.sql` creates the `campus_tour_app` database role and grants SELECT/INSERT, denies UPDATE/DELETE on TourEvents/AuditLogs. Apply after the schema in the intended database. A deployment administrator provisions the runtime user and adds it to this role; the script does not create a login or change existing user memberships. Business-table permissions remain feature-specific.

No trigger/procedure is needed for these changes. No CHECK/DEFAULT is introduced: callers still supply GUIDs, required timestamps/flags and validate status values. Filtered indexes require the SET options at the top of the snapshot on connections performing DML.

### Bootstrap compatibility and runtime permissions (2026-10-19)

Treat the deployed snapshot as immutable, including comments. Put changing
business explanations in docs/ADRs; in particular ADR-0017 freezes Route
configuration from any Tour reference even if an older SQL comment mentions READY.
The initializer hashes the entire LF-normalized source and checks its marker via
`backend/database/smart-campus-tour-bootstrap-check.sql`. Only this audited pair
is compatible: current `96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68`
and prior `2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67`.
They differ only in two Route/dwell comments. Tests reconstruct those exact
changes and check both hashes. Recognizing the old marker preserves it and all
data; no automatic marker rewrite or unknown-schema adoption is performed.
Any further executable schema change needs its own ADR/database change process.

Apply `backend/database/smart-campus-tour-runtime-permissions.sql` after the log
role script for runtime business permissions. Route/RouteStops CRUD and Tour
SELECT/INSERT/UPDATE are included; Tour DELETE and runtime robot/branch writes
are absent. Audit/TourEvent rewrite remains denied. SQL integration tests run
the real Route/Tour preparation pipeline under an impersonated restricted user.

Backend CI provisions disposable SQL Server and sets
`SMARTCAMPUS_REQUIRE_SQL_TESTS=true`; verification fails before tests if its SQL
connection is missing. Local fast verification remains opt-in for SQL; use
`SMARTCAMPUS_SCHEMA_TEST_CONNECTION` for the complete SQL suite.

Admin POI Management adds `Pois.RowVersion` to the v1.1 schema for optimistic
concurrency. New empty databases receive it from the snapshot. Existing v1.1
databases must first run `patches/add-poi-rowversion-v1.1.sql`; do not rerun the
CREATE snapshot against them. Apply the patch to the intended development or
deployment database through the normal database-change process, then
re-scaffold from that database and review the generated POI property/mapping.
The patch is idempotent and preserves existing POIs.

## Run real SQL tests

From the repository root in PowerShell, using a local SQL Server test instance with CREATE DATABASE permission:

```powershell
$env:SMARTCAMPUS_SCHEMA_TEST_CONNECTION = 'Server=localhost,1433;Integrated Security=true;TrustServerCertificate=true'
bash scripts/verify backend
```

Use a disposable development SQL Server, never a production connection. SQL tests create their own GUID-named databases (including `SmartCampusTourPoiDemo_<32-hex-guid>` for POI fixtures), apply the selected snapshot and test fixtures, and drop only that database in cleanup. The supplied Initial Catalog is ignored; existing databases are not modified. No connection string is written into generated source. SQL-backed tests explicitly report SKIPPED without this environment variable; a normal PASS with skips is not evidence v1.1 was tested.

Coverage: execute the complete snapshot; reject duplicate business keys; allow legitimate historical/multi-registration rows; race two independent connections for one session; require closing an expired session before replacement; enforce pending/accepted branch limits; validate new stop FKs; preserve last actual arrival across a route change; enforce robot-claim uniqueness; apply permissions twice; demonstrate INSERT/SELECT succeeds and UPDATE/DELETE fails as a non-owner test user. Audit tests append request/result rows and count email attempts separately from log rows.

## Apply/adopt later

For the POI development baseline, provision a separate empty
`SmartCampusTourPoiDemo` database and apply
`backend/database/smart-campus-tour-schema-v1.1.sql` there once. Do not apply the
CREATE snapshot to an existing populated database. Then run the explicit
`--seed-demo-pois` command using the environment/connection instructions in
`backend/database/seed-data-plan.md` section 8. It creates four unverified POIs
with stable GUIDs and map key `demo-poi-baseline-v1`; reruns skip matching rows
or fail on conflict. It never runs on normal API startup. Keep this DB separate
from physical robot operations. The baseline fixture itself does not change the
schema; Admin POI Management adds the separate RowVersion patch above. Existing
runtime User Secrets remain unchanged.

The current local target is `SmartCampusTourV11` on `localhost,1433`; the local API User Secret `ConnectionStrings:DefaultConnection` points to it using Windows Integrated Security. Runtime configuration is per developer; the shared repository contains no connection string. To scaffold again, set `SMARTCAMPUS_DB_CONNECTION` to this target and run `bash backend/scripts/scaffold-db` from Git Bash. Never point that script at a database with data whose schema does not match the snapshot; apply the additive POI RowVersion patch first. After every re-scaffold, review the filtered unique index relationships: EF scaffold inferred `BranchRequest.TourId` as one-to-one from the one-accepted-per-Tour index, and `BrowserSession.InvitationId` as one-to-one from the one-open-session-per-invitation index. Both relations are one-to-many because other request/session rows are allowed; the backend mappings and inverse collections were corrected accordingly.

## Registration submission implementation

Admin Tour creation, preparation updates and pre-Start cancellation now use
the existing v1.1 schema under ADR-0018. Request receipts use append-only
AuditLogs plus transaction-owned application locks, with no new table/column.
Selected Route/POI data uses the existing Route repository. Cancellation retains
relationship history, closes pending review work and revokes invitation/session
access. See `backend/docs/admin-tour-management.md` for request examples,
locking, SQL verification and lifecycle boundaries.

Admin Route Management uses the existing Routes/RouteStops model without a
schema patch. It records an aggregate revision and serializable usage/POI
checks, rather than adding a second route model. See
`docs/decisions/0017-admin-route-management.md` and
`web/docs/route-management.md`. Route SQL tests use disposable databases and
exercise reorder, concurrency, reference locks and audit rollback.

The Representative submission API now enforces Tour-first locks, owned mutations,
rowversions and normalized email reservations in SUBMITTED/APPROVED registrations.
The schema is unchanged. See `web/docs/representative-registration.md` for the
live slice, isolated Route/Tour fixture and verification. Admin approval/rejection now shares these locks and reservations; see
`web/docs/admin-registration-review.md`. Approved roster replacement and
invitation/session revocation remain future implementation.

## Remaining application invariants

- Every roster import/replacement, registration approval and Admin email correction locks the same parent Tour with UPDLOCK **before** checking normalized email duplicates, holding the lock until commit. Define the same effective-row predicate and normalization in all paths; lowercasing only during import is insufficient.
- Derive BranchPointRouteStopId from the selected variant and test rejection of mismatched Tour, registration, route and branch point. Close requests atomically on visit closure/NEEDS_ASSISTANCE; old requests stay terminal after recovery. FK existence and filtered UNIQUE do not implement this state machine.
- Use RowVersion in conditional writes; persist the winning intent before robot send. All active STAFF users can operate every Tour but still need state/readiness/time checks. Staff-only does not gain invitation support rights.
- Reissue/revoke closes old sessions atomically; expiry/IDLE_TIMEOUT must release the open-session slot before a replacement. IDLE_TIMEOUT is the finite disconnected-session lease, not lack of mouse/keyboard interaction while watching.
- Audio replacement creates a new retained asset; narration activation snapshots AudioUrl/NarrationText/NarrationSeconds into TourEvents.DataJson with the POI/visit context.
- Email audit: one CorrelationId per send attempt, append EMAIL_SEND_REQUESTED/PENDING then EMAIL_SEND_RESULT with observed ACCEPTED/FAILED/UNKNOWN. Retries of the send use new IDs; repeated delivery of an outcome must not inflate counts. Never UPDATE old audit rows, log recipient details/codes, or label UNKNOWN as failed/successful without evidence.
- HMAC-SHA256 access-code lookup requires a key outside SQL and consistent normalization/key handling. The SQL BINARY(32) type does not implement HMAC. Keep code generation, collision retry, protected resend storage and revocation tests in the future invitation use case.
- Retention: enumerate RosterRows.DisplayName/Email/ClassName, group contacts and identifying free text, invitation secrets and sessions, import/export copies and links. Revoke rights, preserve only non-identifying aggregate statistics, then delete/de-identify operational data according to configured retention and FK order. See ADR-0011/0012; no cleanup job or retention duration is introduced here.

Runtime users must not be dbo/sysadmin/db_owner, own schemas/tables, have DDL control or column-level grants overriding the intended restriction. The log role protects ordinary app access, not privileged DB administrators. Production identity provisioning and permissions must be checked under the real runtime account before use.
