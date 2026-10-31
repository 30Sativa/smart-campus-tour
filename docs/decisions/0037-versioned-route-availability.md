# ADR-0037: Availability of versioned Routes

- **Status:** Accepted by the repository owner, 2026-10-31, through the task brief for this change. Physical behavior is not involved.
- **Related:** ADR-0023 (versioned routes), ADR-0034 and ADR-0035 (Tours from a tested revision), ADR-0017 (legacy Route availability).

## Context

Staff needs to stop a tested versioned route being used for new Tours without touching its evidence. `Routes.IsActive` exists but was never read for versioned routes: `SetRouteAvailability` handles legacy rows only and `TourTarget` never checked the flag. Worse, every versioned route was created with `IsActive = 0`, so the stored value says nothing today: enforcing it as written would stop every route at deploy.

## Decision

1. **Same column, no schema change.** `Routes.IsActive` carries the decision. `Route.IsOpenForNewTours` reads it.
2. **Existing rows count as open.** A versioned row with `IsActive = 0` and `UpdatedAt IS NULL` was never deactivated, because only deactivate and activate write `UpdatedAt` on a versioned route. It is treated as open. New versioned routes are stored with `IsActive = 1`. Any data cleanup is optional and separate; no deploy step or ordering depends on it.
3. **Endpoints.** Staff-only `POST /api/staff/routes/{id}/deactivate` and `/activate`, body `{requestId, expectedRowVersion}`, plus `GET /api/staff/routes/{id}/scheduled-tours` so Staff sees the affected Tours before confirming. A retried `requestId` replays without a second audit row; reusing it for another route or action is 409 `IDEMPOTENCY_CONFLICT`.
4. **Concurrency token.** `Routes` has no RowVersion. `expectedRowVersion` carries the same opaque aggregate hash as legacy Routes, exposed as `rowVersion` on the route view, compared after the Route lock. A mismatch is 409 `STALE_ROUTE`. It also changes when the row's metadata does.
5. **What deactivate does.** It is always allowed and flips the flag only. It cancels nothing and changes no revision, test run, PASS or existing Tour. The response lists SCHEDULED and READY Tours on the route. The audit row `ROUTE_DEACTIVATED` or `ROUTE_ACTIVATED` records `routeId` and `affectedTourCount`.
6. **What activate does.** It flips the flag only. Tour create still requires an effective PASS.
7. **Enforcement.** Create and the slots API refuse an inactive route with 409 `ROUTE_UNAVAILABLE` through the shared `TourTarget` check. Create holds the Route lock through commit, so a deactivation cannot pass between the check and the new Tour. `GET /api/routes` gains an optional `isActive` filter; the tested-route picker asks for active routes.

## Out of scope

Legacy Route behavior, stopping revision authoring on an inactive route, the Technical test queue, Tour delete and POI deactivation.

## Consequences

`RouteRevisionView` gains `isActive` and `rowVersion`. Existing callers of `GET /api/routes` see no filtering unless they ask for it. Until a cleanup runs, the column alone does not answer "is this route open" for old rows: always use `IsOpenForNewTours`, or the matching SQL predicate in `EfRouteRevisionRepository`.
