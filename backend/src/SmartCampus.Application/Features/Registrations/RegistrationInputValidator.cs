using FluentValidation;

namespace SmartCampus.Application.Features.Registrations;

public sealed class RegistrationInputValidator : AbstractValidator<RegistrationInput>
{
    public RegistrationInputValidator()
    {
        RuleFor(x => x.SchoolName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.GroupName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ContactName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.ContactEmail).NotEmpty().MaximumLength(254).Must(RegistrationEmail.IsValid).WithMessage("Email liên hệ không hợp lệ.");
        RuleFor(x => x.ExpectedTourRowVersion).Must(RowVersionToken.IsValid).WithMessage("Phiên bản Tour không hợp lệ.");
        RuleFor(x => x.Roster).NotNull().Must(rows => rows is { Count: >= 1 and <= 10 })
            .WithMessage("Cần từ 1 đến 10 điểm xem trong một hồ sơ; dòng điểm xem chung không phải số học sinh.");
        RuleForEach(x => x.Roster).NotNull().SetValidator(new RosterInputValidator());
        RuleFor(x => x.Roster).Custom((rows, context) =>
        {
            if (rows is null) return;
            var numbers = new HashSet<int>();
            // Same normalization as the stored value and the Tour-wide reservation check.
            var emails = new HashSet<string>(StringComparer.Ordinal);
            var rowIds = new HashSet<Guid>();
            for (var i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                if (row is null) continue;
                if (!numbers.Add(row.RowNumber)) context.AddFailure($"Roster[{i}].RowNumber", "Số dòng bị trùng.");
                if (row.RowId is not null && !rowIds.Add(row.RowId.Value))
                    context.AddFailure($"Roster[{i}].RowId", "Dòng đăng ký bị lặp.");
                if (row.Email is not null && !emails.Add(RegistrationEmail.Normalize(row.Email)))
                    context.AddFailure($"Roster[{i}].Email", $"Dòng {row.RowNumber}: email bị trùng trong danh sách.");
            }
        });
    }
}

public static class RegistrationCutoff
{
    /// <param name="close">The configured registration close, <c>Tours:RegistrationCloseHours</c> (ADR-0047).</param>
    public static void EnsureNewRowsAllowed(SmartCampus.Domain.Entities.Tour tour, DateTimeOffset now, TimeSpan close)
    {
        if (now >= tour.ScheduledStartAt - close)
            throw new SmartCampus.Application.Common.Exceptions.ConflictException(
                $"Không thể tạo đăng ký hoặc thêm điểm xem trong {close.TotalHours:0} giờ trước giờ Tour.", "REGISTRATION_CUTOFF");
    }
}
