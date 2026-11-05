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

    public Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken) =>
        dbContext.Robots.AsNoTracking().AnyAsync(robot => robot.RobotCode == robotCode, cancellationToken);

    public void Add(Robot robot) => dbContext.Robots.Add(robot);

    public void AddAuditLog(AuditLog auditLog) => dbContext.AuditLogs.Add(auditLog);
}
