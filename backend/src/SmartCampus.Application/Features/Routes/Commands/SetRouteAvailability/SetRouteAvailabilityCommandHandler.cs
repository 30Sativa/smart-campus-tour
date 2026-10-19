using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Routes.Commands.SetRouteAvailability;

public sealed class SetRouteAvailabilityCommandHandler(IRouteManagementRepository repository, TimeProvider time)
    : IRequestHandler<SetRouteAvailabilityCommand, Unit>
{
    public async Task<Unit> Handle(SetRouteAvailabilityCommand command, CancellationToken ct)
    {
        var route = await repository.FindAsync(command.Id, true, ct) ?? throw new NotFoundException("Route was not found.");
        RouteRevision.EnsureCurrent(route, command.ExpectedVersion);
        if (!(await repository.GetUsageAsync(route.Id, ct)).CanEditMetadataAndAvailability)
            throw new ConflictException("A READY or RUNNING Tour uses this Route.", "ROUTE_IN_USE");
        if (command.IsActive)
        {
            // Reload POIs after taking the route lock; serializable reads hold them through commit.
            var pois = await repository.GetPoisAsync(route.RouteStops.Select(s => s.PoiId).Distinct().ToArray(), ct);
            foreach (var stop in route.RouteStops) stop.Poi = pois.Single(p => p.Id == stop.PoiId);
            RouteConfiguration.EnsureValid(route, true);
        }
        if (route.IsActive == command.IsActive) return Unit.Value;
        route.IsActive = command.IsActive;
        route.UpdatedAt = time.GetUtcNow();
        RouteAudit.Append(repository, command.ActorUserId, route,
            command.IsActive ? "ROUTE_ACTIVATED" : "ROUTE_DEACTIVATED", route.UpdatedAt.Value, "isActive");
        return Unit.Value;
    }
}
