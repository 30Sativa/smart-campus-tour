namespace SmartCampus.Application.Features.FleetCamera;

/// <summary>The <c>FleetCamera</c> section of ADR-0052.</summary>
public sealed class FleetCameraSettings
{
    public FleetCameraSettings(int leaseSeconds = 120, int pollSeconds = 5, int robotListeningWithinSeconds = 20)
    {
        if (leaseSeconds is < 10 or > 3600)
            throw new InvalidOperationException("FleetCamera:LeaseSeconds must be between 10 and 3600.");
        if (pollSeconds is < 1 or > 60)
            throw new InvalidOperationException("FleetCamera:PollSeconds must be between 1 and 60.");
        if (robotListeningWithinSeconds < pollSeconds)
            throw new InvalidOperationException("FleetCamera:RobotListeningWithinSeconds must not be shorter than PollSeconds.");
        Lease = TimeSpan.FromSeconds(leaseSeconds);
        PollSeconds = pollSeconds;
        RobotListeningWithin = TimeSpan.FromSeconds(robotListeningWithinSeconds);
    }

    /// <summary>How long one Staff renewal keeps the camera on; the start-check page renews well before it ends.</summary>
    public TimeSpan Lease { get; }

    /// <summary>Told to the robot: how often to ask again.</summary>
    public int PollSeconds { get; }

    /// <summary>The robot counts as listening while its last poll is no older than this.</summary>
    public TimeSpan RobotListeningWithin { get; }
}
