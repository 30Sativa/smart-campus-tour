using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.FleetHead;

namespace SmartCampus.Application.Features.FleetHead;

/// <summary>
/// AUTO head mode (ADR-0045 addendum): when a Tour's robot arrives at a POI, queue one SWEEP. The robot turns PAN left,
/// then right, then back to where it was, at button speed; any Operator button stops it. Best effort: nothing is queued
/// while head control is off, the Tour is MANUAL or the robot is not polling, and the arrival is recorded regardless.
/// </summary>
public sealed class HeadArrivalSweep(IHeadCommandChannel channel, ITourHeadModeStore modes, FleetHeadSettings settings,
    ILogger<HeadArrivalSweep> logger)
{
    public bool Queue(Guid tourId, string robotCode)
    {
        if (!settings.Enabled || modes.GetMode(tourId) != HeadModes.Auto)
            return false;
        if (!channel.IsRobotConnected(robotCode))
        {
            logger.LogInformation("Head sweep skipped at a POI of Tour {TourId}: robot {RobotCode} is not polling Fleet Head.",
                tourId, robotCode);
            return false;
        }
        channel.Enqueue(robotCode, new HeadCommandSpec(HeadCommandKinds.Sweep));
        return true;
    }
}
