using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// The SCHEDULED and READY Tours that stop at this POI, so Staff sees them before retiring it (ADR-0062). Read-only:
/// retiring changes none of them.
/// </summary>
public sealed record ListPoiScheduledToursQuery(Guid ProposalId) : IRequest<IReadOnlyList<RouteScheduledTourView>>;

public sealed class ListPoiScheduledToursQueryHandler(IPoiProposalRepository proposalRepository)
    : IRequestHandler<ListPoiScheduledToursQuery, IReadOnlyList<RouteScheduledTourView>>
{
    public async Task<IReadOnlyList<RouteScheduledTourView>> Handle(ListPoiScheduledToursQuery query, CancellationToken ct)
    {
        _ = await proposalRepository.FindProposalAsync(query.ProposalId, ct)
            ?? throw new NotFoundException("POI proposal", query.ProposalId);
        return await proposalRepository.ListScheduledToursUsingAsync(query.ProposalId, ct);
    }
}
