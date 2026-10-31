# ADR-0034: Schedule new Tours from a tested Route revision

- **Status:** Accepted by the repository owner, 2026-10-30, as an interim decision until an approved content/audio duration source exists. Physical behavior remains unverified.
- **Partly supersedes:** ADR-0024's block on creating a new Tour and its rule that `RouteTestRun.MeasuredDurationSeconds` must not size a reservation. ADR-0024's READY block, and every other boundary it records, stays in force.
- **Amended by:** ADR-0035 (slots, lead time, what a test measures, reservation length).
- **Related:** ADR-0023 (versioned routes), ADR-0028 and ADR-0033 (map evidence), ADR-0018 (legacy Tour CRUD).

## Context

ADR-0024 blocks new Tours until the backend can compute a defensible configured duration, and no approved audio or content duration exists yet. Meanwhile Staff can author a versioned route and Technical Staff can record a whole-route PASS, so tested routes exist that no Tour can use. The scope reserves the robot for "15 minutes before + the longest allowed tested path duration + 15 minutes after". With fixed routes and no branches implemented, the longest tested path of a revision is its one effective PASS run.

## Decision

1. **Reservation length.** New Tours reserve the robot from 15 minutes before `ScheduledStartAt` to `ScheduledStartAt` + the measured seconds of the revision's effective PASS run + 15 minutes. This is the owner's approved relationship between the measurement and the reservation. It is interim: when an approved duration source exists, a later ADR replaces the measurement.
2. **What can be scheduled.** A Tour names one exact submitted `RouteRevision` whose effective test run is PASS and whose POI PASS evidence is still effective. An older revision qualifies if it still meets this; the rule follows the tested tuple, not the newest number. Its map must also pass the ADR-0033 gate. Legacy Routes can no longer start a new Tour.
3. **Robot.** Staff picks one physical robot when creating the Tour. A reservation is a row, not `Tours.AssignedRobotId`, which keeps meaning the runtime claim at Start. Reservations on one robot may not overlap; overlap returns 409 `ROBOT_RESERVATION_CONFLICT`. The check runs under a transaction-owned per-robot lock. Whether that robot is connected or deployed on the map is a READY concern and stays out of this decision.
4. **Operator.** Staff names one active single-role Staff account as Operator when creating the Tour; 409 `OPERATOR_REQUIRED` otherwise. It may be the creator. This does not add per-Tour authorization.
5. **Reader boundary.** A Tour with `RouteRevisionId` reads its name, stops and narration from that revision's immutable stops, never from legacy `RouteStops`. Representative, Student and Staff readers all follow this, so a new Tour never shows an empty itinerary.
6. **Changes after creation.** Name, description and fallback video stay editable. Time, route and robot changes stay blocked with `TOUR_DURATION_UNAVAILABLE`; Staff cancels and recreates. Cancelling releases the reservation in the same transaction, and the row is kept as history.
7. **Legacy Tours.** They keep their Route, readers and metadata edits. Their schedule and route stay blocked as ADR-0024 says.

## Out of scope

READY, reopen, reservation of branch paths, Start, RUNNING, robot dispatch and per-Tour Operator authorization. A Tour created here stays `SCHEDULED`.

## Known limitations

- A measurement describes one manual run, so a long narration can make a real Tour run longer than the reservation. The 15-minute buffers are the only allowance.
- A later FAIL or lost map evidence does not change a Tour already scheduled. READY must recheck them.
- A dwell-only revision reuses the PASS of its unchanged navigation, so its measurement may not include the new dwell.

## Consequences

Database First v1.9 adds `Tours.RouteRevisionId`, `Tours.OperatorUserId` and `TourRobotReservations`. The create request changes shape, which is safe because every create request has returned 409 since ADR-0024. `POST /api/staff/manage/tours` now takes `routeRevisionId`, `robotCode` and `operatorUserId` and drops `expectedRouteVersion`. `GET /api/staff/manage/tours/operators` is added for the picker. Tour detail returns `routeRevision`, `reservation` and `operator`, and `route` and `activeRoute` are null for these Tours. The API build requires the v1.9 database, so the schema upgrade must run before it deploys.
