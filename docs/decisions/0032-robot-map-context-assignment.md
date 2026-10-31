# ADR-0032: Store each robot's Fleet Sync map context in the database

- Status: accepted by the owner for implementation
- Scope: physical robot map assignment, Fleet Sync context validation and Technical Staff management UI
- Supersedes: only the per-robot `FleetSync:RobotContexts` configuration source described in ADR-0019; ADR-0029's persisted first-accepted context remains historical confirmation for the current credential.

## Decision

`dbo.Robots` stores a nullable `AssignedMapVersionId`, `MapAssignedAt` and
`MapAssignedByUserId`. The mapKey and frameId always come from that immutable,
valid uploaded `MapVersion`; operators cannot type an independent context.
Only TechnicalStaff can assign, change or clear the assignment. Staff and Admin
may view it. Any valid uploaded map version can be assigned, regardless of its
technical PASS status, so first connection confirmation can be established
before a deployment check.

Assignment does not change the robot credential or reset
`FirstAcceptedSyncAt`/`FirstAcceptedMapKey`/`FirstAcceptedFrameId`. Those values
remain historical evidence from the first accepted report for the current
credential. Fleet Sync authentication reads the assigned map context with the
Robot row. An unassigned robot receives `MAP_CONTEXT_UNCONFIGURED`; a report
whose mapKey or frameId differs receives `MAP_CONTEXT_MISMATCH`. A report using
an old context after reassignment is rejected; the MiniPC must be updated.

`ROBOT_MAP_ASSIGNED` and `ROBOT_MAP_CLEARED` audit rows are appended in the same
transaction as the assignment write. SQL runtime permission is limited to
column-level UPDATE on the three assignment columns and INSERT on AuditLogs;
credential and dispatch state remain outside that write boundary.

The legacy `FleetSync:RobotContexts` section is ignored. If present at startup,
the API logs one deprecation warning. Operators remove those lines from
`/etc/campustour/api.env` after deploying this release. Provisioning order is
robot registration, credential issue, map assignment in the web UI, MiniPC
configuration from copied mapKey/frameId, then a Fleet Sync probe. This is
configuration workflow only; assignment does not certify deployment, map
loading, localization, safety or dispatch readiness.

## Consequences

- A reassignment changes the accepted Fleet Sync context immediately, even if
  an old bridge process is still running; its next old-map report is rejected.
- Assignment and first connection confirmation are separate state. Reassigning
  a map preserves the credential's original confirmation history.
- Valid but not-yet-PASS map versions are assignable; map checks remain manual
  and PASS requirements are unchanged.
- The API runtime cannot modify Robot columns outside its reviewed grants.
- This does not create multi-map assignment, auto-assignment on map PASS, or a
  MiniPC installation workflow.

## Verification status

Schema, API, UI, deployment-gate, SQL upgrade and integration test results are
reported by the implementing PR. This decision is not evidence of physical
robot connectivity or map loading.
