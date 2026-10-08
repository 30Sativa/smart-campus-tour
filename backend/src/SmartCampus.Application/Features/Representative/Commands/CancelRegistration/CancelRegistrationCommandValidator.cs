using SmartCampus.Application.Features.Registrations;
using FluentValidation;

namespace SmartCampus.Application.Features.Representative.Commands.CancelRegistration;

public sealed class CancelRegistrationCommandValidator : AbstractValidator<CancelRegistrationCommand>
{
    public CancelRegistrationCommandValidator()
    {
        RuleFor(x => x.Request).NotNull();
        When(x => x.Request is not null, () =>
        {
            RuleFor(x => x.Request.ExpectedRowVersion).Must(RegistrationConsistency.ValidVersion).WithMessage("Mã phiên bản đăng ký không hợp lệ.");
            RuleFor(x => x.Request.ExpectedTourRowVersion).Must(RegistrationConsistency.ValidVersion).WithMessage("Mã phiên bản Tour không hợp lệ.");
        });
    }
}
