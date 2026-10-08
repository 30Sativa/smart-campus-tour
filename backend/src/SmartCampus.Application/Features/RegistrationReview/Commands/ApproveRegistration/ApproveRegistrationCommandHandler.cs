using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ApproveRegistration;

public sealed class ApproveRegistrationCommandHandler(IRegistrationRepository repository, TimeProvider clock,
    InvitationSettings invitationSettings, InvitationIssuer invitationIssuer)
    : IRequestHandler<ApproveRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(ApproveRegistrationCommand command, CancellationToken ct)
    {
        var (tour, registration) = await ReviewDecision.LockAsync(repository, command.Id, command.Request, ct);
        // Approval decides on the stored active rows, never on a browser preview or a SQL import: they must
        // pass the submission rules and the Tour-wide email reservation under the same lock.
        var stored = StoredInput(tour, registration);
        await new RegistrationInputValidator().ValidateAndThrowAsync(stored, ct);
        await RegistrationEmailReservation.EnsureAvailableAsync(repository, tour.Id, registration.Id, stored.Roster, ct);
        var now = clock.GetUtcNow();
        ReviewDecision.Record(registration, command.ActorUserId, RegistrationStates.Approved, rejectionReason: null, now);
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId, RegistrationAudit.ApprovedAuditAction, now));
        if (invitationSettings.Enabled)
            await invitationIssuer.IssueAsync(registration, tour, command.ActorUserId, now, ct);
        return Unit.Value;
    }

    private static RegistrationInput StoredInput(Tour tour, GroupRegistration registration) => new(
        registration.SchoolName, registration.GroupName, registration.ContactName, registration.ContactEmail,
        RowVersionToken.Encode(tour.RowVersion),
        registration.RosterRows.Where(row => row.IsActive).OrderBy(row => row.RowNumber)
            .Select(row => new RosterInput(row.RowNumber, row.RowType, row.DisplayName, row.Email, row.ClassName)).ToArray());
}
