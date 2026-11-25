using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IPhysicalRobotRepository
{
    Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksAsync(CancellationToken cancellationToken);
    /// <summary>
    /// SCHEDULED or READY Tours that have not begun running, starting in [<paramref name="from"/>, <paramref name="to"/>), with
    /// their route revision, its map and the robot their active reservation holds. Tours without a revision or a reservation are left out.
    /// </summary>
    Task<IReadOnlyList<UpcomingTourTarget>> ListUpcomingTourTargetsAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken);
    Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken);
    void Add(Robot robot);
    void AddAuditLog(AuditLog auditLog);
}

/// <summary>What the shared robot rule needs to judge an upcoming Tour: its robot, revision and the revision's map with its area.</summary>
public sealed record UpcomingTourTarget(Guid TourId, string TourName, DateTimeOffset ScheduledStartAt, Guid RobotId,
    RouteRevision Revision, MapVersion Map);
