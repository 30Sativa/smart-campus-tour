using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Routes.Queries.GetRoutes;

public sealed class GetRoutesQueryHandler(IRouteManagementRepository repository) : IRequestHandler<GetRoutesQuery, PagedResult<RouteListItem>>
{
    public Task<PagedResult<RouteListItem>> Handle(GetRoutesQuery query, CancellationToken ct) =>
        repository.ListAsync(string.IsNullOrWhiteSpace(query.Search) ? null : query.Search.Trim(), query.Sort, query.IsActive, query.Page, query.Size, ct);
}
