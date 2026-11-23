using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfPhysicalRobotRepository(ApplicationDbContext dbContext) : IPhysicalRobotRepository
{
    public async Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken) =>
        await dbContext.Robots.AsNoTracking()
            .Where(robot => robot.SourceType == "PHYSICAL")
            .Include(robot => robot.CredentialIssuedByUser)
            .Include(robot => robot.CredentialRevokedByUser)
            .Include(robot => robot.AssignedMapVersion).ThenInclude(map => map!.AreaKeyNavigation)
            .Include(robot => robot.MapAssignedByUser)
            .Include(robot => robot.CurrentTour)
            .OrderBy(robot => robot.DisplayName).ThenBy(robot => robot.RobotCode)
            .ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksAsync(CancellationToken cancellationToken) =>
        await LatestPhysicalRobotDeploymentChecks.Query(dbContext).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<UpcomingTourTarget>> ListUpcomingTourTargetsAsync(DateTimeOffset from, DateTimeOffset to,
        CancellationToken cancellationToken)
    {
        var tours = await dbContext.Tours.AsNoTracking()
            .Where(tour => (tour.State == "SCHEDULED" || tour.State == "READY") && tour.OperationalStatus == null && tour.StartedAt == null &&
                tour.RouteRevisionId != null && tour.ScheduledStartAt >= from && tour.ScheduledStartAt < to)
            .Select(tour => new
            {
                tour.Id, tour.Name, tour.ScheduledStartAt,
                RobotId = tour.TourRobotReservations.Where(reservation => reservation.ReleasedAt == null)
                    .Select(reservation => (Guid?)reservation.RobotId).FirstOrDefault(),
                Revision = new RouteRevision
                {
                    Id = tour.RouteRevision!.Id, RouteId = tour.RouteRevision.RouteId,
                    MapVersionId = tour.RouteRevision.MapVersionId, MapPackageSha256 = tour.RouteRevision.MapPackageSha256
                }
            })
            .ToArrayAsync(cancellationToken);
        var mapIds = tours.Select(tour => tour.Revision.MapVersionId).Distinct().ToArray();
        // The package bytes are not needed for the rule, only its checksum.
        var maps = await dbContext.MapVersions.AsNoTracking().Where(map => mapIds.Contains(map.Id))
            .Select(map => new MapVersion
            {
                Id = map.Id, AreaKey = map.AreaKey, VersionNumber = map.VersionNumber, MapKey = map.MapKey, FrameId = map.FrameId,
                PackageSha256 = map.PackageSha256,
                AreaKeyNavigation = new MapArea { AreaKey = map.AreaKeyNavigation.AreaKey, DisplayName = map.AreaKeyNavigation.DisplayName }
            })
            .ToDictionaryAsync(map => map.Id, cancellationToken);
        return tours.Where(tour => tour.RobotId is not null && maps.ContainsKey(tour.Revision.MapVersionId))
            .OrderBy(tour => tour.ScheduledStartAt).ThenBy(tour => tour.Id)
            .Select(tour => new UpcomingTourTarget(tour.Id, tour.Name, tour.ScheduledStartAt, tour.RobotId!.Value, tour.Revision,
                maps[tour.Revision.MapVersionId]))
            .ToArray();
    }

    public Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken) =>
        dbContext.Robots.AsNoTracking().AnyAsync(robot => robot.RobotCode == robotCode, cancellationToken);

    public void Add(Robot robot) => dbContext.Robots.Add(robot);

    public void AddAuditLog(AuditLog auditLog) => dbContext.AuditLogs.Add(auditLog);
}
