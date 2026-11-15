using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>Every narration version of one POI, newest first (ADR-0060). Discarded POIs stay readable.</summary>
public sealed record ListPoiNarrationsQuery(Guid ProposalId) : IRequest<IReadOnlyList<PoiNarrationRevisionView>>;

public sealed class ListPoiNarrationsQueryHandler(IPoiProposalRepository proposalRepository)
    : IRequestHandler<ListPoiNarrationsQuery, IReadOnlyList<PoiNarrationRevisionView>>
{
    public async Task<IReadOnlyList<PoiNarrationRevisionView>> Handle(ListPoiNarrationsQuery query, CancellationToken ct)
    {
        _ = await proposalRepository.FindProposalAsync(query.ProposalId, ct)
            ?? throw new NotFoundException("POI proposal", query.ProposalId);
        return (await proposalRepository.ListNarrationsAsync(query.ProposalId, ct)).Select(PoiNarrationRules.ToView).ToArray();
    }
}
