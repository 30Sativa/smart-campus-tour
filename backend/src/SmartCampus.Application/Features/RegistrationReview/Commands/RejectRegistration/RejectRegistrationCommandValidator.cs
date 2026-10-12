using FluentValidation;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.RejectRegistration;

public sealed class RejectRegistrationCommandValidator : AbstractValidator<RejectRegistrationCommand>
{
    public RejectRegistrationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ActorUserId).NotEmpty();
        RuleFor(x => x.Request).NotNull().SetValidator(new ReviewRequestValidator());
        When(x => x.Request is not null, () =>
            RuleFor(x => x.Request.Reason).NotEmpty().WithMessage("Cần lý do từ chối."));
    }
}
