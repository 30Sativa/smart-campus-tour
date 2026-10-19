using FluentValidation;
using FluentValidation.Results;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public static class RouteConfiguration
{
    public static Route Build(RouteInput input, IReadOnlyList<Poi> pois)
    {
        var route = new Route
        {
            Name = input.Name.Trim(), Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim(),
            MapKey = input.MapKey.Trim(), MapFrame = input.MapFrame.Trim(),
            StartX = input.StartX, StartY = input.StartY, StartYaw = input.StartYaw,
            EndMode = input.EndMode, EndX = input.EndX, EndY = input.EndY, EndYaw = input.EndYaw
        };
        var byId = pois.ToDictionary(p => p.Id);
        route.RouteStops = input.Stops.Select((s, index) => new RouteStop
        {
            Id = Guid.NewGuid(), PoiId = s.PoiId, StopOrder = index + 1,
            DwellSeconds = s.DwellSeconds, HeadStepsJson = Route.WriteHeadSteps(s.HeadSteps),
            Poi = byId.GetValueOrDefault(s.PoiId)!
        }).ToList();
        return route;
    }

    public static bool SameItinerary(Route a, Route b) =>
        a.MapKey == b.MapKey && a.MapFrame == b.MapFrame && a.StartX == b.StartX &&
        a.StartY == b.StartY && a.StartYaw == b.StartYaw && a.EndMode == b.EndMode &&
        a.EndX == b.EndX && a.EndY == b.EndY && a.EndYaw == b.EndYaw &&
        a.RouteStops.OrderBy(s => s.StopOrder).Select(StopConfiguration)
            .SequenceEqual(b.RouteStops.OrderBy(s => s.StopOrder).Select(StopConfiguration));

    private static string StopConfiguration(RouteStop s) =>
        JsonConfiguration(s.PoiId, s.StopOrder, s.DwellSeconds, Route.ReadHeadSteps(s.HeadStepsJson));

    private static string JsonConfiguration(Guid id, int order, int dwell, IReadOnlyList<RouteHeadStep> steps) =>
        System.Text.Json.JsonSerializer.Serialize(new { id, order, dwell, steps });

    public static string[] AvailabilityIssues(Route route) =>
        route.ConfigurationIssues().Concat(route.RouteStops.Any(s => s.Poi is not null && !s.Poi.IsActive)
            ? ["POI_INACTIVE"] : Array.Empty<string>()).Distinct().ToArray();

    public static void EnsureValid(Route route, bool requireAvailable)
    {
        var issues = requireAvailable ? AvailabilityIssues(route) : route.ConfigurationIssues();
        if (issues.Count != 0)
            throw new ValidationException(issues.Select(code => new ValidationFailure("Route", code)));
    }

    public static RouteDetails Details(Route r, RouteUsage usage) => new(
        r.Id, r.Name, r.Description, r.MapKey, r.MapFrame, r.IsActive, r.RouteStops.Count, r.CreatedAt, r.UpdatedAt,
        r.StartX, r.StartY, r.StartYaw, r.EndMode, r.EndX, r.EndY, r.EndYaw,
        r.RouteStops.OrderBy(s => s.StopOrder).Select(s => new RouteStopDetails(s.Id, s.PoiId,
            s.Poi?.Name ?? "", s.StopOrder, s.DwellSeconds, Route.ReadHeadSteps(s.HeadStepsJson).Where(h => h is not null).ToArray())).ToArray(),
        RouteRevision.For(r), usage, r.ConfigurationIssues(), AvailabilityIssues(r));
}
