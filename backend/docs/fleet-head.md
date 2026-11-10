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

## Automatic sweep (ADR-0045 addendum)

`ReportCommandResultCommandHandler` calls `HeadArrivalSweep.Queue` when the current leg's GoTo to a POI is recorded
`ARRIVED`. In `AUTO` mode, with head control on and the robot polling, it queues one `SWEEP`; otherwise nothing.
`NextTourStopCommandHandler` calls `HeadArrivalSweep.QueueRecenter` when it starts the next leg: in `AUTO` mode it
queues `ANGLE 0/0`, which also stops a sweep still running, so the robot never drives with the head turned. Both run
inside the handler, before the commit, and never fail it. An `AUTO` Tour while `FleetHead:Enabled` is false logs
`... skipped ... Fleet Head is disabled` at each arrival and departure, so a head that never moves is explained. Code: `Features/FleetHead/HeadArrivalSweep.cs`,
`Commands/SetTourHeadMode/`, `Common/Abstractions/FleetHead/ITourHeadModeStore.cs`,
`Integrations/FleetHead/InMemoryTourHeadModeStore.cs`.

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
`HeadAutoMode_AnArrivalAtAPoi_QueuesOneSweep_AndManualModeDoesNot` and
`HeadAutoMode_LeavingAPoi_BringsTheHeadBackToTheFront` (SQL Server).
