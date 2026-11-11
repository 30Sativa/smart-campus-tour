using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.Application.Features.FleetHead;

/// <summary>
/// AUTO head mode (ADR-0045 addenda): every head behaviour at a POI is configured on the POI itself, in its camera
/// preset (Staff "Camera &amp; tư liệu", FR-49), and copied into the route revision stop. When a Tour's robot arrives,
/// the preset becomes one Fleet Head command: FRONT/LEFT/RIGHT/ANGLE turn to that angle, SWEEP looks left, right and
/// back, NONE leaves the head to the Operator. When the Tour leaves a POI the head turns to the front, so the robot
/// never drives with it turned. Any Operator button wins on the robot. MANUAL Tours skip all of it. Best effort:
/// nothing is queued while head control is off or the robot is not polling, and the arrival or departure is recorded
/// regardless.
/// </summary>
public sealed class HeadAutoMotion(IHeadCommandChannel channel, ITourHeadModeStore modes, FleetHeadSettings settings,
    ILogger<HeadAutoMotion> logger)
{
    /// <summary>The command a POI camera preset asks for at arrival; null for NONE or an unknown older value.</summary>
    public static HeadCommandSpec? ArrivalCommand(string? cameraPreset) => PoiCameraPresets.Parse(cameraPreset) switch
    {
        null or { Kind: PoiCameraPresets.None } => null,
        { Kind: PoiCameraPresets.Sweep } sweep => new HeadCommandSpec(HeadCommandKinds.Sweep, SweepDeg: sweep.SweepDeg),
        var angle => new HeadCommandSpec(HeadCommandKinds.Angle, PanDeg: angle.PanDeg, TiltDeg: angle.TiltDeg)
    };

    public bool QueueArrival(Guid tourId, string robotCode, string? cameraPreset)
    {
        var spec = ArrivalCommand(cameraPreset);
        if (spec is null)
        {
            if (!PoiCameraPresets.IsValid(cameraPreset))
                logger.LogInformation("Head preset at a POI of Tour {TourId} skipped: the stop has no valid camera preset.", tourId);
            return false;
        }
        return QueueIfAuto(tourId, robotCode, spec, "Head preset at a POI");
    }

    /// <summary>The robot leaves a POI for its next leg: bring the head back to the front (stops a sweep still running).</summary>
    public bool QueueDeparture(Guid tourId, string robotCode) =>
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
