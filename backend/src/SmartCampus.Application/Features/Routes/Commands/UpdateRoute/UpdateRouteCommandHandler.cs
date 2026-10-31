using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Routes.Commands.UpdateRoute;

public sealed class UpdateRouteCommandHandler(IRouteManagementRepository repository, TimeProvider time)
    : IRequestHandler<UpdateRouteCommand, Unit>
{
    public async Task<Unit> Handle(UpdateRouteCommand command, CancellationToken ct)
    {
        var route = await repository.FindAsync(command.Id, true, ct) ?? throw new NotFoundException("Route was not found.");
        LegacyRouteRevision.EnsureCurrent(route, command.Input.ExpectedVersion);
        var usage = await repository.GetUsageAsync(route.Id, ct);
        if (!usage.CanEditMetadataAndAvailability)
            throw new ConflictException("A READY or RUNNING Tour uses this Route.", "ROUTE_IN_USE");

        var input = command.Input.Configuration;
        var pois = await repository.GetPoisAsync(input.Stops.Select(s => s.PoiId).Distinct().ToArray(), ct);
        var proposed = RouteConfiguration.Build(input, pois);
        var configurationChanged = !RouteConfiguration.SameItinerary(route, proposed);
        if (configurationChanged && !usage.CanEditConfiguration)
            throw new ConflictException("Referenced itineraries are immutable. Copy this Route to change its configuration.", "ROUTE_IN_USE");
        // A metadata correction on historical data does not rewrite or recertify its itinerary.
        if (configurationChanged)
            RouteConfiguration.EnsureValid(proposed, route.IsActive);
        var changed = new List<string>();
        if (route.Name != proposed.Name) { route.Name = proposed.Name; changed.Add("name"); }
        if (route.Description != proposed.Description) { route.Description = proposed.Description; changed.Add("description"); }
        if (configurationChanged)
        {
            route.MapKey = proposed.MapKey; route.MapFrame = proposed.MapFrame;
            route.StartX = proposed.StartX; route.StartY = proposed.StartY; route.StartYaw = proposed.StartYaw;
            route.EndMode = proposed.EndMode; route.EndX = proposed.EndX; route.EndY = proposed.EndY; route.EndYaw = proposed.EndYaw;
            await repository.ReplaceStopsAsync(route, proposed.RouteStops.ToArray(), ct);
            changed.Add("configuration");
        }
        if (changed.Count == 0) return Unit.Value;
        route.UpdatedAt = time.GetUtcNow();
        RouteAudit.Append(repository, command.ActorUserId, route, "ROUTE_UPDATED", route.UpdatedAt.Value, changed.ToArray());
        return Unit.Value;
    }
}
