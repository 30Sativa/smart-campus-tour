using SmartCampus.Domain.Entities;
namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// Student admission persistence. Lookups do not authorize access: after locking the parent Tour,
/// the handler rechecks invitation hash/version, approval, revocation, expiry and session ownership.
/// Mutations use the registration transaction and its scoped UnitOfWork context.
/// </summary>
public interface IStudentAccessRepository
{
    Task<Guid?> FindInvitationIdAsync(Guid tourId, byte[] codeHash, CancellationToken ct);
    Task<Guid?> FindSessionInvitationIdAsync(Guid tourId, byte[] tokenHash, CancellationToken ct);
    Task<Invitation?> LoadAsync(Guid invitationId, CancellationToken ct);
    /// <summary>
    /// Closes idle sessions before inserting a replacement, satisfying the open-session unique index.
    /// Executes inside the caller's transaction before loading tracked sessions; it is not a commit.
    /// </summary>
    Task CloseExpiredAsync(Guid invitationId, DateTimeOffset now, CancellationToken ct);
    void Add(BrowserSession session);
    Task<bool> HasEnteredAsync(Guid invitationId, CancellationToken ct);
    void AddAudit(AuditLog audit);
}
