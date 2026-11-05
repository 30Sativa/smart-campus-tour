using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>Where a leg goes; <see cref="Stop"/> is null for the end pose.</summary>
internal sealed record TourLegTarget(RouteRevisionStop? Stop, decimal X, decimal Y, decimal Yaw)
{
    public static TourLegTarget To(RouteRevisionStop stop) => new(stop, stop.X, stop.Y, stop.Yaw);
    public static TourLegTarget End(RouteRevision revision) => new(null, revision.EndX!.Value, revision.EndY!.Value, revision.EndYaw!.Value);
}

/// <summary>
/// Starts a new leg of a running Tour: one new LegId, one PENDING GoTo and its event, all committed with the caller's
/// transaction. Nothing is sent; the robot pulls the command (ADR-0042). Start and Next share this.
/// </summary>
internal static class TourLegDispatch
{
    public static void Begin(ITourManagementRepository repository, FleetCommandSettings settings, Tour tour, Guid robotId, MapVersion map,
        TourLegTarget target, Guid actor, DateTimeOffset now)
    {
        var legId = Guid.NewGuid();
        var legKind = target.Stop is null ? RobotLegKinds.ToEnd : RobotLegKinds.ToPoi;
        tour.BeginLeg(legId, legKind, target.Stop?.Id, now);
        var command = RobotCommand.GoTo(robotId, tour.Id, legId, legKind, target.Stop?.Id, map.MapKey, map.FrameId,
            target.X, target.Y, target.Yaw, now, now + settings.AcceptWindow, actor);
        repository.Add(command);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.LegDispatchRequested, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, LegId = legId, LegKind = legKind, CommandId = command.Id,
            TargetStopOrder = target.Stop?.StopOrder, TargetMapKey = map.MapKey, TargetMapFrame = map.FrameId,
            TargetX = target.X, TargetY = target.Y, TargetYaw = target.Yaw, ActorUserId = actor
        });
    }

    /// <summary>Null when the Tour ends at its last POI; otherwise the stop after the current one, or the end pose.</summary>
    public static TourLegTarget? NextTarget(Tour tour, RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops)
    {
        var currentOrder = stops.Single(stop => stop.Id == tour.CurrentRevisionStopId).StopOrder;
        var next = stops.Where(stop => stop.StopOrder > currentOrder).MinBy(stop => stop.StopOrder);
        return next is not null ? TourLegTarget.To(next) : revision.EndMode == "POSE" ? TourLegTarget.End(revision) : null;
    }

    /// <summary>A normal end releases the robot in the same transaction (ADR-0043 D13).</summary>
    public static async Task CompleteAsync(ITourManagementRepository repository, Tour tour, Guid robotId, Guid? actor,
        DateTimeOffset now, CancellationToken ct)
    {
        tour.Complete(now);
        await repository.ReleaseRobotAsync(robotId, tour.Id, ct);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.Completed, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, ActorUserId = actor
        });
    }
}
