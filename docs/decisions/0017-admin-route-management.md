# ADR-0017: Admin Route CRUD and configuration preservation

Date: 2026-10-19. Status: implementation scope explicitly authorized by the
project owner; this is not a record of advisor approval.

## Decision

Admin manages business Routes through the application: list/detail, create an
inactive route, edit its ordered existing POIs, dwell, head steps, map context,
Start and End, activate/deactivate, copy as a new route, and delete an unused
route. Reuse the existing Routes/RouteStops schema. This supersedes the
seed-only Route preparation and technical-only Route dwell editing portions of
ADR-0009 section 3 and ADR-0012. Dwell remains a RouteStop setting, with no
per-Tour override. The rest of those decisions remains in force.

Configuration is frozen as soon as any Tour (including SCHEDULED and terminal
Tours), RouteVariant, TourEvent or execution stop reference uses it. There is
no Tour snapshot table today; freezing earlier than READY preserves every
published/historical itinerary without adding versioned route tables. Create
a new route to change that itinerary. Referenced routes cannot be deleted.
Name/description and availability may still change except when a READY/RUNNING
Tour uses the route as its base, active route or enabled branch. Deactivation
does not cancel or reconfigure existing Tours. Variant authoring is deferred;
existing variants and their stop identities are preserved, including inactive
variants. Direct stop references also protect malformed legacy associations.

New/edited configurations contain at least one unique POI, in contiguous order
starting at one, with matching case-sensitive MapKey/MapFrame and positive
dwell and head holds. Supported head presets are FRONT, LEFT, RIGHT; total head
hold cannot exceed dwell. LAST_POI has no explicit End pose; POSE requires all
three End coordinates. Activating additionally requires active POIs. Saving an
inactive draft may use inactive POIs; the response explains availability
blockers. Audio/narration readiness and physical commissioning remain separate
Tour preparation checks, not an implicit consequence of CRUD or activation.

Routes has no RowVersion. An opaque SHA-256 revision covers all persisted
route fields and ordered stop identities/configuration; it is compared after
an update lock on the route aggregate. Serializable transactions protect usage
and POI/map reads through the ordinary UnitOfWork save and audit insertion.
Unreferenced stop replacement deletes the old stops inside that transaction
before inserting new identities, avoiding unique (RouteId, StopOrder) reorder
collisions. Any failure rolls the deletion back. Future Tour and variant
writers must coordinate selection/readiness with the same route and POI locks
and revalidate availability; FK existence alone is insufficient.

## Seed, CRUD and technical import

CRUD owns routinely changing Route/POI business catalogs. Retain explicit
initial-admin bootstrap, required reference data, disposable test fixtures and
isolated demo fixtures. Technical import is appropriate for surveyed ROS map
snapshots/commissioned waypoint batches with provenance and validation; it
must honor usage locks and must not overwrite historical or operating data.
No technical Route/variant import workflow is added here.

ROS2 remains authoritative for physical maps and navigation. Technical staff
survey and test map/frame/poses, transitions, dwell and camera behavior. Admin
CRUD neither edits ROS maps nor proves reachability. Stored successfully,
valid data configuration, available for selection, and physically tested are
distinct claims. There is no persisted physical-verification flag; never infer
one from IsActive. No robot commands or Tour runtime are introduced.
