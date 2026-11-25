using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.FleetCamera.Commands.PollCameraDemand;

/// <summary>
/// ADR-0052 robot poll: records that the robot listens (and, ADR-0056, its headset) and tells it whether anyone needs
/// its camera now, with a Staff wake/sleep press for the headset if one is waiting (handed out once). While a Tour runs
/// on the robot the answer also carries its current stop and narration, for the MC character in the headset.
/// </summary>
public sealed class PollCameraDemandHandler(
    ICameraDemandStore store,
    IRobotCameraReader robots,
    FleetCameraSettings settings,
    TimeProvider clock,
    IQuestTourStopReader? tourStops = null) : IRequestHandler<PollCameraDemand, CameraDemand>
{
    public async Task<CameraDemand> Handle(PollCameraDemand request, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        store.RecordPoll(request.RobotCode, now);
        if (request.Headset is { } headset) store.RecordHeadset(request.RobotCode, headset, now);
        var facts = await robots.GetAsync(request.RobotCode, ct);
        var (wanted, reason) = CameraDemandRules.Decide(facts?.HasRunningTour ?? false, store.GetLease(request.RobotCode), now);
        var press = store.TakeHeadsetCommand(request.RobotCode, now);
        var tour = facts is { HasRunningTour: true } && tourStops is not null
            ? await tourStops.GetRunningAsync(facts.RobotCode, ct)
            : null;
        return new CameraDemand(wanted, reason, settings.PollSeconds,
            press is null ? null : new HeadsetCommandOrder(press.Id, press.Action),
            tour is null ? null : new QuestTourStop(tour.TourId, tour.Step, tour.IsHeld, tour.VisitId, tour.StopId,
                tour.StopOrder, tour.StopName, tour.NarrationText));
    }
}
