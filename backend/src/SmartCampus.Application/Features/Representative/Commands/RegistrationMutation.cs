using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Representative.Commands;

// Shared Tour-first ownership/version checks for the three pre-approval mutations.
internal static class RegistrationMutation
{
    public static async Task<(Tour Tour, GroupRegistration Registration)> LoadAsync(IRegistrationRepository repository,
        Guid id, Guid owner, string expectedVersion, string expectedTourVersion,
        RegistrationOperation operation, CancellationToken ct)
    {
        var tourId = await repository.FindTourIdAsync(id, owner, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var tour = await repository.LockTourAsync(tourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var registration = await repository.LockRegistrationAsync(id, owner, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        RegistrationConsistency.CheckVersion(tour.RowVersion, expectedTourVersion);
        RegistrationConsistency.CheckVersion(registration.RowVersion, expectedVersion);
        RepresentativeRegistrationPolicy.RequireAllowed(tour.State, registration.State,
            await repository.HasInvitationsAsync(id, ct), operation);
        return (tour, registration);
    }

}
