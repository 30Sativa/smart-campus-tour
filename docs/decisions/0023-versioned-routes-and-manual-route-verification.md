# ADR-0023: Versioned Route preparation and manual whole-route verification

- Status: Accepted for the backend implementation slice
- Date: 2026-10-27
- Authority: SRS v0.2 aligned to Phiếu v1.9; scoped route gap in `docs/requirements/srs-v02-backend-gap-register.md`
- Supersedes: the mutable Route configuration as the representation of the new Staff route-preparation target only. It does **not** remove or reinterpret legacy Route/RouteStops data or accepted Route Management decision ADR-0017.

## Decision

Keep `Routes` as the identity table and mark each row `LEGACY` or `VERSIONED`. Existing rows receive `LEGACY` and keep the existing CRUD contract. New preparation uses immutable `RouteRevisions`, ordered `RouteRevisionStops`, append-only `RouteRevisionSubmissions`, and append-only `RouteTestRuns`. Legacy Route catalog endpoints list/read/mutate only `LEGACY` rows. The new revision API does not copy legacy POIs or certify them.

A revision stores the exact `MapVersionId` and SHA-256, exact POI proposal-revision IDs, and the PASS evidence IDs and fingerprints used for those POIs. Each stop snapshots the navigation-relevant POI data. The database enforces matching map/fingerprint foreign keys. Route configuration fingerprint covers map ID/checksum, start/end poses, ordered POI navigation fingerprints and dwell; POI content-only revision IDs and evidence record IDs are intentionally excluded. This lets a route content-only revision reuse a valid whole-route navigation test while retaining exact content and source-evidence links. A newer FAIL for the same POI navigation fingerprint blocks submit/test; a newer PASS does not invalidate a previously captured PASS record.

Staff saves a new revision to change any configuration. Submission is a separate append-only receipt. Technical Staff can append manual PASS/FAIL evidence only for a submitted revision, after checking that the physical robot's latest deployment record across all maps still points to the revision's exact map and checksum. The shared robot deployment application lock is held through commit, matching map deployment and POI verification. The participating Operator is an explicit, active `STAFF` account distinct from the Technical Staff checker. It is only a named participant for this test record; no Tour assignment or runtime Operator authorization is implemented.

PASS requires all stops reached, localization passed, and safe stop observed. FAIL needs a concrete reason and a failed observation. All outcomes, request hashes, actors, timestamps, robot, map, configuration and measured duration are append-only. The latest test run for the same route navigation fingerprint is the effective result; latest FAIL cannot be hidden by an earlier PASS. An unrelated retained revision/configuration keeps its own outcome.

## Schema and runtime permissions

Database First schema v1.3 retains the v1.2 snapshot and adds `patches/upgrade-v1.2-to-v1.3-route-revisions.sql`. Existing route rows are preserved and default to `LEGACY`. Runtime receives SELECT/INSERT only on revision, stop, submission and test evidence tables via `smart-campus-tour-route-revision-permissions.sql`; no UPDATE/DELETE is granted for immutable evidence. The patch has not been applied to a shared or production database.

## Scope and unresolved items

This slice covers fixed route authoring/revision, submit, human whole-route test evidence, and history only. It does not implement branch variants/requests, scheduling/reservation/READY, Start/End Early, robot commands, project POI YAML import, approval of new narration/audio, frontend, or physical-test execution. Approved content/audio duration is not available from the current versioned POI contract; the API reports `INCOMPLETE_CONTENT_AUDIO_DATA` and dwell subtotal separately rather than claiming a total duration. Branch policy/cutoff, YAML/frame mapping and command transport retain their existing pending status. The feature records human evidence; PASS is not autonomous proof or Tour readiness.

Diagrams requiring a member update: ERD (Route authoring discriminator and four v1.3 evidence tables), route preparation/revision sequence, and Route verification status flow. Diagram redraw/review remains pending; this ADR does not claim diagrams changed.
