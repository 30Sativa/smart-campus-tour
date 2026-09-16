# AGENTS.md — `backend/`

Booking, tour scheduling and multi-robot dispatch API for CampusTour DT-AMR
(Work Package 2). Read the repo-root `AGENTS.md` first for the shared rules;
this file only covers what is specific to `backend/`.

---

## 1. Stack

- Language / runtime: **C# / .NET 10 (LTS)**.
- Framework: **ASP.NET Core Web API** (controller-based, not Minimal API).
- Browser realtime transport: **SignalR**, matching `web/AGENTS.md`; it is not
  implemented in the current backend scaffold. `backend/src/SmartCampus.Api/Hubs/`
  is the intended API location when it lands.
- Planned database: **SQL Server**.
- Planned ORM: **Entity Framework Core**, code-first. EF Core is not installed
  in the current scaffold; `ApplicationDbContext` and migrations are not yet
  implemented. When persistence lands, migrations belong in
  `backend/src/SmartCampus.Infrastructure/Persistence/Migrations/`.
- Architecture style: **Clean Architecture**, not DDD — no aggregates, domain
  events, or value-object-heavy modelling unless a task explicitly asks for
  it. Entities are plain; behaviour belongs in the Domain/Application
  boundaries described below.
- Local run: <!-- TODO(WP2): connection string source (User Secrets / appsettings.Development.json / env var), and the exact `dotnet run` / docker compose command once scaffolded. -->

---

## 2. Layout

**4 separate `.csproj` per layer** in one solution, not folders inside one
project. Dependencies point inward only (API -> Infrastructure/Application ->
Domain; nothing points back out to API).

```
backend/
├── SmartCampus.slnx
├── src/
│   ├── SmartCampus.Domain/          Exceptions/. Entities/ and Enums/ arrive
│   │                                 with the first domain feature.
│   │                                 No project reference at all.
│   ├── SmartCampus.Application/     Common/{Abstractions,Behaviors,
│   │                                 Exceptions,Models}/; Features/
│   │                                 {Commands,Queries}/ (exist, empty);
│   │                                 DependencyInjection.cs.
│   │                                 -> Domain. MediatR + FluentValidation.
│   ├── SmartCampus.Infrastructure/  Persistence/ (DbContext scaffold;
│   │                                 Repositories/ exists, empty; Migrations/
│   │                                 arrives with EF Core), Authentication/
│   │                                 and Integrations/ (exist, empty),
│   │                                 DependencyInjection.cs. -> Application.
│   └── SmartCampus.Api/             Controllers/, Common/{Requests,Responses}/,
│                                     Properties/, Program.cs, appsettings.
│                                     ExceptionHandling/ and Hubs/ exist but are
│                                     empty. -> Application + Infrastructure.
├── tests/
│   └── SmartCampus.UnitTests/       unit tests, xUnit
├── SmartCampus.IntegrationTests/    integration-test project, xUnit
└── scripts/verify
```

Wiring: `Program.cs` gọi `builder.Services.AddApplication()` và
`AddInfrastructure(builder.Configuration)` — mỗi layer tự đăng ký DI của mình
trong `DependencyInjection.cs` của layer đó, `Api` không new trực tiếp class
của `Infrastructure`.

---

## 3. Architecture Rules

Clean Architecture, dependencies point inward only:

```
SmartCampus.Api
    v
SmartCampus.Infrastructure  --\
    v                         > both depend on
SmartCampus.Application     --/
    v
SmartCampus.Domain
```

- `Domain` has zero project references. No EF Core, no ASP.NET, no external
  package beyond the BCL. Plain entities, enums, and domain exceptions only.
- `Application` defines persistence and external-boundary abstractions
  (`IFooRepository`, `IClock`, ...), commands/queries, and their handlers. It
  must not reference EF Core, ASP.NET Core, or any HTTP-specific type — only
  `Domain` and abstractions.
- `Infrastructure` implements the `Application` abstractions: the planned EF
  Core `DbContext`, entity configurations, repository classes, and external
  service clients (email, storage, ROS bridge client, ...). Query construction
  lives here only, never in `Application`.
- `Api` is composition + transport: controllers, DTOs, DI registration
  (`Program.cs`), model validation, HTTP status mapping. Controllers must not
  contain business logic or touch `DbContext`/EF Core types directly. They
  dispatch an Application command/query through MediatR; a named Application
  capability service is valid where that is the established boundary.
- A new feature adds one command/query and its handler for one use case. If it
  needs persistence, use an Application repository abstraction and an
  Infrastructure implementation. Extract an Application service only when it
  has an independent responsibility, meaningful reuse, or a clearly named
  capability. Do not reach from `Api` straight into `Infrastructure`.

Scheduling / dispatch specifically:

- The backend owns `TourRoute`, `TourSlot`, `Booking`, `TourInstance`,
  `TourLeg`, POI/navigation-target data, robot assignment, and the per-leg tour
  state machine. These business concepts and their use cases belong in
  `Domain`/`Application` according to the dependency rules above.
- A `TourSlot` is a timed group with visitor capacity. Confirmed visitors share
  one `TourInstance`; booking a place does not reserve a robot days in advance.
  Robot assignment happens near the tour start.
- The robot-assignment algorithm (which available robot takes which ready tour,
  when) lives in an **`Application` service** — e.g. `DispatchService`. It
  fetches robots and tour state through repository interfaces and returns the
  decision. Do not put it in a controller, a repository, or a fleet client.
- The backend sends only the current `TourLeg`, waits for robot arrival, owns
  the `AT_POI` narration/interaction pause, and then decides when to send the
  next leg. Never send a whole stop list for the robot to orchestrate.
- If no robot is available at the tour time, put the `TourInstance` into an
  operational waiting/delayed state such as `WAITING_FOR_ROBOT` or `DELAYED`
  for operator intervention. Do not fail an already confirmed booking merely
  because a robot is temporarily unavailable.
- The fleet bridge client (the thing that actually talks to the robot over
  the still-TBD external transport) is **`Infrastructure`**, behind an
  `Application` interface such as `IFleetGateway`. `Application` code calls
  the interface, never a transport client directly.
- **A controller must never call the bridge directly.** The path is always
  `Api -> Application use case -> IFleetGateway -> Infrastructure`, with a
  named dispatch capability service where that algorithm warrants one, even
  for a one-line "send this command" endpoint.

Core invariants (implementation is deferred until the relevant feature task):

- confirmed visitor count never exceeds `TourSlot` capacity;
- one robot has at most one active assignment;
- one active `TourInstance` has at most one assigned robot;
- transient robot telemetry state and tour business state remain separate;
- retries/duplicate commands do not create duplicate business-level leg
  execution;
- stale/out-of-order robot state cannot overwrite newer state; `seq` supports
  ordering.

### Coding and maintainability

The layer ownership and dependency direction above are authoritative. These
rules add practical guidance without introducing another architecture layer.

- Keep controllers thin: bind/validate transport input, dispatch the
  Application use case, and map the result. Do not duplicate a business
  invariant in the controller, handler/service, and persistence mapping.
- HTTP and SignalR DTOs remain transport types; do not make them Domain
  entities. Keep Application persistence and external-boundary abstractions
  in Application, with their implementations in Infrastructure.
- One `ICommand<TResponse>` or `IQuery<TResponse>` represents one use case.
  Its MediatR handler is the default orchestration entry point. Queries do not
  mutate business state.
- Extract an Application service only for a real independent responsibility,
  meaningful reuse across handlers, or a clearly named business capability.
  Do not create one service per handler merely for layering. A named dispatch
  capability such as `DispatchService` is appropriate when its algorithm
  genuinely deserves one.
- The decided persistence pattern is Application-owned repository abstractions
  implemented by Infrastructure. Concrete repositories are added per real use
  case; none should be assumed to exist before implementation. Do not add a
  second generic/base repository layer or repositories for data that has no
  persistence boundary.
- The existing `UnitOfWorkBehavior<,>` is the command persistence boundary.
  Do not introduce a second Unit of Work abstraction or competing
  `SaveChanges` policy without a concrete requirement.
- `IApplicationDbContext` is the commit abstraction used by that pipeline. It
  must not become an EF leakage point: do not expose `DbSet<T>`, `IQueryable<T>`
  or other EF Core-specific types from it into Application.
- FluentValidation handles input/use-case checks that can run before the
  operation. Rules requiring current persisted state belong in the use-case
  flow; critical invariants also need persistence protection when races allow
  application-side checks to be bypassed.
- Use `async`/`await` for I/O. Do not use `.Result` or `.Wait()`; propagate
  `CancellationToken`; do not use unowned fire-and-forget for business-critical
  work; cancellation/failure must not knowingly leave inconsistent state.
- Use PascalCase for types/public members, camelCase for locals/parameters,
  `Async` suffixes where appropriate, and keep nullable enabled. Do not
  suppress warnings without understanding them; verification treats compiler
  warnings as errors.
- Avoid `dynamic` unless a real external/interoperability boundary requires it.
- Avoid broad `catch (Exception)` except at an intentional boundary that
  logs/maps unexpected failures without swallowing them.
- Persistence is not implemented yet: the projects currently have no EF Core
  package, `ApplicationDbContext` is only a scaffold, and there are no
  migrations. Once EF Core lands, keep EF types in Infrastructure, use
  no-tracking for appropriate read-only queries, avoid N+1 queries, and
  preserve transaction/invariant semantics. Schema changes still require the
  ADR rule in Section 9.
- Do not swallow exceptions or expose stack traces, SQL errors, internal
  messages, or secrets at the API boundary. Use structured operational logs
  with useful context, no secrets/tokens, and no noisy high-frequency telemetry;
  Section 9 owns the visitor-PII prohibition.
- Keep API contracts explicit. Controllers do not return EF or Domain entities
  directly; preserve `BaseResponse<T>`/`PagedResponse<T>` conventions where
  applicable. Collection parameters are `Search`, `Sort`, `Page`, `Size`, and
  `Expand` as defined by
  `backend/src/SmartCampus.Api/Common/Requests/CollectionQueryParameters.cs` —
  `Select` is not currently implemented. Contract changes visible outside this
  backend follow Section 6: update `docs/architecture.md` in the same PR.
- Use UTC for persisted/server timestamps and configuration for environment-
  specific values. For state-changing operations, account for retries,
  concurrency, stale state, and partial failure; do not add distributed
  locking or a generic idempotency framework without a real requirement.
- Clean Architecture and SOLID keep responsibilities and boundaries clear;
  they do not maximize the number of layers, interfaces, or classes. Do not
  introduce by default an interface for every class, a generic/base
  repository, generic CRUD service, generic base controller, second Unit of
  Work, Result/Maybe/Specification framework, AutoMapper for a few explicit
  mappings, CQRS infrastructure beyond the existing MediatR pattern, event
  sourcing, a generic domain-event or state-machine framework, Redis/message
  broker, microservices, or factories/builders for trivial construction.

---

## 4. Testing Strategy

- Unit test framework: **xUnit**.
- Actual solution projects are `backend/tests/SmartCampus.UnitTests/` and
  `backend/SmartCampus.IntegrationTests/` (the latter is at the backend root,
  as listed in `backend/SmartCampus.slnx`). Both currently contain only
  scaffold tests.
- Unit tests cover observable Application behavior and invariants without
  ASP.NET or real infrastructure where possible. Integration tests cover
  persistence, SQL, transactions, mappings, and other real infrastructure
  semantics when those implementations exist; the current integration project
  has no EF Core/SQL package yet.
- Add regression tests for reproducible bugs, mock meaningful external
  boundaries rather than every owned class, and do not test private details or
  add tests only to increase coverage. A refactor without behavior change does
  not require unrelated test rewrites.
- `backend/scripts/verify` restores and builds `backend/SmartCampus.slnx` with
  `-warnaserror`, then (from `backend/`) runs `dotnet test SmartCampus.slnx
  --no-build` when any `tests/*/*.csproj` exists. The current unit-test
  project satisfies that gate, and the solution invocation includes
  `SmartCampus.IntegrationTests`; it is not currently skipped. The migration
  check runs only after migration files exist.
- There is no coverage threshold. A behavior change should ship with tests in
  the same change, or document why it cannot be automated.

---

## 5. Authentication

Contract with `web/` (see `web/AGENTS.md`) — decided, details TBD:

- **JWT access token + refresh token in an HttpOnly cookie.**
- Access token: short-lived, returned in the login response body, sent by the
  client as `Authorization: Bearer <token>`. Carries the user's role
  (`staff`/`ops`/visitor, etc.) as a claim so the frontend can gate `/admin/*`
  without an extra round trip.
- Refresh token: long-lived, issued as an **HttpOnly, Secure** cookie — the
  API sets it via `Set-Cookie`, never returns it in a JSON body. A dedicated
  refresh endpoint reads the cookie and issues a new access token.
- Password storage: hash with a modern algorithm (BCrypt or ASP.NET Core
  Identity's default) — never plaintext, never a fast general-purpose hash
  (MD5/SHA1/SHA256 alone).
- Token lifetimes: access token **15 minutes**, refresh token **7 days**.
- Claims on the access token: **`sub` (user id) and `role` only** — no
  display name, email, or other PII in the JWT payload. If the frontend needs
  a display name, it fetches that separately (e.g. a `/api/auth/me` call),
  not from the token.
- Endpoints: `POST /api/auth/login` (returns access token in the body, sets
  the refresh token as an HttpOnly cookie), `POST /api/auth/refresh` (reads
  the refresh cookie, returns a new access token), `POST /api/auth/logout`.
- Logout/revocation: **server-side revocation, not just cookie deletion.**
  Refresh tokens are persisted (e.g. a `RefreshTokens` table/entity — token
  hash, user id, expiry, revoked flag — schema change needs an ADR per
  Section 9). `POST /api/auth/logout` marks the presented refresh token as
  revoked in storage, then clears the cookie. `POST /api/auth/refresh` must
  reject a revoked or unknown token even if it has not yet expired. This
  means a stolen refresh token can be invalidated by the legitimate user
  logging out, instead of staying valid until its 7-day expiry.
- Store a hash of the refresh token (not the raw token) — same reasoning as
  password storage: a DB leak should not hand out usable tokens.

---

## 6. Interface with the robot fleet

The robot side (`robot/`) is a separate deploy unit maintained by WP3. Any
change to the telemetry the backend consumes or the commands it sends is a
**contract change**: update `docs/architecture.md` in the same PR and tell WP3.

The backend does **not** speak ROS. It talks to a thin bridge node that lives
in `robot/` and translates to ROS 2 on the other side — full topology in
`docs/architecture.md` §3. For the backend that means:

- One `Application` interface (`IFleetGateway` or similar) describes what the
  fleet can do — send/cancel one leg and receive/read latest robot state. Its
  implementation in `Infrastructure` uses the external transport once that
  transport is decided.
- Do not add ROS concepts (topic names, action names, message types) to
  `Domain` or `Application`. They stop at the `Infrastructure` boundary.
- Treat the robot as unreliable: it can be offline, slow, or mid-reboot. A
  dispatch call that cannot reach a robot must not hang a request thread or
  leave an inconsistent assignment. Keep the confirmed booking intact and
  move the `TourInstance` to the documented waiting/delayed operational path.
- Production POI target poses are backend-managed data. Each `TourLeg`
  resolves `stop_id`, `x`, `y`, and `yaw` in its map/frame/context before
  dispatch; robot-local `bus_stops.yaml` is not authoritative production data.
- Robot state is transient latest-state data. Do not persist every pose update
  to transactional SQL Server; persist meaningful business state transitions
  and use a dedicated experiment log/file when a benchmark needs telemetry.
- Battery is optional/nullable telemetry, not a guaranteed physical capability
  or a mandatory dispatch threshold.
- The external Fleet Emulator in `digital-twin/` uses this same boundary and
  must not reference `SmartCampus.Application` or
  `SmartCampus.Infrastructure`.

<!-- TODO(WP2+WP3): chốt wire protocol (REST vs gRPC), auth cho kênh điều
khiển robot, và schema telemetry/command — rồi ghi vào docs/architecture.md §3
trước khi code hai đầu. -->

---

## 7. Verification

```bash
backend/scripts/verify
```

Order: `dotnet restore` -> `dotnet build -warnaserror` -> `dotnet test` (the
script skips this only when `backend/tests/` has no test project) ->
`dotnet ef migrations has-pending-model-changes` (only when
`backend/src/SmartCampus.Infrastructure/Persistence/Migrations/` has a
migration).

---

## 8. Definition of Done

Standard **DONE (verified)** from the root `AGENTS.md`. The backend has no
tier-3 hardware step — if a change is fully covered by tests and
`backend/scripts/verify` passes, it is DONE.

Exception: anything that sends commands to a real robot. That is tier 3 and
must be reported as READY FOR HARDWARE TEST.

---

## 9. Hard Constraints

- Do not change the database schema without an ADR in `docs/decisions/`.
- Do not weaken authentication on robot-control endpoints. An unauthenticated
  path that can move a robot is a safety bug, not a convenience.
- Visitor personal data (name, contact, booking history) must never appear in
  logs or in an error response body.

<!-- TODO(WP2): thêm constraint khác khi có. -->
