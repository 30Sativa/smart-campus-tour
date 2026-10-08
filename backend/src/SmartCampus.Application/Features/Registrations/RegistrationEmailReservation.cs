using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Registrations;

// Called only while holding the parent Tour update lock through commit.
public static class RegistrationEmailReservation
{
    public static async Task EnsureAvailableAsync(IRegistrationRepository repository, Guid tourId,
        Guid? excludedRegistrationId, IReadOnlyList<RosterInput> roster, CancellationToken ct)
    {
        var duplicateIndexes = await repository.ReservedEmailIndexesAsync(tourId, excludedRegistrationId,
            roster.Select(row => row.Email).ToArray(), ct);
        if (duplicateIndexes.Count > 0)
            throw new ConflictException(RegistrationConsistency.EmailReserved, RegistrationConsistency.EmailReservedCode,
                RegistrationConsistency.EmailErrors(duplicateIndexes));
    }
}
