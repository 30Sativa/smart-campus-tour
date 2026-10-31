using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ListPoiProposalsQuery(Guid? MapVersionId) : IRequest<IReadOnlyList<PoiProposalView>>;
public sealed class ListPoiProposalsQueryHandler(IPoiProposalRepository proposalRepository, IPoiVerificationRepository verificationRepository)
    : IRequestHandler<ListPoiProposalsQuery, IReadOnlyList<PoiProposalView>>
{
    public async Task<IReadOnlyList<PoiProposalView>> Handle(ListPoiProposalsQuery query, CancellationToken ct)
    {
        var proposals = await proposalRepository.ListProposalsAsync(query.MapVersionId, ct);
        if (proposals.Count == 0) return [];

        // Load page-wide related data once; per-proposal EF reads turn this list into an N+1 query path.
        var proposalIds = proposals.Select(proposal => proposal.Id).ToArray();
        var revisions = await proposalRepository.ListCurrentRevisionsAsync(proposalIds, ct);
        var verifications = await verificationRepository.ListVerificationRecordsAsync(proposalIds, ct);
        var effectiveByFingerprint = verifications
            .GroupBy(record => (record.ProposalRevision.ProposalId, Fingerprint: Convert.ToHexString(record.NavigationFingerprint)))
            .ToDictionary(group => group.Key, group => group
                .OrderByDescending(record => record.ProposalRevision.RevisionNumber)
                .ThenByDescending(record => record.CheckedAt).ThenByDescending(record => record.Id).First());
        var revisionByProposal = revisions.ToDictionary(revision => revision.ProposalId);
        var result = new List<PoiProposalView>(proposals.Count);
        foreach (var proposal in proposals)
        {
            if (!revisionByProposal.TryGetValue(proposal.Id, out var revision))
                throw new InvalidOperationException("A POI proposal has no current revision.");
            effectiveByFingerprint.TryGetValue((proposal.Id, Convert.ToHexString(revision.NavigationFingerprint)), out var verification);
            var submission = revision.PoiProposalSubmission;
            var view = PoiProposalReadModelLoader.ToRevisionView(revision, submission, verification);
            result.Add(new(proposal.Id, proposal.CurrentRevision, Convert.ToBase64String(proposal.RowVersion),
                proposal.CreatedAt, proposal.UpdatedAt, view, proposal.SourcePoiId));
        }
        return result;
    }
}
