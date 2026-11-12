using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.FleetCamera.Commands.PollCameraDemand;

/// <summary>
/// ADR-0052 robot poll: records that the robot listens (and, ADR-0056, its headset) and tells it whether anyone needs
/// its camera now.
/// </summary>
public sealed class PollCameraDemandHandler(
    ICameraDemandStore store,
    IRobotCameraReader robots,
    FleetCameraSettings settings,
    TimeProvider clock) : IRequestHandler<PollCameraDemand, CameraDemand>
{
    public async Task<CameraDemand> Handle(PollCameraDemand request, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        store.RecordPoll(request.RobotCode, now);
        if (request.Headset is { } headset) store.RecordHeadset(request.RobotCode, headset, now);
        var facts = await robots.GetAsync(request.RobotCode, ct);
        var (wanted, reason) = CameraDemandRules.Decide(facts?.HasRunningTour ?? false, store.GetLease(request.RobotCode), now);
        return new CameraDemand(wanted, reason, settings.PollSeconds);
    }
}
