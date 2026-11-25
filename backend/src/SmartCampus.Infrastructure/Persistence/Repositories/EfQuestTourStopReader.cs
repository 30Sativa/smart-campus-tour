using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>
/// Unlocked read of the Tour RUNNING on a robot, for the headset MC. Uses the same stop and narration columns as
/// <see cref="EfStudentTourViewReader"/>: a versioned Tour reads its RouteRevisionStops snapshot, an older Tour its
/// RouteStops' POI. The current stop wins; the last arrived one stands in when the current one is not set.
/// </summary>
public sealed class EfQuestTourStopReader(ApplicationDbContext db) : IQuestTourStopReader
{
    public async Task<QuestTourStopFacts?> GetRunningAsync(string robotCode, CancellationToken cancellationToken)
    {
        var tour = await db.Tours.AsNoTracking()
            .Where(t => t.State == TourRuntime.Running && t.AssignedRobot != null
                && t.AssignedRobot.RobotCode == robotCode && t.AssignedRobot.DeactivatedAt == null)
            .OrderByDescending(t => t.StartedAt)
            .Select(t => new
            {
                t.Id,
                t.CurrentStep,
                t.IsHeld,
                t.CurrentStopVisitId,
                RevisionStopId = t.CurrentRevisionStopId ?? t.LastArrivedRevisionStopId,
                RouteStopId = t.CurrentRouteStopId ?? t.LastArrivedRouteStopId,
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (tour is null) return null;

        (Guid Id, int Order, string Name, string? Narration)? stop = null;
        if (tour.RevisionStopId is { } revisionStopId)
        {
            var s = await db.RouteRevisionStops.AsNoTracking()
                .Where(x => x.Id == revisionStopId)
                .Select(x => new { x.Id, x.StopOrder, x.Name, x.NarrationText })
                .SingleOrDefaultAsync(cancellationToken);
            if (s is not null) stop = (s.Id, s.StopOrder, s.Name, s.NarrationText);
        }
        else if (tour.RouteStopId is { } routeStopId)
        {
            var s = await db.RouteStops.AsNoTracking()
                .Where(x => x.Id == routeStopId)
                .Select(x => new { x.Id, x.StopOrder, x.Poi.Name, Narration = x.Poi.NarrationText ?? x.Poi.Description })
                .SingleOrDefaultAsync(cancellationToken);
            if (s is not null) stop = (s.Id, s.StopOrder, s.Name, s.Narration);
        }

        return new QuestTourStopFacts(tour.Id, tour.CurrentStep, tour.IsHeld, tour.CurrentStopVisitId,
            stop?.Id, stop?.Order, stop?.Name, stop?.Narration);
    }
}
