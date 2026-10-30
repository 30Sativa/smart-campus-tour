# ADR-0028: Require technical map evidence before POI preparation

- **Status:** Owner-authorized business rule, 2026-10-28.
- **Scope:** Map → POI preparation only; does not add a map approval/publish workflow or change the schema.
- **Supersedes:** ADR-0021's implementation allowance to create an unverified POI draft on any uploaded, valid map package before deployment-check evidence exists.

## Decision

Tour Staff may create a POI proposal, create its next revision (including a map change), or submit a revision only if the exact referenced map version has successful technical deployment evidence. For each map-version/physical-robot pair, only that pair's newest deployment check is effective. At least one pair must have the exact map package SHA-256 and both localization and display passing. A newer failure for that same robot/version supersedes its older pass. A new map version starts without inherited evidence.

Map eligibility is historical to the exact version. A robot's later deployment to another map does not erase the previous version's passing evidence. Recording POI verification still requires the verification robot's latest deployment record across all maps to point to that exact version and checksum, as in ADR-0021.

The map list/detail API is the source of the calculated check state, eligibility, reason and supporting robot/time/check evidence. The same calculation protects reads and mutations. Mutations and deployment-check recording serialize on a transaction-owned per-map preparation lock; POI verification continues to use the existing per-robot deployment-state lock. A blocked mutation returns a business 409 and commits no proposal, revision, submission receipt or success audit. An already-committed idempotent retry returns its committed result.

### Operations and scope clarification (2026-10-29)

- The map is eligible when at least one physical robot's latest check for that exact map version has matching package SHA-256 and both localization and display passing. A failure on another robot does not revoke that eligibility; that robot cannot verify POIs or test routes on the map until its own latest cross-map deployment check points to the exact version and checksum.
- The same Technical account may upload a map and record its deployment check. This is an accepted limitation for manual evidence. Route test runs retain their separate requirement for a Technical checker and a distinct active Staff participant.
- A pre-tour readiness check requiring a robot to be deployed on the route's map and connected is deferred until a Tour start/run feature exists. Current map/route preparation rules remain unchanged.

Technical Staff remains the only role that uploads map packages and records deployment evidence or POI verification. Tour Staff retains proposal/revision/submission rights. Admin and Staff cannot record technical evidence. A package's ZIP/YAML/PGM validation is only file validity; it never implies map technical PASS or POI PASS.

## User-visible states

- `PENDING`: “Chờ kỹ thuật kiểm tra”.
- `FAILED`: “Kiểm tra chưa đạt”.
- `PASSED`: “Đã có kiểm tra kỹ thuật đạt”.

The Technical Staff screen shows file validity, technical check outcome, and POI-preparation eligibility separately. Tour Staff sees unavailable maps but cannot select them for new edits; if evidence changes during editing, the backend conflict preserves the local form values. Existing proposal history remains readable regardless of present eligibility.

## Consequences and verification limits

No database schema change is needed; deployment records already contain the map version, checksum, robot, observed outcomes and timestamp. Test records may simulate human-entered evidence and must not be described as real robot testing. The existing workflow diagram needs a later redraw so successful map checking appears before Tour Staff POI proposal/submission; this ADR does not redraw it.
