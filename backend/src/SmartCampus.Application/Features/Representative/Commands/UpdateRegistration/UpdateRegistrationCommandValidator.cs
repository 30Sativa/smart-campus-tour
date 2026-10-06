using FluentValidation;

namespace SmartCampus.Application.Features.Representative.Commands.UpdateRegistration;

public sealed class UpdateRegistrationCommandValidator : AbstractValidator<UpdateRegistrationCommand>
{
    public UpdateRegistrationCommandValidator()
    {
        RuleFor(x => x.Request).NotNull();
        When(x => x.Request is not null, () =>
        {
            RuleFor(x => x.Request.Input).NotNull().SetValidator(new RegistrationInputValidator());
            RuleFor(x => x.Request.ExpectedRowVersion).Must(RegistrationRules.ValidVersion).WithMessage("Mã phiên bản đăng ký không hợp lệ.");
        });
    }
}
