namespace SmartCampus.Application.Features.FleetHead;

/// <summary>
/// The <c>FleetHead</c> section of ADR-0045. <see cref="Enabled"/> (off by default) gates the Operator's head commands;
/// the robot poll always answers so a robot can stay connected while the feature is off.
/// </summary>
public sealed class FleetHeadSettings
{
    public const int MaximumQueuedPerRobot = 32;

    public FleetHeadSettings(bool enabled = false, int maxCommandAgeMs = 1000, int jogTtlMs = 600, int maxWaitMs = 1500,
        int robotConnectedWithinMs = 3000, string defaultMode = HeadModes.Auto)
    {
        if (!HeadModes.All.Contains(defaultMode))
            throw new InvalidOperationException("FleetHead:DefaultMode must be AUTO or MANUAL.");
        if (maxCommandAgeMs <= 0)
            throw new InvalidOperationException("FleetHead:MaxCommandAgeMs must be positive.");
        if (jogTtlMs <= 0)
            throw new InvalidOperationException("FleetHead:JogTtlMs must be positive.");
        if (maxWaitMs < 0 || maxWaitMs > 10_000)
            throw new InvalidOperationException("FleetHead:MaxWaitMs must be between 0 and 10000.");
        if (robotConnectedWithinMs <= 0)
            throw new InvalidOperationException("FleetHead:RobotConnectedWithinMs must be positive.");
        Enabled = enabled;
        MaxCommandAge = TimeSpan.FromMilliseconds(maxCommandAgeMs);
        JogTtl = TimeSpan.FromMilliseconds(jogTtlMs);
        MaxWait = TimeSpan.FromMilliseconds(maxWaitMs);
        RobotConnectedWithin = TimeSpan.FromMilliseconds(robotConnectedWithinMs);
        DefaultMode = defaultMode;
    }

    public bool Enabled { get; }
    /// <summary>A command older than this is never delivered: a reconnecting robot must not replay old button presses.</summary>
    public TimeSpan MaxCommandAge { get; }
    /// <summary>A JOG keeps the head turning only this long after the robot received it (deadman over the network).</summary>
    public TimeSpan JogTtl { get; }
    /// <summary>Longest time a robot poll is held open waiting for a new command.</summary>
    public TimeSpan MaxWait { get; }
    /// <summary>The robot counts as listening while a poll is open or ended no longer ago than this.</summary>
    public TimeSpan RobotConnectedWithin { get; }
    /// <summary>Head mode of a Tour whose Operator has not chosen one (in memory, so also after an API restart).</summary>
    public string DefaultMode { get; }
}
