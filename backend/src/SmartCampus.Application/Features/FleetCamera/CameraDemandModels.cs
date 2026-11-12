namespace SmartCampus.Application.Features.FleetCamera;

public static class CameraDemandReasons
{
    /// <summary>A Tour assigned to this robot is RUNNING: students and the Operator watch it.</summary>
    public const string TourRunning = "TOUR_RUNNING";

    /// <summary>A Staff page (start check) holds a lease on this robot's camera.</summary>
    public const string StaffWatching = "STAFF_WATCHING";

    /// <summary>Nobody needs the camera: the robot stops capturing.</summary>
    public const string Idle = "IDLE";
}

/// <summary>
/// Answer to the robot's poll: capture and publish while <see cref="Wanted"/>. <see cref="HeadsetCommand"/> (ADR-0056
/// addendum) is a Staff wake/sleep press for the headset, handed out once, or null.
/// </summary>
public sealed record CameraDemand(bool Wanted, string Reason, int PollSeconds, HeadsetCommandOrder? HeadsetCommand = null);

/// <summary>
/// What a Staff page learns when it renews its lease. <see cref="Stream"/> is the relay URL and token (ADR-0055), null
/// when the relay is not configured or carries another robot.
/// </summary>
public sealed record RobotCameraStatus(
    string RobotCode,
    bool Wanted,
    string Reason,
    bool RobotListening,
    DateTimeOffset? LastPollAt,
    DateTimeOffset? LeaseUntil,
    StreamRelay.StreamAccess? Stream = null);

public static class CameraDemandRules
{
    /// <summary>A running Tour always wins; otherwise a lease that has not ended yet.</summary>
    public static (bool Wanted, string Reason) Decide(bool hasRunningTour, DateTimeOffset? leaseUntil, DateTimeOffset now) =>
        hasRunningTour ? (true, CameraDemandReasons.TourRunning)
        : leaseUntil is { } until && until > now ? (true, CameraDemandReasons.StaffWatching)
        : (false, CameraDemandReasons.Idle);
}
