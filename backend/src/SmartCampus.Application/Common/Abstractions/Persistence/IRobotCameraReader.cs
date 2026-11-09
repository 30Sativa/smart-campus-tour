namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>The facts the camera demand of ADR-0052 needs about one active robot, read without locks.</summary>
public sealed record RobotCameraFacts(string RobotCode, bool HasRunningTour);

public interface IRobotCameraReader
{
    /// <summary>Null when no active (not deactivated) robot has this code.</summary>
    Task<RobotCameraFacts?> GetAsync(string robotCode, CancellationToken cancellationToken);
}
