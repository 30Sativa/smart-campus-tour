# ADR-0066: One rule for "robot ready on a map version"

- **Status:** Accepted 23/11/2026 by the repository owner through the task brief for this change (decisions 1–7 of
  the Technical-area brief). Backend in PR 1 (`feature/claude/be-robot-map-readiness`); web in PR 2 and PR 3. No
  physical robot behaviour was tested by this change.
- **Related:** ADR-0021 (deployment checks), ADR-0028 (map evidence for POI preparation), ADR-0029 (connection
  confirmation), ADR-0032 (robot map assignment), ADR-0039 (usable robots for Tours), ADR-0049 (dispatch switch).
- **Partially supersedes:** the "usable robot" definitions in ADR-0028 and ADR-0039; ADR-0032 for what a map
  assignment gates and what its write path may change; ADR-0049 for when dispatch turns off. Their text is unchanged;
  each carries a note pointing here.

## Context

Two notions said which map a robot belongs to, and nothing tied them together:

- the **map assignment** (`Robots.AssignedMapVersionId`, ADR-0032), used only so Fleet Sync accepts the right
  `mapKey`/`frameId`;
- the robot's **newest deployment check** across all maps (`MapDeploymentChecks`, ADR-0021/0028/0039), used for POI
  verification, POI import, route test runs and Tours.

On 23/11/2026 in the real environment amr_01 held Tầng 6 · test123 · v1 and its bridge still reported `test123-v1`.
Technical Staff could still record a passing deployment check for amr_01 on **Betea**, then pass POIs on Betea.
amr_01 then lost route tests, Tour creation and POI verification on Tầng 6, because its newest check had moved to
Betea. The same holds for a new version of the same area: a robot running map A, a map B uploaded, a PASS recorded on
B without moving the robot, and POIs passed on B.

The rule was written in seven places, each differently:

| Place | Active | Connection confirmed | Assigned to M | Newest check passes on M |
|---|---|---|---|---|
| `RecordMapDeploymentCommand` | yes | yes (PASS) | **no** | (this writes it) |
| `RecordPoiVerificationCommand` (`PoiProposalRules.IsDeployedOn`) | yes | **no** | **no** | yes |
| `ImportPoiFilesCommand`, `PoiImportPlanner` | yes | **no** | **no** | yes |
| `RecordRouteTestRun` (`RouteRobotDeployment.IsCurrent`) | yes | yes | **no** | yes |
| `TourTarget.RobotBlockReason` (create, slots, robot list, READY) | yes | yes | **no** | yes |
| `TourStartPreflight` (`robotMapMatchesRoute`) | yes | yes | yes | yes |
| `SetRobotDispatchCommand.EnsureCanEnableAsync` | yes | (needs a key) | yes | yes, on the assigned map |

Only dispatch had it right; that rule becomes the shared one.

## Decision

1. **A robot is ready on map version M** when, checked in this order:
   1. it is not deactivated (`ROBOT_DEACTIVATED`);
   2. its connection is confirmed, `FirstAcceptedSyncAt` is set (`ROBOT_CONNECTION_UNCONFIRMED`);
   3. `AssignedMapVersionId == M.Id` (`ROBOT_MAP_NOT_ASSIGNED`);
   4. its newest deployment check on any map has `MapVersionId == M.Id`, localization and display passed, was
      recorded at or after the current assignment (`CheckedAt >= MapAssignedAt`; round 5), and has the package SHA-256
      of M (`ROBOT_DEPLOYMENT_CHECK_REQUIRED`).

   `RobotMapReadiness.Evaluate` (`backend/src/SmartCampus.Application/Features/MapPoi/Common/RobotMapReadiness.cs`)
   is the only implementation. Each failure carries a Vietnamese sentence naming the robot and, where relevant, the
   map as "{area} · {area key} · phiên bản {n}". Route test runs and Tours also require the route revision's map
   checksum to equal M's (`EvaluateForRoute`). POI verification and import, route test runs, Tour create, slots, the
   Tour robot list, READY, the Start preflight and enabling dispatch all call it. `PoiProposalRules.IsDeployedOn` and
   `RouteRobotDeployment.IsCurrent` are removed. Outside error codes stay: POI verification `MAP_NOT_DEPLOYED`, Tours
   `ROBOT_NOT_READY_FOR_ROUTE`; the route test run and dispatch return the readiness code itself (the route test run's
   `MAP_NOT_CURRENTLY_DEPLOYED` is gone). The Start preflight keeps its `robotMapMatchesRoute` row as the assignment
   part of the rule.
2. **A deployment check (PASS or FAIL) for robot R on M is recorded only while R holds M**, else 409
   `ROBOT_MAP_NOT_ASSIGNED`. A FAIL is refused too: on another map it would also become R's newest check and take R
   off its real map. Idempotent replays still return the stored check.
3. **A PASS also needs R to be sending data on its assigned map:** a Fleet Sync snapshot in `IFleetTelemetryStore`
   with `ReceivedAt >= now - SyncFreshness` (the robot list's CONNECTED rule, now `FleetSyncFreshness.IsFresh`),
   `ReceivedAt >= MapAssignedAt`, and the assigned `mapKey`. Fleet Sync accepts only the assigned map's key, so this is
   evidence that `fleet_bridge` is configured for that map. Otherwise 409 `ROBOT_NOT_REPORTING`. A FAIL needs no data.
4. **Changing or clearing a robot's map assignment turns dispatch off** (`IsDispatchEnabled = false`) in the same
   transaction, audited as `ROBOT_DISPATCH_CHANGED` with `enabled: false`, reason "Tự tắt vì đổi bản đồ" and
   `automatic: true` (no request id, since it is not a dispatch request). Assigning the version already held changes
   nothing: neither the assignment time nor dispatch.
5. **Recorded results are not edited or re-marked** (POI verifications, route test runs, deployment checks). Data
   already in the real environment is cleaned up by hand.
6. **A new area cannot reuse an existing area's name**, compared after trimming, ignoring case (and Unicode-normalized):
   409 `MAP_AREA_NAME_TAKEN`, "Đã có khu vực tên {tên} ({mã}). Chọn Khu vực đã có hoặc đặt tên khác." A new version of
   an existing area is unaffected; duplicates that already exist stay, and the web always shows the area key when names
   collide.
7. The Technical menu and URLs change in PR 3; old URLs redirect.

**Unchanged:** a map usable for POI preparation is still the historical rule of ADR-0028; one area holds at most one
robot (`MAP_AREA_ALREADY_ASSIGNED`); a map can still be assigned before it has passed a check (ADR-0032).

## Concurrency and permissions

- The map assignment writer now also takes the `map-poi:robot-deployment:{robotId}` application lock, after the area
  and map-preparation locks and before it reads the robot row. Deployment checks, POI verification, import, route test
  runs, Tour create, READY and Start take that lock after the map-preparation lock too, so the order is consistent.
  Behind the lock each writer reads the robot again, so a check on the old map either commits before the move or sees
  the new assignment and is refused.
- New areas take one more application lock, `map-poi:new-area-names`, after the area key lock, so two uploads cannot
  claim one name.
- **No SQL grant changes.** The API runtime role already has column-level `UPDATE` on the assignment columns (ADR-0032)
  and on `IsDispatchEnabled` (ADR-0049) in `backend/database/smart-campus-tour-runtime-permissions.sql`. ADR-0032's
  "the assignment path updates only its columns" was a code rule, not a separate role; the assignment path now also
  writes `IsDispatchEnabled`, which ADR-0049 already allows. `DeploymentDatabaseTests` asserts this combined update.
  No schema version change.

## Read contract (for the web)

Additive JSON fields, recorded in `docs/architecture.md` §3.4.6:

- `GET` physical robots: each item adds `readiness` =
  `{ state: READY | NOT_READY | NOT_SET_UP, reasonCode, reason, mapVersionId, mapLabel, deploymentCheckedAt,
  reportingOnAssignedMap }`. `NOT_SET_UP` = not deactivated and no assigned map or no confirmed connection.
  `reportingOnAssignedMap` is decision 3, shown for information, not a READY condition.
- Map version list and detail add `runningRobot` = the active robot holding that version with its `readiness`, or
  null. `currentlyDeployedOn` stays for compatibility; the web no longer uses it for the running-robot column.
- POI import preview adds `robotReadiness` = `{ ready, code, message }`. When the robot is not ready on the chosen
  map, files that ask for PASS are imported without a verification record and wait in the verification queue (before,
  such a file failed the whole import with `MAP_NOT_DEPLOYED`). A preview or import file's `verified` is now what is,
  or will be, recorded.

## Consequences

- After deploy, a robot whose newest check is on another map than the one it holds (amr_01 on 23/11) shows
  "Chưa sẵn sàng" and is refused for POI verification, route tests and Tours until a deployment check is recorded on
  its assigned map. Its dispatch switch stays as it is until its assignment changes. This is the intended behaviour.
- Recording a check now follows the order: assign the map, configure MiniPC `fleet_bridge` with its MapKey/FrameId,
  wait for a report, then record the check. The web moves the check into the robot setup dialog (PR 2).
- POIs already passed on a map the robot did not hold remain PASS (decision 5); Staff may make a new POI revision and
  have it checked again.
- **Blocked Tours show up early (round 2, 23/11/2026).** Because one rule decides READY and Start, the Technical
  dashboard can ask it ahead of time: `GET /api/technical/dashboard` adds a `TOUR_ROBOT_NOT_READY` warning for each robot
  whose SCHEDULED or READY Tours (not yet running, starting within seven days) it could not run, by
  `TourTarget.RobotBlockReason` with the Tour's route revision. Several Tours of one robot make one item. The bell shows it
  like the other items. It is a read: nothing is cancelled or changed (`docs/architecture.md`, Technical dashboard).
- **The reason says what to do next, and a wrong map is named (round 3, 23/11/2026).** On amr_01 the reason "Lần kiểm
  tra triển khai mới nhất … là trên Betea" was true but did not say what to do, and the robot list said "Mất kết nối"
  while the MiniPC was still sending `test123-v1` after the move to tang-6. The rule and its order are unchanged.
  `readiness` adds `nextStep` (`ASSIGN_MAP`, `CONFIRM_CONNECTION`, `CONFIGURE_MINIPC`, `DEPLOYMENT_CHECK`, or null when
  READY), display only; the main sentence becomes "Robot {code} chưa kiểm tra triển khai trên {M} (gán lúc {dd/MM
  HH:mm})." and is what 409s say, while the history sentence moves to `detail`. Fleet Sync remembers in memory the
  robot's newest report refused with `MAP_CONTEXT_MISMATCH`; while it is fresh by `SyncFreshness` and newer than the
  newest accepted report, the connection is `WRONG_MAP` with `lastRejectedReport` instead of `DISCONNECTED`. No schema,
  grant or Fleet Sync wire change (`docs/architecture.md` §3.4.6).
- **A check counts only for the current assignment (round 5, 27/11/2026).** amr_01 had a PASS on Betea on 23/11, was
  assigned Tầng 6 · tang-6, then Betea again on 26/11, and showed READY with no check since: the 23/11 PASS was still its
  newest check on any map, because nobody checked it on tang-6. The same happened for v2 then v1 of one area. Decision 3
  already required a PASS to rest on data received after the assignment; decision 1.4 now requires the same of the check
  it reads. A PASS on M recorded before `MapAssignedAt` gives `ROBOT_DEPLOYMENT_CHECK_REQUIRED` with the usual sentence
  and the detail "Lần kiểm tra đạt gần nhất trên {M} lúc {dd/MM HH:mm} có trước lần gán lúc {dd/MM HH:mm}, cần kiểm
  lại."; `readiness.deploymentCheckedAt` is null for it. A null `MapAssignedAt` (older rows) keeps the earlier rule.
  Saving the version already held does not change `MapAssignedAt` (decision 4), so it never undoes readiness. After
  deploy, amr_01 is "Chưa sẵn sàng" until Technical Staff record a new check on Betea; its dispatch switch stays as it is,
  as above.
- **No map, activation or key change while the robot runs a Tour (round 5, 27/11/2026).** Changing or clearing the
  assignment stops dispatch (decision 4), and `PollRobotCommand` needs dispatch, so a RUNNING Tour stalled with no reason
  shown; deactivating and rotating the key cut the MiniPC off. When `Robots.CurrentTourId` names a RUNNING Tour, changing
  or clearing the map (assigning the version already held is not a change), deactivating and rotating the key return 409
  `ROBOT_IN_RUNNING_TOUR`: "Robot {code} đang chạy Tour {tên}. Kết thúc Tour (hoặc kết thúc sớm) rồi mới {đổi bản đồ /
  ngừng sử dụng / đổi khóa}.", with one `blockers` item `{ code: "TOUR", message: tên }`. It is read behind the
  `map-poi:robot-deployment:{robotId}` lock (and, for deactivation, `tour-robot-reservation:{robotId}` after it), which
  Start holds while it claims the robot; rotation from the web now takes the deployment lock too. The CLI provisioner
  (`campus_fleet_provisioner`, column-scoped, no access to `Tours`) is not checked: it is run on the machine on purpose. A robot held for inspection after its
  Tour ended is not running. Stopping dispatch, revoking the key, releasing an inspection and recording a deployment check
  are never refused (ADR-0049: the safer choice is always available).
- Deploy PR 1 together with PR 2 and PR 3: the web before PR 2 still offers the old free-form check, which the backend
  now refuses for an unassigned robot.
