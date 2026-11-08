using SmartCampus.Application.Features.Invitations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IInvitationRepository
{
    /// <summary>Tracked invitations and open sessions only; caller owns the registration's Tour lock through commit.</summary>
    Task<IReadOnlyList<Invitation>> LoadAsync(Guid registrationId, CancellationToken ct);
    /// <summary>Loads only invitations needing revocation and their open sessions. Caller must own the Tour lock.</summary>
    Task<IReadOnlyList<Invitation>> LoadForTourCancellationAsync(Guid tourId, CancellationToken ct);
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
    Task<AuditLog?> GetTourCancelNoticeAsync(Guid attemptId, CancellationToken ct);
    Task<bool> HasTourCancelNoticeStartedAsync(Guid attemptId, CancellationToken ct);
    Task<bool> HasTourCancelNoticeResultAsync(Guid attemptId, CancellationToken ct);
    Task<IReadOnlyList<EmailWorkItem>> PendingTourCancelNoticesAsync(DateTimeOffset staleBefore, CancellationToken ct);
    Task<AuditLog?> GetRosterExpiryNoticeAsync(Guid attemptId, CancellationToken ct);
    Task<bool> HasRosterExpiryNoticeStartedAsync(Guid attemptId, CancellationToken ct);
    Task<bool> HasRosterExpiryNoticeResultAsync(Guid attemptId, CancellationToken ct);
    Task<IReadOnlyList<EmailWorkItem>> PendingRosterExpiryNoticesAsync(DateTimeOffset staleBefore, CancellationToken ct);
    /// <summary>The group contact address is the only email the schema holds for a representative.</summary>
    Task<IReadOnlyList<TourCancelRecipient>> LoadTourCancelRecipientsAsync(IReadOnlyCollection<Guid> registrationIds, CancellationToken ct);
    Task<InvitationReadModel?> ReadAsync(Guid registrationId, Guid? owner, CancellationToken ct);
}
