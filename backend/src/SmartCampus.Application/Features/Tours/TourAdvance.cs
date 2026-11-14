using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>
/// Leaves where a running Tour stands (the start, a POI, or a stopped leg) for <c>target</c>: closes an open visit once,
/// then begins the leg, or completes the Tour when there is no target (a route that ends at its last POI). Next, the
/// departure from the start, Skip and the automatic advance share it; each caller has checked its own preconditions and
/// the movement checks first, under the Tour root lock.
/// </summary>
internal static class TourAdvance
{
    public static async Task GoAsync(ITourManagementRepository repository, FleetCommandSettings settings, HeadAutoMotion headMotion,
        Tour tour, Robot? robot, MapVersion map, TourLegTarget? target, Guid? actor, DateTimeOffset now, CancellationToken ct)
    {
        var robotId = tour.AssignedRobotId!.Value;
        if (tour.CurrentStep == TourRuntime.Observing && tour.StopVisitClosedAt is null)
        {
            tour.CloseVisit(now);
            repository.AddEvent(new TourEvent
            {
                TourId = tour.Id, EventType = TourLifecycleEvents.VisitClosed, OccurredAt = now, RobotId = robotId,
                RouteId = tour.ActiveRouteId, StopVisitId = tour.CurrentStopVisitId, ActorUserId = actor
            });
        }
        if (target is null)
        {
            await TourLegDispatch.CompleteAsync(repository, tour, robotId, actor, now, ct);
            return;
        }
        if (tour.OperationalStatus != TourRuntime.Normal) tour.ClearAssistance(now);
        TourLegDispatch.Begin(repository, settings, tour, robotId, map, target, actor, now);
        // Queued before the commit, like the arrival sweep: a failed commit at worst turns the head to the front.
        headMotion.QueueDeparture(tour.Id, robot!.RobotCode);
    }
}
