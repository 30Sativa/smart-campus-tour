using FluentValidation;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RegistrationReview.Commands;

/// <summary>Body rules shared by approval and rejection; each command adds its own reason rule.</summary>
internal sealed class ReviewRequestValidator : AbstractValidator<ReviewRequest>
{
    public ReviewRequestValidator()
    {
        RuleFor(x => x.ExpectedRowVersion).Must(RowVersionToken.IsValid).WithMessage("Phiên bản đăng ký không hợp lệ.");
        RuleFor(x => x.ExpectedTourRowVersion).Must(RowVersionToken.IsValid).WithMessage("Phiên bản Tour không hợp lệ.");
        RuleFor(x => x.Reason).MaximumLength(1000);
    }
}
