using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

internal static class LatestPhysicalRobotDeploymentChecks
{
    public static IQueryable<MapDeploymentCheck> Query(ApplicationDbContext dbContext)
    {
        var latestCheckIds = dbContext.Robots.AsNoTracking()
            .Where(robot => robot.SourceType == "PHYSICAL")
            .Select(robot => dbContext.MapDeploymentChecks.AsNoTracking()
                .Where(check => check.RobotId == robot.Id)
                .OrderByDescending(check => check.CheckedAt)
                .ThenByDescending(check => check.Id)
                .Select(check => check.Id)
                .FirstOrDefault());

        return dbContext.MapDeploymentChecks.AsNoTracking()
            .Where(check => latestCheckIds.Contains(check.Id))
            .Include(check => check.Robot)
            .Include(check => check.MapVersion);
    }
}
