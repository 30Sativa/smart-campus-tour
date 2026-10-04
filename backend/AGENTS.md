# AGENTS.md — `backend/`

Read the repo-root `AGENTS.md` first. This file is the authoritative guide for
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
- SignalR serves the development SimulationPreview Hub. Production fleet and
  operations Hubs are selected but not implemented; ADR-0008 requires a Python
  compatibility checkpoint before production fleet bridge implementation.
- Four separate projects; no root-level backend project or extra architecture
  layer.

```text
backend/
├── AGENTS.md
├── SmartCampus.slnx
├── database/smart-campus-tour-schema-v1.1.sql
├── scripts/
│   ├── verify
│   └── scaffold-db
├── src/
│   ├── SmartCampus.Domain/          Entities/, Exceptions/
│   ├── SmartCampus.Application/     Common/, DependencyInjection.cs
│   ├── SmartCampus.Infrastructure/  Persistence/, DependencyInjection.cs
│   └── SmartCampus.Api/             Common/, Controllers/, Hubs/, ExceptionHandling/,
│                                    Properties/, Program.cs, appsettings.json
└── tests/
    ├── SmartCampus.UnitTests/
    └── SmartCampus.IntegrationTests/
```

Current `backend/src/SmartCampus.Api/` has a development-only simulation
controller and Hub; Application has the in-memory pose publisher used by that
SimulationPreview path. The temporary robot pose endpoint and read-only fleet
pose Hub were removed. Production fleet/operations Hubs, tour/dispatch use
cases, and feature repository abstractions remain unimplemented. An absent
extension folder on GitHub is not missing setup.

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
│   │   ├── Messaging/               ICommand<T>, IQuery<T>
│   │   └── Persistence/             IApplicationDbContext; specific repository interfaces when needed
│   ├── Behaviors/                    validation and command commit pipeline
│   ├── Exceptions/
│   └── Models/                       PagedResult<T>
├── Features/                          Simulation exists; add other real use cases as needed
│   └── <Feature>/
│       ├── Commands/<UseCase>/
│       └── Queries/<UseCase>/
└── DependencyInjection.cs

backend/src/SmartCampus.Infrastructure/
├── Persistence/
│   ├── ApplicationDbContext.cs       generated EF mapping
│   ├── ApplicationDbContext.Abstractions.cs  handwritten partial
│   └── Repositories/                future: specific implementations
├── Authentication/                   JWT/password/token technology
├── Integrations/                     future: external adapters without Api/Hub references
└── DependencyInjection.cs

backend/src/SmartCampus.Api/
├── Common/{Requests,Responses}/
├── Controllers/                      simulation exists; production HTTP endpoints future
├── ExceptionHandling/
├── Hubs/                             Simulation exists; fleet/operations future
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

Organize Application **feature first**. Keep one use case and its validator,
handler, and feature-local result together, for example:

```text
backend/src/SmartCampus.Application/Features/Tours/
├── Commands/StartTour/{StartTourCommand,StartTourCommandHandler,StartTourCommandValidator}.cs
└── Queries/GetTour/{GetTourQuery,GetTourQueryHandler}.cs
```

The example describes future placement, not existing files. Do not create
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
V1 target: fixed seeded dwell, every active STAFF account can operate every Tour,
no per-Tour dwell editor or operator assignment. Invitation/branch use cases,
roster locking and retention cleanup remain implementation work.

`backend/database/smart-campus-tour-schema-v1.1.sql` and the scaffolded entities
contain `User`, `UserRole`, `RefreshToken`, `Route`, `Poi`, `RouteStop`,
`RouteVariant`, `Robot`, `Tour`, `TourAllowedBranch`, `GroupRegistration`,
`RosterRow`, `Invitation`, `BrowserSession`, `BranchRequest`, `TourEvent`, and
`AuditLog`. A `Tour` stores scheduling/execution state and route-stop references;
invitation/session records represent student access; BranchRequests represent
proposed route changes. `RowVersion` is a SQL Server concurrency token on
`Robot`, `Tour`, `GroupRegistration`, `RosterRow`, `Invitation`,
`TourAllowedBranch`, `BranchRequest`, and `Poi`. Database uniqueness enforces
selected invariants, while session/request workflows and cross-row consistency
still need application code.

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
tour progression; the robot bridge only translates external commands to ROS.
For production targets, use the backend-managed map/frame context and send
only the current navigation leg. Keep transient high-frequency robot telemetry
out of transactional SQL. A future fleet boundary such as `IFleetGateway` is
an Application abstraction. For the selected SignalR transport, the thin
adapter using `IHubContext` belongs in Api alongside the Hubs; do not make
Infrastructure reference Api to access a Hub. ADR-0008 and
`docs/architecture.md` Section 3 select SignalR JSON Hub Protocol over TLS,
separate `/hubs/fleet` and `/hubs/operations`, and the conceptual command/report
contract with machine-auth requirements. Python compatibility remains unproven
and gated; final DTO binding and implementations remain pending. ROS topics
and message types stay outside Domain and Application. A controller must never
call a fleet or ROS client directly.

The future FleetHub transport is not tour orchestration. Later Application
work must persist the execution intent/current leg before external send and
reconcile the outcome.
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

### Review 1 target and current implementation gap

The accepted group target in `docs/decisions/0009-review-1-tour-business-scope.md`
and its access update in `docs/decisions/0010-personal-access-code-entry.md`
require email containing an ordinary Tour page URL and a personal access code,
code validation before creating a session, a single “Điểm xem chung” invitation row
for a shared projector room, one active browser session per invitation,
revocation/reissue, Admin correction of one email while SCHEDULED, and
representative branch requests accepted by Staff at a verified POI. Staff Start
is allowed from the published time only. Admin POI-content editing and summary
statistics are P1; route geometry remains technically prepared/seeded. Command
audit records decision-to-send, sent, and robot-response stages separately.
These are target behaviors to implement and verify, not invariants in the
current database.

The URL alone grants no access. Resend keeps the same valid code and session;
revoke/reissue invalidates the old code/session and sends a new code to the
approved email, retaining invitation identity and expiry. Representative support
is own-group only; Admin supports all groups; Staff-only has no recovery right.
Shared-viewing data identifies its responsible person, not every student in the
room; individual data requires individual rows. Code storage for safe resend,
API binding, atomic admission and revocation remain implementation work.

The current v1.1 schema persists invitation/session records, shared-viewing
classification and branch requests; email attempts remain append-only audit
records, and their delivery/revocation workflows remain application logic. The
backend currently implements Auth V1, Admin account management, Admin POI
management, and its development Simulation controller/Hub. The Review 1 tour,
registration, invitation, dispatch, and production fleet endpoints above remain
planned. Do not infer that a group code/name match is equivalent to an approved
personal invitation. A future feature change must reconcile its public
contracts in `docs/architecture.md` and include the appropriate schema and
tests.

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

Exception: Admin POI create, update, and availability commands are marked as POI
mutations. `PoiMutationTransactionBehavior` wraps their normal UnitOfWork save
in a POI-specific serializable SQL transaction so usage checks and POI/audit
writes commit together. `FindForManagementAsync` takes an update lock on the POI
row before checking its RowVersion; this makes simultaneous writes with the same
version serialize into one success and one stale-version conflict. Do not move
these commands to an independent save or remove the transaction without
replacing that invariant.

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
`PagedResponse<T>` with `PaginationMetadata`. No collection endpoint or bounds
validator is implemented yet.

`GlobalExceptionHandler` in Api currently maps Domain and FluentValidation
exceptions to 400, `UnauthorizedException` to 401, `NotFoundException` to
404, `ConflictException` to 409, and unexpected exceptions to 500. HTTP errors
use a `BaseResponse` envelope.
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
Application owns the use cases, Infrastructure owns password hashing,
username normalization, JWT and SQL token persistence, and Api owns HTTP and
cookie handling. The current request/response, role, cookie, status, and JWT
configuration contract is in
[`docs/architecture.md` Section 3.0](../docs/architecture.md#30-user-account-authentication-api-implemented).
Keep that contract factual and update it when public behavior changes. The
schema has `RefreshTokens.TokenHash` as binary data and nullable `RevokedAt`,
not a revoked flag. The application permits exactly one supported role per
account in V1; the physical `UserRoles` primary key remains unchanged.

These endpoints do not provide account management, authorization policies for
future business routes, or robot/fleet machine authentication. Production fleet
and operations Hubs remain pending; before robot navigation commands are
enabled outside the local compatibility spike, require TLS, per-robot
credentials using `Robot.CredentialHash`, and a fleet-machine policy distinct
from user access. Browser/user credentials must not submit robot state. The
local spike may bootstrap with dummy identity, but passing the checkpoint
requires valid and invalid credentials, authenticated reconnect, and backend
restart tests.

SignalR Hubs belong in `backend/src/SmartCampus.Api/Hubs/` when a realtime
use case exists. Application must not depend on SignalR types; add an
Application notification boundary only when needed, then implement its
transport adapter in Api or Infrastructure according to the transport. The
fleet/operations boundaries and conceptual fleet methods are now recorded in
`docs/architecture.md` and ADR-0008; production implementation is still pending.
Before navigation commands are enabled outside the local compatibility spike,
require TLS, per-robot credentials using the existing `Robot.CredentialHash`
concept, and a fleet-machine policy distinct from operations user access.
Browser/user credentials must not submit robot state. The local spike may
bootstrap with dummy identity, but passing the checkpoint requires valid and
invalid credentials, authenticated reconnect, and backend restart tests.

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
  It does not connect to SQL Server, invoke the scaffold script, or run EF
  migration checks. Do not report completion while it fails.

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
