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
            result.Add(PoiProposalReadModelLoader.ToRevisionView(revision,
                await proposalRepository.FindSubmissionAsync(revision.Id, ct),
                await verificationRepository.FindVerificationAsync(revision.Id, ct)));
        return result;
    }
}
