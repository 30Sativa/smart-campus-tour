using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.RobotDiagnostics;
using SmartCampus.Application.Features.RobotDiagnostics.Commands.IngestRobotDiagnostics;
using SmartCampus.Application.Features.RobotDiagnostics.Queries.GetRobotDiagnostics;
using SmartCampus.Application.Features.RobotDiagnostics.Queries.GetTechnicalDashboard;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class RobotDiagnosticsTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 5, 8, 0, 0, TimeSpan.Zero);
    private static readonly FleetSyncSettings Settings = new(
        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));

    private static FleetRobotIdentity TestIdentity(string code = "amr-01") =>
        new(code, "PHYSICAL", null, false);

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    [Fact]
    public async Task IngestValidator_AcceptsValidReport()
    {
        var validator = new IngestRobotDiagnosticsValidator(new FixedTimeProvider(Now));
        var report = new RobotDiagnosticsReport(
            "amr-01",
            Now.AddSeconds(-5),
            new MiniPcResourcesReport(25.4, new MemoryMetric(16000000000, 8000000000, 8000000000, 50.0),
                new GpuMetric(false, null, null, null, null),
                new DiskMetric("/", 120000000000, 60000000000, 50.0),
                48.5),
            new Ros2SystemReport("OK", [new Ros2NodeStatus("stm32_bridge", "ACTIVE", 20.0)], true, "IDLE"),
            new SensorHealthReport(
                new SensorStatus("OK", "LiDAR running 10Hz", 10.0, Now.AddSeconds(-1)),
                new ImuSensorStatus("OK", "IMU yaw fresh", true, 0, 0, 0, Now.AddSeconds(-1)),
                new SensorStatus("OK", "Odom OK", 20.0, Now.AddSeconds(-1)),
                new SensorStatus("NOT_EQUIPPED", "Camera disabled", null, null)));

        var result = await validator.ValidateAsync(new IngestRobotDiagnostics(TestIdentity("amr-01"), report));

        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task IngestValidator_RejectsRobotIdMismatch()
    {
        var validator = new IngestRobotDiagnosticsValidator(new FixedTimeProvider(Now));
        var report = new RobotDiagnosticsReport("amr-02", Now, null, null, null);

        var result = await validator.ValidateAsync(new IngestRobotDiagnostics(TestIdentity("amr-01"), report));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Report.RobotId");
    }

    [Fact]
    public async Task IngestValidator_RejectsStaleTimestamp()
    {
        var validator = new IngestRobotDiagnosticsValidator(new FixedTimeProvider(Now));
        var report = new RobotDiagnosticsReport("amr-01", Now.AddMinutes(-10), null, null, null);

        var result = await validator.ValidateAsync(new IngestRobotDiagnostics(TestIdentity("amr-01"), report));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Report.ReportedAt");
    }

    [Fact]
    public async Task IngestValidator_RejectsInvalidCpuOrTemperatureRange()
    {
        var validator = new IngestRobotDiagnosticsValidator(new FixedTimeProvider(Now));
        var report = new RobotDiagnosticsReport(
            "amr-01",
            Now,
            new MiniPcResourcesReport(150.0, null, null, null, 200.0),
            null,
            null);

        var result = await validator.ValidateAsync(new IngestRobotDiagnostics(TestIdentity("amr-01"), report));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Report.MiniPc.CpuPercent");
        Assert.Contains(result.Errors, e => e.PropertyName == "Report.MiniPc.CpuTemperatureCelsius");
    }

    [Fact]
    public async Task IngestHandler_StoresSnapshotAndReturnsAccepted()
    {
        var store = new TestDiagnosticsStore();
        var handler = new IngestRobotDiagnosticsHandler(store, new FixedTimeProvider(Now));
        var report = new RobotDiagnosticsReport("amr-01", Now, null, null, null);

        var result = await handler.Handle(new IngestRobotDiagnostics(TestIdentity("amr-01"), report), CancellationToken.None);

        Assert.True(result.Accepted);
        Assert.Equal(Now, result.ReceivedAt);
        Assert.NotNull(store.GetLatest("amr-01"));
    }

    [Fact]
    public async Task GetRobotDiagnostics_ThrowsNotFound_WhenRobotDoesNotExist()
    {
        var repo = new TestRobotRepository([], []);
        var telemetry = new TestTelemetryStore([]);
        var diag = new TestDiagnosticsStore();

        var handler = new GetRobotDiagnosticsQueryHandler(
            repo, telemetry, diag, Settings, new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new GetRobotDiagnosticsQuery("amr-unknown"), CancellationToken.None));
    }

    [Fact]
    public async Task GetRobotDiagnostics_HandlesIndependentDataAvailability_WhenDiagnosticsMissing()
    {
        // Core requirement: robot is in database, has telemetry, but has never sent diagnostics
        var robot = new Robot
        {
            Id = Guid.NewGuid(),
            RobotCode = "amr-01",
            DisplayName = "AMR 01",
            FirstAcceptedSyncAt = Now.AddDays(-1),
            RowVersion = [1, 2, 3]
        };

        var repo = new TestRobotRepository([robot], []);
        var telemetryReport = new FleetTelemetryReport(
            "amr-01", Guid.NewGuid(), 10, Now.AddSeconds(-2), "map_01", "odom",
            new FleetPose(1.0, 2.0, 0.5, Now.AddSeconds(-2)), "IDLE", null, true, true, null, 85.0);

        var telemetry = new TestTelemetryStore([new FleetTelemetrySnapshot(TestIdentity("amr-01"), telemetryReport, Now.AddSeconds(-2))]);
        var diag = new TestDiagnosticsStore();

        var handler = new GetRobotDiagnosticsQueryHandler(
            repo, telemetry, diag, Settings, new FixedTimeProvider(Now));

        var result = await handler.Handle(new GetRobotDiagnosticsQuery("amr-01"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("amr-01", result.RobotCode);
        Assert.Equal("CONNECTED", result.ConnectionStatus);
        Assert.True(result.TelemetryFresh);
        Assert.Equal(85.0, result.BatteryPercent);
        Assert.True(result.Localized);
        // Diagnostics are independently missing without error
        Assert.False(result.DiagnosticsFresh);
        Assert.Null(result.MiniPc);
        Assert.Null(result.Ros2);
        Assert.Null(result.Sensors);
    }

    [Fact]
    public async Task GetTechnicalDashboard_AggregatesKpisAndFlagsActionItems()
    {
        var robotHeld = new Robot
        {
            Id = Guid.NewGuid(),
            RobotCode = "amr-held",
            DisplayName = "Held Robot",
            NeedsInspection = true,
            RowVersion = [1, 0, 0]
        };

        var robotNormal = new Robot
        {
            Id = Guid.NewGuid(),
            RobotCode = "amr-normal",
            DisplayName = "Normal Robot",
            FirstAcceptedSyncAt = Now.AddHours(-1),
            RowVersion = [0, 1, 0]
        };

        var repo = new TestRobotRepository([robotHeld, robotNormal], []);
        // Map upload stores "VALID" (CreateMapVersionCommand); only those count as usable map versions.
        var mapRepo = new TestMapRepository([
            new MapVersion { Id = Guid.NewGuid(), MapKey = "library-v1", ValidationStatus = "VALID" },
            new MapVersion { Id = Guid.NewGuid(), MapKey = "library-v2", ValidationStatus = "INVALID" }
        ]);
        var telemetry = new TestTelemetryStore([]);
        var diag = new TestDiagnosticsStore();
        var sender = new TestSender();

        var handler = new GetTechnicalDashboardQueryHandler(
            repo, mapRepo, telemetry, diag, sender, Settings, new FixedTimeProvider(Now));

        var result = await handler.Handle(new GetTechnicalDashboardQuery(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(2, result.Kpis.TotalRobots);
        Assert.Equal(1, result.Kpis.HeldForInspectionCount);
        Assert.Equal(1, result.Kpis.ActiveMapVersionsCount);
        Assert.Contains(result.ActionItems, item => item.Type == "HELD_ROBOT" && item.TargetId == robotHeld.Id.ToString());
    }

    [Fact]
    public async Task GetTechnicalDashboard_HeldRobotSaysTrảRobot_AndQueuesLinkToTheRenamedPages()
    {
        var held = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-held", NeedsInspection = true, RowVersion = [1] };

        var result = await Dashboard(new TestRobotRepository([held], []), new TestSender(queued: 1));

        Assert.Equal("Robot bị giữ cần kiểm tra. Cần kiểm tra tại chỗ rồi trả robot.",
            Assert.Single(result.ActionItems, item => item.Type == "HELD_ROBOT").Description);
        Assert.Equal("/technical/pois", Assert.Single(result.ActionItems, item => item.Type == "POI_QUEUE").LinkUrl);
        Assert.Equal("/technical/route-tests", Assert.Single(result.ActionItems, item => item.Type == "ROUTE_QUEUE").LinkUrl);
        Assert.Equal("/technical/route-tests", Assert.Single(result.ActionItems, item => item.Type == "ROUTE_RERUN").LinkUrl);
    }

    [Fact]
    public async Task GetTechnicalDashboard_MapMismatch_SaysTheRobotListsReadinessSentence()
    {
        var robot = AssignedRobot("amr_01", TestMap);
        var check = PassingCheck(robot, Betea);

        var result = await Dashboard(new TestRobotRepository([robot], [check]), new TestSender());

        var item = Assert.Single(result.ActionItems, item => item.Type == "MAP_MISMATCH");
        // Round 3: the readiness sentence names the map the robot holds; the Betea history is only its detail.
        Assert.Equal("Robot amr_01 chưa kiểm tra triển khai trên Tầng 6 · test123 · phiên bản 1 (gán lúc 04/11 15:00).", item.Description);
        Assert.Equal(RobotMapReadiness.EvaluateOnAssignedMap(robot, check).Message, item.Description);
    }

    [Fact]
    public async Task GetTechnicalDashboard_RobotRefusedForTheWrongMap_IsWrongMapNotDisconnected()
    {
        var robot = AssignedRobot("amr_01", TestMap);
        var telemetry = new TestTelemetryStore([new FleetTelemetrySnapshot(TestIdentity("amr_01"),
            new FleetTelemetryReport("amr_01", Guid.NewGuid(), 1, Now.AddMinutes(-5), "test123-v1", "map", null, "IDLE", null, true, true, null, 80),
            Now.AddMinutes(-5))]);
        telemetry.RecordRejected("amr_01", new FleetRejectedReport("betea-v1", "map", Now.AddSeconds(-3)));

        var result = await new GetTechnicalDashboardQueryHandler(new TestRobotRepository([robot], []), new TestMapRepository([]), telemetry,
            new TestDiagnosticsStore(), new TestSender(), Settings, new FixedTimeProvider(Now)).Handle(new GetTechnicalDashboardQuery(), CancellationToken.None);

        var summary = Assert.Single(result.Robots);
        Assert.Equal("WRONG_MAP", summary.ConnectionStatus);
        Assert.Equal("betea-v1", summary.LastRejectedReport?.MapKey);
        Assert.Equal((1, 0), (result.Kpis.WrongMapRobots, result.Kpis.DisconnectedRobots));
    }

    [Fact]
    public async Task GetTechnicalDashboard_UpcomingToursTheRobotCannotRun_AreOneWarningPerRobot()
    {
        // amr_01 holds and passed Tầng 6 (test123); amr_02 is connected but holds no map.
        var first = AssignedRobot("amr_01", TestMap);
        var second = new Robot { Id = Guid.NewGuid(), RobotCode = "amr_02", FirstAcceptedSyncAt = Now.AddDays(-1), RowVersion = [2] };
        var onBetea = new RouteRevision { Id = Guid.NewGuid(), MapVersionId = Betea.Id, MapPackageSha256 = Betea.PackageSha256 };
        var onTest = new RouteRevision { Id = Guid.NewGuid(), MapVersionId = TestMap.Id, MapPackageSha256 = TestMap.PackageSha256 };
        UpcomingTourTarget Tour(string name, TimeSpan after, Robot robot, RouteRevision revision) =>
            new(Guid.NewGuid(), name, Now + after, robot.Id, revision, revision == onBetea ? Betea : TestMap);
        var repo = new TestRobotRepository([first, second], [PassingCheck(first, TestMap)],
        [
            Tour("Tham quan lầu 6", TimeSpan.FromDays(2), first, onBetea),
            Tour("Tham quan sớm", TimeSpan.FromDays(1), first, onBetea),
            Tour("Chạy được", TimeSpan.FromHours(3), first, onTest),
            Tour("Tour robot hai", TimeSpan.FromDays(3), second, onTest)
        ]);

        var result = await Dashboard(repo, new TestSender());

        Assert.Equal((Now, Now + TimeSpan.FromDays(7)), repo.UpcomingWindow);
        var items = result.ActionItems.Where(item => item.Type == "TOUR_ROBOT_NOT_READY").ToArray();
        Assert.Equal(2, items.Length);
        Assert.All(items, item => Assert.Equal("WARNING", item.Severity));
        Assert.Equal(("2 Tour sắp tới của robot amr_01 chưa chạy được",
                "Robot amr_01 đang gán Tầng 6 · test123 · phiên bản 1, không phải bản đồ này. Sớm nhất: Tour Tham quan sớm 06/11 15:00.",
                first.Id.ToString(), $"/technical/robots?robot={first.Id}"),
            (items[0].Title, items[0].Description, items[0].TargetId, items[0].LinkUrl));
        Assert.Equal(("Tour Tour robot hai 08/11 15:00 chưa chạy được", "Robot amr_02 chưa được gán bản đồ.", $"/technical/robots?robot={second.Id}"),
            (items[1].Title, items[1].Description, items[1].LinkUrl));
    }

    [Fact]
    public void BackendText_NoLongerSaysGiảiPhóng()
    {
        var src = Path.Combine(FindBackend(), "src");
        var offenders = Directory.EnumerateFiles(src, "*.cs", SearchOption.AllDirectories)
            .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}") &&
                File.ReadAllText(path).Contains("giải phóng", StringComparison.OrdinalIgnoreCase))
            .Select(path => Path.GetRelativePath(src, path)).ToArray();
        // A held robot is "Chờ kiểm tra tại chỗ" and its button is "Trả robot" (technical-readiness round 2, F1).
        Assert.Empty(offenders);
    }

    private static readonly MapVersion TestMap = Map("test123", "Tầng 6", [1, 1]);
    private static readonly MapVersion Betea = Map("betea", "Betea", [2, 2]);

    private static MapVersion Map(string areaKey, string areaName, byte[] sha) => new()
    {
        Id = Guid.NewGuid(), AreaKey = areaKey, VersionNumber = 1, MapKey = $"{areaKey}-v1", FrameId = "map", PackageSha256 = sha,
        ValidationStatus = "VALID", AreaKeyNavigation = new MapArea { AreaKey = areaKey, DisplayName = areaName }
    };

    private static Robot AssignedRobot(string code, MapVersion map) => new()
    {
        Id = Guid.NewGuid(), RobotCode = code, FirstAcceptedSyncAt = Now.AddDays(-1), AssignedMapVersionId = map.Id,
        AssignedMapVersion = map, AssignedAreaKey = map.AreaKey, MapAssignedAt = Now.AddDays(-1), RowVersion = [1]
    };

    private static MapDeploymentCheck PassingCheck(Robot robot, MapVersion map) => new()
    {
        Id = Guid.NewGuid(), RobotId = robot.Id, Robot = robot, MapVersionId = map.Id, MapVersion = map, PackageSha256 = map.PackageSha256,
        LocalizationPassed = true, DisplayPassed = true, CheckedAt = Now.AddHours(-2)
    };

    private static Task<TechnicalDashboardDto> Dashboard(TestRobotRepository repo, TestSender sender) =>
        new GetTechnicalDashboardQueryHandler(repo, new TestMapRepository([]), new TestTelemetryStore([]), new TestDiagnosticsStore(),
            sender, Settings, new FixedTimeProvider(Now)).Handle(new GetTechnicalDashboardQuery(), CancellationToken.None);

    private static string FindBackend()
    {
        for (var current = new DirectoryInfo(AppContext.BaseDirectory); current is not null; current = current.Parent)
            if (File.Exists(Path.Combine(current.FullName, "SmartCampus.slnx")))
                return current.FullName;
        throw new DirectoryNotFoundException("Cannot find backend/SmartCampus.slnx.");
    }

    private sealed class TestRobotRepository(IReadOnlyList<Robot> robots, IReadOnlyList<MapDeploymentCheck> deploymentChecks,
        IReadOnlyList<UpcomingTourTarget>? upcomingTours = null) : IPhysicalRobotRepository
    {
        public (DateTimeOffset From, DateTimeOffset To)? UpcomingWindow { get; private set; }
        public Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken) => Task.FromResult(robots);
        public Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksAsync(CancellationToken cancellationToken) => Task.FromResult(deploymentChecks);
        public Task<IReadOnlyList<UpcomingTourTarget>> ListUpcomingTourTargetsAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken)
        {
            UpcomingWindow = (from, to);
            return Task.FromResult(upcomingTours ?? []);
        }
        public Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken) => Task.FromResult(false);
        public void Add(Robot robot) => throw new NotSupportedException();
        public void AddAuditLog(AuditLog auditLog) => throw new NotSupportedException();
    }

    private sealed class TestMapRepository(IReadOnlyList<MapVersion> versions) : IMapVersionRepository
    {
        public Task<IReadOnlyList<MapVersion>> ListMapVersionsAsync(string? areaKey, int take, bool includeRetired, CancellationToken cancellationToken) => Task.FromResult(versions);
        public Task<IReadOnlyList<MapArea>> ListMapAreasAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<MapArea>>([]);
        public Task<MapArea?> LockAreaAsync(string areaKey, CancellationToken cancellationToken) => Task.FromResult<MapArea?>(null);
        public Task<MapArea?> GetAreaAsync(string areaKey, CancellationToken cancellationToken) => Task.FromResult<MapArea?>(null);
        public Task<MapVersion?> FindMapUploadRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) => Task.FromResult<MapVersion?>(null);
        public Task<int> GetNextMapVersionAsync(string areaKey, CancellationToken cancellationToken) => Task.FromResult(1);
        public Task<int?> FindVersionNumberByPackageAsync(string areaKey, byte[] packageSha256, CancellationToken cancellationToken) => Task.FromResult<int?>(null);
        public Task<MapVersion?> FindMapVersionAsync(Guid id, bool includePackage, CancellationToken cancellationToken) => Task.FromResult<MapVersion?>(null);
        public Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksForPhysicalRobotsAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<MapDeploymentCheck>>([]);
        public Task<MapDeploymentCheck?> FindDeploymentRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) => Task.FromResult<MapDeploymentCheck?>(null);
        public Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken cancellationToken) => Task.FromResult<Robot?>(null);
        public Task<IReadOnlyList<Robot>> ListAssignedPhysicalRobotsAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Robot>>([]);
        public Task<Robot?> ReadRobotForReadinessAsync(Guid robotId, CancellationToken cancellationToken) => Task.FromResult<Robot?>(null);
        public Task LockNewAreaNamesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
        public Task LockRobotDeploymentStateAsync(Guid robotId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<bool> LockAndReadConnectionConfirmationAsync(Guid robotId, CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<MapDeploymentCheck?> GetLatestDeploymentCheckForRobotAsync(Guid robotId, CancellationToken cancellationToken) => Task.FromResult<MapDeploymentCheck?>(null);
        public Task<MapDeploymentCheck?> GetLatestDeploymentCheckAsync(Guid mapVersionId, Guid? robotId, CancellationToken cancellationToken) => Task.FromResult<MapDeploymentCheck?>(null);
        public Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksForMapAsync(Guid mapVersionId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<MapDeploymentCheck>>([]);
        public Task LockMapPreparationStateAsync(Guid mapVersionId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<bool> IsMapVersionRetiredAsync(Guid mapVersionId, CancellationToken cancellationToken) => Task.FromResult(false);
        public Task<(bool Found, DateTimeOffset? RetiredAt)> LockMapVersionRowAsync(Guid mapVersionId, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task SetMapVersionRetirementAsync(Guid mapVersionId, DateTimeOffset? retiredAt, Guid? retiredByUserId, string? reason, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<MapRetirementImpact> GetMapRetirementImpactAsync(Guid mapVersionId, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksAsync(Guid mapVersionId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<MapDeploymentCheck>>([]);
        public void Add(MapArea area) => throw new NotSupportedException();
        public void Add(MapVersion mapVersion) => throw new NotSupportedException();
        public void Add(MapDeploymentCheck deploymentCheck) => throw new NotSupportedException();
        public void AddAuditLog(AuditLog auditLog) => throw new NotSupportedException();
    }

    private sealed class TestTelemetryStore(IReadOnlyList<FleetTelemetrySnapshot> snapshots) : IFleetTelemetryStore
    {
        public Task<FleetTelemetryApplyResult> ApplyAsync(FleetTelemetrySnapshot snapshot, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public IReadOnlyList<FleetTelemetrySnapshot> GetLatest() => snapshots;
        private readonly Dictionary<string, FleetRejectedReport> rejected = new(StringComparer.Ordinal);
        public void RecordRejected(string robotCode, FleetRejectedReport report) => rejected[robotCode] = report;
        public FleetRejectedReport? GetLatestRejected(string robotCode) => rejected.GetValueOrDefault(robotCode);
    }

    private sealed class TestDiagnosticsStore : IRobotDiagnosticsStore
    {
        private readonly Dictionary<string, RobotDiagnosticsSnapshot> store = new(StringComparer.OrdinalIgnoreCase);

        public Task<bool> ApplyAsync(RobotDiagnosticsSnapshot snapshot, CancellationToken cancellationToken)
        {
            store[snapshot.RobotCode] = snapshot;
            return Task.FromResult(true);
        }

        public RobotDiagnosticsSnapshot? GetLatest(string robotCode) =>
            store.TryGetValue(robotCode, out var snapshot) ? snapshot : null;

        public IReadOnlyList<RobotDiagnosticsSnapshot> GetAll() => store.Values.ToArray();
    }

    /// <summary>Each queue holds <paramref name="queued"/> rows; the dashboard only counts them.</summary>
    private sealed class TestSender(int queued = 0) : ISender
    {
        private List<T> Rows<T>() => Enumerable.Repeat(default(T)!, queued).ToList();

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
        {
            if (request is ListPoiVerificationQueueQuery)
                return Task.FromResult((TResponse)(object)Rows<PoiVerificationQueueItem>());
            if (request is ListRouteRerunQueueQuery)
                return Task.FromResult((TResponse)(object)Rows<RouteRevisionView>());

            if (request is ListRouteRevisionQueueQuery)
                return Task.FromResult((TResponse)(object)Rows<RouteRevisionView>());

            throw new NotSupportedException($"Unhandled request {request.GetType().Name}");
        }

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default) where TRequest : IRequest =>
            throw new NotSupportedException();

        public Task<object?> Send(object request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
