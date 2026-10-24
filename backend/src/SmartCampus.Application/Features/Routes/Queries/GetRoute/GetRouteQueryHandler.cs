using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Routes.Queries.GetRoute;

public sealed class GetRouteQueryHandler(IRouteManagementRepository repository) : IRequestHandler<GetRouteQuery, RouteDetails>
{
    public async Task<RouteDetails> Handle(GetRouteQuery query, CancellationToken ct)
    {
        var route = await repository.FindAsync(query.Id, false, ct) ?? throw new NotFoundException("Route was not found.");
        return RouteConfiguration.Details(route, await repository.GetUsageAsync(route.Id, ct));
    }
}
