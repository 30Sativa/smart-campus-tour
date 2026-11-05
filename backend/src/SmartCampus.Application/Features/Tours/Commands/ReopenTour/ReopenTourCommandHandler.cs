using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.ReopenTour;

/// <summary>READY → SCHEDULED before Start. Reservation, registrations and invitations are left exactly as they are.</summary>
public sealed class ReopenTourCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<ReopenTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(ReopenTourCommand command, CancellationToken ct)
    {
        var reason = command.Request.Reason.Trim();
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.Reopened, command.Id, reason: reason);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Reopened, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        if (!tour.CanReopenBeforeStart)
            throw new ConflictException("Chỉ mở lại Tour READY chưa Start.", "TOUR_STATE_INVALID");
        var now = clock.GetUtcNow();
        tour.State = "SCHEDULED";
        tour.UpdatedAt = now;
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.Reopened, OccurredAt = now, ActorUserId = command.Actor,
            ReasonNote = reason
        });
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Reopened, fingerprint, now, "state");
        return new(tour.Id);
    }
}
