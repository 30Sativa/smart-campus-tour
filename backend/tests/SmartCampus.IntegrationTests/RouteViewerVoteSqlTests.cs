using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Commands.MarkTourReady;
using SmartCampus.Application.Features.Tours.Queries.GetTour;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0065 route rules and test-run coverage, on SQL Server (schema v1.25).</summary>
public sealed class RouteViewerVoteSqlTests
{
    [SchemaV11Fact]
    public async Task ASeparateEndPose_IsRefusedOnANewSave_WhileARevisionSavedWithOne_StillRuns()
    {
        // The harness writes the end pose (1.5, 2.5) the way a revision saved before ADR-0065 holds it.
        await using var h = await TourReadySqlTests.Harness.Create(twoStopsToEndPose: true);
        Assert.Equal(("POSE", 1.5m, 2.5m), (h.Route.EndMode, h.Route.EndX, h.Route.EndY));
        Assert.Equal("PASS", h.Route.VerificationStatus);

        var refused = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new SaveRouteRevisionCommand(h.StaffId, h.Route.RouteId,
            Copy(h.Route, "Đổi mô tả"))));
        Assert.Equal("ROUTE_END_POSE_NOT_START", refused.Code);
        Assert.Contains("Quay về điểm bắt đầu", refused.Message);
        await using (var db = h.Context())
            Assert.Equal(1, await db.RouteRevisions.CountAsync(revision => revision.RouteId == h.Route.RouteId));

        // The old revision is read, tested and scheduled as before.
        var old = await h.Send(new GetRouteRevisionQuery(h.Route.RouteId, h.Route.RevisionId, false));
        Assert.Equal(("PASS", false, (RouteLegCoverageView?)null), (old.VerificationStatus, old.ViewerChoosesNextStop, old.LegCoverage));
        var rerun = await h.Send(new RecordRouteTestRunCommand(h.TechnicalId, h.Route.RouteId, h.Route.RevisionId,
            new(Guid.NewGuid(), TourReadySqlTests.Robot, h.StaffId, "PASS", true, true, true, null, "Chạy lại đạt.")));
        Assert.Equal("PASS", rerun.VerificationStatus);
        Assert.NotEqual(h.TourId, await h.CreateTour(h.Start.AddDays(1)));

        // Choosing again: back at the start is accepted.
        var back = await h.Send(new SaveRouteRevisionCommand(h.StaffId, h.Route.RouteId,
            Copy(h.Route, "Quay về") with { EndX = h.Route.StartX, EndY = h.Route.StartY, EndYaw = h.Route.StartYaw }));
        Assert.Equal((2, "NOT_TESTED"), (back.RevisionNumber, back.VerificationStatus));
    }

    [SchemaV11Fact]
    public async Task AFixedRoute_BehavesAsBefore()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        Assert.Equal(("PASS", false, (RouteLegCoverageView?)null), (h.Route.VerificationStatus, h.Route.ViewerChoosesNextStop, h.Route.LegCoverage));
        // A fixed route ignores an order sent with its run and stores none.
        var run = await h.Send(new RecordRouteTestRunCommand(h.TechnicalId, h.Route.RouteId, h.Route.RevisionId,
            new(Guid.NewGuid(), TourReadySqlTests.Robot, h.StaffId, "PASS", true, true, true, null, "Đạt.", [h.Route.Stops[1].Id])));
        Assert.Equal("PASS", run.VerificationStatus);
        await using var db = h.Context();
        Assert.All(await db.RouteTestRuns.AsNoTracking().ToArrayAsync(), stored => Assert.Null(stored.TraversedStopIdsJson));
        Assert.All(await db.RouteRevisions.AsNoTracking().ToArrayAsync(), stored => Assert.False(stored.ViewerChoosesNextStop));
    }

    [SchemaV11Fact]
    public async Task AVotingRoute_IsSavedOnlyWithThreeToFourPOIs_LongEnoughDwell_AndTheReturnToStart()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var (a, b) = (h.Route.Stops[0].PoiRevisionId, h.Route.Stops[1].PoiRevisionId);
        var c = await h.VerifiedPoi(h.MapId, "Hội trường", 1.5m, 2.5m);

        Assert.Equal("ROUTE_VOTE_STOP_COUNT", (await Refusal(h, Voting(h.MapId, [a, b]))).Code);
        Assert.Equal("ROUTE_VOTE_DWELL_TOO_SHORT", (await Refusal(h, Voting(h.MapId, [a, b, c]) with
            { Stops = [new(a, 30, [new("FRONT", 10)]), new(b, 29, [new("FRONT", 10)]), new(c, 30, [new("FRONT", 10)])] })).Code);
        Assert.Equal("ROUTE_VOTE_END_MUST_RETURN", (await Refusal(h, Voting(h.MapId, [a, b, c]) with
            { EndMode = "LAST_POI", EndX = null, EndY = null, EndYaw = null })).Code);

        var saved = await h.Send(new SaveRouteRevisionCommand(h.StaffId, null, Voting(h.MapId, [a, b, c])));
        Assert.True(saved.ViewerChoosesNextStop);
        Assert.Equal("NOT_TESTED", saved.VerificationStatus);
        Assert.Equal((7, 0, 7), (saved.LegCoverage!.RequiredCount, saved.LegCoverage.CoveredCount, saved.LegCoverage.MissingLegs.Count));
        Assert.True(saved.RevisionHistory.Single().ViewerChoosesNextStop);
        await using var db = h.Context();
        Assert.True((await db.RouteRevisions.AsNoTracking().SingleAsync(revision => revision.Id == saved.RevisionId)).ViewerChoosesNextStop);
    }

    [SchemaV11Fact]
    public async Task AVotingRoute_NeedsEveryLegCovered_BeforeATourOrREADY_AndSharesTheResultAcrossSavesOfItsPath()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var (a, b) = (h.Route.Stops[0].PoiRevisionId, h.Route.Stops[1].PoiRevisionId);
        var c = await h.VerifiedPoi(h.MapId, "Hội trường", 1.5m, 2.5m);
        var route = await h.Send(new SaveRouteRevisionCommand(h.StaffId, null, Voting(h.MapId, [a, b, c])));
        await h.Send(new SubmitRouteRevisionCommand(h.StaffId, route.RouteId, route.RevisionId, new(Guid.NewGuid(), 1)));
        var (sa, sb, sc) = (route.Stops[0].Id, route.Stops[1].Id, route.Stops[2].Id);

        // The driven order is required, starts with the first POI and names each POI once.
        foreach (var order in new IReadOnlyList<Guid>?[] { null, [sb, sa, sc], [sa, sb], [sa, sb, sb], [sa, sb, h.Route.Stops[0].Id] })
            Assert.Equal("ROUTE_TEST_ORDER_INVALID", (await Assert.ThrowsAsync<ConflictException>(() => Run(h, route, "PASS", order))).Code);

        var first = await Run(h, route, "PASS", [sa, sb, sc]);
        Assert.Equal("LEGS_INCOMPLETE", first.VerificationStatus);
        Assert.Equal((7, 4), (first.LegCoverage!.RequiredCount, first.LegCoverage.CoveredCount));
        Assert.Equal([(sa, "Thư viện", sc, "Hội trường"), (sc, "Hội trường", sb, "Phòng lab"), (sb, "Phòng lab", null, "Điểm kết thúc")],
            first.LegCoverage.MissingLegs.Select(leg => (leg.FromStopId, leg.FromName, leg.ToStopId, leg.ToName)).ToArray());
        Assert.Equal([sa, sb, sc], first.TestRuns.Last().TraversedStopIds!);
        var incomplete = await h.Send(new GetRouteRevisionQuery(route.RouteId, route.RevisionId, false));
        Assert.Equal(("LEGS_INCOMPLETE", 3), (incomplete.VerificationStatus, incomplete.LegCoverage!.MissingLegs.Count));
        Assert.Contains(await h.Send(new ListRouteRevisionQueueQuery()), queued => queued.RevisionId == route.RevisionId);
        var noTour = await Assert.ThrowsAsync<ConflictException>(() => CreateTour(h, route.RevisionId, h.Start.AddDays(1)));
        Assert.Equal("ROUTE_TEST_PASS_REQUIRED", noTour.Code);
        Assert.Contains("3/7 chặng", noTour.Message);
        Assert.Contains("Phòng lab → Điểm kết thúc", noTour.Message);

        var second = await Run(h, route, "PASS", [sa, sc, sb]);
        Assert.Equal(("PASS", 7, 0), (second.VerificationStatus, second.LegCoverage!.CoveredCount, second.LegCoverage.MissingLegs.Count));
        await using (var db = h.Context())
        {
            var stored = await db.RouteTestRuns.AsNoTracking().SingleAsync(run => run.Id == second.EffectiveTestRunId);
            Assert.Equal([sa, sc, sb], JsonSerializer.Deserialize<Guid[]>(stored.TraversedStopIdsJson!)!);
        }
        var tourId = await CreateTour(h, route.RevisionId, h.Start.AddDays(1));
        var detail = await h.Send(new GetTourQuery(tourId));
        Assert.Equal(second.ExpectedDurationSeconds, detail.Reservation!.ExpectedDurationSeconds);

        // A dwell-only save keeps the path, so it shares the coverage; its stop ids are new.
        var dwell = await h.Send(new SaveRouteRevisionCommand(h.StaffId, route.RouteId, Voting(h.MapId, [a, b, c], expected: 1, dwell: 40)));
        Assert.Equal(("PASS", 7), (dwell.VerificationStatus, dwell.LegCoverage!.CoveredCount));
        Assert.DoesNotContain(dwell.Stops, stop => stop.Id == sa);
        // Switching the flag off changes the path: a fixed route needs its own run.
        var fixedRoute = await h.Send(new SaveRouteRevisionCommand(h.StaffId, route.RouteId, Voting(h.MapId, [a, b, c], expected: 2) with { ViewerChoosesNextStop = false }));
        Assert.Equal(("NOT_TESTED", false, (RouteLegCoverageView?)null), (fixedRoute.VerificationStatus, fixedRoute.ViewerChoosesNextStop, fixedRoute.LegCoverage));
        Assert.NotEqual(dwell.ConfigurationFingerprint, fixedRoute.ConfigurationFingerprint);

        // A newer FAIL wins; a PASS after it starts the coverage again, and READY refuses the Tour meanwhile.
        Assert.Equal("FAIL", (await Run(h, route, "FAIL", [sa, sb, sc])).VerificationStatus);
        var again = await Run(h, route, "PASS", [sa, sb, sc]);
        Assert.Equal(("LEGS_INCOMPLETE", 4), (again.VerificationStatus, again.LegCoverage!.CoveredCount));
        await h.AddAcceptedRow(tourId);
        var version = (await h.Send(new GetTourQuery(tourId))).Tour.RowVersion;
        var ready = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new MarkTourReadyCommand(tourId, h.StaffId,
            new(Guid.NewGuid(), version))));
        Assert.Contains(ready.Blockers!, blocker => blocker.Code == "ROUTE_TEST_PASS_REQUIRED" && blocker.Message.Contains("chặng"));
    }

    private static async Task<ConflictException> Refusal(TourReadySqlTests.Harness h, RouteRevisionDraftInput draft)
    {
        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new SaveRouteRevisionCommand(h.StaffId, null, draft)));
        await using var db = h.Context();
        Assert.Equal(1, await db.RouteRevisions.CountAsync());
        return error;
    }

    /// <summary>A voting route from the harness start (2.5, 2.5), returning to it.</summary>
    private static RouteRevisionDraftInput Voting(Guid mapId, IReadOnlyList<Guid> pois, int expected = 0, int dwell = 30) =>
        new(Guid.NewGuid(), expected, "Tuyến bình chọn", null, mapId, 2.5m, 2.5m, 0m, "POSE", 2.5m, 2.5m, 0m,
            pois.Select(poi => new RouteRevisionStopInput(poi, dwell, [new("FRONT", 10)])).ToArray(), true);

    private static RouteRevisionDraftInput Copy(RouteRevisionView view, string description) =>
        new(Guid.NewGuid(), view.RevisionNumber, view.Name, description, view.MapVersionId, view.StartX, view.StartY, view.StartYaw,
            view.EndMode, view.EndX, view.EndY, view.EndYaw,
            view.Stops.Select(stop => new RouteRevisionStopInput(stop.PoiRevisionId, stop.DwellSeconds, stop.HeadSteps)).ToArray());

    private static Task<RouteRevisionView> Run(TourReadySqlTests.Harness h, RouteRevisionView route, string result, IReadOnlyList<Guid>? order) =>
        h.Send(new RecordRouteTestRunCommand(h.TechnicalId, route.RouteId, route.RevisionId, result == "PASS"
            ? new(Guid.NewGuid(), TourReadySqlTests.Robot, h.StaffId, "PASS", true, true, true, null, "Chạy thử đạt.", order)
            : new(Guid.NewGuid(), TourReadySqlTests.Robot, h.StaffId, "FAIL", false, true, true, "Kẹt ở cửa", "Không đạt.", order)));

    private static async Task<Guid> CreateTour(TourReadySqlTests.Harness h, Guid revisionId, DateTimeOffset start) =>
        (await h.Send(new CreateTourCommand(h.StaffId, new(Guid.NewGuid(), new("Tour bình chọn", null, revisionId,
            TourReadySqlTests.Robot, h.OperatorId, start, null, 20))))).Id;
}
