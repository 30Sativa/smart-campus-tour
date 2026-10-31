using MediatR;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

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
        // Every registration/access writer owns this same Tour lock; no per-group roster/session history is needed.
        var notified = new List<Guid>();
        foreach (var registration in await repository.LoadCancellationRegistrationsAsync(tour.Id, ct))
        {
            if (registration.State is RegistrationStates.Submitted or RegistrationStates.Approved) notified.Add(registration.Id);
            if (registration.State == RegistrationStates.Submitted)
            {
                // Pending work must leave the review queue; prior approval/rejection decisions remain history.
                registration.State = RegistrationStates.Cancelled;
                registration.CancelledAt = now;
                registration.UpdatedAt = now;
                repository.AddAudit(RegistrationAudit.Create(registration, command.Actor, "TOUR_REGISTRATION_CANCELLED", now));
            }
        }
        foreach (var invitation in await invitations.LoadForTourCancellationAsync(tour.Id, ct))
        {
            InvitationIssuer.CloseSessions(invitation, now);
            invitation.RevokedAt ??= now;
            repository.AddAudit(new AuditLog
            {
                TourId = tour.Id, ActorUserId = command.Actor, CorrelationId = Guid.NewGuid(),
                Action = "TOUR_INVITATION_REVOKED", EntityType = "Invitation", EntityId = invitation.Id.ToString("D"),
                ResultCode = "SUCCESS", OccurredAt = now
            });
        }
        var reservation = await repository.FindActiveReservationAsync(tour.Id, ct);
        if (reservation is not null)
        {
            reservation.ReleasedAt = now;
            reservation.ReleasedByUserId = command.Actor;
        }
        tour.State = "CANCELLED";
        tour.EndedAt = now;
        tour.EndReason = reason;
        tour.UpdatedAt = now;
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            "TOUR_CANCELLED", fingerprint, now, "state", "endedAt", "endReason", "pendingRegistrations", "invitationAccess");
        QueueNotice(tour.Id, command.Actor, notified, now);
        return new(tour.Id);
    }

    /// <summary>Only a queue row commits with the cancel: the worker emails after commit, so email can never undo it.</summary>
    private void QueueNotice(Guid tourId, Guid actor, IReadOnlyCollection<Guid> notified, DateTimeOffset now)
    {
        if (notified.Count == 0) return;
        if (settings.Enabled)
        {
            repository.AddAudit(TourCancelNoticeAudit.Request(tourId, actor, notified, now));
            return;
        }
        logger.LogWarning("Tour {TourId} was cancelled but email is disabled, so {RecipientCount} representatives were not notified.", tourId, notified.Count);
        repository.AddAudit(TourCancelNoticeAudit.Create(tourId, actor, TourCancelNoticeAudit.Failed, Guid.NewGuid(), now, "FAILED",
            new { code = "EMAIL_DISABLED", recipientCount = notified.Count }));
    }
}
