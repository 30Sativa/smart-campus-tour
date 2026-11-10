using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.FleetHead;

namespace SmartCampus.Application.Features.FleetHead;

/// <summary>
/// AUTO head mode (ADR-0045 addendum): when a Tour's robot arrives at a POI, queue one SWEEP. The robot turns PAN left,
/// then right, then back to where it was, at button speed; any Operator button stops it. When the Operator sends the
/// robot on to the next stop, queue ANGLE 0/0 so it never drives with the head still turned sideways or backwards.
/// Best effort: nothing is queued while head control is off, the Tour is MANUAL or the robot is not polling, and the
/// arrival or departure is recorded regardless.
/// </summary>
public sealed class HeadArrivalSweep(IHeadCommandChannel channel, ITourHeadModeStore modes, FleetHeadSettings settings,
    ILogger<HeadArrivalSweep> logger)
{
    public bool Queue(Guid tourId, string robotCode) =>
        QueueIfAuto(tourId, robotCode, new HeadCommandSpec(HeadCommandKinds.Sweep), "Head sweep at a POI");

    /// <summary>The robot leaves a POI for its next leg: bring the head back to the front (stops a sweep still running).</summary>
    public bool QueueRecenter(Guid tourId, string robotCode) =>
        QueueIfAuto(tourId, robotCode, new HeadCommandSpec(HeadCommandKinds.Angle, PanDeg: 0, TiltDeg: 0),
            "Head recenter on departure");

    private bool QueueIfAuto(Guid tourId, string robotCode, HeadCommandSpec spec, string what)
    {
        if (modes.GetMode(tourId) != HeadModes.Auto)
            return false;
        if (!settings.Enabled)
        {
            // Off by default: say so, otherwise an AUTO Tour whose head never moves looks like a bug.
            logger.LogInformation("{What} skipped for Tour {TourId}: Fleet Head is disabled (FleetHead:Enabled=false).",
                what, tourId);
            return false;
        }
        if (!channel.IsRobotConnected(robotCode))
        {
            logger.LogInformation("{What} skipped for Tour {TourId}: robot {RobotCode} is not polling Fleet Head.",
                what, tourId, robotCode);
            return false;
        }
        channel.Enqueue(robotCode, spec);
        return true;
    }
}
