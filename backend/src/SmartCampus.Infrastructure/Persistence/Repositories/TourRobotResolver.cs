using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Features.RobotTelemetry;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>The robot a RUNNING Tour shows its viewers: <c>Tours.AssignedRobotId</c> → <c>Robots.RobotCode</c>.</summary>
public sealed class TourRobotResolver(ApplicationDbContext db) : ITourRobotResolver
{
    public Task<string?> RunningRobotCodeAsync(Guid tourId, CancellationToken cancellationToken) =>
        db.Tours.AsNoTracking()
            .Where(tour => tour.Id == tourId && tour.State == "RUNNING" && tour.AssignedRobot != null)
            .Select(tour => (string?)tour.AssignedRobot!.RobotCode)
            .SingleOrDefaultAsync(cancellationToken);
}

/// <summary>
/// Development without SQL Server: <c>"RobotTelemetry": { "TourRobots": { "&lt;tourId&gt;": "robot_01" } }</c>.
/// </summary>
public sealed class ConfiguredTourRobotResolver(Microsoft.Extensions.Configuration.IConfiguration configuration) : ITourRobotResolver
{
    public Task<string?> RunningRobotCodeAsync(Guid tourId, CancellationToken cancellationToken)
    {
        var code = configuration[$"RobotTelemetry:TourRobots:{tourId}"];
        return Task.FromResult(string.IsNullOrWhiteSpace(code) ? null : code);
    }
}
