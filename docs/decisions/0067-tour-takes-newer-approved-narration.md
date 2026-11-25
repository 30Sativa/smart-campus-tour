# ADR-0067: A Tour still to run can take newer approved narration

- **Status:** Accepted 23/11/2026 by the repository owner ("hướng B": update the narration of a Tour without
  recreating it). Backend and web in one change; no schema change.
- **Related:** ADR-0023 addendum (a run is shared by saves with the same path), ADR-0034 (a Tour runs one tested route
  revision), ADR-0060 (approved narration is snapshotted into the route revision when it is saved).
- **Partially supersedes:** ADR-0034 where it says a scheduled Tour can never move to another revision of its route.
  Its text is unchanged.

## Context

ADR-0060 snapshots each stop's approved narration into `RouteRevisionStops` when a route revision is saved, and a Tour
runs the exact revision it was created on (ADR-0034). So when Staff fixed the wording of a POI after creating a Tour,
the Student page (and the MC in the Quest headset, which reads the same snapshot) kept saying the old text. The only way
out was to save the route again, cancel the Tour and create it again, which revokes the invitations of every
registered group.

## Decision

Before Start (SCHEDULED or READY, no execution state, no operational use, a versioned Tour), Staff may press
**"Cập nhật lời thuyết minh mới"** on the Tour page. `POST /api/staff/manage/tours/{id}/narration/refresh`
(`{requestId, expectedRowVersion}`) then, in one serializable route transaction:

1. locks the Tour and checks its row version and state;
2. compares, for each stop, the narration revision the Tour's route revision snapshotted with the POI's current
   `APPROVED` narration. None newer: 409 `TOUR_NARRATION_UP_TO_DATE`;
3. requires the route's newest revision to have **the Tour's exact path**: same navigation fingerprint (map, start, end,
   POI navigation, order, camera steps, vote flag) and, stop by stop, the same POI revision and dwell. Otherwise 409
   `TOUR_ROUTE_CHANGED`: a different path still needs a new Tour;
4. when that newest revision does not already carry the newest approved narration, saves it again unchanged (the save
   snapshots the newest approved narration, ADR-0060) and submits it, with request ids derived from the Tour request so
   a retry repeats the same writes. Every rule of `SaveRouteRevision` and `SubmitRouteRevision` applies;
5. requires the target to be schedulable (`TourTarget.RequireSchedulableRevisionAsync`): with the same path it keeps
   the applied PASS of the Tour's revision (ADR-0023 addendum);
6. moves `Tours.RouteRevisionId` to the target and writes audit `TOUR_NARRATION_REFRESHED` with the from/to revisions
   and the stops whose text changed.

Any refusal rolls everything back, so no orphan revision is left. The robot hold (its test run and duration), the
registrations, invitations and the Tour state do not change; a READY Tour stays READY. The refresh is not operational
use of the Tour (it writes no `TourEvents` row).

`GET /api/staff/manage/tours/{id}/narration` shows each stop's current and newest approved text and either `canRefresh`
or `blockedCode`/`blockedReason`. `TourPermissions.CanRefreshNarration` is set like `CanChangeOperator`.

The command is an `IRouteMutationCommand` (it may save and submit a route revision) living under `Tours.Commands`, so
the Tour pages are told after commit. It calls the save and submit handlers directly, inside its own transaction,
running the save validator itself. Lock order Tour → route → POIs → map, as READY and `SaveRouteRevision`.

## Consequences

- Fixing wording no longer forces cancelling a Tour and revoking invitations.
- The Student page and the headset MC read the new text as soon as the Tour moves, because both read the Tour's route
  revision.
- A refresh may add a route revision to the history that nobody saved by hand; its audit names the Staff and the Tour.
- A route whose newest revision changed the path blocks the refresh of older Tours on it; Staff keeps the old text or
  recreates the Tour, as before.
- Not covered: a RUNNING Tour (the stop being presented must not change under the viewers), legacy (non-versioned)
  Tours, and choosing an older narration version.
