using System.Text.Json;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

/// <summary>
/// The applied test result of one revision from the runs recorded on any save with the same path (ADR-0023 addendum).
/// A fixed route takes the newest run; a voting route needs its legs covered (ADR-0065).
/// </summary>
internal static class RouteVerification
{
    public const string StartName = "Điểm bắt đầu";
    public const string EndName = "Điểm kết thúc";

    /// <summary>A run with the stops of the revision it was recorded on; their StopOrders line up across saves of one path.</summary>
    public sealed record Run(RouteTestRun Record, IReadOnlyList<RouteRevisionStop> RevisionStops);

    public sealed record Result(string Status, RouteTestRun? Effective, RouteLegCoverageView? LegCoverage);

    /// <param name="runsOldestFirst">Only runs on the same path as <paramref name="revision"/>.</param>
    public static Result Evaluate(RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops, IReadOnlyList<Run> runsOldestFirst)
    {
        if (!revision.ViewerChoosesNextStop)
        {
            var last = runsOldestFirst.Count == 0 ? null : runsOldestFirst[^1].Record;
            return new(last?.ResultCode ?? RouteLegCoverage.NotTested, last, null);
        }
        var coverage = RouteLegCoverage.Evaluate(stops.Count, runsOldestFirst
            .Select(run => new RouteCoverageRun(run.Record.Id, run.Record.ResultCode, OrderOf(run))).ToArray());
        var byOrder = stops.ToDictionary(stop => stop.StopOrder);
        var view = new RouteLegCoverageView(coverage.Required.Count, coverage.Required.Count - coverage.Missing.Count,
            coverage.Missing.Select(leg => new RouteMissingLegView(
                leg.From is { } from ? byOrder[from].Id : null, leg.From is { } fromName ? byOrder[fromName].Name : StartName,
                leg.To is { } to ? byOrder[to].Id : null, leg.To is { } toName ? byOrder[toName].Name : EndName)).ToArray());
        return new(coverage.Status, runsOldestFirst.Select(run => run.Record).SingleOrDefault(run => run.Id == coverage.EffectiveRunId), view);
    }

    /// <summary>The matching runs of a route, each with the stops of its own revision, oldest first.</summary>
    public static IReadOnlyList<Run> RunsOnPath(IEnumerable<RouteTestRun> routeRuns, RouteNavigationConfiguration path) =>
        routeRuns.Where(run => run.RouteRevision is not null && RouteNavigationConfigurationFactory.SameNavigation(
                RouteNavigationConfigurationFactory.FromRevision(run.RouteRevision, run.RouteRevision.RouteRevisionStops.ToArray()), path))
            .OrderBy(run => run.CheckedAt).ThenBy(run => run.Id)
            .Select(run => new Run(run, run.RouteRevision.RouteRevisionStops.ToArray())).ToArray();

    public static string? WriteTraversed(IReadOnlyList<Guid>? stopIds) =>
        stopIds is null ? null : JsonSerializer.Serialize(stopIds);

    public static IReadOnlyList<Guid>? ReadTraversed(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<Guid[]>(json); }
        catch (JsonException) { return null; }
    }

    private static IReadOnlyList<int>? OrderOf(Run run)
    {
        if (ReadTraversed(run.Record.TraversedStopIdsJson) is not { } ids) return null;
        var orderById = run.RevisionStops.ToDictionary(stop => stop.Id, stop => stop.StopOrder);
        // An id outside the run's revision makes the order invalid, so it covers nothing.
        return ids.Select(id => orderById.TryGetValue(id, out var order) ? order : 0).ToArray();
    }
}
