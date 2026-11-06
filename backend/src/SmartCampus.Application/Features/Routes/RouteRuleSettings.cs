namespace SmartCampus.Application.Features.Routes;

/// <summary>Rules a new route revision must meet when it is saved (docs/lich-tour-theo-ca.md §2). Saved revisions are not re-checked.</summary>
public sealed class RouteRuleSettings
{
    public const int DefaultMinStops = 2;
    public const decimal DefaultMinStopSeparationMeters = 1.0m;
    public const int MinDwellSeconds = 15;
    public const int MaxDwellSeconds = 300;
    public const int MaxStops = 100;

    public RouteRuleSettings(int? minStops, decimal? minStopSeparationMeters)
    {
        MinStops = minStops ?? DefaultMinStops;
        MinStopSeparationMeters = minStopSeparationMeters ?? DefaultMinStopSeparationMeters;
        if (MinStops is < 1 or > MaxStops)
            throw new InvalidOperationException($"Routes:MinStops must be between 1 and {MaxStops}.");
        if (MinStopSeparationMeters <= 0)
            throw new InvalidOperationException("Routes:MinStopSeparationMeters must be greater than 0.");
    }

    public int MinStops { get; }
    public decimal MinStopSeparationMeters { get; }

    /// <summary>Planar X/Y distance on the map, in metres.</summary>
    public static decimal Distance(decimal ax, decimal ay, decimal bx, decimal by)
    {
        var dx = (double)(ax - bx);
        var dy = (double)(ay - by);
        return (decimal)Math.Sqrt(dx * dx + dy * dy);
    }

    public bool TooClose(decimal ax, decimal ay, decimal bx, decimal by) =>
        Distance(ax, ay, bx, by) < MinStopSeparationMeters;
}
