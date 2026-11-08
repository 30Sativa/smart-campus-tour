using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>
/// The pre-Start cancellation shared by Staff Cancel and the system auto-cancel (ADR-0047). The caller holds the Tour root
/// lock and has checked that the Tour may be cancelled. A NULL actor means the system did it.
/// </summary>
internal static class TourCancellation
{
    /// <summary>Cancels the Tour and returns the registrations whose representatives should hear about it.</summary>
    public static async Task<IReadOnlyList<Guid>> ApplyAsync(ITourManagementRepository repository, IInvitationRepository invitations,
        Tour tour, Guid? actor, string reason, DateTimeOffset now, CancellationToken ct)
    {
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
                repository.AddAudit(RegistrationAudit.Create(registration, actor, "TOUR_REGISTRATION_CANCELLED", now));
            }
        }
        foreach (var invitation in await invitations.LoadForTourCancellationAsync(tour.Id, ct))
        {
            InvitationIssuer.CloseSessions(invitation, now);
            invitation.RevokedAt ??= now;
            repository.AddAudit(new AuditLog
            {
                TourId = tour.Id, ActorUserId = actor, CorrelationId = Guid.NewGuid(),
                Action = "TOUR_INVITATION_REVOKED", EntityType = "Invitation", EntityId = invitation.Id.ToString("D"),
                ResultCode = "SUCCESS", OccurredAt = now
            });
        }
        var reservation = await repository.FindActiveReservationAsync(tour.Id, ct);
        if (reservation is not null)
        {
            reservation.ReleasedAt = now;
            // v1.17 CK_TourRobotReservations_Release_Actor: NULL here is a system release.
            reservation.ReleasedByUserId = actor;
        }
        tour.State = "CANCELLED";
        tour.EndedAt = now;
        tour.EndReason = reason;
        tour.UpdatedAt = now;
        return notified;
    }

    /// <summary>Only a queue row commits with the cancel: the worker emails after commit, so email can never undo it.</summary>
    public static void QueueNotice(ITourManagementRepository repository, InvitationSettings settings, ILogger logger,
        Guid tourId, Guid? actor, IReadOnlyCollection<Guid> notified, DateTimeOffset now)
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
