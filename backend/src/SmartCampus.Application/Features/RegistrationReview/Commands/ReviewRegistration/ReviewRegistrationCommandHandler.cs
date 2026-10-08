using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;

public sealed class ReviewRegistrationCommandHandler(IRegistrationRepository repository, TimeProvider clock)
    : IRequestHandler<ReviewRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(ReviewRegistrationCommand command, CancellationToken ct)
    {
        var tourId = await repository.FindTourIdAsync(command.Id, null, ct) ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var tour = await repository.LockTourAsync(tourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var registration = await repository.LockRegistrationAsync(command.Id, null, ct) ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        RegistrationConsistency.CheckVersion(tour.RowVersion, command.Request.ExpectedTourRowVersion);
        RegistrationConsistency.CheckVersion(registration.RowVersion, command.Request.ExpectedRowVersion);
        ReviewPolicy.RequireAllowed(tour.State, registration.State, await repository.HasInvitationsAsync(registration.Id, ct));
        if (command.Approve)
        {
            // Revalidate persisted active rows; never trust an old browser preview or SQL imports.
            var roster = registration.RosterRows.Where(row => row.IsActive).OrderBy(row => row.RowNumber)
                .Select(row => new RosterInput(row.RowNumber, row.RowType, row.DisplayName, row.Email, row.ClassName)).ToArray();
            var input = new RegistrationInput(registration.SchoolName, registration.GroupName, registration.ContactName,
                registration.ContactEmail, command.Request.ExpectedTourRowVersion, roster);
            await new RegistrationInputValidator().ValidateAndThrowAsync(input, ct);
            await RegistrationEmailReservation.EnsureAvailableAsync(repository, tour.Id, registration.Id, roster, ct);
        }
        var now = clock.GetUtcNow();
        registration.State = command.Approve ? RegistrationConsistency.Approved : RegistrationConsistency.Rejected;
        registration.RejectionReason = command.Approve ? null : command.Request.Reason!.Trim();
        registration.ReviewedByUserId = command.ActorUserId;
        registration.ReviewedAt = now;
        registration.UpdatedAt = now;
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId,
            command.Approve ? RegistrationAudit.ApprovedAuditAction : RegistrationAudit.RejectedAuditAction, now));
        return Unit.Value;
    }
}
