# ADR-0044: Require an outcome for terminal robot commands

Date: 2026-11-04
Status: corrective implementation of ADR-0042/0043; no new business scope

## Context

The v1.14 `CK_RobotCommands_Outcome` compares `Outcome = State` for ARRIVED,
FAILED and CANCELLED. A NULL outcome makes that expression UNKNOWN, which a
SQL Server CHECK accepts. The existing integration test reproduces this hole.

## Decision

Schema v1.15 explicitly requires `Outcome IS NOT NULL` for these three terminal
states, with the outcome equal to the state. Other states still require NULL.
The v1.14 snapshot and upgrade patch remain immutable. A new v1.15 snapshot
serves empty databases; a transactional v1.14-to-v1.15 patch replaces only this
CHECK and advances the version marker. No entity, column, grant or API changes.

Before replacing the CHECK, the patch locks and validates existing command
rows. Invalid rows stop the upgrade and their command IDs are reported. The
patch never invents outcomes or rewrites command history. Repairing shared
data requires the normal reviewed database process. Deployment continues to
use the backed-up upgrade path; its read-only gate requires v1.15 and a trusted
outcome CHECK containing the explicit NULL guard. Historical hashes remain
recognized for upgrades.

## Verification

Exercise all three terminal states on fresh and upgraded disposable databases:
NULL and mismatched outcomes fail, matching outcomes succeed. Verify patch
reruns, invalid-data rollback, retained history/bootstrap hash and deployment
rejection of v1.14 or missing/disabled/untrusted outcome constraints.
