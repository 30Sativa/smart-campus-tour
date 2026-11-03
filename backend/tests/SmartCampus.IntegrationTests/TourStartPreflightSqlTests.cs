using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.StartTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// The M2.1 Start preflight (ADR-0042, architecture §3.2): every check reads real data, and Start always refuses
/// without writing anything.
/// </summary>
public sealed class TourStartPreflightSqlTests
{
    private const string Transport = "commandTransportEnabled";

    [SchemaV11Fact]
    public async Task EveryCheckPasses_OnlyTheTransportBlocks_AndStartWritesNothing()
    {
        await using var w = await World.Create();
        var checks = await w.Checks();
        Assert.False(checks.CanStart);
        Assert.Equal([Transport], checks.BlockedBy);
        Assert.All(checks.Checks.Where(c => c.Id != Transport), c => Assert.True(c.Passed, c.Id));
        Assert.Contains(checks.Checks, c => c is { Id: "callerIsOperator", Passed: true });
        Assert.DoesNotContain(checks.Checks, c => c.Source == "OPERATOR_CONFIRMATION");
        Assert.Equal(["DB", "TELEMETRY", "CONSOLE", "CONFIG"], checks.Checks.Select(c => c.Source).Distinct().OrderBy(Order));
        Assert.Contains(checks.Checks, c => c is { Id: "noUnresolvedCommand", Passed: true } && c.Detail.Contains("command store"));
        Assert.Contains(checks.Checks, c => c is { Id: "batteryInfo", Passed: true, Source: "TELEMETRY" } && c.Detail.Contains("80"));

        var before = await w.State();
        var refused = await w.StartRefused();
        Assert.Equal("COMMAND_TRANSPORT_DISABLED", refused.Code);
        Assert.Equal([Transport], refused.BlockedBy);
        Assert.Equal(4, refused.Checks!.Count(c => c is { Source: "OPERATOR_CONFIRMATION", Passed: true }));
        Assert.Equal(before, await w.State());
    }

    [SchemaV11Fact]
    public async Task EachDatabaseCheck_FailsAlone_WithItsOwnId()
    {
        await using var w = await World.Create();
        await w.AssertBlocked(["tourReady"], "UPDATE dbo.Tours SET State = 'SCHEDULED';", "UPDATE dbo.Tours SET State = 'READY';");
        await w.AssertBlocked(["robotEligibleForRoute"],
            "UPDATE dbo.Robots SET FirstAcceptedSyncAt = NULL, FirstAcceptedMapKey = NULL, FirstAcceptedFrameId = NULL;",
            "UPDATE dbo.Robots SET FirstAcceptedSyncAt = SYSDATETIMEOFFSET(), FirstAcceptedMapKey = 'pilot', FirstAcceptedFrameId = 'map';");
        await w.AssertBlocked(["robotMapMatchesRoute"],
            "UPDATE dbo.Robots SET AssignedMapVersionId = NULL, AssignedAreaKey = NULL, MapAssignedAt = NULL, MapAssignedByUserId = NULL;", w.AssignMapSql);
        // Inspection is its own check; the open-incident stand-in does not report it again (ADR-0042 open decision 3, refined).
        await w.AssertBlocked(["robotNotNeedsInspection"],
            "UPDATE dbo.Robots SET NeedsInspection = 1;", "UPDATE dbo.Robots SET NeedsInspection = 0;");
        await w.AssertBlocked(["robotNotHeldByOtherTour"],
            $"UPDATE dbo.Robots SET CurrentTourId = '{w.OtherTourId}';", "UPDATE dbo.Robots SET CurrentTourId = NULL;");
        // A RUNNING Tour assigned to the robot needing assistance is an open incident even without CurrentTourId.
        await w.AssertBlocked(["noOpenIncident"],
            $"UPDATE dbo.Tours SET State = 'RUNNING', AssignedRobotId = (SELECT Id FROM dbo.Robots), OperationalStatus = 'NEEDS_ASSISTANCE' WHERE Id = '{w.OtherTourId}';",
            $"UPDATE dbo.Tours SET State = 'SCHEDULED', AssignedRobotId = NULL, OperationalStatus = NULL WHERE Id = '{w.OtherTourId}';");
        // Held by another Tour that needs assistance: two independent facts, each reported once.
        await w.AssertBlocked(["robotNotHeldByOtherTour", "noOpenIncident"],
            $"""
            UPDATE dbo.Tours SET OperationalStatus = 'NEEDS_ASSISTANCE' WHERE Id = '{w.OtherTourId}';
            UPDATE dbo.Robots SET CurrentTourId = '{w.OtherTourId}';
            """,
            $"""
            UPDATE dbo.Robots SET CurrentTourId = NULL;
            UPDATE dbo.Tours SET OperationalStatus = NULL WHERE Id = '{w.OtherTourId}';
            """);
        await w.AssertBlocked(["robotDispatchEnabled"], "UPDATE dbo.Robots SET IsDispatchEnabled = 0;", "UPDATE dbo.Robots SET IsDispatchEnabled = 1;");
        await w.AssertBlocked(["noPendingDecisions"], w.H.PendingRowSql(), "UPDATE dbo.RosterRows SET ParticipationState = 'REJECTED';");
        await w.AssertBlocked([]);
    }

    [SchemaV11Fact]
    public async Task WithoutReservation_OnlyTheRootCauseIsBlocking_AndRobotAndTelemetryChecksDoNotRun()
    {
        await using var w = await World.Create();
        var result = await w.AssertBlocked(["reservationActive"],
            $"UPDATE dbo.TourRobotReservations SET ReleasedAt = SYSDATETIMEOFFSET(), ReleasedByUserId = '{w.H.StaffId}';");
        foreach (var id in new[] { "robotEligibleForRoute", "robotMapMatchesRoute", "robotNotNeedsInspection", "robotNotHeldByOtherTour",
                     "robotDispatchEnabled", "noOpenIncident", "noUnresolvedCommand", "telemetryFresh", "mapContextMatches",
                     "executionIdle", "robotLocalized", "motionReady" })
        {
            var check = Assert.Single(result.Checks, c => c.Id == id);
            Assert.False(check.Passed);
            Assert.Contains("reservationActive", check.Detail);
        }
    }

    [SchemaV11Fact]
    public async Task AFailedRouteTestAfterReady_MakesTheRevisionUnschedulable()
    {
        await using var w = await World.Create();
        await w.H.FailRouteTest();
        var result = await w.AssertBlocked(["revisionStillSchedulable"]);
        Assert.Contains("ROUTE_TEST_PASS_REQUIRED", Assert.Single(result.Checks, c => c.Id == "revisionStillSchedulable").Detail);
    }

    [SchemaV11Fact]
    public async Task Telemetry_MissingStaleOrWrong_FailsItsOwnCheck()
    {
        await using var w = await World.Create();
        await w.AssertTelemetry(["robotLocalized"], localized: null);
        Assert.Equal("Robot chưa báo.", Assert.Single((await w.Checks()).Checks, c => c.Id == "robotLocalized").Detail);
        await w.AssertTelemetry(["robotLocalized"], localized: false);
        await w.AssertTelemetry(["motionReady"], motionReady: null);
        await w.AssertTelemetry(["motionReady"], motionReady: false);
        await w.AssertTelemetry(["mapContextMatches"], mapKey: "other-map");
        await w.AssertTelemetry(["mapContextMatches"], frameId: "odom");
        await w.AssertTelemetry(["executionIdle"], status: "NAVIGATING");
        await w.AssertTelemetry([], battery: null);

        // Exactly the limit is still fresh; one millisecond more is stale and the reported values are not judged.
        await w.Report();
        w.Clock.Now = w.Clock.Now!.Value.AddSeconds(2);
        await w.AssertBlocked([]);
        w.Clock.Now = w.Clock.Now!.Value.AddMilliseconds(1);
        var stale = await w.AssertBlocked(["telemetryFresh"]);
        Assert.All(stale.Checks.Where(c => c.Id is "mapContextMatches" or "executionIdle" or "robotLocalized" or "motionReady"),
            c => Assert.Contains("telemetryFresh", c.Detail));
    }

    [SchemaV11Fact]
    public async Task ARobotThatNeverReported_FailsTelemetryFresh()
    {
        await using var w = await World.Create(report: false);
        var result = await w.AssertBlocked(["telemetryFresh"]);
        Assert.Equal("Robot chưa báo telemetry.", Assert.Single(result.Checks, c => c.Id == "telemetryFresh").Detail);
    }

    [SchemaV11Fact]
    public async Task StartWindow_IncludesBothBounds_AndNothingOutside()
    {
        await using var w = await World.Create();
        foreach (var (offset, passes) in new[]
                 {
                     (TimeSpan.FromMilliseconds(-1), false), (TimeSpan.Zero, true),
                     (TimeSpan.FromMinutes(15), true), (TimeSpan.FromMinutes(15) + TimeSpan.FromMilliseconds(1), false)
                 })
        {
            w.Clock.Now = w.H.Start + offset;
            await w.Report();
            await w.AssertBlocked(passes ? [] : ["withinStartWindow"]);
        }
    }

    [SchemaV11Fact]
    public async Task OperatorConsoleWithoutSource_OrDisconnected_Fails()
    {
        await using var w = await World.Create();
        w.Console.Connected = null;
        var result = await w.AssertBlocked(["operatorConsoleConnected"]);
        Assert.Equal("CONSOLE", Assert.Single(result.Checks, c => c.Id == "operatorConsoleConnected").Source);
        w.Console.Connected = false;
        await w.AssertBlocked(["operatorConsoleConnected"]);
    }

    [SchemaV11Fact]
    public async Task EachMissingOrFalseConfirmation_FailsItsOwnCheck()
    {
        await using var w = await World.Create();
        var all = new TourStartConfirmation(true, true, true, true);
        foreach (var (id, confirmation) in new (string, TourStartConfirmation?)[]
                 {
                     ("robotPlaced", all with { RobotPlaced = null }), ("robotPlaced", all with { RobotPlaced = false }),
                     ("areaClear", all with { AreaClear = null }), ("areaClear", all with { AreaClear = false }),
                     ("attendantPresent", all with { AttendantPresent = null }), ("attendantPresent", all with { AttendantPresent = false }),
                     ("previewChecked", all with { PreviewChecked = null }), ("previewChecked", all with { PreviewChecked = false })
                 })
        {
            var refused = await w.StartRefused(confirmation);
            Assert.Equal("START_PRECONDITION_FAILED", refused.Code);
            Assert.Equal([id, Transport], refused.BlockedBy);
        }
        var none = await w.StartRefused(null, omitConfirmation: true);
        Assert.Equal(["robotPlaced", "areaClear", "attendantPresent", "previewChecked", Transport], none.BlockedBy);
    }

    [SchemaV11Fact]
    public async Task OnlyTheOperatorMayStart_OtherStaffSeeCallerIsOperatorFalse()
    {
        await using var w = await World.Create();
        var checks = await w.H.Send(new GetTourStartChecksQuery(w.H.TourId, w.H.StaffId));
        Assert.False(Assert.Single(checks.Checks, c => c.Id == "callerIsOperator").Passed);
        Assert.Equal(["callerIsOperator", Transport], checks.BlockedBy);
        // Independent: every other check still runs and reads exactly as the Operator sees it.
        var own = await w.Checks();
        Assert.Equal(own.Checks.Where(c => c.Id != "callerIsOperator").Select(c => (c.Id, c.Passed, c.Source)),
            checks.Checks.Where(c => c.Id != "callerIsOperator").Select(c => (c.Id, c.Passed, c.Source)));

        var before = await w.State();
        var version = await w.H.Version();
        await Assert.ThrowsAsync<ForbiddenException>(() => w.H.Send(new StartTourCommand(w.H.TourId, w.H.StaffId,
            new(Guid.NewGuid(), version, new(true, true, true, true)))));
        Assert.Equal("STALE_VERSION", (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new StartTourCommand(w.H.TourId,
            w.H.OperatorId, new(Guid.NewGuid(), Convert.ToBase64String(new byte[8]), new(true, true, true, true)))))).Code);
        Assert.Equal(before, await w.State());
    }

    [SchemaV11Fact]
    public async Task ConcurrentStarts_AreAllRefused_AndNothingIsWritten()
    {
        await using var w = await World.Create();
        var before = await w.State();
        var version = await w.H.Version();
        var errors = await Task.WhenAll(Enumerable.Range(0, 6).Select(async _ =>
        {
            try
            {
                await w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), version, new(true, true, true, true))));
                return null;
            }
            catch (Exception error) { return error; }
        }));
        Assert.All(errors, error => Assert.IsType<ConflictException>(error));
        Assert.Contains(errors, error => ((ConflictException)error!).Code == "COMMAND_TRANSPORT_DISABLED");
        Assert.Equal(before, await w.State());
    }

    private static int Order(string source) => Array.IndexOf(["DB", "TELEMETRY", "CONSOLE", "CONFIG"], source);

    private sealed class MutableClock : TimeProvider
    {
        public DateTimeOffset? Now { get; set; }
        public override DateTimeOffset GetUtcNow() => Now ?? base.GetUtcNow();
    }

    private sealed class FakeConsole : IOperatorConsolePresence
    {
        public bool? Connected { get; set; } = true;
        public bool? IsConnected(Guid userId) => Connected;
    }

    /// <summary>A READY Tour in its start window, with a dispatch-enabled robot on the route's map reporting idle.</summary>
    private sealed class World(TourReadySqlTests.Harness harness, MutableClock clock, FakeConsole console) : IAsyncDisposable
    {
        private readonly Guid stream = Guid.NewGuid();
        private long seq;

        public TourReadySqlTests.Harness H => harness;
        public MutableClock Clock => clock;
        public FakeConsole Console => console;
        public Guid OtherTourId { get; private set; }
        public string AssignMapSql => $"""
            UPDATE robot SET AssignedMapVersionId = map.Id, AssignedAreaKey = map.AreaKey,
                MapAssignedAt = SYSDATETIMEOFFSET(), MapAssignedByUserId = '{harness.TechnicalId}'
            FROM dbo.Robots robot CROSS JOIN dbo.RouteRevisions revision JOIN dbo.MapVersions map ON map.Id = revision.MapVersionId
            WHERE revision.Id = '{harness.Route.RevisionId}';
            """;
        private string mapKey = null!;
        private string frameId = null!;

        public static async Task<World> Create(bool report = true)
        {
            var clock = new MutableClock();
            var console = new FakeConsole();
            var harness = await TourReadySqlTests.Harness.Create(services =>
            {
                services.AddSingleton<TimeProvider>(clock);
                services.AddSingleton<IOperatorConsolePresence>(console);
            });
            var world = new World(harness, clock, console);
            // Created now, before the clock moves to the start: Tour create requires its lead time.
            world.OtherTourId = await harness.CreateTour(harness.Start.AddDays(1));
            await harness.Ready(new(Guid.NewGuid(), await harness.Version()));
            await harness.Database.ExecuteAsync(world.AssignMapSql + " UPDATE dbo.Robots SET IsDispatchEnabled = 1;");
            await using (var db = harness.Context())
            {
                var mapId = await db.RouteRevisions.AsNoTracking().Where(r => r.Id == harness.Route.RevisionId).Select(r => r.MapVersionId).SingleAsync();
                var map = await db.MapVersions.AsNoTracking().Where(m => m.Id == mapId).Select(m => new { m.MapKey, m.FrameId }).SingleAsync();
                (world.mapKey, world.frameId) = (map.MapKey, map.FrameId);
            }
            clock.Now = harness.Start.AddMinutes(1);
            if (report) await world.Report();
            return world;
        }

        public Task Report(bool? localized = true, bool? motionReady = true, string? mapKey = null, string? frameId = null,
            string status = "IDLE", double? battery = 80)
        {
            var now = clock.GetUtcNow();
            seq++;
            var report = new FleetTelemetryReport(TourReadySqlTests.Robot, stream, seq, DateTimeOffset.UnixEpoch.AddSeconds(seq),
                mapKey ?? this.mapKey, frameId ?? this.frameId, null, status, null, localized, motionReady, null, battery);
            return harness.Service<IFleetTelemetryStore>().ApplyAsync(new(new(TourReadySqlTests.Robot, "PHYSICAL", null, false,
                this.mapKey, this.frameId), report, now), CancellationToken.None);
        }

        public Task<TourStartChecks> Checks() => harness.Send(new GetTourStartChecksQuery(harness.TourId, harness.OperatorId));

        public async Task<ConflictException> StartRefused(TourStartConfirmation? confirmation = null, bool omitConfirmation = false) =>
            await Assert.ThrowsAsync<ConflictException>(async () => await harness.Send(new StartTourCommand(harness.TourId, harness.OperatorId,
                new(Guid.NewGuid(), await harness.Version(), omitConfirmation ? null : confirmation ?? new(true, true, true, true)))));

        /// <summary>
        /// Reports telemetry with one value changed, expects exactly these root causes (plus the transport) from the
        /// read and from Start, then reports the passing values again.
        /// </summary>
        public async Task AssertTelemetry(string[] ids, bool? localized = true, bool? motionReady = true, string? mapKey = null,
            string? frameId = null, string status = "IDLE", double? battery = 80)
        {
            await Report(localized, motionReady, mapKey, frameId, status, battery);
            await AssertBlocked(ids);
            await Report();
        }

        /// <summary>
        /// Applies <paramref name="breakSql"/>, expects exactly these root causes (plus the transport) from the read and
        /// from Start, checks nothing was written, then restores.
        /// </summary>
        public async Task<TourStartChecks> AssertBlocked(string[] ids, string? breakSql = null, string? restoreSql = null)
        {
            if (breakSql is not null) await harness.Database.ExecuteAsync(breakSql);
            string[] expected = [.. ids, Transport];
            var checks = await Checks();
            Assert.False(checks.CanStart);
            Assert.Equal(expected, checks.BlockedBy);
            Assert.All(checks.Checks.Where(c => expected.Contains(c.Id)), c => Assert.False(c.Passed));
            Assert.All(checks.Checks, c => Assert.False(string.IsNullOrWhiteSpace(c.Detail)));

            var before = await State();
            var refused = await StartRefused();
            Assert.Equal(ids.Length == 0 ? "COMMAND_TRANSPORT_DISABLED" : "START_PRECONDITION_FAILED", refused.Code);
            Assert.Equal(expected, refused.BlockedBy);
            Assert.Equal(before, await State());
            if (restoreSql is not null) await harness.Database.ExecuteAsync(restoreSql);
            return checks;
        }

        /// <summary>Everything Start must never write in M2.1.</summary>
        public async Task<string> State()
        {
            await using var db = harness.Context();
            var tours = await db.Tours.AsNoTracking().OrderBy(t => t.Id)
                .Select(t => new { t.Id, t.State, t.StartedAt, t.AssignedRobotId, t.CurrentLegId, t.RowVersion }).ToArrayAsync();
            var robots = await db.Robots.AsNoTracking().Select(r => new { r.CurrentTourId, r.LastAssignedAt, r.RowVersion }).ToArrayAsync();
            var events = await db.TourEvents.CountAsync();
            var audits = await db.AuditLogs.CountAsync();
            return string.Join('|', tours.Select(t => $"{t.Id}:{t.State}:{t.StartedAt}:{t.AssignedRobotId}:{t.CurrentLegId}:{Convert.ToBase64String(t.RowVersion)}"))
                + "#" + string.Join('|', robots.Select(r => $"{r.CurrentTourId}:{r.LastAssignedAt}:{Convert.ToBase64String(r.RowVersion)}"))
                + $"#{events}#{audits}";
        }

        public ValueTask DisposeAsync() => harness.DisposeAsync();
    }
}
