using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Routes;

/// <summary>What a deactivation would leave running on this route, so Staff can see it before confirming.</summary>
public sealed record ListRouteScheduledToursQuery(Guid RouteId) : IQuery<IReadOnlyList<RouteScheduledTourView>>;

public sealed class ListRouteScheduledToursHandler(IRouteRevisionRepository repo)
    : IRequestHandler<ListRouteScheduledToursQuery, IReadOnlyList<RouteScheduledTourView>>
{
    public async Task<IReadOnlyList<RouteScheduledTourView>> Handle(ListRouteScheduledToursQuery query, CancellationToken ct)
    {
        _ = await repo.FindRouteAsync(query.RouteId, ct) ?? throw new NotFoundException("Không tìm thấy tuyến.");
        return await repo.ListScheduledToursAsync(query.RouteId, ct);
    }
}
