using FluentValidation;

namespace SmartCampus.Application.Features.Registrations;

public sealed class RegistrationInputValidator : AbstractValidator<RegistrationInput>
{
    public RegistrationInputValidator()
    {
        RuleFor(x => x.SchoolName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.GroupName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ContactName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.ContactEmail).NotEmpty().MaximumLength(254).Must(RegistrationConsistency.ValidEmail).WithMessage("Email liên hệ không hợp lệ.");
        RuleFor(x => x.ExpectedTourRowVersion).Must(RegistrationConsistency.ValidVersion).WithMessage("Phiên bản Tour không hợp lệ.");
        RuleFor(x => x.Roster).NotNull().Must(rows => rows is { Count: >= 1 and <= 1000 })
            .WithMessage("Cần từ 1 đến 1000 dòng lời mời.");
        RuleForEach(x => x.Roster).NotNull().SetValidator(new RosterInputValidator());
        RuleFor(x => x.Roster).Custom((rows, context) =>
        {
            if (rows is null) return;
            var numbers = new HashSet<int>();
            // Same normalization as the stored value and the Tour-wide reservation check.
            var emails = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                if (row is null) continue;
                if (!numbers.Add(row.RowNumber)) context.AddFailure($"Roster[{i}].RowNumber", "Số dòng bị trùng.");
                if (row.Email is not null && !emails.Add(RegistrationConsistency.NormalizeEmail(row.Email)))
                    context.AddFailure($"Roster[{i}].Email", $"Dòng {row.RowNumber}: email bị trùng trong danh sách.");
            }
        });
    }
}
