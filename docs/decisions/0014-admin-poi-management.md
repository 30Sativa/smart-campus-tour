# ADR-0014: Admin management of unused POIs

## Context

The current POI baseline has stable identities and required map/pose fields, but
Admin cannot create POIs or update their details without editing the database.
The existing Review 1 scope reserved geometry changes for technical staff and
did not yet specify create, deactivation, route-use locks, or concurrent edits.
The demo POIs are explicitly unverified and there is no calibrated browser map
transform suitable for converting pixels into ROS coordinates.

## Decision

The Admin POI feature provides list, detail, create, update, activate, and
deactivate operations. It has no hard-delete operation. New POIs are inactive
until an Admin activates them. POI identity remains stable through every update.

Admin may edit map context and pose only while no `RouteStop` or historical
`TourEvent` references the POI. Content and availability may be changed while a
POI is referenced, except while a `READY` or `RUNNING` Tour uses it through its
base route, active route, or an enabled branch; that state blocks every POI
mutation. Historical references do not block content correction or
deactivation. The API rechecks these conditions in a serializable POI mutation
transaction and requires the current SQL Server `RowVersion` for updates and
availability changes. It takes an update lock on the POI row before reading
the token, so concurrent requests using one version serialize into one success
and one stale-version conflict.

`IsActive` means available for selection in a newly prepared route. It does not
mean that the POI is verified, route-ready, or safe for physical navigation.
The UI labels stored coordinates as unverified because the schema has no
verification field. The first Admin form accepts numeric coordinates and map
context; an interactive map picker waits for a measured, documented transform.
Audio upload, route editing, robot pose lookup, and navigation tests remain
separate work.

## Consequences

Admin can bootstrap a POI catalog and correct unused geometry without deleting
records or breaking route/history identity. Backend validation and SQL
concurrency checks protect updates, while active Tour checks cover enabled
route branches. The v1.1 SQL snapshot gains a POI `RowVersion`; an additive,
idempotent patch is provided for existing v1.1 databases. Existing v1.1 or demo
databases must receive that patch before running this application build.

Numeric pose entry is an interim workflow and does not make a point physically
verified. This feature does not make POIs route-ready: route reachability,
narration readiness, route stop order, and hardware validation remain separate
checks. This is the implementation scope authorized for the POI feature; group
and advisor review remains at Review 2.
