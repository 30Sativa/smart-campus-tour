# Representative registration submission slice

This integrates `backend/` and `web/`. The live contract is recorded in
`docs/architecture.md` Section 3.2.1; requirements remain the business authority.
The schema is v1.1, unchanged by this feature.

## Implemented

The Representative workspace uses a compact three-destination header: overview,
Tour catalog and owned registrations. The overview keeps three equally sized
summary cards, a full-width upcoming-visit card, then two equal-width cards for
recent registrations and open Tours. Card spacing and empty-state heights match
across both columns; mobile layouts stack naturally. The registration list and detail share a
workspace; selection, filters, pagination and detail tab survive in the URL.
Phone layouts offer a registration chooser and labelled table values. Account
and contact information are read-only; contact values come from owned records.

- One registration per Representative/Tour. Opening a Tour checks existing
  ownership before offering a new registration; failed lookups block creation.
- Three steps: school/contact, invitation rows, then review and consent.
  XLSX/CSV requires LoaiDong, HoTen and Email; Lop is optional. CA_NHAN maps to
  INDIVIDUAL and DIEM_XEM_CHUNG maps to SHARED_VIEWING. Maximum 10 viewing
  points and 2 MB per file. Viewing points are not a student attendance count.
- Imports require explicit acceptance. Invalid files preserve the accepted
  roster. Existing row IDs survive matching normalized emails; replacements
  show additions/removals and their access impact before submission.
- A 48-hour cutoff gates new registrations and additional rows. Existing
  updates, removals, cancellation and resubmission follow server capabilities.
  Missing identity/version data prevents unsafe editing.
- Detail separates per-row PENDING/ACCEPTED/REJECTED/REMOVED decisions,
  invitation access, email-service results and email-change review. Aggregate
  APPROVED means some rows were approved; it never implies every row passed.
- Accepted-row email corrections use the existing owner-scoped request API,
  with the old address remaining current until Staff approves the request.
  The request contains no unsupported reason field.
- Owner-scoped invitation support uses the existing capabilities and API.
  Provider acceptance is not proof of delivery. Submission itself issues no
  shared group code or personal access code.
- Mutations preserve request IDs and version snapshots across uncertain
  retries. Conflicts require explicit reload; polling never silently replaces
  the version attached to a draft. Definitive validation responses allow a
  corrected email request without losing its error or consent.

All runtime data comes from the real API. There is no sample-data fallback,
mock account or simulated successful email delivery. Cache entries are scoped
to the signed-in owner and removed when the account changes. Timestamps display
in Vietnam time (UTC+7). Backend contracts and permissions remain authoritative.

See `web/docs/admin-registration-review.md` for Staff review and
`backend/docs/invitations-resend.md` for invitation/email configuration.

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
7. Reopen the same Tour and confirm it leads to the existing registration. Edit it,
   cancel it and re-register through its detail link. Each change persists.
8. Sign in as the second Representative. Lists must contain only their groups;
   opening the first account's registration must fail with 404.

9. Sign in as Staff and open `/staff/manage/registrations/pending`; inspect the SQL
   roster, reject with a reason, then confirm Representative can resubmit.
   Approve selected rows and confirm Representative sees their individual results.
   When invitation support is enabled, approval issues/queues private codes
   and emails; otherwise review continues without issuance.

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
