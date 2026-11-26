# CampusTour database snapshots

## v1.26 technical evidence photos

smart-campus-tour-schema-v1.26.sql adds nullable MapDeploymentChecks.EvidencePhotoUrlsJson NVARCHAR(2000), PoiVerificationRecords.EvidencePhotoUrlsJson NVARCHAR(2000) and RouteTestRuns.EvidencePhotoUrlsJson NVARCHAR(2000), each with an ISJSON CHECK constraint (CK_MapDeploymentChecks_EvidencePhotoUrlsJson, CK_PoiVerificationRecords_EvidencePhotoUrlsJson, CK_RouteTestRuns_EvidencePhotoUrlsJson). The value is a JSON array of 1-5 Cloudinary https image URLs; the app validates the array contents, the DB only checks ISJSON. patches/upgrade-v1.25-to-v1.26-technical-evidence-photos.sql applies them to a v1.25 database, changes no row and is rerunnable (THROW 51260/51261). Runtime already has table-level SELECT/INSERT on these three tables under smart-campus-tour-map-poi-permissions.sql and smart-campus-tour-route-revision-permissions.sql, so the new columns need no grant changes; the check-only gate is unchanged. The v1.25 snapshot and its patch stay immutable. A scaffold of a fresh v1.26 database will show the three new properties added to the EF entities.


## Runtime grant: a Tour that ends shortens its hold (ADR-0043 D13 addendum, 23/11/2026)

No schema change and no new snapshot. `smart-campus-tour-runtime-permissions.sql` now grants column `UPDATE (EndsAt)` on `TourRobotReservations` next to the release columns, so a COMPLETED or ended-early Tour sets its hold's `EndsAt` to `Tours.EndedAt`. `StartsAt`, `RobotId` and the durations stay write-once; the check-only gate refuses a runtime without the `EndsAt` grant or with `UPDATE (StartsAt)`. A v1.25 database gets the grant from the regrant step of `upgrade-db.sh --upgrade-to-v1.25`, which `upgrade-db-schema-ec2.sh --if-needed` runs when the gate refuses. No row is backfilled: holds of Tours that ended before the deploy run to their old end.

## v1.25 viewer vote for the next POI (ADR-0065)

`smart-campus-tour-schema-v1.25.sql` adds `RouteRevisions.ViewerChoosesNextStop BIT NOT NULL` (`DF_RouteRevisions_ViewerChoosesNextStop` = 0), nullable `RouteTestRuns.TraversedStopIdsJson NVARCHAR(1000)` with `CK_RouteTestRuns_TraversedStopIdsJson` (`ISJSON`), and three tables appended after the v1.22 narration objects: `TourStopVisits` (one row per POI a Tour arrived at or skipped, `UQ_TourStopVisits_TourStop`; CHECKs keep `Outcome`/`ChosenReason` to their values, the chosen stop and reason set together, a closed ballot only after an opened one, ballot reasons only after it closed and no ballot on a skip), `TourStopVotes` (one vote per roster row per visit, `UQ_TourStopVotes_VisitRow`) and `TourStopLocks` (non-blank reason, unlock columns all set with a non-blank `UnlockReason` or all NULL, filtered `UX_TourStopLocks_Active`). `patches/upgrade-v1.24-to-v1.25-viewer-vote.sql` applies them to a v1.24 database, changes no row and is rerunnable (THROW 51250/51251). Runtime gets SELECT/INSERT on the three tables and column UPDATE only on the ballot/choice columns of `TourStopVisits`, `RouteRevisionStopId`/`UpdatedAt` of `TourStopVotes` and the unlock columns of `TourStopLocks`, never table-wide UPDATE or DELETE; the two new route columns stay insert-only under the existing DENY UPDATE. The check-only gate refuses a runtime without those grants or with broader rights. The v1.24 snapshot and its patch stay immutable. A scaffold of a fresh v1.25 database matches the committed entities and the three new mappings; the hand-added `HasDefaultValue(false)` on `ViewerChoosesNextStop` was removed because EF does not scaffold a BIT default of 0 (as for `Tours.IsShortNotice`).

## v1.24 account avatar (ADR-0064)

`smart-campus-tour-schema-v1.24.sql` adds nullable `Users.AvatarUrl NVARCHAR(1000)` and `CK_Users_AvatarUrlHttps` (NULL or an `https://` link), placed after the v1.23 retirement columns. `patches/upgrade-v1.23-to-v1.24-user-avatar.sql` applies them to a v1.23 database, changes no row and is rerunnable (THROW 51240/51241). Runtime already has UPDATE on `dbo.Users`, so the grants and the check-only gate are unchanged. The v1.23 snapshot and its patch stay immutable. The EF `User` entity gained `AvatarUrl` by hand in scaffold form; re-scaffold against a v1.24 database to confirm.

## v1.23 POI retirement (ADR-0062)

`smart-campus-tour-schema-v1.23.sql` adds nullable `PoiProposals.RetiredAt` and `RetiredByUserId`, `FK_PoiProposals_RetiredByUserId` and `CK_PoiProposals_Retirement_Complete` (both set or both null), placed next to the v1.20 discard columns. `patches/upgrade-v1.22-to-v1.23-poi-retirement.sql` applies them to a v1.22 database, changes no row and is rerunnable (THROW 51230/51231). Runtime gets column UPDATE on the two new columns through `smart-campus-tour-runtime-permissions.sql`, never table-wide UPDATE or DELETE; the check-only gate refuses a runtime without those grants or with broader rights on `PoiProposals`. The v1.22 snapshot and its patch stay immutable. EF entities gained the two properties, the `RetiredByUser` navigation and the `User.PoiProposalRetiredByUsers` collection by hand in scaffold form; re-scaffold against a v1.23 database to confirm.

## v1.22 POI narration approved by a second Staff (ADR-0060)

`smart-campus-tour-schema-v1.22.sql` adds `PoiNarrationRevisions` (narration versions of a POI proposal: `DRAFT`, `APPROVED`, `SUPERSEDED`, `DISCARDED`, with `RowVersion`), filtered unique indexes `UX_PoiNarrationRevisions_Draft` and `UX_PoiNarrationRevisions_Approved` (one each per POI), CHECKs for state, approval columns, non-blank text, HTTPS video and `CK_PoiNarrationRevisions_NotSelfApproved` (approver differs from the last editor), the append-only `PoiNarrationRequestReceipts` (`UQ (ActorUserId, RequestId)`), and nullable `RouteRevisionStops.NarrationRevisionId` with its FK. `patches/upgrade-v1.21-to-v1.22-poi-narration-approval.sql` applies them to a v1.21 database (THROW 51220/51221, rerunnable) and moves data: each POI's newest revision with narration becomes one `DRAFT` row by that revision's author. It creates no `APPROVED` row, so after the upgrade no new route revision can be saved until a second Staff approves the narration of its POIs; existing route revisions and Tours keep their snapshot. Runtime gets SELECT/INSERT on both tables and column UPDATE on the mutable narration columns only (`NarrationText`, `FallbackVideoUrl`, `State`, `LastEditedByUserId`, `LastEditedAt`, `ApprovedByUserId`, `ApprovedAt`), never DELETE; the check-only gate refuses broader or missing rights. The v1.21 snapshot and its patch stay immutable; `PoiProposalRevisions.NarrationText/FallbackVideoUrl` remain but are no longer written. EF entities were re-scaffolded from a fresh v1.22 database and only the new tables, navigations and the FK were taken; the inferred one-to-one `PoiNarrationRevision → PoiProposal` (from the filtered unique index) was corrected to one-to-many.

## v1.21 Technical retirement of a map version (ADR-0041)

`smart-campus-tour-schema-v1.21.sql` adds nullable `MapVersions.RetiredAt`, `RetiredByUserId` and `RetirementReason NVARCHAR(500)`, `FK_MapVersions_RetiredByUserId` and `CK_MapVersions_Retirement_Complete` (all three set or all three null). `patches/upgrade-v1.20-to-v1.21-map-retirement.sql` applies them to a v1.20 database, retires nothing and is rerunnable (THROW 51210/51211). Runtime gets column UPDATE on the three new columns through `smart-campus-tour-runtime-permissions.sql`, never table-wide UPDATE or DELETE; the check-only gate refuses a runtime without that grant or with broader rights on `MapVersions`. The v1.20 snapshot and its patch stay immutable. EF entities gained the three properties and the `RetiredByUser` navigation by hand in scaffold form (the uploader collection on `User` is now `MapVersionUploadedByUsers`); re-scaffold against a v1.21 database to confirm.

## v1.20 Staff discard of a never-passed POI (ADR-0051)

`smart-campus-tour-schema-v1.20.sql` adds nullable `PoiProposals.DiscardedAt` and `DiscardedByUserId`, `FK_PoiProposals_DiscardedByUserId` and `CK_PoiProposals_Discard_Complete` (both set or both null). `patches/upgrade-v1.19-to-v1.20-poi-discard.sql` applies them to a v1.19 database, changes no row and is rerunnable. Runtime gets column UPDATE on the two new columns through `smart-campus-tour-runtime-permissions.sql`, never DELETE; the check-only gate refuses a runtime without that grant or with table-wide UPDATE/DELETE on `PoiProposals`. The v1.19 snapshot and its patch stay immutable. EF entities gained the two properties and the `DiscardedByUser` navigation by hand in scaffold form; re-scaffold against a v1.20 database to confirm.

## v1.15 Terminal command outcomes (ADR-0044)

`smart-campus-tour-schema-v1.15.sql` requires a non-NULL, matching `Outcome` for ARRIVED, FAILED and CANCELLED commands. The v1.14 snapshot and its patch stay immutable. `patches/upgrade-v1.14-to-v1.15-command-outcome.sql` transactionally replaces only the outcome CHECK and advances the version marker. It preserves command rows and the original bootstrap hash, and stops with invalid command IDs if existing history has missing or mismatched outcomes. It never fills these values automatically. Use the backed-up Database Schema Upgrade workflow before deploying this release; read-only checks require v1.15 and the trusted NULL guard. Runtime grants and EF entities are unchanged.

## v1.14 Robot commands and versioned Tour stops (ADR-0042, ADR-0043)

`smart-campus-tour-schema-v1.14.sql` adds `dbo.RobotCommands` (one row per GoTo/Cancel, lifecycle state, delivery stream, outcome and RECONCILED resolution) with CHECKs that keep each row internally consistent, and filtered unique indexes for one open GoTo per robot (UNKNOWN included), one open Cancel per leg and one GoTo per leg. `Tours` gains `CurrentRevisionStopId` and `LastArrivedRevisionStopId` (FK `RouteRevisionStops`) and a CHECK that keeps versioned Tours off the legacy `RouteStop` columns. `patches/upgrade-v1.13-to-v1.14-robot-commands.sql` applies it to a v1.13 database and is rerunnable; a versioned Tour already pointing at a legacy stop stops the patch with the Tour listed. Runtime gets SELECT/INSERT on `RobotCommands`, UPDATE only on its lifecycle columns (never the target, never DELETE), and column UPDATE on `Robots.CurrentTourId`, `LastAssignedAt` and `NeedsInspection`; `Tours` already had table UPDATE. The status CHECKs use the database collation, which is case-insensitive. No handler writes these rows yet.

## v1.13 Map package uniqueness (ADR-0040)

`smart-campus-tour-schema-v1.13.sql` adds the unique index `UX_MapVersions_Area_PackageSha256` on `(AreaKey, PackageSha256)`. `patches/upgrade-v1.12-to-v1.13-map-package-uniqueness.sql` applies it to a v1.12 database and is idempotent. If an area already holds the same package twice it stops, lists the area, versions and SHA-256, and changes nothing; choosing which version stays is a reviewed data change. The index needs no new grant.

## v1.12 Robot area and deactivation (ADR-0039)

`smart-campus-tour-schema-v1.12.sql` adds `Robots.AssignedAreaKey` with a filtered unique index, and `DeactivatedAt`, `DeactivatedByUserId`, `DeactivationReason`. `patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql` applies them to a v1.11 database and is idempotent. It backfills the area and stops with the robots named if an area is already shared: clear the extra assignment, then rerun. Runtime gets column-level UPDATE on the new columns; the provisioner gets SELECT on `DeactivatedAt`. The API build requires v1.12, so run the upgrade first.

## v1.11 POI pose-capture import (ADR-0038)

`smart-campus-tour-schema-v1.11.sql` adds `PoiProposals.SourceAreaKey`/`SourcePoiId`, `PoiVerificationRecords.VerificationMethod`/`SourceFileSha256`/`SourceFileContent`, makes the four observation columns nullable for `POSE_CAPTURE` only, and adds append-only `PoiImportReceipts`. `patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql` applies them to a v1.10 database and is idempotent; existing results become `MANUAL_CHECK` unchanged. Runtime gets SELECT/INSERT on receipts, never UPDATE/DELETE. The API build requires v1.11, so run the upgrade first.

## v1.10 Tour scheduling inputs (ADR-0035)

`smart-campus-tour-schema-v1.10.sql` adds nullable `RouteTestRuns.MeasurementBasis` and `TourRobotReservations.ExpectedDurationSeconds`; `patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql` applies them to a v1.9 database and is idempotent. Existing rows keep NULL: an old run must be measured again before it can size a reservation, and an old reservation keeps its window. Runtime grants do not change. The API build requires v1.10, so run the upgrade first.

## v1.9 Tour on a tested Route revision (ADR-0034)

`smart-campus-tour-schema-v1.9.sql` adds `Tours.RouteRevisionId`, `Tours.OperatorUserId` and `TourRobotReservations`; `patches/upgrade-v1.8-to-v1.9-tour-route-revision.sql` applies them to a v1.8 database and is idempotent. Legacy Tours keep NULL in the new columns. Runtime gets SELECT/INSERT on reservations and UPDATE only on the release columns, never DELETE. Overlap is refused by the application under a per-robot lock, not by a database constraint. The API build requires v1.9, so run the upgrade first.

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
- Current schema is Database First v1.15. Runtime may SELECT/INSERT `Robots` for Technical Staff registration and UPDATE only credential lifecycle, `FirstAccepted*`, the map-assignment columns, the deactivation columns and the Tour claim columns (`CurrentTourId`, `LastAssignedAt`, `NeedsInspection`). It never gets whole-table UPDATE/DELETE. The separate provisioner has column-scoped SELECT/UPDATE grants for credential lifecycle and confirmation fields, plus append-only audit access. Versioned POI revisions and route-stop snapshots add nullable `NarrationText` and `FallbackVideoUrl`; runtime retains only SELECT/INSERT access to these immutable records.
- A v1.4/v1.5/v1.6/v1.7/v1.8/v1.9/v1.10/v1.11/v1.12/v1.13/v1.14 database must run the controlled upgrade/regrant through v1.15 and pass the read-only `init-db.sh --check-only` gate before deploying an API build that requires map assignment in the database. Do not run regrant against EC2/shared databases outside the verified-backup change process.

No trigger/procedure is needed for these changes. No CHECK/DEFAULT is introduced: callers still supply GUIDs, required timestamps/flags and validate status values. Filtered indexes require the SET options at the top of the snapshot on connections performing DML.

### Bootstrap compatibility and runtime permissions (2026-10-28)

Treat the deployed snapshot as immutable, including comments. Put changing
business explanations in docs/ADRs; in particular ADR-0017 freezes Route
configuration from any Tour reference even if an older SQL comment mentions READY.
The Compose initializer creates an empty database from
`smart-campus-tour-schema-v1.15.sql`; its bootstrap check requires the current
LF-normalized v1.15 hash marker or a recognized historical bootstrap marker plus
the complete v1.15 structure before granting runtime permissions. The two
historical v1.1 marker values (`96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68`
and `2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67`)
remain recognized as the accepted comment-only pair, but now return
`UPGRADE_REQUIRED`: they do not prove the required tables/columns exist. The
initializer refuses them without changing data or markers, and also refuses
unknown or unmarked non-empty schemas. Normal API deployment runs this tool only
in read-only `--check-only` mode; it cannot bootstrap, migrate, change login
credentials, or change the SQL Server engine. Empty-database bootstrap is an
explicit `--bootstrap` operation. Existing data uses the separately locked
Backend Database Schema Upgrade workflow, which takes and verifies a full
backup before applying additive patches in order (v1.1→v1.2, v1.2→v1.3,
v1.3→v1.4, v1.4→v1.5, v1.5→v1.6, v1.6→v1.7, v1.7→v1.8, v1.8→v1.9, v1.9→v1.10, v1.10→v1.11, v1.11→v1.12, v1.12→v1.13, v1.13→v1.14, v1.14→v1.15), then checks the resulting structure and runtime grants. It retains
the original bootstrap hash and records `CampusTourSchemaVersion=1.15` only
after required structure checks. Unknown markers or incomplete upgrades fail
closed. Any executable schema change needs its own ADR/database change process.

For a fresh v1.15 database the initializer applies, in order, the full schema,
the log role, map/POI grants, Route revision grants, then creates the runtime
user and applies `backend/database/smart-campus-tour-runtime-permissions.sql`.
That runtime script grants the v1.4 email request table only SELECT/INSERT/UPDATE
and leaves DELETE denied; it does not skip missing objects. Route/RouteStops CRUD and Tour
SELECT/INSERT/UPDATE are included. Robots allow SELECT/INSERT for identity
registration and column-level UPDATE for credential lifecycle and first-sync
confirmation fields; full-table UPDATE/DELETE remain denied. The separate
provisioner has its own scoped credential/confirmation grants and appends audit
rows without rewrite. Branch writes and Tour DELETE
remain absent. Audit/TourEvent rewrite remains denied. SQL integration tests run
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

Wave C adds the v1.4 Database First row-registration slice. Representative roster
updates use stable row IDs; new rows await Staff review, accepted rows retain
their own access, and removed rows revoke only their own invitation/session.
Email changes are requested by the owning Representative and reviewed by Staff;
the old direct Admin correction URL fails closed. Invitation/access checks use
row participation state. Same-browser reconnect uses a tour-scoped device token
and a two-minute window. See
`backend/docs/representative-registration.md` and
`backend/docs/registration-review.md` for API details and boundaries.

## v1.4 row-level registration and email change (ADR-0026)

`smart-campus-tour-schema-v1.4.sql` is the snapshot for an empty database and
retains v1.3 tables. Existing v1.3 schemas require
`patches/upgrade-v1.3-to-v1.4-row-registration.sql` through a reviewed
Database First change, with backup and explicit database approval. The patch
validates known bootstrap markers, backfills row participation from the existing
registration decision, and adds row review metadata, email-change request
history, and a browser device-token hash. Do not run this patch on a shared or
production database from this branch. Integration tests use disposable SQL
databases; the developer's local v1.1 database is intentionally untouched.

Apply `smart-campus-tour-runtime-permissions.sql` after the existing runtime
role setup to grant the email-request table access required by the API and
SELECT/INSERT on Robots for physical identity registration. Existing v1.4
databases receive the controlled Backend Database Schema Upgrade regrant, which
Backend Deploy now runs automatically (after a backup) when the release's
read-only check reports missing grants; this regrant applies the
existing permission scripts without adding a schema version or changing
business data. The patch does not create a global seat-capacity setting,
institutional calendar, or versioned scheduling/READY writer. Staff review ageing is observable from
submission/request timestamps; an automatic business-day due date/escalation
requires a separately approved working-day calendar.

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

## v1.3 immutable Route revisions (ADR-0023)

`smart-campus-tour-schema-v1.3.sql` is the new-empty-database snapshot and
retains all v1.2 structures. For an explicitly recognized v1.2 database, apply
`patches/upgrade-v1.2-to-v1.3-route-revisions.sql` through the reviewed database
change process after a full backup. The accepted `CampusTourBootstrapHash`
values are the two known original snapshot hashes retained by the v1.1→v1.2
upgrade; the map/POI upgrade preserves that marker. Unknown/unmarked schemas
are rejected. The patch is additive and leaves `Routes`/`RouteStops` records
unchanged; old rows default to `AuthoringMode=LEGACY`.

After the patch and existing role scripts, apply
`smart-campus-tour-route-revision-permissions.sql`. The runtime role can read
and insert versioned route revisions, stops, submission receipts and test runs,
but cannot update/delete those records. Route API code uses the same `Routes`
identity table and legacy APIs filter to LEGACY rows. This patch has not been
applied to any shared or production database. SQL integration tests cover the
new snapshot and repeat application of the patch on a disposable database.

Database First model generation was run against a disposable v1.3 local SQL
database using EF Core scaffolding; generated entities and mappings were
reviewed, including the manually corrected EF relationship/cardinality rules.
The disposable database was removed. This work branch does not apply the patch
to a shared database or scaffold/migrate a database at application startup.
