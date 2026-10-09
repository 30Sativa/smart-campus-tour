using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Representative.Commands;

// Owner-scoped Tour-first locks, version and policy checks shared by the update, resubmit and cancel commands.
internal static class RegistrationMutation
{
    public static async Task<(Tour Tour, GroupRegistration Registration)> LoadAsync(IRegistrationRepository repository,
        Guid id, Guid owner, string expectedVersion, string expectedTourVersion,
        RegistrationOperation operation, CancellationToken ct)
    {
        var (tour, registration) = await repository.LockRegistrationAsync(id, owner, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, expectedTourVersion);
        RowVersionToken.EnsureCurrent(registration.RowVersion, expectedVersion);
        RepresentativeRegistrationPolicy.Evaluate(tour.State, registration.State,
            await repository.HasInvitationsAsync(id, ct), operation).EnsureAllowed();
        return (tour, registration);
    }
}
