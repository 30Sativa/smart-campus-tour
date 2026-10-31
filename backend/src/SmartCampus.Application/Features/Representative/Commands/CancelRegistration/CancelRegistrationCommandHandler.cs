using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative.Commands.CancelRegistration;

public sealed class CancelRegistrationCommandHandler(IRegistrationRepository repository, IInvitationRepository invitations, TimeProvider clock)
    : IRequestHandler<CancelRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(CancelRegistrationCommand command, CancellationToken ct)
    {
        var (tour, registration) = await RegistrationMutation.LoadAsync(repository, command.Id, command.ActorUserId,
            command.Request.ExpectedRowVersion, command.Request.ExpectedTourRowVersion, RegistrationOperation.Cancel, ct);
        var now = clock.GetUtcNow();
        var activeInvitations = await invitations.LoadAsync(registration.Id, ct);
        foreach (var row in registration.RosterRows.Where(row => row.IsActive))
        {
            row.IsActive = false;
            row.ParticipationState = RosterParticipationStates.Removed;
            row.UpdatedAt = now;
            var invitation = activeInvitations.SingleOrDefault(item => item.RosterRowId == row.Id);
            if (invitation is null) continue;
            InvitationIssuer.CloseSessions(invitation, now);
            invitation.RevokedAt = now;
            invitations.AddAudit(InvitationAudit.Create(tour.Id, command.ActorUserId, "INVITATION_REVOKED_BY_REGISTRATION_CANCEL",
                invitation.Id.ToString("D"), Guid.NewGuid(), now, "OK", entityType: "Invitation"));
        }
        registration.State = RegistrationStates.Cancelled;
        registration.CancelledAt = now;
        registration.UpdatedAt = now;
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId, RegistrationAudit.CancelledAuditAction, now));
        return Unit.Value;
    }
}
