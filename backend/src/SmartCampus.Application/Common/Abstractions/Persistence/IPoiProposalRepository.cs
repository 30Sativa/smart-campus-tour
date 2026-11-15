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
    Task<IReadOnlyList<PoiProposalRevision>> ListCurrentRevisionsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposal>> ListProposalsAsync(Guid? mapVersionId, CancellationToken cancellationToken);
    /// <summary>The proposals among these that have a revision in any RouteRevisionStops row, of any route (ADR-0062).</summary>
    Task<IReadOnlySet<Guid>> ListProposalsUsedInRoutesAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken);
    /// <summary>Every narration version of one POI, newest first, with author, editor and approver (ADR-0060).</summary>
    Task<IReadOnlyList<PoiNarrationRevision>> ListNarrationsAsync(Guid proposalId, CancellationToken cancellationToken);
    /// <summary>The DRAFT and APPROVED narration versions of these POIs, with editor and approver.</summary>
    Task<IReadOnlyList<PoiNarrationRevision>> ListCurrentNarrationsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken);
    /// <summary>Tracked; callers hold the proposal row lock.</summary>
    Task<PoiNarrationRevision?> FindNarrationAsync(Guid proposalId, int revisionNumber, CancellationToken cancellationToken);
    /// <summary>Tracked; state is DRAFT or APPROVED. Callers hold the proposal row lock.</summary>
    Task<PoiNarrationRevision?> FindNarrationInStateAsync(Guid proposalId, string state, CancellationToken cancellationToken);
    Task<int> GetLastNarrationNumberAsync(Guid proposalId, CancellationToken cancellationToken);
    /// <summary>Untracked, with author, editor and approver, as stored after the last save.</summary>
    Task<PoiNarrationRevision?> GetNarrationForViewAsync(Guid narrationId, CancellationToken cancellationToken);
    Task<PoiNarrationRequestReceipt?> FindNarrationReceiptAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    void Add(PoiNarrationRevision narration);
    void Add(PoiNarrationRequestReceipt receipt);
    void Add(PoiProposal proposal);
    void Add(PoiProposalRevision revision);
    void Add(PoiProposalSubmission submission);
    void AddAuditLog(AuditLog auditLog);
}
