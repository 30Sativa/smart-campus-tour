# ADR-0030: Web-managed physical robot credential lifecycle

- Status: accepted for implementation by the owner, 2026-10-29
- Scope: Technical Staff credential issue/rotation/revocation, Admin emergency
  revoke and audit, and the existing Fleet Sync MiniPC credential consumer
- Supersedes: the one-shot-only provisioning portion of ADR-0019 and ADR-0029;
  Fleet Sync remains telemetry-only

## Context

Physical robot registration is separate from commissioning, but the one-shot
CLI credential path does not provide Technical Staff a safe way to issue,
replace, revoke, or audit credentials. The Fleet Bridge reads one credential
from a private file. Rotating or revoking it therefore disconnects that bridge
until an authorized operator updates its local configuration.

## Decision

Each PHYSICAL robot has at most one active Fleet Sync credential. The secret is
generated on issue/rotation, returned once with `Cache-Control: no-store`, and
never persisted, logged, included in an audit row, or returned by a GET. Issue,
rotation, and revocation use caller request IDs recorded as audit correlation
IDs. Replaying a credential mutation returns 409 and never reveals its secret
again. A filtered unique index prevents concurrent reuse of a request ID for
the same robot.

Technical Staff may issue when no credential is active, rotate an active
credential, and revoke. Admin may view credential metadata/audit and revoke as
an emergency action; Admin cannot issue or rotate. Staff sees only read-only
connection status. Revoke requires a reason of 1–500 characters. Every
credential change updates the nullable hash and clears the three durable
first-accepted Fleet Sync confirmation fields atomically. Rotation invalidates
the old secret immediately. The audit row commits in the same transaction and
stores only RobotCode, a four-character hint, optional reason, and source
(`WEB` or `CLI`). Credential audit history is append-only.

The v1.6 Database First schema makes `CredentialHash` nullable and adds issue,
hint, and revoke metadata. Existing non-empty hashes remain active with null
metadata and are displayed as provisioned through the legacy CLI. Empty hashes
representing an unissued registered identity become NULL. The existing CLI
remains an operator fallback and calls the same lifecycle implementation; an
invocation issues when no key is active and rotates when a key is active, while
revocation remains explicit through the web. Runtime and provisioner roles
receive only the Robot columns needed for this lifecycle; neither receives full-table
Robot UPDATE/DELETE. The provisioner remains a distinct database role.

Credential expiry, multiple active keys, scopes, persisted last-used writes,
background key jobs, ROS/SROS2 credential transport, and MiniPC remote
configuration are intentional non-goals. The MiniPC file remains operator
managed; it is not updated by the web application. Revocation/rotation does not
claim a physical stop or safety action.

## Consequences

- A lost one-time secret cannot be recovered; Technical Staff must explicitly
  rotate it, and the operator must update the MiniPC private file.
- Revoke leaves no active credential and retains the last issue metadata and
  hint for history. A later issue starts a new active credential period.
- Credential state and append-only audit are durable SQL records; live
  connection status remains the existing in-memory Fleet Sync projection.
- Deployments must apply the controlled v1.5→v1.6 Database First patch and
  regrant before promoting the API. No shared/production database is changed
  by implementation or CI.

## Verification status

This decision does not claim CI completion, deployment, MiniPC configuration,
or physical robot verification. Those evidence levels are reported by the
implementing change.
