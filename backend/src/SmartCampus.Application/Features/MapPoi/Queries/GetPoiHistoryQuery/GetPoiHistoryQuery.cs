using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record GetPoiHistoryQuery(Guid Id) : IRequest<PoiHistoryView>;
public sealed class GetPoiHistoryQueryHandler(IPoiProposalRepository proposalRepository, IPoiVerificationRepository verificationRepository)
    : IRequestHandler<GetPoiHistoryQuery, PoiHistoryView>
{
    public async Task<PoiHistoryView> Handle(GetPoiHistoryQuery query, CancellationToken ct)
    {
        if (await proposalRepository.FindProposalAsync(query.Id, ct) is null) throw new NotFoundException("POI proposal", query.Id);
        var revisions = await proposalRepository.ListRevisionsAsync(query.Id, ct);
        // History needs one bulk check read; revisions are projected in memory to keep query count bounded.
        var checks = await verificationRepository.ListVerificationRecordsAsync([query.Id], ct);
        // The same rule as ListPoiProposalsQuery and PoiProposalReadModelLoader: a revision's status is the effective
        // result for its navigation fingerprint (newest revision, then newest check), so a content-only save shows the
        // PASS it kept instead of "not checked", and verificationSourceRevisionId names the save that was checked.
        var effectiveByFingerprint = checks
            .GroupBy(check => Convert.ToHexString(check.NavigationFingerprint))
            .ToDictionary(group => group.Key, group => group
                .OrderByDescending(check => check.ProposalRevision.RevisionNumber)
                .ThenByDescending(check => check.CheckedAt).ThenByDescending(check => check.Id).First());
        var revisionViews = revisions.Select(revision =>
            PoiProposalReadModelLoader.ToRevisionView(revision, revision.PoiProposalSubmission,
                effectiveByFingerprint.GetValueOrDefault(Convert.ToHexString(revision.NavigationFingerprint)))).ToArray();
        return new(query.Id, revisionViews, checks.Select(MapPoiReadModelMapper.ToVerificationView).ToArray());
    }
}
