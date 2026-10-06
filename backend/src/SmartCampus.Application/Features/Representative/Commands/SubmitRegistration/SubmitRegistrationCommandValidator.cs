using FluentValidation;

namespace SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;

public sealed class SubmitRegistrationCommandValidator : AbstractValidator<SubmitRegistrationCommand>
{
    public SubmitRegistrationCommandValidator()
    {
        RuleFor(x => x.TourId).NotEmpty();
        RuleFor(x => x.IdempotencyKey).NotEmpty();
        RuleFor(x => x.Input).NotNull().SetValidator(new RegistrationInputValidator());
    }
}
