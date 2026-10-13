using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.RegistrationReview.Commands;

// Steps shared by approval and rejection. Both commands run in the registration transaction, so the
// decision, its review metadata and the audit row commit together or not at all.
internal static class ReviewDecision
{
    /// <summary>Tour-first locks, both opened versions and the review gate.</summary>
    public static async Task<(Tour Tour, GroupRegistration Registration)> LockAsync(IRegistrationRepository repository,
        Guid id, ReviewRequest request, CancellationToken ct)
    {
        var (tour, registration) = await repository.LockRegistrationAsync(id, owner: null, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, request.ExpectedTourRowVersion);
        RowVersionToken.EnsureCurrent(registration.RowVersion, request.ExpectedRowVersion);
        ReviewPolicy.Evaluate(tour.State, registration.State, await repository.HasInvitationsAsync(registration.Id, ct))
            .EnsureAllowed();
        return (tour, registration);
    }

    /// <summary>Records the decision; roster rows, reservations and Tour state are left unchanged.</summary>
    public static void Record(GroupRegistration registration, Guid reviewer, string state, string? rejectionReason,
        DateTimeOffset now)
    {
        registration.State = state;
        registration.RejectionReason = rejectionReason;
        registration.ReviewedByUserId = reviewer;
        registration.ReviewedAt = now;
        registration.UpdatedAt = now;
    }
}
