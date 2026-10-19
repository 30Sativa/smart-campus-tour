using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.Routes.Commands.CreateRoute;

public sealed class CreateRouteCommandHandler(IRouteManagementRepository repository, TimeProvider time)
    : IRequestHandler<CreateRouteCommand, CreateRouteResult>
{
    public async Task<CreateRouteResult> Handle(CreateRouteCommand command, CancellationToken ct)
    {
        var pois = await repository.GetPoisAsync(command.Input.Stops.Select(s => s.PoiId).Distinct().ToArray(), ct);
        var route = RouteConfiguration.Build(command.Input, pois);
        RouteConfiguration.EnsureValid(route, false);
        route.Id = Guid.NewGuid();
        route.CreatedAt = time.GetUtcNow();
        repository.Add(route);
        RouteAudit.Append(repository, command.ActorUserId, route, "ROUTE_CREATED", route.CreatedAt, "metadata", "configuration", "isActive");
        return new CreateRouteResult(route.Id);
    }
}
