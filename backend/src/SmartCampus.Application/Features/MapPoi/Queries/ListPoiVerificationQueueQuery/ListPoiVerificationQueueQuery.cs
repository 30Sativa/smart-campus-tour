using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ListPoiVerificationQueueQuery(Guid? MapVersionId) : IRequest<IReadOnlyList<PoiRevisionView>>;
public sealed class ListPoiVerificationQueueQueryHandler(IPoiProposalRepository proposalRepository, IPoiVerificationRepository verificationRepository)
    : IRequestHandler<ListPoiVerificationQueueQuery, IReadOnlyList<PoiRevisionView>>
{
    public async Task<IReadOnlyList<PoiRevisionView>> Handle(ListPoiVerificationQueueQuery query, CancellationToken ct)
    {
        var revisions = await verificationRepository.ListSubmittedVerificationQueueAsync(query.MapVersionId, ct);
        var result = new List<PoiRevisionView>(revisions.Count);
        foreach (var revision in revisions)
        {
            var effectiveResult = await verificationRepository.FindLatestVerificationByFingerprintAsync(
                revision.ProposalId, revision.NavigationFingerprint, ct);
            if (effectiveResult?.ResultCode == "PASS") continue;
            result.Add(PoiProposalReadModelLoader.ToRevisionView(revision,
                await proposalRepository.FindSubmissionAsync(revision.Id, ct), effectiveResult));
        }
        return result;
    }
}
