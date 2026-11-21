# ADR-0065: Viewers vote for the next POI (Workflow C), replacing branch requests

- **Status:** Proposed 21/11/2026 by the group after the advisory board's review ("a fixed POI order feels like a
  pre-recorded video"). Needs the repository owner's acceptance and a real Workflow C run on the robot.
- **Related:** ADR-0005 (one leg at a time), ADR-0009 (Review 1 scope, branch part replaced here), ADR-0021 (Viewer
  push), ADR-0023 and its addendum (route test results), ADR-0042/0043 (commands, Tour runtime, D13 release),
  ADR-0061 (one stop per POI), BR-14 (branch requests, replaced here).
- **Supersedes:** the branch-request part of ADR-0009 and BR-14. `BranchRequests` and `TourAllowedBranches` remain in
  the schema as legacy tables with no runtime; nothing reads or writes them. The open question on the branch
  request cutoff is closed.

## Context

The robot still receives one leg at a time (ADR-0005) and `TourAdvance.GoAsync` already accepts any target. Only
`TourLegDispatch.NextTarget`/`After` pick the next stop by `StopOrder`. The Representative branch flow never had a
runtime. The group replaces it with a vote by the invited Viewers at each POI, decided by fixed server rules.

## Business rules

1. **Scope.** A route revision has the flag "Cho Viewer chọn điểm tiếp theo" (`ViewerChoosesNextStop`). When set:
   the route has 3–4 POIs; the first POI (`StopOrder` = 1) is fixed; every dwell is at least 30 s
   (`RouteRuleSettings.MinVoteDwellSeconds`); the end is `POSE` equal to the start pose ("Quay về điểm bắt đầu").
   A route without the flag runs exactly as before.
2. **Choice.** The candidates at each turn are the route's POIs not yet visited (arrived or skipped) and not locked.
   Each POI is visited exactly once; votes only change the order.
3. **Opening.** A ballot opens when the robot ARRIVES at a POI (a new stop visit) and at least 2 candidates remain.
   With exactly 1 candidate no ballot opens; that POI is next (`SINGLE_CANDIDATE`).
4. **Closing.** A ballot closes when the dwell ends (`DwellDeadlineAt`, whether auto-advance is on or off), when the
   Operator leaves early (Next), when the Tour is paused or ended early, or when the server restarts
   (`InterruptByRestart` clears the dwell deadline, so the ballot closes with the votes already stored).
5. **Votes.** Each active roster row (invitation row) has one vote per ballot; a shared-screen row also has one.
   A vote may be changed until the ballot closes. The vote belongs to the roster row, not to the browser session:
   reloading or re-issuing a code neither loses nor adds a vote. Votes of a revoked row are not counted.
6. **Decision.** The server decides by server time: the candidate with the most votes wins. A tie, including no votes
   at all, goes to the candidate with the smallest `StopOrder`. Reasons: `VOTE`, `TIE_DEFAULT`, `NO_VOTES`,
   `LOCKED_FALLBACK`, `SINGLE_CANDIDATE`.
7. **Moving on.** Auto-advance on: it goes to the decided POI. Auto-advance off: the robot waits and the Operator's
   Next goes to the decided POI. The Operator never picks or changes the destination.
8. **Locking a POI.** The Operator of the Tour locks or unlocks a not-yet-visited POI, always with a reason that every
   Viewer sees. Locking during a ballot removes the POI from it and clears the votes for it. If the decided POI is
   locked before the robot leaves, the decision is taken again over the open candidates by rule 6
   (`LOCKED_FALLBACK`). If only locked POIs remain, Next and auto-advance refuse (`ALL_REMAINING_STOPS_LOCKED`) and
   the robot waits: the Operator unlocks one, or uses Skip to drop all remaining POIs and go to the end. On a voting
   route Skip is allowed only in that case.
9. **End.** After the last POI the robot returns to the end (= start). On arrival the Tour is COMPLETED and the robot
   is released as today (ADR-0043 D13).

Out of scope: the Representative branch flow, a separate "hold" button (turning auto-advance off already holds),
a Staff-to-Viewer channel, letting Viewers skip a POI, pick a POI outside the route, or end the Tour.

## Route rules for every new save

- `EndMode` is `LAST_POI`, or `POSE` equal to the start pose. A `POSE` elsewhere is refused with 409
  `ROUTE_END_POSE_NOT_START`. Revisions already saved with a separate end pose stay readable and runnable and are not
  changed; only a new save must choose again.
- With the flag set, `SaveRouteRevision` returns 409 `ROUTE_VOTE_STOP_COUNT` (POIs outside 3–4),
  `ROUTE_VOTE_DWELL_TOO_SHORT` (a dwell under 30 s) or `ROUTE_VOTE_END_MUST_RETURN` (end not the start pose), each
  with a Vietnamese message. The minimum distance rule (`ROUTE_STOP_TOO_CLOSE`) compares every pair of POIs instead
  of only neighbours in `StopOrder`.
- The flag is part of `ConfigurationFingerprint` and of the shared-result path key: switching it changes the path and
  needs a new test run.

## Estimated duration

`TourSchedule.EstimatedDurationSeconds` stays the only formula. On a voting route it takes the longest of all valid
orders (first POI fixed, at most 3! = 6 orders, then the end). Route views, test runs, reservations, the quick Tour
preview and `TourTarget` all call it; the web never computes a second one.

## Test-run coverage

`RouteRunRequest.TraversedStopIds` (the revision stop ids in the order driven) is required on a voting route: it starts
with the first POI and names every POI exactly once. It is stored in `RouteTestRuns.TraversedStopIdsJson`. The legs to
cover are start → first POI, first POI → each other POI, every directed pair among the other POIs, and each POI other
than the first → end: 7 legs for 3 POIs, 13 for 4. The effective result of a voting route (still shared by saves with
the same path): the newest run is FAIL → `FAIL`; the PASS runs since the newest FAIL cover all legs → `PASS`;
otherwise `LEGS_INCOMPLETE`, which can neither create a Tour nor mark one READY. The view returns
`legCoverage { requiredCount, coveredCount, missingLegs[{ fromStopId, fromName, toStopId, toName }] }` (`fromStopId`
null for the start, `toStopId` null for the end).

## Runtime

- A pure `NextStopChooser` takes the stops, the visited set, the locked set and the votes and returns the winner,
  the reason and the counts. The visited set is read from `TourStopVisits`, never inferred from `StopOrder`, so it
  survives a restart. It replaces `NextTarget` on a voting route in Next, AutoAdvance and the first departure from
  `INITIALIZING` (always the first POI). Retry keeps its current target. With no POI left the target is the end.
- Closing the ballot and choosing the target happen in one transaction under the Tour root lock. A
  `NEXT_STOP_CHOSEN` TourEvent records the counts, the winner and the reason; `STOP_LOCKED` / `STOP_UNLOCKED` record
  locks. Auto-advance refused by locks writes `TOUR_AUTO_ADVANCE_BLOCKED` as today.

## Schema v1.25 (Database First)

`smart-campus-tour-schema-v1.25.sql` and `patches/upgrade-v1.24-to-v1.25-viewer-vote.sql` (additive, rerunnable):

- `RouteRevisions.ViewerChoosesNextStop BIT NOT NULL` default 0.
- `RouteTestRuns.TraversedStopIdsJson NVARCHAR(1000) NULL`, `ISJSON` check.
- `TourStopVisits`: one row per POI a voting Tour visited or skipped. `Id` (= the Tour's `CurrentStopVisitId` for an
  arrival, a new id for a skip), `TourId`, `RouteRevisionStopId`, `Outcome` (`ARRIVED`/`SKIPPED`), `OccurredAt`,
  ballot columns `BallotClosesAt` (null when no ballot opened), `BallotClosedAt`, `ChosenRevisionStopId`,
  `ChosenReason`, `ChosenVoteCount`; unique `(TourId, RouteRevisionStopId)` (each POI once).
- `TourStopVotes`: `Id`, `TourId`, `StopVisitId` (FK `TourStopVisits`), `RosterRowId`, `RouteRevisionStopId` (null
  once cleared by a lock), `VotedAt`, `UpdatedAt`; unique `(StopVisitId, RosterRowId)`. Runtime updates the choice
  columns, never deletes.
- `TourStopLocks`: `Id`, `TourId`, `RouteRevisionStopId`, `Reason`, `LockedByUserId`, `LockedAt`, `UnlockedByUserId`,
  `UnlockedAt`, `UnlockReason`; filtered unique `(TourId, RouteRevisionStopId) WHERE UnlockedAt IS NULL`.

## API

- `POST /api/staff/routes/...revisions` input gains `viewerChoosesNextStop`; `RouteRevisionView` and summaries gain
  `viewerChoosesNextStop` and `legCoverage`; `VerificationStatus` may be `LEGS_INCOMPLETE`.
- `POST /api/technical/routes/{routeId}/revisions/{revisionId}/test-runs` gains `traversedStopIds`.
- `PUT /api/student/tours/{tourId}/vote` with `{ stopVisitId, stopId }` and the Viewer session (as Q&A). Accepted only
  while the Tour is RUNNING, observing at a POI, the visit is current, the ballot is open and before
  `DwellDeadlineAt`, for a valid candidate. Otherwise 409 `VOTE_CLOSED` or `VOTE_CANDIDATE_INVALID`. Returns the ballot.
- `GET /api/student/tours/{tourId}/view` gains `ballot` and per-stop progress. `StudentTourStop` gains `stopId` and
  `progress` (`VISITED`, `SKIPPED`, `CURRENT`, `NEXT`, `REMAINING`) and `lockReason`. `ballot`:
  `{ stopVisitId, open, closesAt, candidates[{ stopId, poiId, name, votes }], myVote, locked[{ stopId, name, reason }],
  decision{ stopId, name, reason, votes } | null }`. A null `ballot` means the route does not vote or no POI is current.
- `GET /api/staff/manage/tours/{id}` gains the same `ballot` plus `leadingStopId` and `nextTarget { kind (POI/END),
  stopId, name }` for the Next button label.
- `POST /api/staff/manage/tours/{id}/stops/{stopId}/lock` `{ reason }` and `.../unlock` `{ reason }`: only the
  Tour's Operator, Tour RUNNING, POI not yet visited; 409 `STOP_LOCK_INVALID` otherwise.
- Next and auto-advance on a voting route with only locked POIs left: 409 `ALL_REMAINING_STOPS_LOCKED`. Skip on a
  voting route while an unlocked POI remains: 409 `SKIP_NOT_ALLOWED`.
- Live updates use the existing paths (the Viewer page and the Staff page poll as today); no new transport.

## Consequences

- Tours become less predictable: the reservation uses the longest order, so a Tour can finish early, never late by
  route length.
- Four test runs are needed to cover a 4-POI voting route (two for 3 POIs); the web shows the missing legs.
- Camera head turning on the demo machine needs `FleetHead:Enabled` and `head_enabled` after ADR-0045 is accepted;
  that is configuration, not part of this change.
