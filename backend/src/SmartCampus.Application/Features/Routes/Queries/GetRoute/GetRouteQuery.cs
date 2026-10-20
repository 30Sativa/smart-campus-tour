using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Routes.Queries.GetRoute;

public sealed record GetRouteQuery(Guid Id) : IQuery<RouteDetails>;
