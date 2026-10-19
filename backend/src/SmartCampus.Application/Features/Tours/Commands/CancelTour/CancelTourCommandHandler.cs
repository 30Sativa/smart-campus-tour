using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.CancelTour;

public sealed class CancelTourCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IInvitationRepository invitations, TimeProvider clock) : IRequestHandler<CancelTourCommand, TourMutationResult>
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
        foreach (var registrationId in await repository.GetRegistrationIdsAsync(tour.Id, ct))
        {
            var locked = await registrations.LockRegistrationAsync(registrationId, null, ct)
                ?? throw new NotFoundException("Không tìm thấy đăng ký của Tour.");
            var registration = locked.Registration;
            if (registration.State == RegistrationStates.Submitted)
            {
                // Pending work must leave the review queue; prior approval/rejection decisions remain history.
                registration.State = RegistrationStates.Cancelled;
                registration.CancelledAt = now;
                registration.UpdatedAt = now;
                repository.AddAudit(RegistrationAudit.Create(registration, command.Actor, "TOUR_REGISTRATION_CANCELLED", now));
            }
            foreach (var invitation in await invitations.LoadAsync(registrationId, ct))
            {
                if (invitation.RevokedAt.HasValue && invitation.BrowserSessions.All(s => s.EndedAt.HasValue)) continue;
                InvitationIssuer.CloseSessions(invitation, now);
                invitation.RevokedAt ??= now;
                repository.AddAudit(new AuditLog
                {
                    TourId = tour.Id, ActorUserId = command.Actor, CorrelationId = Guid.NewGuid(),
                    Action = "TOUR_INVITATION_REVOKED", EntityType = "Invitation", EntityId = invitation.Id.ToString("D"),
                    ResultCode = "SUCCESS", OccurredAt = now
                });
            }
        }
        tour.State = "CANCELLED";
        tour.EndedAt = now;
        tour.EndReason = reason;
        tour.UpdatedAt = now;
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            "TOUR_CANCELLED", fingerprint, now, "state", "endedAt", "endReason", "pendingRegistrations", "invitationAccess");
        return new(tour.Id);
    }
}
