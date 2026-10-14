using SmartCampus.Domain.Entities;
namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IStudentAccessRepository
{
    Task<Guid?> FindInvitationIdAsync(Guid tourId, byte[] codeHash, CancellationToken ct);
    Task<Guid?> FindSessionInvitationIdAsync(Guid tourId, byte[] tokenHash, CancellationToken ct);
    Task<Invitation?> LoadAsync(Guid invitationId, CancellationToken ct);
    Task CloseExpiredAsync(Guid invitationId, DateTimeOffset now, CancellationToken ct);
    void Add(BrowserSession session);
    Task<bool> HasEnteredAsync(Guid invitationId, CancellationToken ct);
    void AddAudit(AuditLog audit);
    /// <summary>
    /// Read-only check for Student Q&amp;A: an open, unexpired session of an unrevoked, unexpired invitation on an
    /// active row of an APPROVED registration of this Tour. Null when any condition fails.
    /// </summary>
    Task<StudentQuestionAccess?> FindQuestionAccessAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now, CancellationToken ct);
}

public sealed record StudentQuestionAccess(Guid SessionId, string TourState, string RowType);
