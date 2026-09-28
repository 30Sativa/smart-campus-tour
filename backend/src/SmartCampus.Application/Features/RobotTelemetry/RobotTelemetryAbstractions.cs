namespace SmartCampus.Application.Features.RobotTelemetry;

/// <summary>Checks a robot's device credential. Never logs or stores the secret.</summary>
public interface IRobotCredentialVerifier
{
    /// <returns>The robot, or null when the code/secret pair is not valid.</returns>
    Task<RobotIdentity?> VerifyAsync(string robotCode, string secret, CancellationToken cancellationToken);
}

/// <summary>Which robot a Tour shows to its viewers: the one assigned while the Tour is RUNNING.</summary>
public interface ITourRobotResolver
{
    Task<string?> RunningRobotCodeAsync(Guid tourId, CancellationToken cancellationToken);
}

/// <summary>
/// Latest pose per robot, in memory only. SQL never receives every sample
/// (architecture §3.3); a restart starts empty and the UI shows no robot until
/// the next sample.
/// </summary>
public interface IRobotTelemetryStore
{
    /// <summary>Accepts a newer sample or throws <see cref="Common.Exceptions.ConflictException"/> for a duplicate or out-of-order one.</summary>
    RobotPoseState Accept(RobotPoseSample sample, DateTimeOffset receivedAt);

    RobotPoseState? Get(string robotCode);

    IReadOnlyList<RobotPoseState> All();

    /// <summary>Samples accepted after <paramref name="version"/>, for incremental broadcasts.</summary>
    IReadOnlyList<RobotPoseState> ChangedSince(long version);

    long Version { get; }
}
