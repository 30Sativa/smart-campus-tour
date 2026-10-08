using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRegistrationRepository
{
    Task<Guid?> FindTourIdAsync(Guid id, Guid? owner, CancellationToken ct);
    Task<Tour?> LockTourAsync(Guid id, CancellationToken ct);
    Task<GroupRegistration?> LockRegistrationAsync(Guid id, Guid? owner, CancellationToken ct);
    Task<Guid?> FindSubmissionAsync(Guid owner, Guid tour, Guid key, CancellationToken ct);
    Task<bool> HasInvitationsAsync(Guid registration, CancellationToken ct);
    Task<IReadOnlyList<int>> ReservedEmailIndexesAsync(Guid tour, Guid? excludingRegistration,
        IReadOnlyList<string> emails, CancellationToken ct);
    void AddRegistration(GroupRegistration registration);
    void AddAudit(AuditLog audit);
}
