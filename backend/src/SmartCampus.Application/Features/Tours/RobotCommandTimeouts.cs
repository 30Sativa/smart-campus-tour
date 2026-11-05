using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>What the clock or the telemetry stream says must happen to an open command; null for nothing yet.</summary>
public sealed record RobotCommandTimeout(string State, string Reason);

/// <summary>The sweeper rules of ADR-0042 §3, on server time. Poll applies the same stream rule.</summary>
public static class RobotCommandTimeouts
{
    public const string StreamChanged = "STREAM_CHANGED";

    /// <param name="currentStream">The robot's current Fleet Sync stream; null when this process has no telemetry, which proves nothing.</param>
    public static RobotCommandTimeout? Decide(RobotCommand command, Guid? currentStream, DateTimeOffset now, FleetCommandSettings settings)
    {
        var isGoTo = command.Kind == RobotCommandKinds.GoTo;
        if (command.State == RobotCommandStates.Pending)
            return isGoTo && now > command.AcceptBy ? new(RobotCommandStates.Expired, "EXPIRED") : null;
        if (command.State is not (RobotCommandStates.Delivered or RobotCommandStates.Accepted))
            return null;
        // ADR-0042: an accepted Cancel has nothing left to report; it closes with its GoTo.
        if (!isGoTo && command.State == RobotCommandStates.Accepted)
            return null;
        if (currentStream is { } stream && stream != command.DeliveredStreamId)
            return new(RobotCommandStates.Unknown, StreamChanged);
        if (isGoTo && command.State == RobotCommandStates.Delivered && now > command.AcceptBy)
            return new(RobotCommandStates.Unknown, "ACK_TIMEOUT");
        if (isGoTo && command.State == RobotCommandStates.Accepted && now > command.AcceptedAt + settings.LegResultTimeout)
            return new(RobotCommandStates.Unknown, "LEG_RESULT_TIMEOUT");
        return null;
    }

    /// <summary>The caller holds the Tour root lock and the command's update lock.</summary>
    public static void Apply(ITourManagementRepository repository, Tour tour, RobotCommand command, RobotCommandTimeout timeout,
        bool telemetryFresh, DateTimeOffset now)
    {
        var expired = timeout.State == RobotCommandStates.Expired;
        if (expired) command.Expire(now, timeout.Reason);
        else command.MarkUnknown(now, timeout.Reason);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = expired ? TourLifecycleEvents.CommandExpired : TourLifecycleEvents.CommandUnknown, OccurredAt = now,
            RobotId = command.RobotId, RouteId = tour.ActiveRouteId, LegId = command.LegId, LegKind = command.LegKind,
            CommandId = command.Id, ReasonCode = timeout.Reason
        });
        if (command.Kind == RobotCommandKinds.GoTo && tour.State == TourRuntime.Running &&
            tour.OperationalStatus == TourRuntime.Normal && tour.CurrentLegId == command.LegId)
            tour.RequireAssistance(!expired ? TourRuntime.CommandUnknown
                : telemetryFresh ? TourRuntime.CommandExpired : TourRuntime.RobotDisconnected, now);
    }
}
