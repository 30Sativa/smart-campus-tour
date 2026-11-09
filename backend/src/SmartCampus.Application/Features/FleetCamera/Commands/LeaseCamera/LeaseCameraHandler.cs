using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;

/// <summary>ADR-0052: a Staff page keeps a robot's camera on for one lease, and learns whether the robot is listening.</summary>
public sealed class LeaseCameraHandler(
    ICameraDemandStore store,
    IRobotCameraReader robots,
    FleetCameraSettings settings,
    TimeProvider clock) : IRequestHandler<LeaseCamera, RobotCameraStatus>
{
    public async Task<RobotCameraStatus> Handle(LeaseCamera request, CancellationToken ct)
    {
        var facts = await robots.GetAsync(request.RobotCode, ct) ?? throw new NotFoundException("Không tìm thấy robot.");
        var now = clock.GetUtcNow();
        var leaseUntil = store.ExtendLease(facts.RobotCode, now + settings.Lease);
        var lastPoll = store.GetLastPoll(facts.RobotCode);
        var (wanted, reason) = CameraDemandRules.Decide(facts.HasRunningTour, leaseUntil, now);
        return new RobotCameraStatus(facts.RobotCode, wanted, reason,
            lastPoll is { } at && now - at <= settings.RobotListeningWithin, lastPoll, leaseUntil);
    }
}
