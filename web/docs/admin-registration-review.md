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
including inactive or revoked rows, until access revocation is implemented.
APPROVED remains read-only for Representative.

Approval does not issue an invitation/code/session or send email. No fake mail
status, group code or demo Tour link appears in the live drawer. Admin email
correction, approval reversal, Tour lifecycle and access issuance remain outside
this task. Existing Tour/dashboard review and invitation simulation consumers
remain intact with their own drawer and caches; they do not observe SQL data.

Source ownership:

- Backend Representative: use-case commands/validators; shared draft writer and
  replacement body near its shared draft commands; list query validation and
  Tour projection under their query capability; registration detail mapping
  inside its query. There is no feature-root catch-all rules/mapper module.
- The backend Registrations capability owns inputs/validation and shared consistency, email
  reservation and audit. IRegistrationRepository/EfRegistrationRepository owns
  mutation locks/reservations; IRepresentativeRepository owns Representative reads.
- The backend RegistrationReview capability owns list/detail/review use cases and its read
  boundary. No generic repository/workflow framework or new dependency was added.
- Web live review owns API/types/hooks/presentation/errors/drawer under
  web/src/features/administration/registrations. The roster renderer and row type
  have two real consumers and live under web/src/features/registrations.

Verification uses `bash scripts/verify backend web`. Set
SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server with CREATE
DATABASE permission to run SQL tests; absence is reported SKIPPED, not SQL proof.
Endpoint tests create/drop only their GUID-named databases and cover review,
role/ownership regression, versions, races, email validation/reservation,
invitation history and audit rollback. Browser HTTP tests cover confirmations,
rejection reasons, stale reload/focus behavior, server pagination, load errors and
no mock fallback. The preserved mock Tour workflow still has its own regression.

## Verification observed on 2026-10-08

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
