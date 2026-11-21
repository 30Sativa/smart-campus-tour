using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0065: route rules, estimated duration and test-run coverage of a route whose Viewers vote for the next POI.</summary>
public sealed class RouteViewerVoteTests
{
    // StopOrder of the POIs: A is the fixed first POI.
    private const int A = 1, B = 2, C = 3, D = 4;

    [Fact]
    public void Three_POIs_need_seven_legs()
    {
        var expected = new HashSet<RouteLeg> { new(null, A), new(A, B), new(A, C), new(B, C), new(C, B), new(B, null), new(C, null) };
        Assert.True(expected.SetEquals(RouteLegCoverage.RequiredLegs(3)));
        Assert.Equal(7, RouteLegCoverage.RequiredLegs(3).Count);
    }

    [Fact]
    public void Four_POIs_need_thirteen_legs_and_none_enters_the_first_POI_after_the_start_or_leaves_it_for_the_end()
    {
        var legs = RouteLegCoverage.RequiredLegs(4);
        Assert.Equal(13, legs.Count);
        Assert.Equal(13, legs.Distinct().Count());
        Assert.DoesNotContain(legs, leg => leg.To == A && leg.From is not null);
        Assert.DoesNotContain(new RouteLeg(A, null), legs);
        Assert.DoesNotContain(legs, leg => leg.From is null && leg.To != A);
    }

    private static readonly int[][] FourOrders = [[A, B, C, D], [A, B, D, C], [A, C, D, B], [A, D, C, B]];

    [Fact]
    public void The_four_orders_of_ADR_0065_cover_all_thirteen_legs()
    {
        var result = RouteLegCoverage.Evaluate(4, FourOrders.Select(Pass).ToArray());
        Assert.Equal(RouteLegCoverage.Pass, result.Status);
        Assert.Empty(result.Missing);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void Dropping_one_of_the_four_orders_reports_exactly_the_legs_only_it_drove(int dropped)
    {
        var kept = FourOrders.Where((_, index) => index != dropped).ToArray();
        var result = RouteLegCoverage.Evaluate(4, kept.Select(Pass).ToArray());
        Assert.Equal(RouteLegCoverage.LegsIncomplete, result.Status);
        var drivenByOthers = kept.SelectMany(order => RouteLegCoverage.LegsOf(order)).ToHashSet();
        var onlyDropped = RouteLegCoverage.LegsOf(FourOrders[dropped]).Where(leg => !drivenByOthers.Contains(leg)).ToHashSet();
        Assert.NotEmpty(onlyDropped);
        Assert.True(onlyDropped.SetEquals(result.Missing));
    }

    [Fact]
    public void Without_A_C_D_B_the_missing_legs_are_A_to_C_and_D_to_B()
    {
        var result = RouteLegCoverage.Evaluate(4, new[] { FourOrders[0], FourOrders[1], FourOrders[3] }.Select(Pass).ToArray());
        // C -> D and B -> end are driven by A -> B -> C -> D and A -> D -> C -> B.
        Assert.True(new HashSet<RouteLeg> { new(A, C), new(D, B) }.SetEquals(result.Missing));
        Assert.Equal(13, result.Required.Count);
    }

    [Fact]
    public void Three_POIs_are_covered_by_A_B_C_and_A_C_B()
    {
        Assert.Equal(RouteLegCoverage.LegsIncomplete, RouteLegCoverage.Evaluate(3, [Pass([A, B, C])]).Status);
        var result = RouteLegCoverage.Evaluate(3, [Pass([A, B, C]), Pass([A, C, B])]);
        Assert.Equal(RouteLegCoverage.Pass, result.Status);
        Assert.Empty(result.Missing);
    }

    [Fact]
    public void The_newest_FAIL_wins_and_only_PASS_runs_after_it_count()
    {
        var fail = new RouteCoverageRun(Guid.NewGuid(), "FAIL", [A, C, B]);
        Assert.Equal(RouteLegCoverage.Fail, RouteLegCoverage.Evaluate(3, [Pass([A, B, C]), Pass([A, C, B]), fail]).Status);
        Assert.Equal(fail.Id, RouteLegCoverage.Evaluate(3, [Pass([A, B, C]), fail]).EffectiveRunId);

        var after = Pass([A, B, C]);
        var result = RouteLegCoverage.Evaluate(3, [Pass([A, C, B]), fail, after]);
        Assert.Equal(RouteLegCoverage.LegsIncomplete, result.Status);
        Assert.Equal(after.Id, result.EffectiveRunId);
        Assert.True(new HashSet<RouteLeg> { new(A, C), new(C, B), new(B, null) }.SetEquals(result.Missing));
    }

    [Fact]
    public void No_run_is_not_tested_and_a_PASS_without_an_order_covers_nothing()
    {
        var none = RouteLegCoverage.Evaluate(3, []);
        Assert.Equal((RouteLegCoverage.NotTested, (Guid?)null, 7), (none.Status, none.EffectiveRunId, none.Missing.Count));
        var unordered = RouteLegCoverage.Evaluate(3, [new RouteCoverageRun(Guid.NewGuid(), "PASS", null)]);
        Assert.Equal((RouteLegCoverage.LegsIncomplete, 7), (unordered.Status, unordered.Missing.Count));
    }

    [Theory]
    [InlineData(new[] { A, B, C }, true)]
    [InlineData(new[] { A, C, B }, true)]
    [InlineData(new[] { B, A, C }, false)] // does not start with the first POI
    [InlineData(new[] { A, B }, false)]    // misses a POI
    [InlineData(new[] { A, B, B }, false)] // a POI twice
    [InlineData(new[] { A, B, 0 }, false)] // a stop of another revision
    [InlineData(new int[0], false)]
    public void A_driven_order_starts_with_the_first_POI_and_names_every_POI_once(int[] order, bool valid) =>
        Assert.Equal(valid, RouteLegCoverage.OrderProblem(3, order) is null);

    [Fact]
    public void A_missing_order_is_refused() => Assert.NotNull(RouteLegCoverage.OrderProblem(3, null));

    // Duration: four POIs on a line, the start and end at (0,0), 30 s dwell each and 0.25 m/s.
    private static readonly RouteRevisionStop[] LineStops =
    [
        new() { StopOrder = 3, X = 3m, Y = 0m, DwellSeconds = 30 },
        new() { StopOrder = 1, X = 1m, Y = 0m, DwellSeconds = 30 },
        new() { StopOrder = 4, X = 4m, Y = 0m, DwellSeconds = 30 },
        new() { StopOrder = 2, X = 2m, Y = 0m, DwellSeconds = 30 },
    ];

    private static RouteRevision ReturnToStart(bool votes) => new()
    {
        StartX = 0m, StartY = 0m, StartYaw = 0m, EndMode = "POSE", EndX = 0m, EndY = 0m, EndYaw = 0m, ViewerChoosesNextStop = votes
    };

    [Fact]
    public void A_fixed_route_is_estimated_in_StopOrder()
    {
        // 0 -> 1 -> 2 -> 3 -> 4 -> 0 is 8 m = 32 s, plus 120 s dwell.
        Assert.Equal(120 + 32, TourSchedule.EstimatedDurationSeconds(ReturnToStart(false), LineStops, 0.25));
    }

    [Fact]
    public void A_voting_route_takes_the_longest_order_with_the_first_POI_fixed()
    {
        // The longest orders after the fixed first POI are 1 -> 3 -> 2 -> 4 and 1 -> 4 -> 2 -> 3: 1 + 9 = 10 m = 40 s.
        // Letting the first POI move would allow 0 -> 4 -> 1 -> 3 -> 2 -> 0 = 12 m, so 160 also shows it stays first.
        Assert.Equal(120 + 40, TourSchedule.EstimatedDurationSeconds(ReturnToStart(true), LineStops, 0.25));
    }

    [Fact]
    public void A_voting_route_of_three_POIs_compares_both_orders()
    {
        var stops = LineStops.Where(stop => stop.StopOrder <= 3).ToArray();
        // Fixed 0 -> 1 -> 2 -> 3 -> 0 = 6 m; 0 -> 1 -> 3 -> 2 -> 0 = 1 + 2 + 1 + 2 = 6 m too, so both give 24 s.
        Assert.Equal(90 + 24, TourSchedule.EstimatedDurationSeconds(ReturnToStart(true), stops, 0.25));
        // Stop 3 at (1,3): fixed 0 -> 1 -> 2 -> 3 -> 0 is 1 + 1 + sqrt(10) + sqrt(10) = 8.32 m = 34 s, while
        // 0 -> 1 -> 3 -> 2 -> 0 is 1 + 3 + sqrt(10) + 2 = 9.16 m = 37 s, and the vote route takes that one.
        stops = [stops.Single(s => s.StopOrder == 1), stops.Single(s => s.StopOrder == 2), new() { StopOrder = 3, X = 1m, Y = 3m, DwellSeconds = 30 }];
        Assert.Equal(90 + 34, TourSchedule.EstimatedDurationSeconds(ReturnToStart(false), stops, 0.25));
        Assert.Equal(90 + 37, TourSchedule.EstimatedDurationSeconds(ReturnToStart(true), stops, 0.25));
    }

    // Save rules.
    private static RouteRevisionDraftInput Draft(int stopCount = 3, int dwell = 30, bool votes = true, string endMode = "POSE",
        decimal? endX = 0m, decimal? endY = 0m, decimal? endYaw = 0m) =>
        new(Guid.NewGuid(), 0, "Tuyến bình chọn", null, Guid.NewGuid(), 0m, 0m, 0m, endMode, endX, endY, endYaw,
            Enumerable.Range(0, stopCount).Select(_ => new RouteRevisionStopInput(Guid.NewGuid(), dwell, [new("FRONT", 10)])).ToArray(), votes);

    private static string? Refusal(RouteRevisionDraftInput draft) =>
        Record.Exception(() => SaveRouteRevisionHandler.EnsureRouteShape(draft)) is ConflictException conflict ? conflict.Code : null;

    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    public void A_voting_route_of_three_or_four_POIs_returning_to_the_start_passes(int stops) =>
        Assert.Null(Refusal(Draft(stops)));

    [Theory]
    [InlineData(2)]
    [InlineData(5)]
    public void A_voting_route_outside_three_to_four_POIs_is_refused(int stops) =>
        Assert.Equal("ROUTE_VOTE_STOP_COUNT", Refusal(Draft(stops)));

    [Fact]
    public void A_voting_route_with_a_dwell_under_30_seconds_is_refused()
    {
        Assert.Equal(30, RouteRuleSettings.MinVoteDwellSeconds);
        Assert.Equal("ROUTE_VOTE_DWELL_TOO_SHORT", Refusal(Draft(dwell: 29)));
        // The same dwell on a fixed route is fine.
        Assert.Null(Refusal(Draft(dwell: 29, votes: false)));
    }

    [Theory]
    [InlineData("LAST_POI", null, null, null)]
    [InlineData("POSE", 5.0, 0.0, 0.0)]
    [InlineData("POSE", 0.0, 0.0, 1.5)] // the start position facing elsewhere is not the start pose
    public void A_voting_route_must_end_back_at_the_start(string endMode, double? x, double? y, double? yaw) =>
        Assert.Equal("ROUTE_VOTE_END_MUST_RETURN", Refusal(Draft(endMode: endMode, endX: (decimal?)x, endY: (decimal?)y, endYaw: (decimal?)yaw)));

    [Theory]
    [InlineData(5.0, 0.0, 0.0)]
    [InlineData(0.0, 0.0, 1.5)]
    public void Every_new_save_refuses_an_end_pose_other_than_the_start(double x, double y, double yaw)
    {
        var refusal = Record.Exception(() => SaveRouteRevisionHandler.EnsureRouteShape(
            Draft(stopCount: 2, votes: false, endX: (decimal)x, endY: (decimal)y, endYaw: (decimal)yaw)));
        var conflict = Assert.IsType<ConflictException>(refusal);
        Assert.Equal("ROUTE_END_POSE_NOT_START", conflict.Code);
        Assert.Contains("Quay về điểm bắt đầu", conflict.Message);
    }

    [Fact]
    public void A_fixed_route_may_stop_at_the_last_POI_or_return_to_the_start()
    {
        Assert.Null(Refusal(Draft(stopCount: 2, votes: false, endMode: "LAST_POI", endX: null, endY: null, endYaw: null)));
        Assert.Null(Refusal(Draft(stopCount: 2, votes: false)));
    }

    private static RouteCoverageRun Pass(int[] order) => new(Guid.NewGuid(), "PASS", order);
}
