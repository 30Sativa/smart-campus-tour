# ADR-0039: One robot per map area, usable robots for Tours, and robot deactivation

- **Status:** Accepted by the repository owner, 2026-11-01, through the task brief for this change and its correction on deactivation. No physical behavior was tested by this change.
- **Related:** ADR-0029 (connection confirmation), ADR-0030 (credential lifecycle), ADR-0032 (robot map assignment), ADR-0034 and ADR-0035 (Tours from a tested revision).

## Context

Nothing stopped two robots holding the same map area, a Tour could reserve a robot that had never connected or was on another map, and there was no way to take a robot out of use. `Robots.IsDispatchEnabled` looks like the right switch but is not: registration always sets it false and nothing sets it true, so gating on it would block every Tour.

## Decision

### One robot per map area

1. `Robots.AssignedAreaKey` is set and cleared with `AssignedMapVersionId`, from the map's `AreaKey`. A check constraint keeps the two together, and a filtered unique index allows one robot per area.
2. **This is a current-phase limit, not a permanent rule.** The fleet is small and one robot serves an area. Relax it when the fleet grows by dropping the index and deciding how Tours choose among robots.
3. Assigning an area another robot holds returns 409 `MAP_AREA_ALREADY_ASSIGNED` naming that robot. Nothing is taken silently. A per-area application lock taken before any robot row is read serializes assigns, and the unique index is the final guard, mapped to the same 409.
4. Changing a robot's map replaces its old assignment and frees the old area. Map versions are never deleted.
5. The assign response and `GET technical/physical-robots/{id}/affected-tours` list SCHEDULED/READY Tours reserved on the robot whose route revision uses another map version. Clearing the map lists all of them. Nothing is cancelled.
6. The upgrade backfills the area and stops with the robots named if an area is already shared, leaving the choice to an operator.

### Only usable robots for a Tour

Tour create, the slots API and the new `GET staff/manage/tours/robots` accept a robot only if it is PHYSICAL, not deactivated, has `FirstAcceptedSyncAt`, and its latest deployment check across all maps is a PASS on the route revision's exact map version and SHA. That last rule is shared with route test runs. Otherwise 409 `ROBOT_NOT_READY_FOR_ROUTE` says which reason applies. Existing Tours are not modified.

### Deactivation

1. `Robots.DeactivatedAt`, `DeactivatedByUserId` and `DeactivationReason` are all null or all set. Active means `DeactivatedAt IS NULL`. `IsDispatchEnabled` is left untouched.
2. Deactivate is TechnicalStaff only and needs `requestId`, `expectedRowVersion` and a reason. In one transaction it records the columns, revokes the active key with the existing revoke logic so `FirstAccepted*` reset, clears the map assignment, and audits `ROBOT_CREDENTIAL_REVOKED`, `ROBOT_MAP_CLEARED` and `ROBOT_DEACTIVATED`. The response lists the SCHEDULED/READY Tours reserved on the robot. They are not cancelled.
3. Activate clears the three columns only and audits `ROBOT_ACTIVATED`. Technical Staff must issue a new key and assign a map again.
4. A deactivated robot leaves every picker and `CurrentlyDeployedOn`. It stays on the robot page under "Ngừng sử dụng" with its history. Writers refuse it with 409 `ROBOT_DEACTIVATED`: map assignment, deployment check, POI verification, POI import, route test and issuing or rotating a key.
5. Deactivate takes the same deployment and reservation locks as Tour create, in the same order, so a Tour either sees the deactivation or appears in its list.

### Operating rule

One physical robot has one robot record. The system cannot attest hardware, so this is an operational rule: replacing a robot means deactivating the old record and registering the new one.

## Database

Schema v1.12 with `patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql`, stacked on v1.11 of ADR-0038. Runtime gets column-level UPDATE on the four new columns. The credential provisioner gets SELECT on `DeactivatedAt`, so the CLI also refuses a deactivated robot.

## Out of scope

Cancelling or moving affected Tours, more than one robot per area, and any readiness check at Tour start.
