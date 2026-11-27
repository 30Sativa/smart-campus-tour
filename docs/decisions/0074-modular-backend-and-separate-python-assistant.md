# ADR-0074: One modular ASP.NET Core backend and a separate Python AI Assistant

Date: 2026-11-28.

## Status

Accepted for documenting the existing architecture under the owner's ADR-sync instruction, part A,
on 2026-11-28. Implementation inspected at main `1b586a7049d17265f5cd10478fddf9c7e161e55f`.
No earlier team/advisor approval date or physical acceptance is inferred.
Report 4 §1.3 Table 3 should cite ADR-0074: repository ADR-0020 is the SRS/account baseline,
and ADR-0016 is the Student Q&A stack/policy, not the system-wide decomposition decision.

## Context

Tour preparation, registration, reservation, voting and runtime share business invariants and SQL transactions.
Splitting them into independently deployed modules would add consistency/recovery work to the current team.
The Assistant uses Python libraries and its provider dependencies need a bounded service boundary.
Report 4 describes this architecture but assigns it a repository number already used for another decision.
Part A explicitly authorizes this separate ADR; the existing accepted records retain their content and metadata.

## Decision

Deploy one ASP.NET Core .NET 10 backend application, organized into Api, Application, Domain and Infrastructure
projects within `backend/`. Feature-local MediatR handlers own use cases; FluentValidation validates requests.
EF Core is Database First: SQL in `backend/database/` is authoritative, with reviewed additive upgrades and scaffolding,
not normal EF migrations. Commands use the existing feature-specific transaction/lock and unit-of-work boundaries.

Run the AI Assistant as a separate Python service on the server/cloud, called by the backend over authenticated
HTTP with cancellation and a bounded timeout. Current code uses Starlette, pydantic and uvicorn;
`HttpAiAssistantClient.AnswerAsync` calls `/v1/answer` and caps its budget at the smaller of the configured client
timeout and 20 seconds. Do not embed Python in the .NET process or run this service on the robot miniPC.
The browser never calls it directly, and it receives no roster, invitation code, session token or account identity.
Viewer approved-answer policy and the current provider-generation gap remain ADR-0016 / change #469.

## Rejected alternatives

- Microservices per business module: Tour start, row capacity, reservations and voting would need distributed
  transaction/recovery coordination and more deployment operations without a demonstrated V1 benefit.
- Calling Python in-process from .NET: couples native/runtime interop, dependency failures and release lifecycles;
  HTTP provides a simpler, timeout-bound contract for these separately tooled components.
- Browser-to-Assistant requests: duplicate access control and expose the private service/credential boundary.

## Consequences

Related business writes can commit atomically under the existing SQL transaction/lock conventions, and the team
can release the backend as one unit. Python dependencies can be tested and released independently.
The API remains one failure/release unit: a defect can restart unrelated modules and horizontal scaling requires
reconciling existing process-local stores. Each Assistant call adds a network hop, credentials, timeout and an
unavailability path; modular projects alone do not isolate runtime failures.

The checked-in backend Compose file contains API/SQL and the admin seed profile, not an AI Assistant service.
The Assistant has its own Dockerfile and CLI; a deployed host/Compose placement is not established by this ADR.
It documents the code boundary, not a claim that the approved-bank business flow or a production Assistant is deployed.
