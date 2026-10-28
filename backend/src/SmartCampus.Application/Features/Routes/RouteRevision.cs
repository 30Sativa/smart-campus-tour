using System.Security.Cryptography;
using System.Text.Json;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public static class LegacyRouteRevision
{
    // No timestamp-only concurrency: cover the whole persisted aggregate, including stop identities.
    public static string For(Route route) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new
    {
        route.Id, route.Name, route.Description, route.MapKey, route.MapFrame,
        route.StartX, route.StartY, route.StartYaw, route.EndMode, route.EndX, route.EndY,
        route.EndYaw, route.IsActive, route.CreatedAt, route.UpdatedAt,
        Stops = route.RouteStops.OrderBy(s => s.StopOrder).ThenBy(s => s.Id)
            .Select(s => new { s.Id, s.PoiId, s.StopOrder, s.DwellSeconds, s.HeadStepsJson })
    })));

    public static bool IsValid(string? value) => value is { Length: 64 } && value.All(Uri.IsHexDigit);

    public static void EnsureCurrent(Route route, string expected)
    {
        if (!string.Equals(For(route), expected, StringComparison.Ordinal))
            throw new ConflictException("Route changed. Reload before trying again.", "STALE_ROUTE");
    }
}
