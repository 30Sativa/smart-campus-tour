using System.IO.Compression;
using System.Text;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.RobotCredentials;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Commands.MarkTourReady;
using SmartCampus.Application.Features.Tours.Commands.ReopenTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

/// <summary>READY and Reopen on a Tour scheduled from a tested revision (ADR-0042, architecture §3.2).</summary>
public sealed class TourReadySqlTests
{
    internal const string Robot = "amr_ready";

    [SchemaV11Fact]
    public async Task ARevisionSavedBeforeTheStopRules_IsStillReadAndScheduled()
    {
        // docs/lich-tour-theo-ca.md §2: the rules apply when a revision is saved; one already saved with a
        // single stop and a 3600 s dwell is not re-checked.
        await using var h = await Harness.Create();
        await h.Database.ExecuteAsync($"""
            DELETE dbo.RouteRevisionStops WHERE RouteRevisionId = '{h.Route.RevisionId}' AND StopOrder = 2;
            UPDATE dbo.RouteRevisionStops SET DwellSeconds = 3600 WHERE RouteRevisionId = '{h.Route.RevisionId}';
            """);

        var legacy = await h.Send(new GetRouteRevisionQuery(h.Route.RouteId, h.Route.RevisionId, false));
        Assert.Equal(3600, Assert.Single(legacy.Stops).DwellSeconds);
        Assert.Equal("PASS", legacy.VerificationStatus);
        Assert.NotEqual(h.TourId, await h.CreateTour(h.Start.AddDays(1)));
    }

    [SchemaV11Fact]
    public async Task MarkReady_LocksTheTour_RecordsEventAndReceipt_AndTouchesNoRobot()
    {
        await using var h = await Harness.Create();
        var detail = await h.Detail();
        Assert.True(detail.Permissions.CanMarkReady);
        Assert.Empty(detail.Permissions.ReadyBlockers!);

        await h.Ready(new(Guid.NewGuid(), detail.Tour.RowVersion));

        detail = await h.Detail();
        Assert.Equal("READY", detail.Tour.State);
        Assert.False(detail.Permissions.CanMarkReady);
        Assert.True(detail.Permissions.CanReopen);
        Assert.True(detail.Permissions.CanCancel);
        Assert.Equal(["TOUR_STATE_INVALID"], detail.Permissions.ReadyBlockers!.Select(b => b.Code));
        var twice = await Assert.ThrowsAsync<ConflictException>(() => h.Ready(new(Guid.NewGuid(), detail.Tour.RowVersion)));
        Assert.Equal(["TOUR_STATE_INVALID"], twice.Blockers!.Select(b => b.Code));
        await using var db = h.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync();
        Assert.False(tour.HasExecutionState);
        Assert.Null(tour.AssignedRobotId);
        Assert.Null(tour.StartedAt);
        Assert.All(await db.Robots.AsNoTracking().ToArrayAsync(), robot => Assert.Null(robot.CurrentTourId));
        var ready = await db.TourEvents.AsNoTracking().SingleAsync();
        Assert.Equal(("TOUR_READY", h.StaffId), (ready.EventType, ready.ActorUserId));
        Assert.Single(await db.AuditLogs.Where(a => a.Action == "TOUR_READY" && a.ActorUserId == h.StaffId).ToArrayAsync());
        Assert.Null((await db.TourRobotReservations.AsNoTracking().SingleAsync()).ReleasedAt);
    }

    [SchemaV11Fact]
    public async Task EachBlocker_IsReportedWithItsOwnCode_AndNothingIsWritten()
    {
        await using var h = await Harness.Create();
        await h.AssertBlocked(["START_TIME_PASSED"],
            $"UPDATE dbo.Tours SET ScheduledStartAt = DATEADD(MINUTE, -1, SYSDATETIMEOFFSET());",
            $"UPDATE dbo.Tours SET ScheduledStartAt = '{h.Start:O}';");
        await h.AssertBlocked(["OPERATOR_REQUIRED"],
            $"UPDATE dbo.Users SET IsActive = 0 WHERE Id = '{h.OperatorId}';",
            $"UPDATE dbo.Users SET IsActive = 1 WHERE Id = '{h.OperatorId}';");
        await h.AssertBlocked(["PENDING_DECISIONS"], h.PendingRowSql(), "UPDATE dbo.RosterRows SET ParticipationState = 'REJECTED';");
        // The robot rule needs the reserved robot, so only the root cause is reported.
        await h.AssertBlocked(["RESERVATION_MISSING"],
            $"UPDATE dbo.TourRobotReservations SET ReleasedAt = SYSDATETIMEOFFSET(), ReleasedByUserId = '{h.StaffId}';",
            "UPDATE dbo.TourRobotReservations SET ReleasedAt = NULL, ReleasedByUserId = NULL;");
        await h.AssertBlocked(["TOUR_STATE_INVALID"],
            "UPDATE dbo.Tours SET State = 'CANCELLED';", "UPDATE dbo.Tours SET State = 'SCHEDULED';");
        // A robot already holding the Tour is ownership, the same test Cancel and Edit apply.
        await h.AssertBlocked(["TOUR_STATE_INVALID"],
            $"UPDATE dbo.Robots SET CurrentTourId = '{h.TourId}';", "UPDATE dbo.Robots SET CurrentTourId = NULL;");
        Assert.True((await h.Detail()).Permissions.CanMarkReady);

        await h.FailRouteTest();
        await h.AssertBlocked(["ROUTE_TEST_PASS_REQUIRED"]);
        await h.Deactivate();
        await h.AssertBlocked(["ROUTE_TEST_PASS_REQUIRED", "ROBOT_NOT_READY_FOR_ROUTE"]);
    }

    [SchemaV11Fact]
    public async Task SeveralBlockers_AreAllReported_InTableOrder()
    {
        await using var h = await Harness.Create();
        await h.Database.ExecuteAsync($"""
            UPDATE dbo.Users SET IsActive = 0 WHERE Id = '{h.OperatorId}';
            UPDATE dbo.Tours SET ScheduledStartAt = DATEADD(MINUTE, -1, SYSDATETIMEOFFSET());
            {h.PendingRowSql()}
            """);
        await h.AssertBlocked(["OPERATOR_REQUIRED", "PENDING_DECISIONS", "START_TIME_PASSED"]);
    }

    [SchemaV11Fact]
    public async Task ConcurrentReady_HasOneWinner_AndOneConflict()
    {
        await using var h = await Harness.Create();
        var version = (await h.Detail()).Tour.RowVersion;
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Capture(h.Ready(new(Guid.NewGuid(), version)))));

        Assert.Single(results, error => error is null);
        var loser = Assert.IsType<ConflictException>(Assert.Single(results, error => error is not null));
        Assert.Contains(loser.Code, new[] { "STALE_VERSION", "TOUR_CONCURRENT_CHANGE" });
        await using var db = h.Context();
        Assert.Equal("READY", (await db.Tours.AsNoTracking().SingleAsync()).State);
        Assert.Single(await db.TourEvents.AsNoTracking().ToArrayAsync());
        Assert.Single(await db.AuditLogs.AsNoTracking().Where(a => a.Action == "TOUR_READY").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task Receipts_ReplayARetry_RefuseReuseAndStaleVersions()
    {
        await using var h = await Harness.Create();
        var opened = (await h.Detail()).Tour.RowVersion;
        var ready = new MarkTourReadyRequest(Guid.NewGuid(), opened);
        await h.Ready(ready);
        await h.Ready(ready);
        var readyVersion = (await h.Detail()).Tour.RowVersion;

        Assert.Equal("STALE_VERSION", (await Assert.ThrowsAsync<ConflictException>(() =>
            h.Reopen(new(Guid.NewGuid(), opened, "Sửa danh sách")))).Code);
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() =>
            h.Reopen(new(ready.RequestId, readyVersion, "Sửa danh sách")))).Code);
        var other = await h.CreateTour(h.Start.AddDays(1));
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() =>
            h.Send(new MarkTourReadyCommand(other, h.StaffId, ready with { ExpectedRowVersion = readyVersion })))).Code);

        var reopen = new ReopenTourRequest(Guid.NewGuid(), readyVersion, "Sửa danh sách");
        await h.Reopen(reopen);
        await h.Reopen(reopen);
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() =>
            h.Reopen(reopen with { Reason = "Lý do khác" }))).Code);

        await using var db = h.Context();
        Assert.Equal(["TOUR_READY", "TOUR_REOPENED"], await db.TourEvents.AsNoTracking().OrderBy(e => e.Id).Select(e => e.EventType).ToArrayAsync());
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "TOUR_READY"));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "TOUR_REOPENED"));
    }

    [SchemaV11Fact]
    public async Task Reopen_ReturnsToScheduled_KeepsTheReservation_AndAllowsReadyAgain()
    {
        await using var h = await Harness.Create();
        var scheduled = await h.Version();
        Assert.Equal("TOUR_STATE_INVALID", (await Assert.ThrowsAsync<ConflictException>(() =>
            h.Reopen(new(Guid.NewGuid(), scheduled, "Chưa READY")))).Code);
        await Assert.ThrowsAsync<ValidationException>(() => h.Reopen(new(Guid.NewGuid(), scheduled, "  ")));
        await h.Ready(new(Guid.NewGuid(), await h.Version()));
        await h.Reopen(new(Guid.NewGuid(), await h.Version(), "Cần duyệt dòng mới"));

        await using (var db = h.Context())
        {
            Assert.Equal("SCHEDULED", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == h.TourId)).State);
            var reservation = await db.TourRobotReservations.AsNoTracking().SingleAsync();
            Assert.Null(reservation.ReleasedAt);
            var reopened = await db.TourEvents.AsNoTracking().SingleAsync(e => e.EventType == "TOUR_REOPENED");
            Assert.Equal((h.StaffId, "Cần duyệt dòng mới"), (reopened.ActorUserId, reopened.ReasonNote));
        }
        var detail = await h.Detail();
        // Its own READY/Reopen events are not operational history, so the second READY is not refused.
        Assert.False(detail.Usage.HasOperationalHistory);
        Assert.True(detail.Permissions.CanEditMetadata);
        Assert.True(detail.Permissions.CanMarkReady);
        await h.Ready(new(Guid.NewGuid(), detail.Tour.RowVersion));
        Assert.Equal("READY", (await h.Detail()).Tour.State);
        await using var after = h.Context();
        Assert.Equal(["TOUR_READY", "TOUR_REOPENED", "TOUR_READY"],
            await after.TourEvents.AsNoTracking().OrderBy(e => e.Id).Select(e => e.EventType).ToArrayAsync());
    }

    private static async Task<Exception?> Capture(Task task)
    {
        try { await task; return null; }
        catch (Exception error) { return error; }
    }

    private static byte[] MapPackage(string marker)
    {
        var pgm = $"P2\n# {marker}\n4 4\n255\n254 254 254 254\n254 254 254 254\n254 254 254 254\n254 254 254 254\n";
        const string yaml = "image: map.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n";
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var (name, text) in new[] { ("map.yaml", yaml), ("map.pgm", pgm) })
            {
                using var entry = archive.CreateEntry(name).Open();
                entry.Write(Encoding.ASCII.GetBytes(text));
            }
        return stream.ToArray();
    }

    /// <summary>A versioned SCHEDULED Tour on a tested revision with its robot reserved; also used by the Start preflight tests.</summary>
    internal sealed class Harness(InitialAdminSeederTests.EmptySchemaDatabase database, ServiceProvider provider,
        Guid technicalId, Guid staffId, Guid operatorId) : IAsyncDisposable
    {
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public Guid StaffId => staffId;
        public Guid OperatorId => operatorId;
        public Guid TechnicalId => technicalId;
        public Guid TourId { get; private set; }
        public RouteRevisionView Route { get; private set; } = null!;
        public DateTimeOffset Start { get; } =
            new(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)).ToDateTime(new TimeOnly(8, 15)), TimeSpan.FromHours(7));
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);

        /// <summary><paramref name="configure"/> replaces services after the real registrations, e.g. the clock.</summary>
        public static async Task<Harness> Create(Action<IServiceCollection>? configure = null, bool twoStopsToEndPose = false)
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            var technical = await database.InsertUserAsync(true, username: "ready.technical", roles: ["TECHNICAL_STAFF"]);
            var staff = await database.InsertUserAsync(true, username: "ready.staff", roles: ["STAFF"]);
            var operatorUser = await database.InsertUserAsync(true, username: "ready.operator", roles: ["STAFF"]);
            var settings = InvitationPrimitiveTests.ConfigurationValues().ToDictionary(pair => pair.Key, pair => (string?)pair.Value);
            settings["ConnectionStrings:DefaultConnection"] = database.ConnectionString;
            settings["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey;
            settings["Tours:Shifts:0:Code"] = "S1"; settings["Tours:Shifts:0:Name"] = "Ca sáng";
            settings["Tours:Shifts:0:Start"] = "08:00"; settings["Tours:Shifts:0:End"] = "10:00";
            settings["Tours:Shifts:1:Code"] = "S2"; settings["Tours:Shifts:1:Name"] = "Ca chiều 1"; settings["Tours:Shifts:1:Start"] = "13:00"; settings["Tours:Shifts:1:End"] = "15:00";
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddApplication();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddInfrastructure(configuration);
            services.AddSingleton(new FleetSyncSettings(TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1), TimeSpan.FromSeconds(5)));
            configure?.Invoke(services);
            var harness = new Harness(database, services.BuildServiceProvider(), technical.Id, staff.Id, operatorUser.Id);
            await harness.Prepare(twoStopsToEndPose);
            return harness;
        }

        private async Task Prepare(bool twoStopsToEndPose)
        {
            var map = await Send(new CreateMapVersionCommand(technicalId, new("pilot", "Pilot", Guid.NewGuid(), MapPackage("ready"))));
            await using (var db = Context())
            {
                var now = DateTimeOffset.UtcNow;
                db.Robots.Add(new Robot { Id = Guid.NewGuid(), RobotCode = Robot, SourceType = "PHYSICAL", IsDispatchEnabled = false, CreatedAt = now,
                    FirstAcceptedSyncAt = now, FirstAcceptedMapKey = "pilot", FirstAcceptedFrameId = "map", CredentialHash = new byte[32],
                    CredentialHint = "abcd", CredentialIssuedAt = now, CredentialIssuedByUserId = technicalId });
                await db.SaveChangesAsync();
            }
            await Send(new RecordMapDeploymentCommand(technicalId, map.Id, new(Guid.NewGuid(), Robot, map.PackageSha256, true, true, "Kiểm tra triển khai.")));
            var library = await VerifiedPoi(map.Id, "Thư viện", 1.5m, 1.5m);
            // Every route has two stops (docs/lich-tour-theo-ca.md §2); twoStopsToEndPose now only adds the end pose.
            var stops = new List<RouteRevisionStopInput> { new(library, 30, [new("FRONT", 30)]),
                new(await VerifiedPoi(map.Id, "Phòng lab", 2.5m, 1.5m), 45, [new("FRONT", 45)]) };
            var route = await Send(new SaveRouteRevisionCommand(staffId, null, new(Guid.NewGuid(), 0, "Tuyến READY", null, map.Id, 2.5m, 2.5m, 0m,
                twoStopsToEndPose ? "POSE" : "LAST_POI", twoStopsToEndPose ? 1.5m : null, twoStopsToEndPose ? 2.5m : null, twoStopsToEndPose ? 0m : null, stops)));
            await Send(new SubmitRouteRevisionCommand(staffId, route.RouteId, route.RevisionId, new(Guid.NewGuid(), 1)));
            Route = await Send(new RecordRouteTestRunCommand(technicalId, route.RouteId, route.RevisionId,
                new(Guid.NewGuid(), Robot, staffId, "PASS", true, true, true, 260, null, "Chạy thử đạt.")));
            TourId = await CreateTour(Start);
        }

        private async Task<Guid> VerifiedPoi(Guid mapId, string name, decimal x, decimal y)
        {
            var proposal = await Send(new CreatePoiProposalCommand(staffId, new(Guid.NewGuid(), new(mapId, name, "Tham quan", null, x, y, 0m, "FRONT", "Đây là điểm tham quan."))));
            var submitted = await Send(new SubmitPoiProposalCommand(staffId, proposal.Id, new(Guid.NewGuid(), 1, proposal.RowVersion)));
            await Send(new RecordPoiVerificationCommand(technicalId, proposal.Id, 1, new(Guid.NewGuid(), 1, submitted.RowVersion, Robot, "PASS", true, true, true, true, null, "Kiểm tra tại chỗ.")));
            return proposal.Revision.Id;
        }

        public async Task<Guid> CreateTour(DateTimeOffset start) =>
            (await Send(new CreateTourCommand(staffId, new(Guid.NewGuid(), new("Tour READY", null, Route.RevisionId, Robot, operatorId, start, null))))).Id;

        public async Task<TResponse> Send<TResponse>(IRequest<TResponse> request)
        {
            await using var scope = provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
        }

        public T Service<T>() where T : notnull => provider.GetRequiredService<T>();

        public Task<TourDetails> Detail() => Send(new GetTourQuery(TourId));
        public async Task<string> Version() => (await Detail()).Tour.RowVersion;
        public Task<TourMutationResult> Ready(MarkTourReadyRequest request) => Send(new MarkTourReadyCommand(TourId, staffId, request));
        public Task<TourMutationResult> Reopen(ReopenTourRequest request) => Send(new ReopenTourCommand(TourId, staffId, request));

        public Task FailRouteTest() => Send(new RecordRouteTestRunCommand(technicalId, Route.RouteId, Route.RevisionId,
            new(Guid.NewGuid(), Robot, staffId, "FAIL", false, true, true, 260, "Kẹt ở cửa", "Chạy lại không đạt.")));

        public async Task Deactivate()
        {
            await using var db = Context();
            var robot = await db.Robots.AsNoTracking().SingleAsync(item => item.RobotCode == Robot);
            await Send(new DeactivatePhysicalRobotCommand(robot.Id, technicalId, new(Guid.NewGuid(), Convert.ToBase64String(robot.RowVersion), "Hỏng động cơ")));
        }

        /// <summary>One registration whose only row still waits for Staff review.</summary>
        public string PendingRowSql()
        {
            var registration = Guid.NewGuid();
            return $"""
                INSERT dbo.GroupRegistrations (Id, TourId, RepresentativeUserId, SchoolName, GroupName, ContactName, ContactEmail, State, SubmittedAt, CreatedAt)
                VALUES ('{registration}', '{TourId}', '{staffId}', N'THPT Thử', N'Nhóm', N'Liên hệ', N'contact@example.test', 'SUBMITTED', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
                INSERT dbo.RosterRows (Id, RegistrationId, RowNumber, RowType, DisplayName, Email, IsActive, CreatedAt)
                VALUES ('{Guid.NewGuid()}', '{registration}', 1, 'SHARED_VIEWING', N'Phòng', N'room@example.test', 1, SYSDATETIMEOFFSET());
                """;
        }

        /// <summary>Applies <paramref name="breakSql"/>, expects exactly these blockers from detail and Mark READY, then restores.</summary>
        public async Task AssertBlocked(string[] codes, string? breakSql = null, string? restoreSql = null)
        {
            if (breakSql is not null) await database.ExecuteAsync(breakSql);
            var detail = await Detail();
            Assert.False(detail.Permissions.CanMarkReady);
            Assert.Equal(codes, detail.Permissions.ReadyBlockers!.Select(b => b.Code));
            var refused = await Assert.ThrowsAsync<ConflictException>(() => Ready(new(Guid.NewGuid(), detail.Tour.RowVersion)));
            Assert.Equal("READY_PRECONDITION_FAILED", refused.Code);
            Assert.Equal(codes, refused.Blockers!.Select(b => b.Code));
            Assert.All(refused.Blockers!, b => Assert.False(string.IsNullOrWhiteSpace(b.Message)));
            await using (var db = Context())
            {
                Assert.NotEqual("READY", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == TourId)).State);
                Assert.Empty(await db.TourEvents.AsNoTracking().ToArrayAsync());
                Assert.Empty(await db.AuditLogs.AsNoTracking().Where(a => a.Action == "TOUR_READY").ToArrayAsync());
            }
            if (restoreSql is not null) await database.ExecuteAsync(restoreSql);
        }

        public async ValueTask DisposeAsync()
        {
            await provider.DisposeAsync();
            await database.DisposeAsync();
        }
    }
}
