using FluentValidation;

namespace SmartCampus.Application.Features.Registrations;

public sealed class RosterInputValidator : AbstractValidator<RosterInput>
{
    public RosterInputValidator()
    {
        RuleFor(x => x.RowNumber).InclusiveBetween(1, 1048576);
        RuleFor(x => x.RowType).Must(value => value is "INDIVIDUAL" or "SHARED_VIEWING").WithMessage("Loại dòng không hợp lệ.");
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254).Must(RegistrationEmail.IsValid).WithMessage("Email lời mời không hợp lệ.");
        RuleFor(x => x.ClassName).MaximumLength(100);
    }
}
