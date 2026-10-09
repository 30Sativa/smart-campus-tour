using FluentValidation;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative.Commands.ResubmitRegistration;

public sealed class ResubmitRegistrationCommandValidator : AbstractValidator<ResubmitRegistrationCommand>
{
    public ResubmitRegistrationCommandValidator()
    {
        RuleFor(x => x.Request).NotNull();
        When(x => x.Request is not null, () =>
        {
            RuleFor(x => x.Request.Input).NotNull().SetValidator(new RegistrationInputValidator());
            RuleFor(x => x.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid).WithMessage("Mã phiên bản đăng ký không hợp lệ.");
        });
    }
}
