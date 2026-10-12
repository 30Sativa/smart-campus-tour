using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Registrations;

// Active rows of SUBMITTED/APPROVED registrations reserve their normalized emails within one Tour.
// Called only while holding the parent Tour update lock through commit.
public static class RegistrationEmailReservation
{
    public const string ConflictCode = "EMAIL_RESERVED";

    public static async Task EnsureAvailableAsync(IRegistrationRepository repository, Guid tourId,
        Guid? excludedRegistrationId, IReadOnlyList<RosterInput> roster, CancellationToken ct)
    {
        var duplicateIndexes = await repository.ReservedEmailIndexesAsync(tourId, excludedRegistrationId,
            roster.Select(row => row.Email).ToArray(), ct);
        if (duplicateIndexes.Count == 0) return;
        // Field keys name only the caller's own rows; another group's data is never disclosed.
        var fields = duplicateIndexes.ToDictionary(index => $"Roster[{index}].Email",
            _ => new[] { "Email đã được đăng ký trong Tour này." });
        throw new ConflictException("Có email đã được đăng ký trong Tour này. Kiểm tra lại danh sách.", ConflictCode, fields);
    }
}
