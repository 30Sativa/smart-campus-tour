using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// Persistence shared by every registration writer (Representative mutations, Admin review and invitation
/// support). Callers run inside the registration transaction, so acquired locks are held until commit.
/// </summary>
public interface IRegistrationRepository
{
    Task<Tour?> LockTourAsync(Guid id, CancellationToken ct);

    /// <summary>
    /// Locks the parent Tour and then the registration with its active roster rows: the Tour-first order every
    /// registration writer uses. A non-null <paramref name="owner"/> restricts the lookup to that Representative.
    /// Returns null when the registration does not exist or is not owned.
    /// </summary>
    Task<(Tour Tour, GroupRegistration Registration)?> LockRegistrationAsync(Guid id, Guid? owner, CancellationToken ct);

    Task<Guid?> FindSubmissionAsync(Guid owner, Guid tour, Guid key, CancellationToken ct);
    Task<AuditLog?> FindEmailCorrectionAsync(Guid tour, Guid requestId, CancellationToken ct);
    Task<bool> HasLaterEmailCorrectionAsync(Guid tour, Guid row, long receiptId, CancellationToken ct);
    Task<bool> HasInvitationsAsync(Guid registration, CancellationToken ct);
    Task<IReadOnlyList<int>> ReservedEmailIndexesAsync(Guid tour, Guid? excludingRegistration,
        IReadOnlyList<string> emails, CancellationToken ct);
    void AddRegistration(GroupRegistration registration);
    void AddAudit(AuditLog audit);
}
