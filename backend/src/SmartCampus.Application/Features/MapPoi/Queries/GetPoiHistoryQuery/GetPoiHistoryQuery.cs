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
        var revisionViews = new List<PoiRevisionView>(revisions.Count);
        foreach (var revision in revisions)
        {
            var submission = await proposalRepository.FindSubmissionAsync(revision.Id, ct);
            var verification = await verificationRepository.FindVerificationAsync(revision.Id, ct);
            revisionViews.Add(PoiProposalReadModelLoader.ToRevisionView(revision, submission, verification));
        }
        var checks = (await verificationRepository.ListVerificationRecordsAsync(query.Id, ct)).Select(MapPoiReadModelMapper.ToVerificationView).ToArray();
        return new(query.Id, revisionViews, checks);
    }
}
