using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FleetCamera.Queries.GetRobotHeadset;

/// <summary>ADR-0056: the robot's last headset report (battery, adb connection, video), and whether it is still fresh.</summary>
public sealed class GetRobotHeadsetHandler(
    ICameraDemandStore store,
    IRobotCameraReader robots,
    FleetCameraSettings settings,
    TimeProvider clock) : IRequestHandler<GetRobotHeadset, RobotHeadsetStatus>
{
    public async Task<RobotHeadsetStatus> Handle(GetRobotHeadset request, CancellationToken ct)
    {
        var facts = await robots.GetAsync(request.RobotCode, ct) ?? throw new NotFoundException("Không tìm thấy robot.");
        if (store.GetHeadset(facts.RobotCode) is not { } entry)
            return new RobotHeadsetStatus(facts.RobotCode, false, null, null, null, null, null, true);
        bool stale = clock.GetUtcNow() - entry.At > settings.RobotListeningWithin;
        var report = entry.Report;
        return new RobotHeadsetStatus(facts.RobotCode, true, report.Connection, report.BatteryPercent, report.Charging,
            report.Stream, entry.At, stale, report.Screen);
    }
}
