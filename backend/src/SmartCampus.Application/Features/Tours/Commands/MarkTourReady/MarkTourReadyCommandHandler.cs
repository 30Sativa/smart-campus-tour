using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.MarkTourReady;

/// <summary>SCHEDULED → READY after every READY condition passes under the Tour lock (ADR-0042). No robot is touched.</summary>
public sealed class MarkTourReadyCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, IMapVersionRepository maps, TimeProvider clock)
    : IRequestHandler<MarkTourReadyCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(MarkTourReadyCommand command, CancellationToken ct)
    {
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.Ready, command.Id);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Ready, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        // Every registration, row-review and email-change writer owns this same lock, so no decision can appear before commit.
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        var usage = await repository.GetUsageAsync(tour.Id, ct);
        var blockers = await TourReadiness.EvaluateAsync(tour, usage, repository, registrations, revisions, maps, clock, lockTarget: true, ct);
        if (blockers.Count > 0)
            throw new ConflictException("Tour chưa đủ điều kiện READY.", TourReadiness.FailedCode, blockers: blockers);
        var now = clock.GetUtcNow();
        tour.State = "READY";
        tour.UpdatedAt = now;
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.Ready, OccurredAt = now, ActorUserId = command.Actor
        });
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Ready, fingerprint, now, "state");
        return new(tour.Id);
    }
}
