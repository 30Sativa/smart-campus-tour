using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Persistence operations for Staff-authored POI proposals and immutable revisions.</summary>
public interface IPoiProposalRepository
{
    Task<PoiProposal?> LockProposalAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<PoiProposal?> FindProposalAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<PoiProposal?> FindProposalCreateRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiProposalRevision?> FindRevisionRequestAsync(Guid proposalId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiProposalRevision?> FindCurrentRevisionAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<PoiProposalRevision?> FindRevisionAsync(Guid proposalId, int revisionNumber, CancellationToken cancellationToken);
    Task<PoiProposalSubmission?> FindSubmissionRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiProposalSubmission?> FindSubmissionAsync(Guid revisionId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposalRevision>> ListRevisionsAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposal>> ListProposalsAsync(Guid? mapVersionId, CancellationToken cancellationToken);
    void Add(PoiProposal proposal);
    void Add(PoiProposalRevision revision);
    void Add(PoiProposalSubmission submission);
    void AddAuditLog(AuditLog auditLog);
}
