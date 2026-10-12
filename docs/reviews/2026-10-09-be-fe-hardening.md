# Focused Backend / Frontend hardening review, 2026-10-09

## 1. Overall verdict

READY FOR VERIFICATION: the confirmed application defects are fixed, backend
verification passed against disposable local SQL Server, and local browser UI
checks passed. Actual deployed cross-site cookie acceptance, provider sending
and the new GitHub Actions job remain unexecuted. Frontend full verification
also passed. This is a bounded code/contract review, not a
production security certification.

Baseline: branch `feature/claude/registration-review-hardening`, commit
`ae77147` (`Add YAML POI import for admin drafts`). Four pre-existing dirty files
from the POI navigation fix were retained byte-for-byte in the final diff:
`web/docs/poi-map-picker.md`,
`web/src/features/administration/pois/poi-form.test.tsx`,
`web/src/routes/admin/AdminPoiFormPage.tsx`,
`web/src/routes/admin/AdminPoisPage.tsx`.

## 2. Confirmed issues and evidence

P2 means a functional or misleading-access-state defect; P3 means misleading
copy/error classification. No backend authorization bypass was demonstrated.
Evidence references the reviewed source and the resulting fix, not a historical
reviewer's assumed repository state.

| Classification | Severity | Evidence | Finding and fix |
| --- | --- | --- | --- |
| Confirmed defect | P2 | `web/src/features/student/invitation/StudentInvitationPage.tsx:40` | The old UI hid cached access only on 401. Heartbeat 403/409 retained the room and appeared to be a network failure. Hide cached room access on 401/403/409; show the appropriate entry error. |
| Confirmed defect | P2 | `web/src/features/student/invitation/StudentInvitationPage.tsx:32` | A pending session response could overwrite successful join/leave cache writes. Cancel and revert pending queries before mutation and suspend heartbeat while join/leave is pending. Deferred-response regressions cover both races. |
| Confirmed defect | P2 | `web/src/routes/student/StudentTourPage.tsx:17` | The unkeyed entry component reused `left`/code state across GUID Tour changes, so leaving A prevented B's session restore. Remount for each canonical Tour ID. |
| Confirmed defect | P2 | `web/src/routes/student/StudentTourPage.tsx:17`; `backend/src/SmartCampus.Api/Controllers/StudentAccessController.cs:31` | GUID routes accepted uppercase while the backend cookie Path uses canonical lowercase GUID formatting. Normalize GUID case before building requests; keep the existing narrow cookie path. |
| Confirmed defect | P3 | `web/src/features/student/invitation/StudentInvitationPage.tsx:16` | 400/403 were called network errors. Give distinct invalid-code/forbidden-origin messages, without exposing server bodies or changing account auth. |
| Confirmed defect | P3 | `web/src/features/student/invitation/StudentInvitationPage.tsx:67`; `backend/src/SmartCampus.Infrastructure/Integrations/Invitations/InvitationConfiguration.cs:25` | The UI promised 10 minutes although configured idle retention supports 1–60 minutes and is bounded by invitation expiry. Use a non-promissory stale warning and explicit recovery action. |
| Confirmed defect | P2 | `web/src/routes/representative/RepDashboardPage.tsx:30` | “Còn chỗ” claimed capacity absent from the API/schema. Replace with “Các buổi đang nhận đăng ký đoàn”; retain server pagination totals. |
| Documentation drift | — | `backend/AGENTS.md`, `web/AGENTS.md` | Physical trees omitted implemented invitation/registration boundaries and the FE verify description omitted maps:check. Synchronize current implementation and ownership without moving source. |
| Missing coverage | — | `web/src/features/student/invitation/StudentInvitationPage.test.tsx`; `backend/tests/SmartCampus.IntegrationTests/InvitationEndpointTests.cs:54` | Add 16 focused Student cases and one SQL-backed cookie/CORS/logout/rejoin regression. Preserve the existing tests. |
| Missing CI | — | `.github/workflows/web-verify.yml` | Previously no FE workflow. Add the existing verification entry point with Node 24.15.0, read-only permissions and relevant map inputs. |

## 3. Reviewer assumptions that are non-issues

- Invitations, Registrations, RegistrationReview and Representative already
  exist; the tree documentation lagged behind source. No missing folders or
  speculative extension classes were created.
- `RosterPreview`, roster/state vocabulary and `InvitationPanel` already have
  real Administration and Representative consumers under
  `web/src/features/registrations/`. No reverse feature dependency was found.
  No file relocation is warranted for these consumers.
- Domain/Application/Infrastructure/Api project references retain their stated
  direction. Application has no EF/ASP.NET query surface. HTTP controllers
  dispatch MediatR use cases; EF/SQL remains in Infrastructure.
- Registration and POI transaction behaviors protect actual invariants.
  Student session access is a command because it updates heartbeat/expiry.
  Idle closure executes inside the registration transaction before inserting
  the replacement session. These are not reasons to add a generic UnitOfWork
  or transaction framework.
- Email claims commit before external HTTP, and results use a fresh command
  scope. UNKNOWN remains distinct from FAILED/ACCEPTED. Existing retry request
  IDs, email cooldowns, code protection and owner-scoped support remain intact.
- Existing Student mock workflow tests are useful for non-GUID demo rooms, but
  are not equivalent to real invitation entry coverage. They were kept.

## 4. Files changed by this review

| File | Reason |
| --- | --- |
| `backend/AGENTS.md` | Current feature trees, controllers, repositories, email ownership and implemented lock boundaries. |
| `backend/docs/invitations-resend.md` | Exact browser/deployment checks and separation of HTTP assertions from browser acceptance. |
| `backend/tests/SmartCampus.IntegrationTests/InvitationEndpointTests.cs` | Real SQL cookie headers, trusted/untrusted Origin, successful leave/rejoin and once-per-invitation entry audit. |
| `web/AGENTS.md` | Shared registrations ownership, Student auth isolation and official verify/CI steps. |
| `web/src/features/student/invitation/StudentInvitationPage.tsx` | Cancellation, denied-session display, correct errors and configurable-timeout wording/recovery. |
| `web/src/routes/student/StudentTourPage.tsx` | Canonical GUID and isolated local state per Tour. |
| `web/src/features/student/invitation/StudentInvitationPage.test.tsx` | Cookie-request contract, status errors, network recovery, mutation races, Tour changes and GUID casing. |
| `web/src/routes/representative/RepDashboardPage.tsx` | Remove unsupported capacity claim. |
| `web/src/features/representative/representative-flow.test.tsx` | Assert truthful wording alongside server totals. |
| `.github/workflows/web-verify.yml` | Minimal official FE gate; no credentials/SQL/robot runtime. |
| `docs/reviews/2026-10-09-be-fe-hardening.md` | Review evidence, classifications, verification and unresolved deployment checks. |

The four prior POI changes are not new review modifications. No package,
framework, schema, migration, re-scaffold or public response/route change was
introduced.

## 5. Architecture and BE/FE contracts

The existing organization conforms to the scoped AGENTS/ADR boundaries.
Registration requirements in scope/ADR-0010 remain the business baseline;
ADR-0015 and architecture sections 3.2.1–3.2.3 identify the implemented slice.
Unimplemented Tour readiness, dispatch, full media/AI, retention and approved
roster/email correction are not silently treated as completed.

| Boundary | Reviewed contract and behavior |
| --- | --- |
| Representative submission | Owner from JWT sub; UUID Idempotency-Key retained for uncertain create; RegistrationInput contains expectedTourRowVersion and roster types. Committed replay returns the original ID under the Tour lock. |
| Representative replace/resubmit/cancel | Replace body is `{input, expectedRowVersion}`; input carries the original Tour version. Cancel carries both versions. APPROVED/invitation history is not writable through this slice. |
| Admin review | Admin-only; both opaque versions and optional rejection reason; committed null-data response followed by refetch; conflict requires explicit reload rather than substituting a newer snapshot. |
| Invitation support | Admin or owner; another owner gets 404, Staff gets 403. Request UUID and expected invitation version for resend/reissue/revoke; issue uses registration and Tour versions. Retry does not rotate or queue twice for the same committed operation. |
| Student entry | Anonymous POST join/session/leave; credentials included, account JWT/refresh excluded. Minimal Tour info returned, never cookie token, access-code material or roster identity. SQL state strings stay uppercase on the wire and use readable UI labels. |
| Email | Private one-recipient sending after committed claim; idempotency key per attempt; PENDING/ACCEPTED/FAILED/UNKNOWN stay distinct, with no inbox-read or attendance claim. |

Existing effective-email reservation, RowVersion conflicts, transaction rollback,
owner isolation and invitation races passed against SQL. No mismatch requiring
a public contract change was found in these reviewed boundaries.

## 6. Student cookie/auth findings

Retained: HttpOnly, Secure, SameSite=None, host-only per-Tour cookie, exact Origin
check and credentialed CORS; HMAC storage; expiry/revocation checks; one active
BrowserSession via Tour lock and filtered SQL uniqueness. No security setting
was weakened and no secret was moved into localStorage/sessionStorage.

The new SQL test verifies header behavior, not browser storage. Local UI preview
uses explicitly labelled fake responses, not a production cookie or real
recipient. SameSite=None does not override third-party-cookie restrictions;
credentialed CORS does not prove cookie acceptance. See
[MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
and [MDN third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies).

Leave errors remain uncertain rather than inventing a successful logout; the
existing backend clears the cookie even after a failed leave transaction, and
the next session check reconciles local state. Polling is not a substitute for
production streaming authorization. Inactive tabs, idle expiry, proxy identity
and unrelated FE/API sites still need deployment checks.

## 7. Frontend CI

New workflow: PRs for web/map/contract inputs and main/develop pushes; checkout,
setup-node with npm cache, then `bash web/scripts/verify`. maps:check reads
checked-in ROS map sources without running ROS. No production token, SQL or
Fleet Emulator is needed. YAML/permissions/triggers/runtime/script checks passed.
The hosted GitHub Actions run is NOT RUN because no commit/push/PR was requested.

## 8. Verification results

| Check | Result |
| --- | --- |
| `git diff --check` | PASS. |
| `backend/scripts/verify` | PASS: build with warnings as errors, 70 unit + 121 integration tests; 0 failures, 0 skipped. |
| SQL Server | Real local `.\SQLEXPRESS` with Windows integrated auth, disposable databases only. Zero remaining test databases after cleanup. |
| Initial BE verify attempt | FAIL due to API process 15052 locking default build DLLs. Resolved using SDK UseArtifactsOutput/ArtifactsPath for the same official script; the user's running API was not stopped. |
| `web/scripts/verify` | PASS: npm ci, maps:check, typecheck, lint, 50 test files / 352 tests, production build. Existing Node engine and large-chunk warnings remain. |
| New Student regression suite | PASS, 16 cases. |
| Local browser preview | PASS: stale-warning recovery, denied-origin entry state, Representative wording. Fake local responses only. |
| Workflow static check | PASS; real GitHub execution NOT RUN. |
| Cross-domain HTTPS browser matrix | NOT RUN; requires deployment URLs/profiles. |
| Actual Resend/inbox delivery | NOT RUN; fake provider handlers only, no mail sent. |
| Additional `npm audit --json` | FAIL: 2 existing high advisories in brace-expansion/source-map-js build/lint dependencies. Packages/lockfile unchanged in this focused review. |

For the successful BE script run, temporary process environment supplied
`SMARTCAMPUS_SCHEMA_TEST_CONNECTION` for the local disposable SQL instance,
`UseArtifactsOutput=true` and a task-specific Temp `ArtifactsPath`. No product
connection string or User Secrets were read or changed. With the SQL test
environment omitted, SchemaV11Fact tests explicitly SKIP; the existing backend
CI does not provision SQL. A script PASS without that environment is not SQL
verification.

## 9. Remaining risks and manual verification

- Execute the actual HTTPS FE/API browser matrix in
  `backend/docs/invitations-resend.md`: cookie acceptance, reload/multiple tabs,
  another browser's 409, logout/rejoin, revoke/reissue, idle/absolute expiry,
  network recovery and origin denial. Include private profiles and blocked
  third-party cookies. Prefer a supported same-site/proxied deployment while
  retaining the security settings; do not weaken CORS/TLS to work around it.
- Verify trusted TLS/client-IP forwarding: the current join limiter partitions
  on RemoteIpAddress. An unconfigured proxy can aggregate all viewers under one
  60/minute bucket. No arbitrary forwarded-header trust was added.
- Run the new workflow on GitHub after a human commits/pushes this change.
- Real email sending, deliverability and retention policy remain separate gates.
- Local Node 24.14.1 is below jsdom's declared 24.15 minimum; tests passed here,
  while CI uses the supported 24.15.0 version.
- Existing dependency advisories are tooling risks, not evidence of a Student
  authorization bypass: brace-expansion 5.0.9 via ESLint/minimatch, source-map-js
  1.2.1 via CSS/build tooling. No untrusted-input exploit in these application
  endpoints was demonstrated. Track targeted package remediation separately;
  see [brace-expansion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7)
  and [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## 10. Scope and repository safety

No changes to `robot/`, root `digital-twin/`, firmware or `ai-assistant/`.
No schema/EF-generated file changes. No commit, push, deploy or email send.
No tests removed/weakened. Existing local POI diffs preserved. Temporary browser
fixtures and the development server were removed/stopped; the existing backend
API process remains running. Build outputs remain outside tracked source.
