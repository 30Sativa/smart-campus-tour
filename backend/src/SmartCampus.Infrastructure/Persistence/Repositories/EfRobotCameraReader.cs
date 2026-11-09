using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>Unlocked read for ADR-0052: is the robot active, and is a Tour assigned to it RUNNING.</summary>
public sealed class EfRobotCameraReader(ApplicationDbContext db) : IRobotCameraReader
{
    public Task<RobotCameraFacts?> GetAsync(string robotCode, CancellationToken cancellationToken) =>
        db.Robots.AsNoTracking()
            .Where(robot => robot.RobotCode == robotCode && robot.DeactivatedAt == null)
            .Select(robot => new RobotCameraFacts(robot.RobotCode,
                db.Tours.Any(tour => tour.AssignedRobotId == robot.Id && tour.State == TourRuntime.Running)))
            .SingleOrDefaultAsync(cancellationToken);
}
