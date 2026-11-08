using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.Application.Features.Representative.Commands.ResubmitRegistration;

public sealed class ResubmitRegistrationCommandHandler(IRegistrationRepository repository, IInvitationRepository invitations, TimeProvider clock)
    : IRequestHandler<ResubmitRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(ResubmitRegistrationCommand command, CancellationToken ct)
    {
        var input = command.Request.Input;
        var (tour, registration) = await RegistrationMutation.LoadAsync(repository, command.Id, command.ActorUserId,
            command.Request.ExpectedRowVersion, input.ExpectedTourRowVersion, RegistrationOperation.Resubmit, clock, ct);
        await RegistrationEmailReservation.EnsureAvailableAsync(repository, tour.Id, registration.Id, input.Roster, ct);
        var now = clock.GetUtcNow();
        if (input.Roster.Any(row => row.RowId is null)) RegistrationCutoff.EnsureNewRowsAllowed(tour, now);
        var heldBefore = registration.RosterRows.Count(row => row.IsActive && RosterParticipationStates.HoldsSeat(row.ParticipationState));
        var removed = RegistrationDraftWriter.Apply(registration, input, await invitations.LoadAsync(registration.Id, ct), now,
            resetRowsForResubmit: true);
        TourCapacity.EnsureRoom(tour, await repository.CountHeldSeatsAsync(tour.Id, registration.Id, ct), heldBefore,
            registration.RosterRows.Count(row => row.IsActive && RosterParticipationStates.HoldsSeat(row.ParticipationState)));
        foreach (var invitation in removed)
            invitations.AddAudit(InvitationAudit.Create(tour.Id, command.ActorUserId, "INVITATION_REVOKED_BY_ROSTER_REMOVAL",
                invitation.Id.ToString("D"), Guid.NewGuid(), now, "OK", entityType: "Invitation"));
        registration.State = RegistrationStates.Submitted;
        registration.SubmittedAt = now;
        registration.CancelledAt = null;
        registration.ReviewedAt = null;
        registration.ReviewedByUserId = null;
        registration.RejectionReason = null;
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId, RegistrationAudit.ResubmittedAuditAction, now));
        return Unit.Value;
    }
}
