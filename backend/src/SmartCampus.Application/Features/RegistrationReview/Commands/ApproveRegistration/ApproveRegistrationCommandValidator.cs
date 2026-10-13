using FluentValidation;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ApproveRegistration;

public sealed class ApproveRegistrationCommandValidator : AbstractValidator<ApproveRegistrationCommand>
{
    public ApproveRegistrationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ActorUserId).NotEmpty();
        RuleFor(x => x.Request).NotNull().SetValidator(new ReviewRequestValidator());
        When(x => x.Request is not null, () =>
            RuleFor(x => x.Request.Reason).Must(string.IsNullOrWhiteSpace).WithMessage("Duyệt không có lý do từ chối."));
    }
}
