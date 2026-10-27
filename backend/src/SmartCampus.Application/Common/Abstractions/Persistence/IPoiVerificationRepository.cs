using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Persistence operations for technical POI verification evidence and history.</summary>
public interface IPoiVerificationRepository
{
    Task<PoiVerificationRecord?> FindVerificationRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiVerificationRecord?> FindVerificationAsync(Guid revisionId, CancellationToken cancellationToken);
    Task<PoiVerificationRecord?> FindLatestVerificationByFingerprintAsync(Guid proposalId, byte[] fingerprint, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiVerificationRecord>> ListVerificationRecordsAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposalRevision>> ListSubmittedVerificationQueueAsync(Guid? mapVersionId, CancellationToken cancellationToken);
    void Add(PoiVerificationRecord verification);
    void AddAuditLog(AuditLog auditLog);
}
