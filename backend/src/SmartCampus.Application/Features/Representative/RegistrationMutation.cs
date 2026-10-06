using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative;

// Shared Tour-first ownership/version checks for the three pre-approval mutations.
internal static class RegistrationMutation
{
    public static async Task<(Tour Tour, GroupRegistration Registration)> LoadAsync(IRepresentativeRepository repository,
        Guid id, Guid owner, string expectedVersion, string expectedTourVersion,
        RegistrationOperation operation, CancellationToken ct)
    {
        var tourId = await repository.FindOwnedTourIdAsync(id, owner, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var tour = await repository.LockTourAsync(tourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var registration = await repository.LockRegistrationAsync(id, owner, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        RegistrationRules.CheckVersion(tour.RowVersion, expectedTourVersion);
        RegistrationRules.CheckVersion(registration.RowVersion, expectedVersion);
        RegistrationRules.RequireAllowed(tour.State, registration.State,
            await repository.HasInvitationsAsync(id, ct), operation);
        return (tour, registration);
    }

    public static async Task EnsureEmailsAvailableAsync(IRepresentativeRepository repository, Guid tourId,
        Guid? excludedRegistrationId, IReadOnlyList<RosterInput> roster, CancellationToken ct)
    {
        var duplicateIndexes = await repository.ReservedEmailIndexesAsync(tourId, excludedRegistrationId,
            roster.Select(row => row.Email).ToArray(), ct);
        if (duplicateIndexes.Count > 0)
            throw new ConflictException(RegistrationRules.EmailReserved, RegistrationRules.EmailReservedCode,
                RegistrationRules.EmailErrors(duplicateIndexes));
    }
}
