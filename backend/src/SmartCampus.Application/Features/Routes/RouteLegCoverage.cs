namespace SmartCampus.Application.Features.Routes;

/// <summary>
/// One leg of a voting route, by <c>StopOrder</c>: <c>From</c> null is the start, <c>To</c> null is the end (ADR-0065).
/// </summary>
public sealed record RouteLeg(int? From, int? To);

/// <summary>One recorded run on the path, oldest first; <c>Order</c> is the StopOrders driven, null when unknown.</summary>
public sealed record RouteCoverageRun(Guid Id, string ResultCode, IReadOnlyList<int>? Order);

/// <summary>
/// The applied result of a voting route. <c>EffectiveRunId</c> is the newest run behind <c>Status</c>: the newest FAIL,
/// the newest PASS that the coverage rests on, or null before any run.
/// </summary>
public sealed record RouteCoverageResult(string Status, Guid? EffectiveRunId, IReadOnlyList<RouteLeg> Required,
    IReadOnlyList<RouteLeg> Missing);

/// <summary>
/// ADR-0065 test-run coverage of a route whose Viewers vote for the next POI. The first POI is fixed, the others come in
/// any order, then the robot returns to the end. Each leg a Tour might drive must have been driven in a PASS run.
/// </summary>
public static class RouteLegCoverage
{
    public const string Pass = "PASS";
    public const string Fail = "FAIL";
    public const string NotTested = "NOT_TESTED";
    public const string LegsIncomplete = "LEGS_INCOMPLETE";

    /// <summary>
    /// start → first POI; first POI → each other POI; every directed pair among the other POIs; each POI other than the
    /// first → end. 7 legs for 3 POIs, 13 for 4.
    /// </summary>
    public static IReadOnlyList<RouteLeg> RequiredLegs(int stopCount)
    {
        if (stopCount < 1) return [];
        var legs = new List<RouteLeg> { new(null, 1) };
        for (var to = 2; to <= stopCount; to++) legs.Add(new(1, to));
        for (var from = 2; from <= stopCount; from++)
            for (var to = 2; to <= stopCount; to++)
                if (from != to) legs.Add(new(from, to));
        for (var from = 2; from <= stopCount; from++) legs.Add(new(from, null));
        // One POI: nothing to choose, the robot goes start → POI → end.
        if (stopCount == 1) legs.Add(new(1, null));
        return legs;
    }

    /// <summary>The legs one run drove: start → each stop in the driven order → end.</summary>
    public static IReadOnlyList<RouteLeg> LegsOf(IReadOnlyList<int> order)
    {
        if (order.Count == 0) return [];
        var legs = new List<RouteLeg>(order.Count + 1) { new(null, order[0]) };
        for (var index = 1; index < order.Count; index++) legs.Add(new(order[index - 1], order[index]));
        legs.Add(new(order[^1], null));
        return legs;
    }

    /// <summary>
    /// Null when <paramref name="order"/> is a valid driven order for <paramref name="stopCount"/> POIs: it starts with
    /// the first POI and names every POI exactly once. Otherwise the Vietnamese reason.
    /// </summary>
    public static string? OrderProblem(int stopCount, IReadOnlyList<int>? order)
    {
        if (order is null || order.Count == 0) return "Cần ghi thứ tự các điểm dừng robot đã đi trong lần chạy thử này.";
        if (order.Any(stop => stop < 1 || stop > stopCount)) return "Thứ tự đã đi có điểm dừng không thuộc phiên bản tuyến này.";
        if (order.Distinct().Count() != order.Count) return "Mỗi điểm dừng chỉ được ghi một lần trong thứ tự đã đi.";
        if (order.Count != stopCount) return "Thứ tự đã đi phải gồm đủ mọi điểm dừng của tuyến.";
        if (order[0] != 1) return "Lần chạy thử phải bắt đầu tại điểm dừng đầu tiên của tuyến.";
        return null;
    }

    /// <summary>
    /// The newest run is FAIL → FAIL. Otherwise the PASS runs since the newest FAIL cover every leg → PASS, or not yet →
    /// LEGS_INCOMPLETE. No run → NOT_TESTED. A run without a valid order covers no leg.
    /// </summary>
    public static RouteCoverageResult Evaluate(int stopCount, IReadOnlyList<RouteCoverageRun> runsOldestFirst)
    {
        var required = RequiredLegs(stopCount);
        if (runsOldestFirst.Count == 0) return new(NotTested, null, required, required);
        var newest = runsOldestFirst[^1];
        if (newest.ResultCode == Fail) return new(Fail, newest.Id, required, required);
        var lastFail = -1;
        for (var index = 0; index < runsOldestFirst.Count; index++)
            if (runsOldestFirst[index].ResultCode == Fail) lastFail = index;
        var covered = new HashSet<RouteLeg>();
        Guid? effective = null;
        for (var index = lastFail + 1; index < runsOldestFirst.Count; index++)
        {
            var run = runsOldestFirst[index];
            if (run.ResultCode != Pass) continue;
            effective = run.Id;
            if (run.Order is { } order && OrderProblem(stopCount, order) is null) covered.UnionWith(LegsOf(order));
        }
        var missing = required.Where(leg => !covered.Contains(leg)).ToArray();
        return new(missing.Length == 0 ? Pass : LegsIncomplete, effective, required, missing);
    }
}
