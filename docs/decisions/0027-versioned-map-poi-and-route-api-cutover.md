# ADR-0027: Versioned Map–POI–Route API cutover

- Status: owner-authorized cutover; implemented in this feature branch, review pending
- Date: 2026-10-28
- Authority: Report 3 SRS v0.2 / Phiếu v1.9 and the owner request in this task
- Related: ADR-0017, ADR-0020, ADR-0021, ADR-0023, ADR-0024, ADR-0026

## Context

The product target assigns map commissioning and POI verification to Technical
Staff, POI proposals and fixed Route authoring to Tour Staff, and account
management to Admin. Versioned Map, POI, and Route contracts now provide the
replacement workflow. Several legacy mutable APIs and Admin URL aliases still
exposed the old model and made it possible for clients to keep integrating the
wrong contract. The legacy POI, Route, Tour, registration and Tour data remain
referenced by current readers and persisted Tours.

## Decision

- Keep `/api/admin/accounts` and its Admin authorization; this remains the
  correct account-management endpoint.
- Retire the legacy Staff/Admin POI catalog routes and direct POI mutations;
  Staff POI work uses `/api/staff/poi-proposals`, and Technical verification
  uses the Technical per-revision endpoint.
- Retire legacy Route create/update/delete/activate/deactivate operations and
  the old Admin Route aliases. Versioned authoring and manual test evidence use
  `/api/staff/routes`, `/api/routes`, and the Technical route-verification API.
- Retire Admin URL aliases for Tour and registration operations, aggregate
  registration-wide decisions, and direct Admin email correction. Keep the
  Staff pre-execution Tour operations and Staff row-review/email-request
  workflow. Keep legacy Route GET projections required by the existing Tour
  read model.
- Do not drop, migrate, or rewrite legacy POI, Route, Tour, or registration
  database rows as part of HTTP API retirement. Legacy Tour scheduling remains
  fail-closed; this decision does not implement versioned scheduling,
  reservations, Operator assignment, READY, runtime, or robot commands.
- Update callers, OpenAPI, tests, architecture and API migration documentation
  together. Retired URLs are absent from routing, not hidden as deprecated
  operations.

## Consequences

New POI and Route preparation follows exact immutable map/revision contracts.
The old Route read projection remains a bounded compatibility dependency for
legacy Tour reads, but cannot author or activate legacy routes. Existing Tour
creation/scheduling callers must wait for the separate scheduling migration.
Database history and existing Tour references are preserved. Diagram redraw and
physical commissioning remain pending; no robot test is implied by stored
manual evidence.
