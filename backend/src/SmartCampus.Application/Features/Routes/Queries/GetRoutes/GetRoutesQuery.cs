using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Routes.Queries.GetRoutes;

public sealed record GetRoutesQuery(string? Search, bool? IsActive, int Page = 1, int Size = 20, string Sort = "name") : IQuery<PagedResult<RouteListItem>>;
