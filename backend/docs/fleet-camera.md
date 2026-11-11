# Fleet Camera v1 (backend)

Quest camera on demand (ADR-0052). The camera of a robot is wanted while a Tour assigned to it is `RUNNING` or a
Staff lease has not expired.

| Endpoint | Who |
|---|---|
| `POST /api/staff/manage/robots/{robotCode}/camera-lease` | Staff. Renewed every 30 s by the pre-start check page. |
| `POST /api/fleet/camera/v1/poll` | The robot's `quest-stream` (Fleet Robot scheme), every `pollSeconds`. |

## Code

| Layer | Files |
|---|---|
| Application | `Features/FleetCamera/` (settings, `CameraDemandRules`, `PollCameraDemand`, `LeaseCamera`), `Common/Abstractions/FleetCamera/ICameraDemandStore.cs`, `Common/Abstractions/Persistence/IRobotCameraReader.cs` |
| Infrastructure | `Integrations/FleetCamera/InMemoryCameraDemandStore.cs` (singleton), `Persistence/Repositories/EfRobotCameraReader.cs` |
| Api | `Controllers/FleetCameraController.cs`, `Controllers/StaffRobotCameraController.cs` |

Both requests are plain `IRequest`, not `ICommand`: no `UnitOfWorkBehavior`, no SQL write. Each costs one unlocked
`Robots`/`Tours` read.

## Configuration

| Key | Default | |
|---|---|---|
| `FleetCamera:LeaseSeconds` | 120 | One renewal keeps the camera on this long. |
| `FleetCamera:PollSeconds` | 5 | Told to the robot. |
| `FleetCamera:RobotListeningWithinSeconds` | 20 | `robotListening` in the lease answer. |

## Tests

`tests/SmartCampus.UnitTests/FleetCameraTests.cs` (rules, poll, lease, validator, settings),
`tests/SmartCampus.IntegrationTests/CameraDemandStoreTests.cs` (in-memory store).
