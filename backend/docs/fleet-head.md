# Fleet Head v1 (backend)

Operator head buttons (ADR-0045, **proposed**, `FleetHead:Enabled = false` by default). Wire format:
[`docs/contracts/fleet-head/v1/`](../../docs/contracts/fleet-head/v1/README.md).

| Endpoint | Who |
|---|---|
| `POST /api/staff/manage/tours/{id}/head-commands` | The Tour's Operator, Tour `RUNNING`, robot polling. |
| `PUT /api/staff/manage/tours/{id}/head-mode` | The Tour's Operator, until the Tour ends: `AUTO` or `MANUAL`. |
| `GET /api/staff/manage/tours/{id}/head` | Any Staff. |
| `POST /api/fleet/head/v1/poll` | The robot (Fleet Sync scheme), long poll. |

## Code

| Layer | Files |
|---|---|
| Application | `Features/FleetHead/` (settings, models, `SendHeadCommand`, `PollHeadCommands`, `GetTourHeadStatus`), `Common/Abstractions/FleetHead/IHeadCommandChannel.cs`, `Common/Abstractions/Persistence/ITourHeadControlReader.cs` |
| Infrastructure | `Integrations/FleetHead/InMemoryHeadCommandChannel.cs` (singleton), `Persistence/Repositories/EfTourHeadControlReader.cs` |
| Api | `Controllers/FleetHeadController.cs`, two actions in `StaffToursController`, rate-limit policy `FleetHead` in `Program.cs` |

Both commands are plain `IRequest`, not `ICommand`: a button press never reaches `UnitOfWorkBehavior` or SQL.
Each press costs one unlocked `Tours`/`Robots` read.

## Configuration

| Key | Default | |
|---|---|---|
| `FleetHead:Enabled` | `false` | Gates `head-commands`; the robot poll always answers. |
| `FleetHead:MaxCommandAgeMs` | 1000 | Older commands are never delivered. |
| `FleetHead:JogTtlMs` | 600 | Deadman sent with each JOG; the web repeats JOG about every 200 ms while held. |
| `FleetHead:MaxWaitMs` | 1500 | Longest long-poll hold. Keep it below any reverse-proxy read timeout. |
| `FleetHead:RobotConnectedWithinMs` | 3000 | `HEAD_ROBOT_NOT_CONNECTED` after this long without a poll. |
| `FleetHead:DefaultMode` | `AUTO` | Head mode of a Tour nobody set (and of every Tour after an API restart). |
| `FleetHead:RateLimit:PermitLimit` / `WindowSeconds` | 1200 / 60 | Per client IP, separate from `FleetSync`. |

Environment form: `FleetHead__Enabled=true`.

## HOME before Start

`HOME` ("Tự canh chỉnh đầu camera" on the Staff start-check page and the live head panel) re-aligns the head against its
stops. `SendHeadCommandHandler` accepts it for a `READY` Tour, queued to `TourHeadControlView.ReservedRobotCode` (the
active `TourRobotReservations` row), as well as for a `RUNNING` Tour; every other kind still needs `RUNNING`.
`GetTourHeadStatus` reports the held robot while `READY` so the page can show connection and `HOMING`.

## Head behaviour at POIs (ADR-0045 addendum 14/11/2026: the robot decides)

Everything the VR camera head does at a POI is set on the POI, in Staff "Camera & tư liệu", as its camera preset
(`PoiCameraPresets`: `FRONT`, `LEFT`, `RIGHT`, `NONE`, `SWEEP[:deg]`, `ANGLE:pan,tilt`). The route revision stop keeps
a copy.

The backend no longer queues a head command at arrival or departure. The robot (`fleet_bridge`, `head_poi_auto`)
reads `GET /api/fleet/head/v1/pois` every few seconds and watches the Nav2 `navigate_to_pose` goal status itself: a
goal that starts executing turns the head to the front, a goal that succeeds within `head_poi_radius_m` of a POI does
that POI's preset. This works for any goal sender, so it does not wait for Fleet Commands dispatch (off until M2.3).

`GetRobotHeadPoisQuery` answers, for the robot's code:

| `source` | `pois` |
|---|---|
| `TOUR` | The stops of its `RUNNING` Tour's route revision, in order, with their frozen presets. |
| `MAP` | No running Tour: the latest PASS revision of every non-discarded POI on `Robots.AssignedMapVersionId`. |
| `NONE` | Unknown or deactivated robot, or no map assigned: empty. |

`autoMotion` is `FleetHead:Enabled && mode == AUTO`, where `mode` is the running Tour's head mode, or
`FleetHead:DefaultMode` without one. MANUAL therefore still switches the POI presets off within one refresh. An older
unknown preset is sent as `NONE`. Code: `Queries/GetRobotHeadPois/`, `Common/Abstractions/Persistence/IRobotHeadPoiReader.cs`,
`Persistence/Repositories/EfRobotHeadPoiReader.cs`, `Features/MapPoi/Common/PoiCameraPresets.cs`,
`Commands/SetTourHeadMode/`, `Integrations/FleetHead/InMemoryTourHeadModeStore.cs`.

## Limits

- In memory per API instance (ADR-0019 single instance). An API restart changes the epoch; queued presses are gone.
- Only a `RUNNING` Tour enables control, so a physical robot cannot be turned from the web before a Tour can start
  on it. Bench tests use `ros2 run stm32_bridge head_teleop`.
- No per-press audit. `ANGLE` is refused outside the firmware soft limits (pan ±170°, tilt ±18°) so the Operator
  sees the error; STEP/JOG stop at those limits on the robot.
- The mode is not persisted: after an API restart every Tour is `FleetHead:DefaultMode` again (an Operator's
  `MANUAL` is lost).

## Tests

`tests/SmartCampus.UnitTests/FleetHeadTests.cs` (validation, Operator/RUNNING/listening rules),
`tests/SmartCampus.IntegrationTests/FleetHeadChannelTests.cs` (long poll, expiry, epoch, queue bound; no database),
`FleetCommandsHttpTests.HeadControl_TheOperatorOfARunningTour_TurnsTheHead_ThroughTheRobotsLongPoll`,
`HeadAutoMode_AnArrivalAtAPoi_DoesWhatItsCameraPresetSays_AndManualModeDoesNot` and
`HeadAutoMode_LeavingAPoi_BringsTheHeadBackToTheFront` (SQL Server).
