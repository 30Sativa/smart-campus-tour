# Technical Staff account integration

Source: Report 3 SRS v0.2 FR-01/02/05, BR-01; owner adoption in
`docs/decisions/0020-srs-v02-business-baseline-and-technical-staff.md`.

## Public mapping

| Meaning | Stored role | JSON role and JWT role claim |
|---|---|---|
| Technical Staff | TECHNICAL_STAFF | TechnicalStaff |

Existing values remain Admin, Staff and Representative (stored ADMIN, STAFF,
SCHOOL_REPRESENTATIVE). Match the canonical application values in clients;
"Technical Staff" is a display label, not a request value. Create uses a single
role string, never an array or comma-separated multi-role list. The API accepts
case-insensitive application names and returns canonical casing. Persisted
codes are resolved consistently by login, refresh and account listing.

Admin uses existing endpoints:
- POST /api/admin/accounts: username, fullName, role: "TechnicalStaff",
  initialPassword (12–128 chars, nonblank).
- GET /api/admin/accounts: safe summary role is TechnicalStaff; unsupported or
  mixed stored assignments still list as null.
- POST /api/admin/accounts/{id}/deactivate and /reactivate: existing lifecycle
  and audit/transaction behavior. Admin bootstrap remains separate.
No account-role reassignment endpoint is added by this slice.

Login/refresh return role TechnicalStaff and a single matching signed JWT role
claim. Locked, missing-role, unknown-role and multi-role accounts fail closed.
Deactivation revokes refresh tokens; existing access JWTs retain the documented
15-minute expiry limitation. Reactivation does not revive revoked refresh tokens.
There is no role inheritance; TechnicalStaff cannot call Admin/Staff/
Representative APIs or the Staff operations hub.

## Database and scope

UserRoles.Role VARCHAR(32) with no value CHECK already holds TECHNICAL_STAFF.
No DDL, EF migration, re-scaffold or shared DB update is required. Generated EF
entities are unchanged. Viewer remains invitation/session based; Operator is
assigned Staff and the safety attendant has no separate account/workspace.

Only the account foundation is delivered. Map/POI workspaces, Technical
confirmation, Staff assignment and migrated business authorization remain gaps
in `docs/requirements/srs-v02-backend-gap-register.md`.

## Frontend work required (not implemented here)

Add TechnicalStaff to the auth/account role type and account creation selector;
display "Technical Staff" on account list/lifecycle screens. Accept the role
from login/refresh without remapping it to Staff. Keep it outside Admin, Staff
and Representative route/action guards. Until the Technical feature slice ships,
show an honest unavailable/pending workspace destination rather than granting
access to existing business screens. Preserve Viewer/session and Operator
semantics; do not add account roles for either.

## Verification boundaries

ApplicationRoleTests and AccountValidatorTests cover valid/invalid mappings.
TechnicalStaffAccountTests exercises handlers with repository doubles plus real
password hashing/JWT validation, and HTTP role denial against the real API before
SQL. TechnicalStaffSqlTests is opt-in and uses disposable schema databases for
Admin creation/listing/lifecycle, login/refresh and invalid role assignments.
The full existing backend suite supplies regression coverage; report SQL
SKIPPED explicitly when its connection is absent.
