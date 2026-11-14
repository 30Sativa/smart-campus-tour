using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Abstractions.Tours;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.AutoAdvanceTour;

/// <summary>The Operator turns the automatic departure of a Tour on or off.</summary>
public sealed record SetTourAutoAdvanceRequest(bool Enabled);
public sealed record SetTourAutoAdvanceCommand(Guid Id, Guid Actor, bool Enabled) : ICommand<TourAutoAdvanceResult>;
public sealed record TourAutoAdvanceResult(Guid TourId, bool Enabled);

/// <summary>Tours whose automatic departure looks due, unlocked; each is decided again under its lock.</summary>
public sealed record ListAutoAdvanceDueQuery : IQuery<IReadOnlyList<Guid>>;

/// <summary>One automatic attempt to leave the current POI of a Tour; true when something was recorded.</summary>
public sealed record AutoAdvanceTourCommand(Guid TourId) : ITourMutationCommand<bool>;

public sealed class SetTourAutoAdvanceCommandHandler(ITourManagementRepository repository, ITourAutoAdvanceStore store)
    : IRequestHandler<SetTourAutoAdvanceCommand, TourAutoAdvanceResult>
{
    public async Task<TourAutoAdvanceResult> Handle(SetTourAutoAdvanceCommand command, CancellationToken ct)
    {
        var tour = await repository.FindAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới đổi được chế độ tự đi tiếp.");
        if (tour.State is not ("READY" or TourRuntime.Running))
            throw new ConflictException("Chỉ đổi được khi Tour đã chốt hoặc đang chạy.", "TOUR_STATE_INVALID");
        store.Set(tour.Id, command.Enabled);
        return new(tour.Id, command.Enabled);
    }
}

public sealed class ListAutoAdvanceDueQueryHandler(ITourManagementRepository repository, ITourAutoAdvanceStore store, TimeProvider clock)
    : IRequestHandler<ListAutoAdvanceDueQuery, IReadOnlyList<Guid>>
{
    public async Task<IReadOnlyList<Guid>> Handle(ListAutoAdvanceDueQuery query, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var due = new List<Guid>();
        foreach (var id in store.EnabledTours())
        {
            var tour = await repository.FindAsync(id, ct);
            if (tour is null || tour.State is TourRuntime.Completed or TourRuntime.Cancelled) store.Set(id, false);
            else if (AutoAdvanceTourCommandHandler.IsDue(tour, now)) due.Add(id);
        }
        return due;
    }
}

/// <summary>
/// The automatic Next: only on a NORMAL Tour observing at a POI whose dwell has ended, once per visit, and only when every
/// movement check passes, the Operator's console connection included. A blocked attempt moves nothing and is not repeated:
/// the robot must never leave minutes after the time the Operator expected. The Operator can always press Next.
/// </summary>
public sealed class AutoAdvanceTourCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, TourStartPreflight preflight, FleetCommandSettings settings, HeadAutoMotion headMotion,
    ITourAutoAdvanceStore store, TimeProvider clock) : IRequestHandler<AutoAdvanceTourCommand, bool>
{
    public const string NotReadyReason = "AUTO_ADVANCE_BLOCKED";

    public static bool IsDue(Tour tour, DateTimeOffset now) =>
        tour.CanAdvance && tour.CurrentStep == TourRuntime.Observing && tour.CurrentStopVisitId is not null &&
        tour.StopVisitClosedAt is null && tour.DwellDeadlineAt is { } deadline && deadline <= now;

    public async Task<bool> Handle(AutoAdvanceTourCommand command, CancellationToken ct)
    {
        if (!store.IsEnabled(command.TourId)) return false;
        var tour = await registrations.LockTourAsync(command.TourId, ct);
        var now = clock.GetUtcNow();
        if (tour is null || !IsDue(tour, now) || !store.TryClaim(tour.CurrentStopVisitId!.Value)) return false;

        var robotId = tour.AssignedRobotId!.Value;
        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct);
        var map = revision is null ? null : await revisions.GetMapAsync(revision.MapVersionId, ct);
        if (revision is null || map is null) return Blocked(tour, robotId, "Không đọc được tuyến của Tour.", now);
        var target = TourLegDispatch.NextTarget(tour, revision, await revisions.GetStopsAsync(revision.Id, ct));
        Robot? robot = null;
        if (target is not null)
        {
            if (await repository.HasOpenCommandAsync(robotId, ct)) return Blocked(tour, robotId, "Robot còn lệnh đang mở.", now);
            robot = await TourTarget.FindReservedRobotAsync(revisions, robotId, ct);
            if (robot is null) return Blocked(tour, robotId, "Không tìm thấy robot của Tour.", now);
            var checks = await preflight.EvaluateMovementAsync(tour, robot, map, ct);
            if (checks.BlockedBy.Count > 0) return Blocked(tour, robotId, string.Join(',', checks.BlockedBy), now);
        }
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.AutoAdvanced, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, StopVisitId = tour.CurrentStopVisitId
        });
        await TourAdvance.GoAsync(repository, settings, headMotion, tour, robot, map, target, null, now, ct);
        return true;
    }

    private bool Blocked(Tour tour, Guid robotId, string reason, DateTimeOffset now)
    {
        store.SetBlocked(tour.Id, tour.CurrentStopVisitId!.Value, reason);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.AutoAdvanceBlocked, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, StopVisitId = tour.CurrentStopVisitId, ReasonCode = NotReadyReason, ReasonNote = reason
        });
        return true;
    }
}
