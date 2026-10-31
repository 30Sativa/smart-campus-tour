# AGENTS.md — `backend/`

Read the repo-root `AGENTS.md` first. The owner-authorized SRS v0.2 target and
scoped succession are in `docs/decisions/0020-srs-v02-business-baseline-and-technical-staff.md`;
use `docs/requirements/srs-v02-backend-gap-register.md` for source, current gaps,
dependencies and acceptance. Historical business targets below do not override it.
This file is the authoritative guide for
placing backend code. The SQL schema, generated EF model, and
`docs/decisions/0006-demo-first-tour-schema.md` define the current persisted
business model. `docs/decisions/0005-backend-authoritative-poi-per-leg-orchestration.md`
defines the fleet ownership boundary. `docs/architecture.md` distinguishes the
current persisted model from historical terminology and planned cross-system
flows; review those contracts before implementing them.
For the Review 1 product target, also read
`docs/requirements/campus-tour-scope.md` and
`docs/decisions/0009-review-1-tour-business-scope.md`. Those documents do not
describe features already present in this backend.

## 1. Current stack and physical structure

- C# / .NET 10, controller-based ASP.NET Core Web API, MediatR,
  FluentValidation, xUnit.
- SQL Server + EF Core **Database First**. No normal EF migrations.
- SignalR serves the development SimulationPreview Hub and the Staff-only
  `/hubs/operations` fleet projection. Robot telemetry uses authenticated HTTPS
  `POST /api/fleet/v1/sync` under ADR-0019. The ROS Fleet Bridge and all
  navigation/command-result runtime remain future work.
- Four separate projects; no root-level backend project or extra architecture
  layer.

```text
backend/
├── AGENTS.md
├── SmartCampus.slnx
├── database/smart-campus-tour-schema-v1.2.sql (empty DB), patches/ (additive upgrades)
├── scripts/
│   ├── verify
│   └── scaffold-db
├── src/
│   ├── SmartCampus.Domain/          Entities/, Exceptions/
│   ├── SmartCampus.Application/     Common/, Features/{Accounts,Auth,FleetSync,Invitations,Pois,
│   │                               Registrations,RegistrationReview,Representative,Routes,Simulation,StudentQuestions,StudentTour,Tours}/
│   ├── SmartCampus.Infrastructure/  Authentication/, Integrations/{FleetSync,Invitations}/,
│   │                               Persistence/{Repositories,Seeding}/
│   └── SmartCampus.Api/             Common/, Controllers/, Hubs/, FleetRobotProvisionCommand.cs, ExceptionHandling/,
│                                    Invitations/, Properties/, Program.cs, appsettings.json
└── tests/
    ├── SmartCampus.UnitTests/
    ├── SmartCampus.IntegrationTests/
    └── SignalRCompatibilityHarness/
```

Current API controllers cover Auth, Admin account management, Staff POI and Route
management, Staff Tour preparation/cancellation (legacy Admin URL aliases), Representative submission/pre-approval registration, Staff
registration review, Representative/Staff invitation support, anonymous Student cookie
entry/session/leave, development SimulationPreview, and authenticated Fleet
Sync v1 telemetry.
Student view and private text Q&A are implemented under architecture §7.1;
provider quality, voice and runtime/dispatch remain separate. The Representative
contract and Tour-first transaction are recorded in `docs/architecture.md`
Section 3.2.1; Admin review is recorded in Section 3.2.2; invitation issuance,
Resend delivery and minimal Student sessions in Section 3.2.3. Application has matching Auth,
Accounts, POI, Routes, Tours, Invitations, Representative and RegistrationReview features, shared Registrations
invariants, and the in-memory pose publisher used by SimulationPreview.
Infrastructure has specific Auth, account, POI, Route, Tour, Representative read and shared
registration mutation/review, invitation and Student-access repositories.
Invitation cryptography/configuration and the Resend HTTP adapter are in
Infrastructure; the hosted delivery worker is in Api and dispatches Application
claim/result commands before/after external HTTP. Fleet Sync has a dedicated
machine authentication scheme, Application validation/store boundaries, an
in-memory Infrastructure store, a Staff-only operations projection, and a
one-shot credential provisioner. No `/hubs/fleet`, navigation command, tour
runtime, SQL telemetry writer, or ROS Fleet Bridge is implemented. An absent
extension folder on GitHub is not missing setup.

The owner-authorized ADR-0021 slice adds versioned ROS map-package and manual
deployment-check APIs plus Tour Staff POI revisions and TechnicalStaff
verification. See `backend/docs/map-poi-versioning.md`. It does not retire the
legacy Admin POI API, implement project POI YAML templates (the robot pose-capture
import is ADR-0038), route certification,
scheduling/READY, frontend, or physical robot execution. Keep v1.1 snapshot
immutable; v1.2 changes are Database First and require its additive patch or
fresh snapshot followed by reviewed scaffolding. Never apply on shared/prod
without the normal backup and database approval process.

Compile-time dependencies: `Domain` has no project references; `Application`
references `Domain`; `Infrastructure` references `Application` and `Domain`;
`Api` references `Application` and `Infrastructure`. `Api` is the composition
root: `Program.cs` calls `AddApplication()` and
`AddInfrastructure(builder.Configuration)`. Runtime requests enter Application
use cases through MediatR; this is not a required linear
`Api -> Infrastructure -> Application` call chain.

## 2. Logical extension points and ownership

The tree below shows where code belongs **when a real implementation needs
it**. Entries marked `future` are not mandatory empty directories. Do not add
`.gitkeep`, `<Folder Include>`, or a class/interface just to complete the tree.

```text
backend/src/SmartCampus.Domain/
├── Entities/                         generated partial POCOs; handwritten behavior partials as needed
├── Enums/                            future: stable domain enums only
└── Exceptions/

backend/src/SmartCampus.Application/
├── Common/
│   ├── Abstractions/
│   │   ├── Authentication/          authentication use-case boundaries
│   │   ├── FleetSync/               robot identity and telemetry-store boundaries
│   │   ├── Invitations/             code/email boundaries and invitation settings
│   │   ├── Messaging/               ICommand<T>, IQuery<T>
│   │   └── Persistence/             commit boundary and feature repository interfaces
│   ├── Authentication/              shared role resolution
│   ├── Behaviors/                    validation and command commit pipeline
│   ├── Exceptions/
│   └── Models/                       PagedResult<T>
├── Features/                          current: Accounts, Auth, FleetSync, Invitations, Pois, Registrations,
│                                       RegistrationReview, Representative, Simulation
│   └── <Feature>/
│       ├── Commands/<UseCase>/
│       └── Queries/<UseCase>/
└── DependencyInjection.cs

backend/src/SmartCampus.Infrastructure/
├── Authentication/                   Fleet robot credentials, Jwt/, PasswordHashing/, Seeding/, UsernameNormalization/
├── Persistence/
│   ├── ApplicationDbContext.cs       generated EF mapping
│   ├── ApplicationDbContext.Abstractions.cs  handwritten partial
│   ├── Repositories/                 Auth, Accounts, POI, Representative, shared Registrations,
│   │                                RegistrationReview, Invitations and StudentAccess
│   └── Seeding/                      current demo POI seeding
├── Integrations/{FleetSync,Invitations}/ current in-memory telemetry store, credential provisioner, and invitation adapters
└── DependencyInjection.cs

backend/src/SmartCampus.Api/
├── Common/{Requests,Responses}/
├── Controllers/                      AuthController, AdminAccountsController,
│                                     AdminPoisController, RepresentativeController,
│                                     AdminRegistrationsController, InvitationsController,
│                                     StudentAccessController, SimulationController
├── Invitations/                      hosted email worker; scoped MediatR claim/result dispatch
├── ApiDocumentation/                 opt-in OpenAPI/Swagger UI and its Basic gate
├── ExceptionHandling/
├── Hubs/                             SimulationHub/Preview helpers; fleet/operations future
├── Properties/
└── Program.cs
```

- **Domain** owns entities, business behavior, domain exceptions, and only
  enums stable in the domain. It has no EF, ASP.NET, or external package
  dependency. A generated `Tour.cs` remains replaceable; put a real tour rule
  in a sibling `Tour.Behavior.cs` partial. Do not create behavior files for
  simple data entities by default. Do not convert SQL string status columns to
  enums without checking persistence and external compatibility.
- **Application** owns commands/queries, validators, handlers, use-case
  results/DTOs, and use-case-facing boundaries. Persistence abstractions go in
  `backend/src/SmartCampus.Application/Common/Abstractions/Persistence/`;
  external service abstractions belong in `Common/Abstractions/` when used.
  Application does not reference EF, ASP.NET, `DbSet<T>`, or `IQueryable<T>`.
- **Infrastructure** owns EF/SQL query construction, specific repository
  implementations in `Persistence/Repositories/`, authentication technology in
  `Authentication/`, and external adapters in `Integrations/<Capability>/`.
  Create each folder with its first implementation. Repositories do not call
  `SaveChangesAsync` under the normal command flow.
- **Api** owns HTTP binding, transport request/response models, controllers,
  status and exception mapping, SignalR Hubs, and DI composition. Controllers
  dispatch Application use cases; they neither contain business rules nor
  access `DbContext` or external clients directly. Do not return Domain or EF
  entities directly from controllers.

Organize Application **feature first**, with one canonical layout for every
feature. Keep one use case and its validator, handler, and feature-local result
together, for example:

```text
backend/src/SmartCampus.Application/Features/Tours/
├── Commands/StartTour/{StartTourCommand,StartTourCommandHandler,StartTourCommandValidator}.cs
└── Queries/GetTour/{GetTourQuery,GetTourQueryHandler}.cs
```

Auth follows this same layout: `Commands/Login/`, `Commands/Logout/`, and
`Queries/Refresh/`. Login persists a refresh-token hash and Logout can revoke a
stored token, so both are commands. Refresh only reads the stored token/user,
issues an access token, and returns the same refresh token and stored expiry; it
does not mutate persistence, so it remains a query. The Auth session result
stays feature-local under `Features/Auth/`.

The StartTour example describes a future use case; the Tours feature currently
contains Admin preparation CRUD and pre-Start cancellation. Do not create
global `Features/Commands/`, `Features/Queries/`, `DTOs/`, `Validators/`,
`Handlers/`, or `Services/` buckets. A MediatR handler is the default use-case
orchestrator. Add an Application service near its capability only for meaningful
reuse or an independent named algorithm, such as a future dispatch algorithm;
do not create one service per handler.

## 3. Current model and fleet boundary

The current SQL source and generated EF model are
`backend/database/smart-campus-tour-schema-v1.1.sql`; the local scaffold target
is the empty database `SmartCampusTourV11` on the local SQL Server instance
`localhost,1433`.
Decisions and operating notes are in
`docs/decisions/0012-v1-1-schema-and-operation-scope.md` and
`backend/database/README.md`. This did not migrate v1.0 data. Do not manually
edit generated entities to stand in for a SQL schema change.
Current implementation: fixed RouteStop dwell managed by Admin Route CRUD
(ADR-0017); no per-Tour dwell editor or operator assignment field. Target SRS v0.2
requires assigned Staff operation and exact map/POI/route revisions; CreatedByUserId
is attribution only. Admin CRUD ownership is current API behavior, not target.
Production branch use cases,
Tour readiness/state writers and retention cleanup remain implementation work;
pre-approval roster mutations already enforce the Tour write window and locks.

`backend/database/smart-campus-tour-schema-v1.1.sql` and the scaffolded entities
contain `User`, `UserRole`, `RefreshToken`, `Route`, `Poi`, `RouteStop`,
`RouteVariant`, `Robot`, `Tour`, `TourAllowedBranch`, `GroupRegistration`,
`RosterRow`, `Invitation`, `BrowserSession`, `BranchRequest`, `TourEvent`, and
`AuditLog`. A `Tour` stores scheduling/execution state and route-stop references;
invitation/session records represent student access; BranchRequests represent
proposed route changes. `RowVersion` is a SQL Server concurrency token on
`Robot`, `Tour`, `GroupRegistration`, `RosterRow`, `Invitation`,
`TourAllowedBranch`, `BranchRequest`, and `Poi`. Database uniqueness enforces
selected invariants. Application invitation/session commands enforce admission,
expiry, revocation and cross-row checks under Tour-first locks; production
branch/request orchestration remains separate implementation work.

`TourRoute`, `TourSlot`, `Booking`, and `TourInstance` are terms from an older
design, **not current tables or entities**. A navigation leg remains a
conceptual command/operation under ADR-0005; there is no `TourLeg` or `Mission`
table. `Tour.CurrentLegId` and `TourEvent.LegId` are identifiers, not foreign
keys to a leg table. Historical terminology in `docs/architecture.md` does
not define current entities. The current schema has no visitor capacity column or
individual visitor booking table, so older capacity/booking rules cannot be
treated as implemented invariants. Resolve any desired behavior against the
current schema and record public contract changes in `docs/architecture.md`.

The backend owns POI/navigation target data, robot assignment decisions, and
tour progression; the future robot bridge only translates approved telemetry
and commands to ROS. Fleet Sync v1 validates per-robot HTTPS reports and stores
the latest state in memory. Keep transient high-frequency telemetry out of
transactional SQL. Robot authentication reads the existing `Robot` row; its
credential provisioner is a one-shot operator command using a dedicated,
column-limited database role. Never put that provisioning connection string in
the runtime API configuration. `IFleetTelemetryStore` and
`IFleetRobotAuthenticator` belong to Application; Infrastructure implements
them. The Staff-only `/hubs/operations` projection and thin adapter using
`IHubContext` belong in Api; Application must not depend on SignalR and
Infrastructure must not reference Api to access a Hub. ADR-0019 and
`docs/architecture.md` Section 3 define the current HTTPS telemetry contract.
No robot command, ROS type, or Tour runtime belongs in this slice. A controller
must never call a ROS client directly.

Fleet Sync and the Operations Hub are not tour orchestration. Later Application
work must persist the execution intent/current leg before any external command
and reconcile the result.
The current commit-after-handler pipeline does not make an external GoTo and
SQL commit atomic; no distributed transaction or pipeline change is introduced
by this decision. Transient state ingestion must not commit every pose to SQL.

`docs/architecture.md` Section 3.2 records planned Remote Tour semantics:
atomic robot claim at Start, Hold only at a POI, Next after confirmed FRONT,
and End Early retaining `Robot.CurrentTourId` / `NeedsInspection` until safe
release. No automatic mid-tour reassignment or timer restoration after backend
restart. Do not copy mock-only state mutation into persistence as a concurrency
guarantee. A result acknowledgement follows required state/event commit;
replayed terminal reports must not advance a tour twice. These are implementation
requirements, not existing backend features. Specifically, `Next -> FRONT ->
next leg` is the current Remote Tour orchestration decision, not an independently
verified Capstone requirement; head/pan presets remain a V1 requirement.
Research implementation/benchmark execution are deferred and do not gate this
production flow; the Capstone methodology remains in force.

### SRS v0.2 target and current implementation gap

Use `docs/requirements/campus-tour-scope.md` and the gap register under ADR-0020.
Target business ownership: Admin account/configuration/admin audit; Technical
Staff map/revision/import/physical confirmation; Staff content, route, row review,
invitations, scheduling and assigned operation; Representative own rows; Viewer
invitation/session. TechnicalStaff account mapping is now implemented; no Technical
workspace or confirmation endpoint follows from role support.

Current Admin POI/Route/Tour/review/email APIs and whole-registration access
remain implementation gaps. Do not merely change attributes or open the
post-approval policy: stable-row writer, row approval, invitation/session/media
readers and Tour transactions must be reconciled together for BR-11. Target is
10 viewing rows, 48-hour registration closure, Staff review within 2 working days,
request/review email change, same-device reconnect 2min, and an instance-wide Q&A
queue (8 executing/20 total). Existing 1000-row validation and StudentQuestionGate
per-session limits do not satisfy these targets.

Operator assignment is explicit and cannot be derived from CreatedByUserId.
End Early revokes live/fallback/Q&A for all sessions and copied URLs, preserving
Result only; cancellation/ACK does not establish physical stop. Do not implement
pending F-14, branch cutoff, project YAML/frame mapping or M2 command transport.
HTTPS Fleet Sync ADR-0019 remains telemetry-only with no commands.

## 4. Request, persistence, and response flow

**Command:** HTTP request -> Api controller and transport mapping -> MediatR
`ICommand<T>` -> `ValidationBehavior` (if validators exist) -> Application
handler -> Domain behavior/Application service and Application repository or
gateway boundary as needed -> Infrastructure implementation -> handler returns
-> `UnitOfWorkBehavior` resolves `IApplicationDbContext` and calls
`SaveChangesAsync` once -> Application result -> Api `BaseResponse<T>` -> client.
`UnitOfWorkBehavior` runs after a successful handler; failed commands do not
commit through that pipeline. The handler and repository normally do not save
independently. External side effects and partial failures need explicit
use-case design when implemented.

Account create/deactivate/reactivate, login/logout and read-only refresh use
`IAccountTransactionRequest` with `AccountTransactionBehavior` outside UnitOfWork.
User roots are locked before current roles/tokens are read; login's initial
password check is revalidated under that lock before issuing credentials.
Account creation reserves the normalized-username index range. Refresh remains
a query without a save. Missing-cookie refresh skips the transaction so the
hosting-only health probe still does not query SQL. New-password policy,
single-instance login budgets and cookie CSRF/origin rules are in architecture §3.0.

Exception: Admin POI create, update, and availability commands are marked as POI
mutations. `PoiMutationTransactionBehavior` wraps their normal UnitOfWork save
in a POI-specific serializable SQL transaction so usage checks and POI/audit
writes commit together. `FindForManagementAsync` takes an update lock on the POI
row before checking its RowVersion; this makes simultaneous writes with the same
version serialize into one success and one stale-version conflict. Do not move
these commands to an independent save or remove the transaction without
replacing that invariant.

Admin Route mutations use `IRouteMutationCommand` and
`RouteMutationTransactionBehavior` around the ordinary UnitOfWork save.
Infrastructure executes it in a serializable transaction and translates SQL
deadlock/reference races into 409 conflicts. Lock the Route root with UPDLOCK
before reading its stops/references. Routes has no RowVersion: compare its
opaque aggregate revision after taking that lock. Any Tour, variant, history
or execution reference freezes configuration; READY/RUNNING use additionally
locks metadata and availability. Unreferenced stop replacement explicitly
deletes old rows inside that same transaction before inserting new stop IDs
to avoid unique-order collisions. No repository independently commits. See
`docs/decisions/0017-admin-route-management.md` and
`web/docs/route-management.md`; future Tour/variant/import writers must share
the route/POI locking and revalidation discipline.

The Representative create, replace, resubmit and cancel commands follow the same
shape as registration mutations: `RegistrationTransactionBehavior` wraps their
UnitOfWork save in a read-committed SQL transaction, and each handler takes an
update lock on the parent Tour before locking the registration, checking versions
and effective emails, so roster/registration/audit rows commit together
(`docs/architecture.md` Section 3.2.1). Admin approve/reject and invitation
support use the same transaction. Individual writers of an existing registration acquire
locks only through `IRegistrationRepository.LockRegistrationAsync`, which owns
the Tour-first order; create and Tour-only writers lock the Tour first. Do not
lock a registration or its rows by another path. Tour-wide cancellation is the
explicit bulk exception: it first owns that same Tour root through commit and
loads registrations/invitations without per-registration or historical roster reads.

Admin Tour create/update/cancel commands use `ITourMutationCommand` and their
feature-specific read-committed transaction wrapper. Existing Tour writes
reuse `IRegistrationRepository.LockTourAsync`; selected Route/POI locks use
the existing Route repository's `FindForTourSelectionAsync`. A transaction-owned
application lock on (Admin, requestId) and append-only audit receipts make
committed retries durable. Do not create a parallel Route repository/model.
Route changes before registration retain the old Route via configuration-only
TourEvents. Schedule/Route changes after any registration/allowed branch or
operational use are blocked until the notification/readiness workflow exists.
Cancel owns the shared Tour root and batch-loads registrations and invitations
needing revocation, without hydrating roster/closed-session history.
It preserves registration decisions, revokes invitations and closes sessions
in the same transaction; hard DELETE and runtime transitions are absent. Tour
detail reads share the Tour read-lock snapshot used by registration detail.
See `backend/docs/admin-tour-management.md` and ADR-0018 for the API and limits.

Student join/session/leave and email claim/result commands also use this
registration transaction and acquire the Tour lock. Session is a command:
heartbeats persist LastSeenAt/ExpiresAt. Closing idle sessions uses a scoped
ExecuteUpdate before insertion to satisfy the filtered unique index, within
the same transaction; it is not an independent commit. The worker commits an
email claim before calling the Infrastructure sender and records a sanitized
result through a new scoped command. Never put external email HTTP inside the
SQL transaction or automatically retry an uncertain send.

**Query:** HTTP request -> Api controller -> MediatR `IQuery<T>` ->
`ValidationBehavior` -> Application query handler -> Application read boundary
-> Infrastructure query implementation -> Application result or
`PagedResult<T>` -> Api response mapping -> client. Queries do not mutate
state or commit. The globally registered `UnitOfWorkBehavior` skips queries
without resolving `IApplicationDbContext`.

The current pipeline code is in
`backend/src/SmartCampus.Application/Common/Behaviors/`. The current
`IApplicationDbContext` exposes only `SaveChangesAsync`; its implementation is
the same scoped EF context registered by Infrastructure. It must not become an
EF query surface for Application.

`CollectionQueryParameters` in
`backend/src/SmartCampus.Api/Common/Requests/CollectionQueryParameters.cs`
currently defines `Search`, `Sort`, `Page` (default 1), `Size` (default 20),
and `Expand`; it does not define `Select`. For a collection endpoint, validate
`Page >= 1` and `1 <= Size <= 100`; the feature decides searchable fields,
sort whitelist, and expandable relations. Do not add a generic reflection
query engine. The flow is Api `CollectionQueryParameters` -> feature query ->
Application persistence abstraction -> Application `PagedResult<T>` -> Api
`PagedResponse<T>` with `PaginationMetadata`. `GET /api/admin/accounts` is the
first implemented collection example: it supports `search`, `sort`, `page`,
and `size`, validates page/size bounds and its sort whitelist, and rejects
non-empty `expand`. Account search covers username and full name. The Admin POI
list is another implemented collection endpoint. Do not add generic reflection
search/sort/expand or OData.

`GlobalExceptionHandler` in Api currently maps Domain and FluentValidation
exceptions to 400, `UnauthorizedException` to 401, `ForbiddenException` to
403, `NotFoundException` to 404, `ConflictException` to 409, and unexpected
exceptions to 500. HTTP errors
from that handler and automatic `[ApiController]` model-state validation use
the `BaseResponse` envelope. `AddProblemDetails()` remains registered as
framework support; it is not a second response format for those API error
paths.
Do not expose stack traces, SQL details, secrets, or visitor personal data in
responses or logs. Domain and Application code must not throw HTTP-specific
exceptions.

## 5. Database First and local configuration

The schema is the source of truth. The normal path is SQL schema ->
`backend/scripts/scaffold-db` -> temporary EF scaffold -> generated partial
POCOs in `backend/src/SmartCampus.Domain/Entities/` and generated
`backend/src/SmartCampus.Infrastructure/Persistence/ApplicationDbContext.cs`.
The handwritten `ApplicationDbContext.Abstractions.cs` implements the
Application commit interface and survives re-scaffolding. Business behavior
belongs in separate partial files. The script never runs migrations or changes
the database, does not use `--force`, and does not delete obsolete generated
entities. Review the diff and remove obsolete generated files manually only
after verifying the schema dropped them.

For a schema change: write an ADR under `docs/decisions/` first; update the
SQL source; apply the database change through the project's database process;
re-scaffold; review generated changes and tests. The current v1.1 SQL script
creates tables in an **empty** selected database and does not migrate old data.
Do not treat a re-scaffold as a database migration. EF may infer a filtered
unique index as a one-to-one relationship even when other rows allow many
records (currently BranchRequest→Tour and BrowserSession→Invitation); review
and correct navigation cardinality after each scaffold.

Runtime reads `ConnectionStrings:DefaultConnection`, for example from
`ConnectionStrings__DefaultConnection` or .NET User Secrets; never track a
real connection string. The tooling script reads only
`SMARTCAMPUS_DB_CONNECTION`, requires `dotnet-ef` 10.x, and can be run from the
repo root as:

```bash
export SMARTCAMPUS_DB_CONNECTION='<local SQL Server connection string>'
bash backend/scripts/scaffold-db
```

## 6. Authentication and realtime placement

The backend implements `POST /api/auth/login`, `/api/auth/refresh`, and
`/api/auth/logout` in `backend/src/SmartCampus.Api/Controllers/AuthController.cs`.
Application owns the use cases under `Features/Auth/Commands/` and
`Features/Auth/Queries/`, Infrastructure owns password hashing, username
normalization, JWT and SQL token persistence, and Api owns HTTP and cookie
handling. Login persists a refresh-token hash; Logout revokes a matching stored
token; Refresh reads without rotating or mutating it and returns the same token
and expiry. The current request/response, role, cookie, status, and JWT
configuration contract is in
[`docs/architecture.md` Section 3.0](../docs/architecture.md#30-user-account-authentication-api-implemented).
Keep that contract factual and update it when public behavior changes. The
schema has `RefreshTokens.TokenHash` as binary data and nullable `RevokedAt`,
not a revoked flag. The application permits exactly one supported role per
account in V1; the physical `UserRoles` primary key remains unchanged.

The backend also implements Admin account and POI management, plus
Representative Tour reads and owner-scoped registration submission/management.
User JWT and role authorization for those APIs are present. Authorization for
future READY/Staff runtime, dispatch, and fleet business APIs remains
unimplemented. Robot machine authentication is implemented for Fleet Sync v1
using `Robot.CredentialHash`, with a separate Staff JWT policy for the
Operations Hub. The API runtime may SELECT and INSERT Robots for Technical
Staff physical-identity registration, but has no UPDATE or DELETE permission;
credential provisioning uses its own SQL role and updates only `CredentialHash`.
Browser/user credentials cannot submit robot state. No command path or physical
readiness policy is implemented.

SignalR Hubs belong in `backend/src/SmartCampus.Api/Hubs/`. Application must
not depend on SignalR types; the Operations Hub projects Application fleet
state from Api. `/hubs/operations` requires a Staff-role JWT and closes the
connection when that token expires. Existing JWTs are not revoked immediately
when an account is deactivated. The sync endpoint accepts only the `FleetRobot`
machine scheme. The production
robot telemetry boundary and reserved M2 methods are recorded in
`docs/architecture.md`, ADR-0008, and ADR-0019. Before navigation commands are
enabled, require the robot-local safety and reconciliation evidence in
`docs/architecture.md` Section 6.

## 7. Tests, verification, and limits

- `backend/tests/SmartCampus.UnitTests/`: Domain behavior, validators,
  handlers/services with meaningful mocked boundaries, pipeline behaviors,
  and pure models.
- `backend/tests/SmartCampus.IntegrationTests/`: Infrastructure DI, EF
  mapping/persistence, API error/transport behavior, and endpoint integration
  when implemented. Test observable behavior, not private implementation;
  avoid fake tests added only for coverage.
- From the repo root, run `scripts/verify backend`. It restores, builds
  `backend/SmartCampus.slnx` with warnings as errors, and runs xUnit tests.
  SQL tests are opt-in through `SMARTCAMPUS_SCHEMA_TEST_CONNECTION` and create
  disposable databases; without it they report SKIPPED. Verification never
  invokes scaffolding or EF migrations. Do not report completion while it fails.

Do not introduce by default `IRepository<T>`, `GenericRepository<T>`, another
`IUnitOfWork` or `TransactionBehavior`, generic CRUD services/base controllers,
Result/Maybe/Specification frameworks, AutoMapper, generic reflection
search/sort/expand, domain-event or aggregate-root frameworks, Redis, a
message broker, microservices, event sourcing, or a new architecture layer.
Use async I/O, propagate cancellation, keep UTC timestamps, and address
concurrency/retries where a real state-changing use case requires them.

Do not change the database schema without an ADR. Do not weaken robot-control
authorization. Do not log or return visitor names, contact details, roster
rows, booking history, tokens, or other secrets. A change to an API, SignalR,
or fleet public contract must also update `docs/architecture.md` under the
repo-root rule.
