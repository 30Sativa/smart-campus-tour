# SRS v0.2 adoption and Technical Staff account verification — 2026-10-27

## Delivered

The owner-authorized source is Report 3 SRS v0.2 aligned to Phiếu v1.9,
read live with Phiếu and supporting SDD. Exact source links/revision and the
requirement→code/schema→change→dependency→acceptance register are in
`docs/requirements/srs-v02-backend-gap-register.md`.
ADR-0020 scopes succession; original ADR bodies/dates remain, and previous
requirements text is preserved in Git at `e70fb52`.

Production code changes are limited to ApplicationRoles, AccountRoles and the
account-create validator. TECHNICAL_STAFF maps to TechnicalStaff in account
responses, login/refresh results and one JWT role claim. Admin's existing
create/list/deactivate/reactivate flow accepts this role. Existing authorization
policies remain unchanged, so TechnicalStaff inherits no business role.
Viewer/Operator/attendant do not become new account roles.

UserRoles.Role VARCHAR(32) with no role-value CHECK already supports the code.
No schema, generated EF, migration, shared database or deployment checksum is
changed. Even SQL comment changes were omitted because snapshot deployment
compatibility hashes include those bytes.

## Verification performed

Final command: `bash scripts/verify backend`, in WSL Ubuntu 24.04 with the
repository-pinned .NET SDK 10.0.402 and native Linux Python/Bash. Exit **0**.
No verification script/check was weakened or bypassed.

| Check | Final result |
|---|---|
| Locked restore and warnings-as-errors build | PASS; 0 warnings, 0 errors |
| Unit suite | 174 passed, 0 failed, 0 skipped |
| Integration suite | 136 passed, 0 failed, 128 skipped |
| SQL integration subset | **125 SKIPPED**; SMARTCAMPUS_SCHEMA_TEST_CONNECTION absent; includes the 2 new TechnicalStaffSqlTests |
| Docker compose subset | **3 SKIPPED**; Docker daemon unavailable |
| Deployment/mock shell checks and result-audit gate | PASS |
| Diff whitespace check | PASS |

The new non-SQL checks exercise all four supported roles through login/refresh
handlers and real signed JWT validation, invalid/mixed/locked account rejection,
TechnicalStaff creation/listing/lifecycle handlers with repository doubles,
refresh revocation, and the real HTTP API's rejection of TechnicalStaff at
Admin, Representative, invitation-support and Staff operations boundaries.
These doubles do not verify SQL persistence, transaction locks or database
permissions. Opt-in SQL tests were added for Admin creation/listing/lifecycle,
login/refresh role claims and invalid assignments; their SKIPPED result is not
a database verification pass. No real delivery/provider/hardware test ran.

## Remaining work

Only the account foundation ships. Technical workspaces/confirmation, explicit
Staff assignment, target business authorization, revisions, reservation/READY,
row-level review and credential preservation, email request/review, 2-minute
reconnect, approved-bank runtime/global queue, media authorization and operation/
End Early remain in the six-wave register. Existing Admin business endpoints
continue to implement their old contracts until a coordinated migration.

F-14, conflicting branch cutoff, YAML/frame mapping and M2 command transport
remain pending; ADR-0019 HTTPS Fleet Sync stays telemetry-only. Source open
decisions and physical acceptance are not closed by backend unit/HTTP checks.
Frontend integration instructions are recorded separately in
`backend/docs/technical-staff-accounts.md`; no frontend file changed.
