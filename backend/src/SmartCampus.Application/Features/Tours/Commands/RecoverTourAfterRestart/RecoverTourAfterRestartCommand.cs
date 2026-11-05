using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.RecoverTourAfterRestart;

public sealed record ListRunningToursQuery : IQuery<IReadOnlyList<Guid>>;
public sealed record RecoverTourAfterRestartCommand(Guid TourId) : ITourMutationCommand<bool>;

public sealed class ListRunningToursQueryHandler(ITourManagementRepository repository) : IRequestHandler<ListRunningToursQuery, IReadOnlyList<Guid>>
{
    public Task<IReadOnlyList<Guid>> Handle(ListRunningToursQuery query, CancellationToken ct) => repository.ListRunningTourIdsAsync(ct);
}

/// <summary>
/// A restarted backend knows nothing it did not store (ADR-0042 §3): the Tour needs the Operator, an undelivered GoTo is
/// withdrawn, a delivered one waits for its result or the sweeper. Nothing continues and no dwell timer comes back. A Tour
/// already needing assistance keeps its reason, which says more than the restart does.
/// </summary>
public sealed class RecoverTourAfterRestartCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<RecoverTourAfterRestartCommand, bool>
{
    public async Task<bool> Handle(RecoverTourAfterRestartCommand recover, CancellationToken ct)
    {
        var tour = await registrations.LockTourAsync(recover.TourId, ct);
        if (tour is null || tour.State != TourRuntime.Running) return false;
        var now = clock.GetUtcNow();
        tour.InterruptByRestart(now);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.BackendRestarted, OccurredAt = now, RobotId = tour.AssignedRobotId,
            RouteId = tour.ActiveRouteId, ReasonCode = TourRuntime.BackendRestarted
        });
        if (await repository.LockOpenGoToAsync(tour.Id, ct) is { State: RobotCommandStates.Pending } goTo)
        {
            goTo.Expire(now, "BACKEND_RESTARTED");
            repository.AddEvent(new TourEvent
            {
                TourId = tour.Id, EventType = TourLifecycleEvents.CommandExpired, OccurredAt = now, RobotId = goTo.RobotId,
                RouteId = tour.ActiveRouteId, LegId = goTo.LegId, LegKind = goTo.LegKind, CommandId = goTo.Id, ReasonCode = "BACKEND_RESTARTED"
            });
        }
        return true;
    }
}
