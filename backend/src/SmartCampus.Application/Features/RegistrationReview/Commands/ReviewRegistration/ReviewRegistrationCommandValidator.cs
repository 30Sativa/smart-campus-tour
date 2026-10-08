using FluentValidation;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;

public sealed class ReviewRegistrationCommandValidator : AbstractValidator<ReviewRegistrationCommand>
{
    public ReviewRegistrationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ActorUserId).NotEmpty();
        RuleFor(x => x.Request).NotNull();
        When(x => x.Request is not null, () =>
        {
            RuleFor(x => x.Request.ExpectedRowVersion).Must(RegistrationConsistency.ValidVersion).WithMessage("Phiên bản đăng ký không hợp lệ.");
            RuleFor(x => x.Request.ExpectedTourRowVersion).Must(RegistrationConsistency.ValidVersion).WithMessage("Phiên bản Tour không hợp lệ.");
            RuleFor(x => x.Request.Reason).MaximumLength(1000);
            When(x => !x.Approve, () => RuleFor(x => x.Request.Reason).NotEmpty().WithMessage("Cần lý do từ chối."));
            When(x => x.Approve, () => RuleFor(x => x.Request.Reason).Must(string.IsNullOrWhiteSpace).WithMessage("Duyệt không có lý do từ chối."));
        });
    }
}
