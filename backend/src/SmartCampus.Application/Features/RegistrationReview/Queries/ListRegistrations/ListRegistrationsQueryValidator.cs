using FluentValidation;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

public sealed class ListRegistrationsQueryValidator : AbstractValidator<ListRegistrationsQuery>
{
    public ListRegistrationsQueryValidator()
    {
        RuleFor(x => x.Request.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.Request.Size).InclusiveBetween(1, 100);
        RuleFor(x => x.Request.Search).MaximumLength(200);
        RuleFor(x => x.Request.Expand).Must(string.IsNullOrWhiteSpace).WithMessage("Không hỗ trợ mở rộng dữ liệu.");
        RuleFor(x => x.Request.Sort).Must(value => value is null or "" or "submittedAt" or "-submittedAt" or
            "updatedAt" or "-updatedAt" or "groupName" or "-groupName").WithMessage("Thứ tự sắp xếp không hợp lệ.");
        RuleFor(x => x.Request.State).Must(value => value is null || RegistrationStates.IsKnown(value))
            .WithMessage("Trạng thái đăng ký không hợp lệ.");
        RuleFor(x => x.Request.To).Must((query, to) => to is null || query.Request.From is null || to > query.Request.From)
            .WithMessage("Ngày kết thúc phải sau ngày bắt đầu.");
    }
}
