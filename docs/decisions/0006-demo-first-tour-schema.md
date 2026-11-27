# ADR-0006: Adopt the demo-first campus tour schema

> Historical baseline: ADR-0012 supersedes v1.0 as the current SQL/EF schema. The v1.0 snapshot is retained for comparison and was not migrated into v1.1.

## Context

The original backend scaffold modeled visitor bookings and feedback around a
`Tours` table. The supplied `smart-campus-tour-schema-v1.0.sql` instead models
staff-created tours, school group registrations, roster rows, and explicit
robot and stop execution state. The backend has no implemented booking or
dispatch use cases yet, so its generated persistence model can be replaced
before those features are built.

## Decision

`backend/database/smart-campus-tour-schema-v1.0.sql` is the SQL Server schema
source for the backend's Database First scaffold. It is applied to an empty
database; it does not migrate data from the previous schema. The checked-in
copy corrects the supplied typo in `TourEvents.LegId` and leaves database
creation to the operator, so it can be applied to a database chosen by the
environment. The scaffolded entities and EF mappings mirror this schema.

The schema intentionally has primary and foreign keys but no additional
unique, check, default, or index constraints. The domain invariants described
in the source document are not yet enforced by the database or implemented as
backend use cases.

## Consequences

- Old `Booking`, `Feedback`, and `SystemConfig` entities are removed. Existing
  data in those tables is not migrated.
- IDs without database defaults must be supplied by the application. SQL
  Server supplies identity values and row versions where declared.
- The conceptual booking and tour-instance flow in `docs/architecture.md`
  predates this schema and needs a separate contract review before those use
  cases are implemented.

## Update 2026-11-28

### Status

Superseded by ADR-0012 for the v1.0→v1.1 baseline. The current empty-database snapshot on main `1b586a70` is
`backend/database/smart-campus-tour-schema-v1.26.sql`; v1.25→v1.26 adds durable Operator presence (ADR-0073).

### Decision

SQL scripts under `backend/database/` remain the Database First source of truth. Existing databases use the
reviewed additive patch chain; old snapshot/hash files stay immutable. EF entities/mapping are scaffolded from
SQL and reviewed; normal EF migrations are not used. Schema v1.0 is not the current deployment schema.

### Consequences

A fresh snapshot is for an empty database, not an in-place overwrite. Version advancement needs coordinated
schema structure/grants and deployment gates; retaining old snapshots costs maintenance but preserves provenance.
