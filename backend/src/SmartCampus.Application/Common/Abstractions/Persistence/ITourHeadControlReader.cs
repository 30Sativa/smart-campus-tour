namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>The Tour facts head control needs (ADR-0045), read without locks.</summary>
public sealed record TourHeadControlView(Guid TourId, string State, Guid? OperatorUserId, Guid? AssignedRobotId, string? RobotCode);

public interface ITourHeadControlReader
{
    Task<TourHeadControlView?> GetAsync(Guid tourId, CancellationToken cancellationToken);
}
