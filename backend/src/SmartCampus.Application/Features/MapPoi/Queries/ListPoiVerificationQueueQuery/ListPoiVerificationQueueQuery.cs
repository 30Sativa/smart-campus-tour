using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ListPoiVerificationQueueQuery(Guid? MapVersionId) : IRequest<IReadOnlyList<PoiVerificationQueueItem>>;
public sealed class ListPoiVerificationQueueQueryHandler(IPoiVerificationRepository verificationRepository)
    : IRequestHandler<ListPoiVerificationQueueQuery, IReadOnlyList<PoiVerificationQueueItem>>
{
    public async Task<IReadOnlyList<PoiVerificationQueueItem>> Handle(ListPoiVerificationQueueQuery query, CancellationToken ct)
    {
        var revisions = await verificationRepository.ListSubmittedVerificationQueueAsync(query.MapVersionId, ct);
        if (revisions.Count == 0) return [];
        // Resolve all effective checks in one repository call instead of querying once for each queued revision.
        var proposalIds = revisions.Select(revision => revision.ProposalId).Distinct().ToArray();
        var verifications = await verificationRepository.ListVerificationRecordsAsync(proposalIds, ct);
        var effectiveByFingerprint = verifications
            .GroupBy(record => (record.ProposalRevision.ProposalId, Fingerprint: Convert.ToHexString(record.NavigationFingerprint)))
            .ToDictionary(group => group.Key, group => group
                .OrderByDescending(record => record.ProposalRevision.RevisionNumber)
                .ThenByDescending(record => record.CheckedAt).ThenByDescending(record => record.Id).First());
        var result = new List<PoiVerificationQueueItem>(revisions.Count);
        foreach (var revision in revisions)
        {
            effectiveByFingerprint.TryGetValue((revision.ProposalId, Convert.ToHexString(revision.NavigationFingerprint)), out var effectiveResult);
            if (effectiveResult?.ResultCode == "PASS") continue;
            result.Add(new PoiVerificationQueueItem(revision.ProposalId, revision.Proposal.CurrentRevision,
                Convert.ToBase64String(revision.Proposal.RowVersion),
                PoiProposalReadModelLoader.ToRevisionView(revision, revision.PoiProposalSubmission, effectiveResult)));
        }
        return result;
    }
}
