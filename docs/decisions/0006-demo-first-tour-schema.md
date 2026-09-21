# ADR-0006: Adopt the demo-first campus tour schema

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
