using SmartCampus.Application.Features.Invitations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IInvitationRepository
{
    Task<IReadOnlyList<Invitation>> LoadAsync(Guid registrationId, CancellationToken ct);
    Task<Invitation?> FindInvitationAsync(Guid id, CancellationToken ct);
    void Add(Invitation invitation);
    Task<bool> HashExistsAsync(byte[] hash, CancellationToken ct);
    void AddAudit(AuditLog audit);
    Task<AuditLog?> FindRequestAsync(Guid requestId, CancellationToken ct);
    Task<AuditLog?> LatestSendAsync(Guid invitationId, CancellationToken ct);
    Task<bool> HasResultAsync(Guid attemptId, CancellationToken ct);
    Task<bool> HasStartedAsync(Guid attemptId, CancellationToken ct);
    Task<AuditLog?> GetAttemptAsync(Guid attemptId, CancellationToken ct);
    Task<IReadOnlyList<EmailWorkItem>> PendingAsync(DateTimeOffset staleBefore, CancellationToken ct);
    Task<InvitationReadModel?> ReadAsync(Guid registrationId, Guid? owner, CancellationToken ct);
}
