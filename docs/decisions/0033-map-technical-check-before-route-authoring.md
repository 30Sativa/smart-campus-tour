# ADR-0033: Require current map technical evidence before route authoring

- **Status:** Accepted by the repository owner, 2026-10-30. Physical behavior remains unverified.
- **Scope:** Versioned Route draft save and submission only. No schema change, no new endpoint, no change to route test runs, scheduling or READY.
- **Extends:** ADR-0023 (versioned routes) and ADR-0028 (map technical evidence before POI preparation).

## Context

ADR-0028 blocks Tour Staff from creating, revising or submitting a POI on a map version with no effective technical evidence. Route authoring had no matching gate. A route required POI PASS evidence on the exact map, so a map without any POI PASS could never make a route, but a map whose newest evidence turned to FAIL after its POIs passed still accepted new routes. Staff could keep preparing a tour on a map that Technical Staff had just found unusable, and the problem only surfaced when Technical Staff tried to test the route.

## Decision

1. `POST /api/staff/routes`, `POST /api/staff/routes/{routeId}/revisions` and `POST /api/staff/routes/{routeId}/revisions/{revisionId}/submit` require the revision's exact map version to be eligible under the ADR-0028 calculation: at least one physical robot's latest check for that version has the matching package SHA-256 and both localization and display passing.
2. An ineligible map returns the existing business 409 with the existing codes and Vietnamese message: `TECHNICAL_CHECK_PENDING` when no check exists, `TECHNICAL_CHECK_NOT_PASSED` when no latest check passes. No route, revision, submission receipt or success audit is written.
3. A committed idempotent retry replays its original result before this gate, as in ADR-0028.
4. Save and submit take the transaction-owned per-map preparation lock before reading eligibility, so deployment evidence and route authoring cannot interleave. Lock order is route, then map. Deployment evidence takes map, then robot, and never takes a route, so no cycle is added.
5. The gate looks at the map only. It does not require a robot to be connected or currently deployed on that map; ADR-0028's deferred pre-tour readiness check stays deferred.
6. Nothing existing is rewritten. Saved revisions stay readable and immutable, and a revision already submitted stays submitted. Technical Staff may still record a route test run, which keeps its own rule from ADR-0023: the testing robot's latest deployment record must name the exact map and checksum, and a retained tested tuple remains eligible until scheduling rules say otherwise.

## Consequences

Staff get the refusal when they author a route rather than when Technical Staff tests it. A draft saved before the map lost its evidence can no longer be submitted until a new passing check exists, and Staff cannot fix that by revising the route on the same map. This is deliberate: the fix belongs to Technical Staff.

The web console disables maps that cannot pass this gate and blocks saving, but the rule stays on the server.

Automated tests use human-entered test evidence; none of this proves a robot ran the route.
