using MediatR;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.CancelTour;

public sealed class CancelTourCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IInvitationRepository invitations, InvitationSettings settings, TimeProvider clock, ILogger<CancelTourCommandHandler> logger)
    : IRequestHandler<CancelTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(CancelTourCommand command, CancellationToken ct)
    {
        var reason = command.Request.Reason.Trim();
        var fingerprint = TourRequestReceipt.Fingerprint("TOUR_CANCELLED", command.Id, reason: reason);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            "TOUR_CANCELLED", command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        if (!TourPreparation.Permissions(tour, await repository.GetUsageAsync(tour.Id, ct)).CanCancel)
            throw new ConflictException("Chỉ hủy Tour SCHEDULED/READY chưa Start và chưa có dấu vết vận hành.", "TOUR_LOCKED");
        var now = clock.GetUtcNow();
        var notified = await TourCancellation.ApplyAsync(repository, invitations, tour, command.Actor, reason, now, ct);
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            "TOUR_CANCELLED", fingerprint, now, "state", "endedAt", "endReason", "pendingRegistrations", "invitationAccess");
        TourCancellation.QueueNotice(repository, settings, logger, tour.Id, command.Actor, notified, now);
        return new(tour.Id);
    }
}
