using System.Text.Json;

namespace SmartCampus.Domain.Entities;

public sealed record RouteHeadStep(string Preset, int HoldSeconds);

public partial class Route
{
    private static readonly JsonSerializerOptions HeadJson = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<RouteHeadStep> ReadHeadSteps(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<RouteHeadStep[]>(json, HeadJson) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string WriteHeadSteps(IReadOnlyList<RouteHeadStep> steps) =>
        JsonSerializer.Serialize(steps, HeadJson);

    public IReadOnlyList<string> ConfigurationIssues()
    {
        var issues = new HashSet<string>();
        if (string.IsNullOrWhiteSpace(MapKey) || string.IsNullOrWhiteSpace(MapFrame)) issues.Add("MAP_REQUIRED");
        if (!Coordinate(StartX) || !Coordinate(StartY) || !Heading(StartYaw)) issues.Add("START_POSE_INVALID");
        if (EndMode == "POSE")
        {
            if (!EndX.HasValue || !EndY.HasValue || !EndYaw.HasValue ||
                !Coordinate(EndX.Value) || !Coordinate(EndY.Value) || !Heading(EndYaw.Value))
                issues.Add("END_POSE_REQUIRED");
        }
        else if (EndMode != "LAST_POI" || EndX.HasValue || EndY.HasValue || EndYaw.HasValue)
            issues.Add("END_MODE_INVALID");

        var stops = RouteStops.OrderBy(s => s.StopOrder).ToArray();
        if (stops.Length == 0) issues.Add("STOPS_REQUIRED");
        if (!stops.Select(s => s.StopOrder).SequenceEqual(Enumerable.Range(1, stops.Length))) issues.Add("STOP_ORDER_INVALID");
        if (stops.Select(s => s.PoiId).Distinct().Count() != stops.Length) issues.Add("DUPLICATE_POI");
        foreach (var stop in stops)
        {
            if (stop.Poi is null) issues.Add("POI_NOT_FOUND");
            else if (stop.Poi.MapKey != MapKey || stop.Poi.MapFrame != MapFrame) issues.Add("POI_MAP_MISMATCH");
            if (stop.Poi is not null && (!Coordinate(stop.Poi.X) || !Coordinate(stop.Poi.Y) || !Heading(stop.Poi.Yaw)))
                issues.Add("POI_POSE_INVALID");
            if (stop.DwellSeconds <= 0) issues.Add("DWELL_INVALID");
            var steps = ReadHeadSteps(stop.HeadStepsJson);
            if (steps.Count == 0 || steps.Any(s => s is null ||
                s.Preset is not ("FRONT" or "LEFT" or "RIGHT") || s.HoldSeconds <= 0) ||
                steps.Sum(s => (long)(s?.HoldSeconds ?? 0)) > stop.DwellSeconds)
                issues.Add("HEAD_STEPS_INVALID");
        }
        return issues.Order(StringComparer.Ordinal).ToArray();
    }

    public static bool Coordinate(decimal value) => value is >= -999999.9999m and <= 999999.9999m && decimal.Round(value, 4) == value;
    public static bool Heading(decimal value) => value is >= -3.141593m and <= 3.141593m && decimal.Round(value, 6) == value;
}
