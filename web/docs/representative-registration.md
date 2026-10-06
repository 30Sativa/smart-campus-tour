# Representative registration submission slice

This integrates `backend/` and `web/`. The live contract is recorded in
`docs/architecture.md` Section 3.2.1; requirements remain the business authority.
The schema is v1.1, unchanged by this feature.

## Implemented

- SCHEDULED Tour catalog/detail and owned registrations, with server pagination.
- Multiple groups per Representative/Tour; required group name.
- Create SUBMITTED, edit SUBMITTED, resubmit REJECTED/CANCELLED using the same ID,
  cancel SUBMITTED/REJECTED, all while SCHEDULED. Read owned records in any state.
- XLSX/CSV import of LoaiDong, HoTen, Email, optional Lop. CA_NHAN maps to
  INDIVIDUAL; DIEM_XEM_CHUNG maps to SHARED_VIEWING. Source row numbers survive.
  Shared-only groups and duplicate display names are supported. Duplicate emails
  are rejected. Invalid files leave the accepted roster untouched.
- Durable create retry, SQL ownership, Tour-first email reservation and optimistic
  concurrency. Background refresh never changes the version attached to a draft.
- Conflicts have stable API codes: stale versions require an explicit reload;
  `EMAIL_RESERVED` returns only the incoming `Roster[i].Email` fields, so the
  draft remains intact without exposing another group's data.

Effective email reservation is an application policy: active rows in SUBMITTED
and APPROVED reserve an email per Tour. REJECTED/CANCELLED release it; resubmit
rechecks. Future Admin approval/email corrections must use the same normalization
and parent lock. The 2 MB / 1000-row limits are technical import limits; preview also bounds
XML expansion (8 MB per part), source rows (10002) and columns (256). The API
limits JSON to 4 MB. Tour timestamps display in Vietnam time (UTC+7).

APPROVED or any registration with invitation history is read-only in this
slice. Approved changes need revocation, so they are deferred together with
invitation support. No personal access code/session is issued by submission.
Admin review, email, branch requests and runtime are separate slices.
Existing Admin/Staff/Student mocks do not see or review these SQL registrations.

The live area has no mock fallback, mock profile, group-code sharing or
name-matching entry instructions. The unused legacy group-code invitation panel was removed. Historical contracts and simulations under
`web/src/api/contracts/` and `web/src/mocks/` remain for their other consumers.
The previous Representative screen tests and two-column import expectations
were replaced with HTTP-contract and Review 1 import tests because the old
assumptions are no longer valid. Legacy simulation tests remain legacy evidence.

## Isolated manual end-to-end run

Provision an isolated `SmartCampusTourPoiDemo_<32-hex-guid>` database and apply
`backend/database/smart-campus-tour-schema-v1.1.sql`, following
`backend/database/README.md`. Do not apply the CREATE snapshot to an existing DB.
Point `ConnectionStrings__DefaultConnection` at that demo DB. Set Development
and a JWT signing key through environment/User Secrets.

1. Bootstrap `rep.demo.admin` using the existing `--seed-initial-admin` command.
   Supply InitialAdminSeed username, full name and password through environment
   or User Secrets; never put credentials on a command line or in this document.
2. Run `--seed-demo-pois` separately.
3. Apply `backend/database/fixtures/representative-registration-demo.sql` to the
   same DB. It requires that Admin and POI fixture, creates one prepared demo
   Route/Tour, refuses other DB names and never overwrites existing data.
4. Start the normal API against the demo DB with SimulationPreview disabled.
   Sign in as Admin and create two Representative accounts through the existing
   account UI/API. No user or roster is seeded on normal startup.
5. Set `VITE_API_BASE_URL` for the web dev process to that API origin. Use an
   origin permitted by backend CORS. Run `npm run dev` from `web/`.
6. Sign in as the first Representative, open the Tour, download the new template,
   replace its example rows, upload and explicitly confirm it, then submit.
   Reload detail/My Registrations; the same ID and roster must persist.
7. Register another group with different emails in that Tour. Edit the original,
   cancel it and re-register through its detail link. Each change persists.
8. Sign in as the second Representative. Lists must contain only their groups;
   opening the first account's registration must fail with 404.

Admin review has no live endpoint yet. SQL test fixtures cover REJECTED/APPROVED
and Tour locks; changing them manually is only suitable for a disposable test
database, not a substitute for Admin/runtime implementation.

## Automated checks

With a disposable SQL test instance configured:

```powershell
$env:SMARTCAMPUS_SCHEMA_TEST_CONNECTION = 'Server=localhost,1433;Integrated Security=true;TrustServerCertificate=true'
bash scripts/verify backend web
```

SQL endpoint tests cover transaction rollback, ownership/role, shared-only and
mixed groups, multiple groups, concurrent duplicate emails, concurrent retry,
restart replay, stale versions, cancel/resubmit and state gates. Frontend tests
use the real wire shape, never the legacy simulator. Import tests cover compressed
Excel/shared strings, normalized email uniqueness, source rows, limits and XML
expansion. Build and lint are included in verification.

If Visual Studio is running this checkout's API and locks output DLLs, run
verification with isolated outputs without stopping its debug session:

```powershell
$env:UseArtifactsOutput = 'true'
$env:ArtifactsPath = Join-Path (Get-Location) 'backend/bin/representative-check'
bash scripts/verify backend web
```

These are ignored build outputs; the normal verification checks are unchanged.
