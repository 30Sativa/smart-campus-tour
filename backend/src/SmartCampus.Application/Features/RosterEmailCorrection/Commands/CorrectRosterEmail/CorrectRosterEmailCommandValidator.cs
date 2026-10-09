using FluentValidation;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;

public sealed class CorrectRosterEmailCommandValidator : AbstractValidator<CorrectRosterEmailCommand>
{
    public CorrectRosterEmailCommandValidator()
    {
        RuleFor(c => c.RegistrationId).NotEmpty();
        RuleFor(c => c.RosterRowId).NotEmpty();
        RuleFor(c => c.ActorUserId).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.Email).NotEmpty().MaximumLength(254).Must(RegistrationEmail.IsValid)
                .WithMessage("Email lời mời không hợp lệ.");
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.ExpectedTourRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.ExpectedRosterRowVersion).Must(RowVersionToken.IsValid);
            When(c => c.Request.ExpectedInvitationRowVersion is not null,
                () => RuleFor(c => c.Request.ExpectedInvitationRowVersion).Must(RowVersionToken.IsValid));
        });
    }
}
