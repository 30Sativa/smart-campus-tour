# Admin registration review

Live routes: `/admin/registrations/pending` and `/admin/registrations`.
The API contract is `docs/architecture.md` Section 3.2.2; business authority is
`docs/requirements/campus-tour-scope.md` Section 5.2. Schema v1.1 is unchanged.

The queue reads registrations submitted by Representatives from SQL. Lists
filter/search/sort/page on the server; detail displays the active roster,
contact, state/reason and review time. One SHARED_VIEWING row is sufficient;
counts are invitation rows and never attendance or projector audience counts.

Admin confirms approval or supplies a rejection reason. Both versions are
from the detail snapshot the reviewer opened. No automatic focus/reconnect
refresh changes that snapshot. A conflict requires explicit successful reload;
failed reload leaves decisions blocked. Lists poll; Representative detail/list
poll and read the committed review status. Live caches include signed-in user
identity and do not share keys/types with simulation review caches.

Backend locks Tour then registration and commits decision/metadata/audit through
the existing registration transaction and UnitOfWork. Approval revalidates
persisted active rows and Tour-wide reserved emails. Rejection permits correction
of invalid data; resubmit retains ID, rechecks emails and clears review metadata.
Detail projections use a short read-only Tour lock in the same order so tokens
and roster agree under SQL read-committed. Only SCHEDULED/SUBMITTED may be reviewed.
Any invitation history blocks review,
including inactive or revoked rows; replacing an approved roster is still deferred.
APPROVED remains read-only for Representative.

Enabled approval atomically issues invitations and queues separate emails under
ADR-0015; see backend/docs/invitations-resend.md. The approved drawer shares live
invitation support with Representative detail. No fake email status, group code
or fixture Tour link appears. Single-row Admin email correction uses the live
API in docs/architecture.md Section 3.2.4; approval reversal and Tour lifecycle
remain separate. Existing Tour/dashboard review and invitation simulation consumers
remain intact with their own drawer and caches; they do not observe SQL data.

Source ownership:

- Backend Registrations (`backend/src/SmartCampus.Application/Features/Registrations/`) owns the invariants every
  registration writer shares: state values, the SCHEDULED write window and
  conflict codes (`RegistrationGate`), rowversion tokens, email normalization and
  Tour-wide reservation, input validation and audit. One public type per file.
- `IRegistrationRepository.LockRegistrationAsync` is the only way an existing
  registration is locked for writing; it owns the Tour-first order for
  Representative mutations, Admin approve/reject and invitation support.
- Backend Representative keeps its action policy and operation enum at the feature
  root (commands enforce it, the detail/Tour queries project it), shared mutation
  loading and draft replacement with its commands, and read models in query DTO folders.
- Backend RegistrationReview keeps `ReviewPolicy` at its root, separate Approve and
  Reject commands sharing
  `backend/src/SmartCampus.Application/Features/RegistrationReview/Commands/ReviewDecision.cs`
  (locks, versions, gate, review metadata), and list/detail read models in query DTO folders. Only approval revalidates
  stored rows/emails and issues invitations. No generic repository/workflow framework.
- Web live review owns API/types/hooks/presentation/errors/drawer under
  web/src/features/administration/registrations. The roster renderer, row type and
  SQL registration-state vocabulary have two real consumers and live under
  web/src/features/registrations. The sidebar "Chờ duyệt" badge reads the live
  SUBMITTED total; the simulated dashboard and bell keep their own counts.

Verification uses `bash scripts/verify backend web`. Set
SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server with CREATE
DATABASE permission to run SQL tests; absence is reported SKIPPED, not SQL proof.
Endpoint tests create/drop only their GUID-named databases and cover review,
role/ownership regression, versions, races, email validation/reservation,
invitation history and audit rollback. Browser HTTP tests cover confirmations,
rejection reasons, stale reload/focus behavior, server pagination, load errors and
no mock fallback. The preserved mock Tour workflow still has its own regression.

## Verification observed on 2026-10-09

Admin roster email correction adds the confirmed single-row action to live
detail. SUBMITTED/REJECTED stay in their original state, with rejection metadata
preserved; APPROVED retains approval and revokes only the corrected row's old
access. The dialog keeps the exact UUID/body on an uncertain response and
requires successful explicit reload after stale/state/auth failures. The shared
roster renderer accepts an optional row action; Representative/demo consumers
remain unchanged. No email-service call is made inside SQL transactions.

The correction's SQL endpoint regressions cover authorization, request binding,
row identity, normalization/reservations, versions and races, atomic rollback,
selected session/code revocation, durable retry after restart, missing/expired
invitation handling, old queued/in-flight delivery and manual resend of the new
code. Browser HTTP tests cover confirmation, committed reload, lost replies,
duplicates/validation, stale/auth blocking, rejected metadata and READY guidance.
Desktop and 390px editor layouts were inspected using an isolated HTTP fixture;
that visual fixture does not establish live provider delivery or production
HTTPS cookie behavior.

- `scripts/verify backend` PASS: 83 unit and 132 integration tests; no skips.
  SQL-backed tests used disposable local databases, including concurrent review,
  atomic rollback, invitation ownership and session admission.
- `scripts/verify web` PASS: maps:check, typecheck, lint, all 362 tests and production build.
  Tests cover the live sidebar total, hiding it after a failed refresh and correcting
  an inverted calendar range without sending the invalid list request.
- Browser render inspected on desktop and mobile using isolated HTTP fixtures:
  pending badge, inverted range notice, correction and APPROVED filter.
- Resend provider tests use fake HTTP; no live email was sent by these checks.

## Historical verification observed on 2026-10-08

- Backend dispatcher PASS: 67 unit tests and 100 integration tests. SQL tests
  actually ran on the disposable local SQL Server; none were skipped.
- Browser smoke against an isolated SQL database PASS: Representative submission,
  Admin rejection, visible reason, Representative resubmission with retained roster,
  Admin approval and Representative read-only approved state. Queue, mixed roster
  and confirmation layouts were visually inspected; the preview database was removed.
- Web typecheck, lint and production build PASS. Full suite: 297 passed, one
  existing map-package test failed. Admin/Representative and preserved mock
  workflow regressions passed.
- Full web dispatcher remains FAIL at maps:check: the committed package records
  freeThreshold=0.25, while the committed ROS YAML records free_thresh=0.196;
  package/source fingerprints differ. This task changes neither source nor map
  assets, and does not bypass that guard. Reconcile as a separate map revision.
- An existing Vite process locks the original native npm module, so npm ci also
  fails in that live checkout. Verification used a source copy with the same
  lockfile in the ignored artifact directory; the dev process was preserved.
