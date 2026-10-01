# CampusTour database snapshots

## Status

- `backend/database/smart-campus-tour-schema-v1.1.sql` now matches the generated EF entities and was applied to the local `SmartCampusTourV11` database on SQL Server `localhost,1433` under `docs/decisions/0012-v1-1-schema-and-operation-scope.md`.
- The local DB was created empty. v1.1 is not an ALTER migration and did not migrate v1.0 or production data.
- `backend/database/smart-campus-tour-permissions.sql` creates the `campus_tour_app` database role and grants SELECT/INSERT, denies UPDATE/DELETE on TourEvents/AuditLogs. Apply after the schema in the intended database. A deployment administrator provisions the runtime user and adds it to this role; the script does not create a login or change existing user memberships. Business-table permissions remain feature-specific.

No trigger/procedure is needed for these changes. No CHECK/DEFAULT is introduced: callers still supply GUIDs, required timestamps/flags and validate status values. Filtered indexes require the SET options at the top of the snapshot on connections performing DML.

## Run real SQL tests

From the repository root in PowerShell, using a local SQL Server test instance with CREATE DATABASE permission:

```powershell
$env:SMARTCAMPUS_SCHEMA_TEST_CONNECTION = 'Server=localhost,1433;Integrated Security=true;TrustServerCertificate=true'
bash scripts/verify backend
```

Use a disposable development SQL Server, never a production connection. Each SQL test creates a database named `CampusTourSchemaTest_<random-guid>`, applies v1.1 and test fixtures, and drops only that database in cleanup. The supplied Initial Catalog is ignored; existing databases are not modified. No connection string is written into generated source. SQL-backed tests explicitly report SKIPPED without this environment variable; a normal PASS with skips is not evidence v1.1 was tested.

Coverage: execute the complete snapshot; reject duplicate business keys; allow legitimate historical/multi-registration rows; race two independent connections for one session; require closing an expired session before replacement; enforce pending/accepted branch limits; validate new stop FKs; preserve last actual arrival across a route change; enforce robot-claim uniqueness; apply permissions twice; demonstrate INSERT/SELECT succeeds and UPDATE/DELETE fails as a non-owner test user. Audit tests append request/result rows and count email attempts separately from log rows.

## Apply/adopt later

The current local target is `SmartCampusTourV11` on `localhost,1433`; the local API User Secret `ConnectionStrings:DefaultConnection` points to it using Windows Integrated Security. Runtime configuration is per developer; the shared repository contains no connection string. To scaffold again, set `SMARTCAMPUS_DB_CONNECTION` to this target and run `bash backend/scripts/scaffold-db` from Git Bash. Never point that script at a database with data whose schema does not match the snapshot. After every re-scaffold, review the filtered unique index relationships: EF scaffold inferred `BranchRequest.TourId` as one-to-one from the one-accepted-per-Tour index, and `BrowserSession.InvitationId` as one-to-one from the one-open-session-per-invitation index. Both relations are one-to-many because other request/session rows are allowed; the backend mappings and inverse collections were corrected accordingly.

## Application invariants still to implement

- Every roster import/replacement, registration approval and Admin email correction locks the same parent Tour with UPDLOCK **before** checking normalized email duplicates, holding the lock until commit. Define the same effective-row predicate and normalization in all paths; lowercasing only during import is insufficient.
- Derive BranchPointRouteStopId from the selected variant and test rejection of mismatched Tour, registration, route and branch point. Close requests atomically on visit closure/NEEDS_ASSISTANCE; old requests stay terminal after recovery. FK existence and filtered UNIQUE do not implement this state machine.
- Use RowVersion in conditional writes; persist the winning intent before robot send. All active STAFF users can operate every Tour but still need state/readiness/time checks. Staff-only does not gain invitation support rights.
- Reissue/revoke closes old sessions atomically; expiry/IDLE_TIMEOUT must release the open-session slot before a replacement. IDLE_TIMEOUT is the finite disconnected-session lease, not lack of mouse/keyboard interaction while watching.
- Audio replacement creates a new retained asset; narration activation snapshots AudioUrl/NarrationText/NarrationSeconds into TourEvents.DataJson with the POI/visit context.
- Email audit: one CorrelationId per send attempt, append EMAIL_SEND_REQUESTED/PENDING then EMAIL_SEND_RESULT with observed ACCEPTED/FAILED/UNKNOWN. Retries of the send use new IDs; repeated delivery of an outcome must not inflate counts. Never UPDATE old audit rows, log recipient details/codes, or label UNKNOWN as failed/successful without evidence.
- HMAC-SHA256 access-code lookup requires a key outside SQL and consistent normalization/key handling. The SQL BINARY(32) type does not implement HMAC. Keep code generation, collision retry, protected resend storage and revocation tests in the future invitation use case.
- Retention: enumerate RosterRows.DisplayName/Email/ClassName, group contacts and identifying free text, invitation secrets and sessions, import/export copies and links. Revoke rights, preserve only non-identifying aggregate statistics, then delete/de-identify operational data according to configured retention and FK order. See ADR-0011/0012; no cleanup job or retention duration is introduced here.

Runtime users must not be dbo/sysadmin/db_owner, own schemas/tables, have DDL control or column-level grants overriding the intended restriction. The log role protects ordinary app access, not privileged DB administrators. Production identity provisioning and permissions must be checked under the real runtime account before use.
