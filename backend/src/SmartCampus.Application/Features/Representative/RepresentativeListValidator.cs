using FluentValidation;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative;

/// <summary>Collection bounds shared by the two Representative list queries; each passes its own sort whitelist.</summary>
internal sealed class RepresentativeListValidator : AbstractValidator<RepresentativeListRequest>
{
    public static readonly string[] TourSorts = ["scheduledStartAt", "name"];
    public static readonly string[] RegistrationSorts = ["updatedAt", "submittedAt", "groupName"];

    public RepresentativeListValidator(IReadOnlyCollection<string> sortFields)
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.Size).InclusiveBetween(1, 100);
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.Expand).Must(string.IsNullOrWhiteSpace).WithMessage("Không hỗ trợ mở rộng dữ liệu.");
        RuleFor(x => x.Sort).Must(value => string.IsNullOrWhiteSpace(value) ||
            sortFields.Any(field => value == field || value == "-" + field)).WithMessage("Thứ tự sắp xếp không được hỗ trợ.");
        RuleFor(x => x.State).Must(value => value is null or "SUBMITTED" or "APPROVED" or "REJECTED" or "CANCELLED")
            .WithMessage("Trạng thái đăng ký không hợp lệ.");
    }
}
