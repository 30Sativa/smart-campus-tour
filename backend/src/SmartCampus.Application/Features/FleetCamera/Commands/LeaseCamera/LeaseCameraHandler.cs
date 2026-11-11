using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.StreamRelay;

namespace SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;

/// <summary>
/// ADR-0052: a Staff page keeps a robot's camera on for one lease, and learns whether the robot is listening. ADR-0055:
/// when the relay carries this robot, the answer also holds a relay token, so each renewal renews the token too.
/// </summary>
public sealed class LeaseCameraHandler(
    ICameraDemandStore store,
    IRobotCameraReader robots,
    FleetCameraSettings settings,
    TimeProvider clock,
    StreamEntitlement? stream = null) : IRequestHandler<LeaseCamera, RobotCameraStatus>
{
    public async Task<RobotCameraStatus> Handle(LeaseCamera request, CancellationToken ct)
    {
        var facts = await robots.GetAsync(request.RobotCode, ct) ?? throw new NotFoundException("Không tìm thấy robot.");
        var now = clock.GetUtcNow();
        var leaseUntil = store.ExtendLease(facts.RobotCode, now + settings.Lease);
        var lastPoll = store.GetLastPoll(facts.RobotCode);
        var (wanted, reason) = CameraDemandRules.Decide(facts.HasRunningTour, leaseUntil, now);
        var access = stream is not null && request.StaffUserId is { } staff && stream.StaffMayWatch(facts.RobotCode)
            ? stream.Issue(StreamTokenKinds.Staff, staff)
            : null;
        return new RobotCameraStatus(facts.RobotCode, wanted, reason,
            lastPoll is { } at && now - at <= settings.RobotListeningWithin, lastPoll, leaseUntil, access);
    }
}
