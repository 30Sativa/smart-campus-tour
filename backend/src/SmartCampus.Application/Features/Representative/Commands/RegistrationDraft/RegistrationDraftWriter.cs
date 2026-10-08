using SmartCampus.Domain.Entities;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;

internal static class RegistrationDraftWriter
{
    public static void Replace(GroupRegistration registration, RegistrationInput input, DateTimeOffset now)
    {
        registration.SchoolName = input.SchoolName.Trim();
        registration.GroupName = input.GroupName.Trim();
        registration.ContactName = input.ContactName.Trim();
        registration.ContactEmail = RegistrationConsistency.NormalizeEmail(input.ContactEmail);
        registration.UpdatedAt = now;
        foreach (var row in registration.RosterRows.Where(row => row.IsActive))
        {
            row.IsActive = false;
            row.UpdatedAt = now;
        }
        foreach (var row in input.Roster)
            registration.RosterRows.Add(new RosterRow
            {
                Id = Guid.NewGuid(), RegistrationId = registration.Id, RowNumber = row.RowNumber,
                RowType = row.RowType, DisplayName = row.DisplayName.Trim(), Email = RegistrationConsistency.NormalizeEmail(row.Email),
                ClassName = string.IsNullOrWhiteSpace(row.ClassName) ? null : row.ClassName.Trim(),
                IsActive = true, CreatedAt = now
            });
    }

}
