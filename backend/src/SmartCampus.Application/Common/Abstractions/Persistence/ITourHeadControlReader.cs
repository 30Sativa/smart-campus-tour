namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// The Tour facts head control needs (ADR-0045), read without locks. <see cref="RobotCode"/> is the robot assigned at
/// Start; <see cref="ReservedRobotCode"/> is the robot a READY Tour holds, so the head can be homed before Start.
/// <see cref="CurrentStep"/> is the RUNNING Tour's step (NAVIGATING, OBSERVING, ...): the head turns only at a POI.
/// </summary>
public sealed record TourHeadControlView(Guid TourId, string State, Guid? OperatorUserId, Guid? AssignedRobotId, string? RobotCode,
    string? ReservedRobotCode = null, string? CurrentStep = null)
{
    /// <summary>The robot whose head this Tour may turn now: the assigned one, or the reserved one while READY.</summary>
    public string? HeadRobotCode => !string.IsNullOrEmpty(RobotCode) ? RobotCode : State == "READY" ? ReservedRobotCode : null;
}

public interface ITourHeadControlReader
{
    Task<TourHeadControlView?> GetAsync(Guid tourId, CancellationToken cancellationToken);
}
