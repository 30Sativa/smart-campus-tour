# ADR-0029: Robot connection confirmation before a new map-check PASS

- Status: accepted for implementation by the owner, 2026-10-29
- Scope: Technical Staff physical-robot registration, HTTPS Fleet Sync, and
  manual map deployment checks
- Supersedes: no earlier transport or robot-readiness decision

## Context

Registration creates a PHYSICAL robot identity before its MiniPC is configured.
Technical Staff must be able to record a manual map check without mistaking an
unprovisioned identity for a connected robot. ADR-0019 keeps Fleet Sync
telemetry-only and keeps high-frequency state in memory. The manual map check
remains a separate human observation.

## Decision

Persist three nullable columns on `dbo.Robots`: `FirstAcceptedSyncAt`,
`FirstAcceptedMapKey`, and `FirstAcceptedFrameId`. They record only the first
new, accepted report for the currently provisioned credential. Authentication,
report validation, configured map/frame matching, and telemetry ordering must
all succeed before recording. The timestamp comes from the backend clock;
`pose` may be null. Duplicate or rejected reports do not confirm. A conditional
update checks both that the three fields remain null and that the credential
hash still matches the hash read for the authenticated request.

Credential provisioning changes `CredentialHash` and clears all three fields
in one SQL update. Old map-check PASS/FAIL history is retained. A request
authenticated before rotation cannot confirm the new credential after
rotation. The runtime API receives only column-level UPDATE on the three
confirmation fields; it never receives UPDATE/DELETE over Robots or
CredentialHash. The separate provisioning role may update only CredentialHash
and these three reset fields.

A new map deployment-check PASS is rejected with 409
`ROBOT_CONNECTION_UNCONFIRMED` unless the robot has durable confirmation.
FAIL remains recordable when the remaining request checks pass. Existing
idempotent replay returns its committed record before this new-PASS gate. The
check reads and locks the Robot row in the map-check transaction, serializing
the decision with credential rotation. It does not require current online
telemetry, a pose, localization claims, a start pose, or a map context match
against the historical confirmation.

The robot list exposes the safe confirmation fields plus a derived connection
status: `UNCONFIRMED`, `CONNECTED`, `DISCONNECTED`, or `AWAITING_DATA`. The last
sync receipt remains in-memory and uses the configured Fleet Sync freshness
threshold. On backend restart, persisted confirmation remains while the
in-memory receipt is absent. A later offline state does not erase confirmation.

## Limits and operations

An accepted report confirms authenticated HTTPS contact with the configured
RobotCode/mapKey/frameId. The report timestamp passing the existing age/skew
window does not prove synchronized NTP. Confirmation does not prove the robot
loaded the named map file, localized correctly, or is safe to move. The saved
mapKey/frameId are historical context from the first accepted report in the
current credential period. If the database write alone fails after the report
has been accepted, Fleet Sync stays successful, an operational error is logged,
and PASS remains blocked until a later new report saves the confirmation.

Schema changes use the Database First v1.5 snapshot and additive v1.4-to-v1.5
patch. Existing v1.4 deployments require a controlled, backed-up upgrade/regrant
before deploying code that needs the new columns and grants. `--check-only`
stays read-only. No shared or production database is upgraded by this decision.

## Consequences

- Manual map checks remain independent evidence and may record FAIL before
  connection confirmation.
- Registration remains available while a robot is offline; robot identity
  still appears in the picker.
- Fleet Sync remains HTTPS telemetry-only, with no command, ROS, or readiness
  contract added.
- Confirmation is durable; latest/high-frequency telemetry is not.
- The repository's text UI-flow is updated. No editable diagram source is
  tracked, so any external workflow illustration must be redrawn by its owner.

## Verification status

This ADR records intended code and schema behavior. Automated local SQL
verification and CI results are reported with the implementing PR; it is not a
physical robot acceptance result or a deployment record.
