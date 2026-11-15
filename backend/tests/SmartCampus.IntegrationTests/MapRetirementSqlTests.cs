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
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0041: a map version is retired, never deleted, and every writer of new work refuses it.</summary>
public sealed class MapRetirementSqlTests
{
    private const string First = "amr_first";
    private const string Second = "amr_second";

    [SchemaV11Fact]
    public async Task Retire_RecordsWhoWhenWhy_LeavesPickers_AndKeepsOldDataReadable()
    {
        await using var h = await Harness.Create();
        var route = await h.TestedRoute();

        var retired = await h.Retire(h.PilotMap.Id, "Bản đồ cũ sau khi quét lại");

        Assert.Equal("RETIRED", retired.Status);
        Assert.Equal(h.TechnicalId, retired.RetiredByUserId);
        Assert.Equal("Bản đồ cũ sau khi quét lại", retired.RetirementReason);
        Assert.Equal("Robot technical", retired.RetiredByName);
        await using (var db = h.Context())
        {
            var row = await db.MapVersions.AsNoTracking().SingleAsync(map => map.Id == h.PilotMap.Id);
            Assert.NotNull(row.RetiredAt);
            var audit = await db.AuditLogs.AsNoTracking().SingleAsync(entry => entry.Action == "MAP_VERSION_RETIRED");
            Assert.Equal(h.PilotMap.Id.ToString("D"), audit.EntityId);
            Assert.Equal(h.TechnicalId, audit.ActorUserId);
        }

        // Pickers no longer offer it; Map Management still reads it, with its status.
        Assert.DoesNotContain(await h.Send(new ListMapVersionsQuery(null, 50)), item => item.Map.Id == h.PilotMap.Id);
        var managed = Assert.Single(await h.Send(new ListMapVersionsQuery(null, 50, IncludeRetired: true)), item => item.Map.Id == h.PilotMap.Id);
        Assert.Equal("RETIRED", managed.Map.Status);
        Assert.False(managed.CanUseForPoiPreparation);
        Assert.Equal("MAP_VERSION_RETIRED", managed.PreparationBlockReasonCode);
        Assert.Equal("RETIRED", (await h.Send(new GetMapVersionQuery(h.PilotMap.Id))).Map.Status);

        // Nothing written on it changed or disappeared.
        Assert.Equal(2, (await h.Send(new ListPoiProposalsQuery(h.PilotMap.Id))).Count);
        var revision = await h.Send(new GetRouteRevisionQuery(route.RouteId, route.RevisionId, false));
        Assert.Equal("PASS", revision.VerificationStatus);
        Assert.Single(await h.Send(new ListMapDeploymentChecksQuery(h.PilotMap.Id)));
        Assert.NotEmpty((await h.Send(new GetMapPackageQuery(h.PilotMap.Id))).Bytes);
        Assert.Equal(route.RouteId, Assert.Single((await h.Send(new GetMapRetirementImpactQuery(h.PilotMap.Id))).Routes).RouteId);
    }

    [SchemaV11Fact]
    public async Task RetiredVersion_RefusesEveryNewWrite()
    {
        await using var h = await Harness.Create();
        var route = await h.TestedRoute();
        var proposal = (await h.Send(new ListPoiProposalsQuery(h.PilotMap.Id)))[0];
        await h.Retire(h.PilotMap.Id, "Ngừng dùng");

        static async Task Refused(Func<Task> write) =>
            Assert.Equal("MAP_VERSION_RETIRED", (await Assert.ThrowsAsync<ConflictException>(write)).Code);

        await Refused(() => h.Assign(First, h.PilotMap.Id));
        await Refused(() => h.RecordDeployment(h.PilotMap, First, passed: true));
        await Refused(() => h.Send(new CreatePoiProposalCommand(h.StaffId, new(Guid.NewGuid(), h.Draft(h.PilotMap.Id, "Cổng mới")))));
        await Refused(() => h.Send(new CreatePoiRevisionCommand(h.StaffId, proposal.Id,
            new(Guid.NewGuid(), proposal.CurrentRevision, proposal.RowVersion, h.Draft(h.PilotMap.Id, "Thư viện mới")))));
        await Refused(() => h.Send(new PreviewPoiImportQuery(new(h.PilotMap.Id, First, [new("a.yaml", [1])]))));
        await Refused(() => h.Send(new ImportPoiFilesCommand(h.TechnicalId, new(Guid.NewGuid(), h.PilotMap.Id, First, "Nhập thử", [new("a.yaml", [1])]))));
        await Refused(() => h.SaveRoute(null, 0, h.PilotMap.Id, route));
        await Refused(() => h.SaveRoute(route.RouteId, route.RevisionNumber, h.PilotMap.Id, route));
        await Refused(() => h.CreateTour(route, First));
        await Refused(() => h.Slots(route, First));

        // Another version of the same area is untouched.
        await h.RecordDeployment(h.PilotMapV2, Second, passed: true);
        await h.Assign(First, h.PilotMapV2.Id);
    }

    [SchemaV11Fact]
    public async Task Retire_IsRefused_WhileAnActiveRobotIsAssignedTheVersion()
    {
        await using var h = await Harness.Create();
        await h.Assign(First, h.PilotMap.Id);

        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Retire(h.PilotMap.Id, "Cũ"));

        Assert.Equal("MAP_VERSION_ROBOT_ASSIGNED", error.Code);
        Assert.Contains(First, error.Message);
        Assert.Equal(First, Assert.Single(error.Blockers!).Message);
        await h.AssertActive(h.PilotMap.Id);
        await h.Assign(First, null);
        await h.Retire(h.PilotMap.Id, "Cũ");
    }

    [SchemaV11Fact]
    public async Task Retire_IsRefused_WhileASubmittedPoiWaitsForTechnical()
    {
        await using var h = await Harness.Create();
        var proposal = await h.Send(new CreatePoiProposalCommand(h.StaffId, new(Guid.NewGuid(), h.Draft(h.PilotMap.Id, "Hội trường"))));
        await h.Send(new SubmitPoiProposalCommand(h.StaffId, proposal.Id, new(Guid.NewGuid(), 1, proposal.RowVersion)));

        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Retire(h.PilotMap.Id, "Cũ"));

        Assert.Equal("MAP_VERSION_HAS_PENDING_REVIEWS", error.Code);
        Assert.Equal("Hội trường · phiên bản 1", Assert.Single(error.Blockers!).Message);
        Assert.Equal(proposal.Id, Assert.Single((await h.Send(new GetMapRetirementImpactQuery(h.PilotMap.Id))).PendingPois).ProposalId);
        await h.AssertActive(h.PilotMap.Id);
    }

    [SchemaV11Fact]
    public async Task Retire_IsRefused_WhileASubmittedRouteWaitsForItsTestRun()
    {
        await using var h = await Harness.Create();
        var route = await h.SubmittedRoute();

        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Retire(h.PilotMap.Id, "Cũ"));

        Assert.Equal("MAP_VERSION_HAS_PENDING_REVIEWS", error.Code);
        Assert.Contains(error.Blockers!, blocker => blocker.Code == "ROUTE");
        Assert.Equal(route.RevisionId, Assert.Single((await h.Send(new GetMapRetirementImpactQuery(h.PilotMap.Id))).PendingRoutes).RevisionId);
        await h.AssertActive(h.PilotMap.Id);
    }

    [SchemaV11Fact]
    public async Task Retire_IsRefused_WhileAScheduledTourUsesARouteOnTheVersion()
    {
        await using var h = await Harness.Create();
        var route = await h.TestedRoute();
        var tour = await h.CreateTour(route, First);

        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Retire(h.PilotMap.Id, "Cũ"));

        Assert.Equal("MAP_VERSION_HAS_UPCOMING_TOURS", error.Code);
        Assert.Equal("Tour robot", Assert.Single(error.Blockers!).Message);
        Assert.Equal(tour, Assert.Single((await h.Send(new GetMapRetirementImpactQuery(h.PilotMap.Id))).UpcomingTours).TourId);
        await h.AssertActive(h.PilotMap.Id);
        await using var db = h.Context();
        Assert.Equal("SCHEDULED", (await db.Tours.AsNoTracking().SingleAsync()).State);
    }

    [SchemaV11Fact]
    public async Task TwoSimultaneousRetires_OnlyOneSucceeds()
    {
        await using var h = await Harness.Create();
        var rowVersion = h.PilotMap.RowVersion;

        var results = await Task.WhenAll(
            Capture(h.Send(new RetireMapVersionCommand(h.TechnicalId, h.PilotMap.Id, new("Người thứ nhất", rowVersion)))),
            Capture(h.Send(new RetireMapVersionCommand(h.SecondTechnicalId, h.PilotMap.Id, new("Người thứ hai", rowVersion)))));

        Assert.Single(results, error => error is null);
        Assert.Equal("MAP_VERSION_STALE", Assert.IsType<ConflictException>(Assert.Single(results, error => error is not null)).Code);
        await using var db = h.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(entry => entry.Action == "MAP_VERSION_RETIRED"));
    }

    [SchemaV11Fact]
    public async Task Reopen_LiftsTheStop_AndNewWorkIsAcceptedAgain()
    {
        await using var h = await Harness.Create();
        var route = await h.TestedRoute();
        var retired = await h.Retire(h.PilotMap.Id, "Tạm ngừng");

        var reopened = await h.Send(new ReopenMapVersionCommand(h.TechnicalId, h.PilotMap.Id, new(retired.RowVersion)));
        var again = await h.Send(new ReopenMapVersionCommand(h.TechnicalId, h.PilotMap.Id, new(null)));

        Assert.Equal("ACTIVE", reopened.Status);
        Assert.Null(reopened.RetiredAt);
        Assert.Null(reopened.RetiredByUserId);
        Assert.Null(reopened.RetirementReason);
        Assert.Equal(reopened.RowVersion, again.RowVersion);
        await using (var db = h.Context())
            Assert.Equal(1, await db.AuditLogs.CountAsync(entry => entry.Action == "MAP_VERSION_REOPENED"));
        Assert.Contains(await h.Send(new ListMapVersionsQuery(null, 50)), item => item.Map.Id == h.PilotMap.Id);
        await h.Send(new CreatePoiProposalCommand(h.StaffId, new(Guid.NewGuid(), h.Draft(h.PilotMap.Id, "Cổng mới"))));
        await h.RecordDeployment(h.PilotMap, First, passed: true);
        Assert.NotEqual(Guid.Empty, await h.CreateTour(route, First));
        await h.Assign(Second, h.PilotMap.Id);
    }

    [SchemaV11Fact]
    public async Task Retire_RefusesAStaleVersion_AndRequiresAReason()
    {
        await using var h = await Harness.Create();
        var stale = await Assert.ThrowsAsync<ConflictException>(() =>
            h.Send(new RetireMapVersionCommand(h.TechnicalId, h.PilotMap.Id, new("Cũ", MapRetirement.RowVersionOf(DateTimeOffset.UnixEpoch)))));
        Assert.Equal("MAP_VERSION_STALE", stale.Code);
        await Assert.ThrowsAsync<ValidationException>(() =>
            h.Send(new RetireMapVersionCommand(h.TechnicalId, h.PilotMap.Id, new("   ", h.PilotMap.RowVersion))));
        await h.AssertActive(h.PilotMap.Id);

        var retired = await h.Retire(h.PilotMap.Id, "Cũ");
        var reopenStale = await Assert.ThrowsAsync<ConflictException>(() =>
            h.Send(new ReopenMapVersionCommand(h.TechnicalId, h.PilotMap.Id, new(h.PilotMap.RowVersion))));
        Assert.Equal("MAP_VERSION_STALE", reopenStale.Code);
        Assert.Equal("RETIRED", (await h.Send(new GetMapVersionQuery(retired.Id))).Map.Status);
    }

    [SchemaV11Fact]
    public async Task TheNewestVersionOfAnArea_CanBeRetired_AndTheAreaShowsTheNearestOpenOne()
    {
        await using var h = await Harness.Create();

        await h.Retire(h.PilotMapV2.Id, "Quét lỗi");

        var open = await h.Send(new ListMapVersionsQuery("pilot", 50));
        Assert.Equal(h.PilotMap.Id, Assert.Single(open).Map.Id);
        Assert.Equal(2, (await h.Send(new ListMapVersionsQuery("pilot", 50, IncludeRetired: true))).Count);
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

    private sealed class Harness(InitialAdminSeederTests.EmptySchemaDatabase database, ServiceProvider provider, Guid technicalId,
        Guid secondTechnicalId, Guid staffId, Guid operatorId, MapVersionView pilotMap, MapVersionView pilotMapV2) : IAsyncDisposable
    {
        public Guid TechnicalId => technicalId;
        public Guid SecondTechnicalId => secondTechnicalId;
        public Guid StaffId => staffId;
        public MapVersionView PilotMap => pilotMap;
        public MapVersionView PilotMapV2 => pilotMapV2;
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);

        public static async Task<Harness> Create()
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            var technical = await database.InsertUserAsync(true, username: "robot.technical", roles: ["TECHNICAL_STAFF"]);
            var secondTechnical = await database.InsertUserAsync(true, username: "second.technical", roles: ["TECHNICAL_STAFF"]);
            var staff = await database.InsertUserAsync(true, username: "robot.staff", roles: ["STAFF"]);
            var operatorUser = await database.InsertUserAsync(true, username: "robot.operator", roles: ["STAFF"]);
            await database.ExecuteAsync($"UPDATE dbo.Users SET FullName=N'Robot technical' WHERE Id='{technical.Id:D}';");
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
            var provider = services.BuildServiceProvider();

            async Task<MapVersionView> Upload(string marker)
            {
                await using var scope = provider.CreateAsyncScope();
                return await scope.ServiceProvider.GetRequiredService<ISender>().Send(
                    new CreateMapVersionCommand(technical.Id, new("pilot", "Tầng 6", Guid.NewGuid(), MapPackage(marker))));
            }
            var pilot = await Upload("a");
            var pilotV2 = await Upload("b");
            var harness = new Harness(database, provider, technical.Id, secondTechnical.Id, staff.Id, operatorUser.Id, pilot, pilotV2);
            await harness.AddRobot(First);
            await harness.AddRobot(Second);
            await harness.RecordDeployment(pilot, First, passed: true);
            return harness;
        }

        public async Task<TResponse> Send<TResponse>(IRequest<TResponse> request)
        {
            await using var scope = provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
        }

        public async Task<MapVersionView> Retire(Guid mapVersionId, string reason)
        {
            var current = (await Send(new GetMapVersionQuery(mapVersionId))).Map;
            return await Send(new RetireMapVersionCommand(technicalId, mapVersionId, new(reason, current.RowVersion)));
        }

        public async Task AssertActive(Guid mapVersionId)
        {
            Assert.Equal("ACTIVE", (await Send(new GetMapVersionQuery(mapVersionId))).Map.Status);
            await using var db = Context();
            Assert.Equal(0, await db.AuditLogs.CountAsync(entry => entry.Action == "MAP_VERSION_RETIRED"));
        }

        public PoiProposalDraft Draft(Guid mapVersionId, string name) =>
            new(mapVersionId, name, "Tham quan", null, 1.5m, 2.5m, 0m, "FRONT", "Đây là điểm tham quan.");

        public async Task<Robot> Robot(string code)
        {
            await using var db = Context();
            return await db.Robots.AsNoTracking().SingleAsync(robot => robot.RobotCode == code);
        }

        public async Task<RobotMapAssignmentView> Assign(string code, Guid? mapVersionId)
        {
            var robot = await Robot(code);
            return await Send(new ChangePhysicalRobotMapAssignmentCommand(robot.Id, technicalId, Guid.NewGuid(), Convert.ToBase64String(robot.RowVersion), mapVersionId));
        }

        public Task RecordDeployment(MapVersionView map, string robot, bool passed) =>
            Send(new RecordMapDeploymentCommand(technicalId, map.Id, new(Guid.NewGuid(), robot, map.PackageSha256, passed, true, "Kiểm tra triển khai.")));

        private async Task<List<RouteRevisionStopInput>> PassedStops()
        {
            // A route needs two stops one metre apart (docs/lich-tour-theo-ca.md §2).
            var stops = new List<RouteRevisionStopInput>();
            foreach (var (name, x) in new[] { ("Thư viện", 1.5m), ("Phòng lab", 2.5m) })
            {
                var proposal = await Send(new CreatePoiProposalCommand(staffId, new(Guid.NewGuid(), new(pilotMap.Id, name, "Tham quan", null, x, 1.5m, 0m, "FRONT", "Đây là điểm tham quan."))));
                var submitted = await Send(new SubmitPoiProposalCommand(staffId, proposal.Id, new(Guid.NewGuid(), 1, proposal.RowVersion)));
                await Send(new RecordPoiVerificationCommand(technicalId, proposal.Id, 1, new(Guid.NewGuid(), 1, submitted.RowVersion, First, "PASS", true, true, true, true, null, "Kiểm tra tại chỗ.")));
                stops.Add(new(proposal.Revision.Id, 30, [new("FRONT", 30)]));
            }
            return stops;
        }

        public async Task<RouteRevisionView> SubmittedRoute()
        {
            var route = await Send(new SaveRouteRevisionCommand(staffId, null, new(Guid.NewGuid(), 0, "Tuyến robot", null, pilotMap.Id, 2.5m, 2.5m, 0m, "LAST_POI", null, null, null,
                await PassedStops())));
            await Send(new SubmitRouteRevisionCommand(staffId, route.RouteId, route.RevisionId, new(Guid.NewGuid(), 1)));
            return route;
        }

        public async Task<RouteRevisionView> TestedRoute()
        {
            var route = await SubmittedRoute();
            return await Send(new RecordRouteTestRunCommand(technicalId, route.RouteId, route.RevisionId,
                new(Guid.NewGuid(), First, staffId, "PASS", true, true, true, 260, null, "Chạy thử đạt.")));
        }

        public async Task<RouteRevisionView> SaveRoute(Guid? routeId, int expectedRevision, Guid mapVersionId, RouteRevisionView source)
        {
            var stops = (await Send(new GetRouteRevisionQuery(source.RouteId, source.RevisionId, false))).Stops
                .Select(stop => new RouteRevisionStopInput(stop.PoiRevisionId, stop.DwellSeconds, [new("FRONT", 30)])).ToList();
            return await Send(new SaveRouteRevisionCommand(staffId, routeId, new(Guid.NewGuid(), expectedRevision, "Tuyến mới", null, mapVersionId,
                2.5m, 2.5m, 0m, "LAST_POI", null, null, null, stops)));
        }

        public async Task<Guid> CreateTour(RouteRevisionView route, string robot)
        {
            var start = new DateTimeOffset(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)).ToDateTime(new TimeOnly(8, 15)), TimeSpan.FromHours(7));
            await Send(new CreateTourCommand(staffId, new(Guid.NewGuid(), new("Tour robot", null, route.RevisionId, robot, operatorId, start, null, 20))));
            await using var db = Context();
            return (await db.Tours.AsNoTracking().OrderByDescending(tour => tour.CreatedAt).FirstAsync()).Id;
        }

        public Task<TourSlotsView> Slots(RouteRevisionView route, string robot)
        {
            var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10));
            return Send(new GetTourSlotsQuery(route.RevisionId, robot, day, day));
        }

        private async Task AddRobot(string code)
        {
            await using var db = Context();
            var now = DateTimeOffset.UtcNow;
            db.Robots.Add(new Robot { Id = Guid.NewGuid(), RobotCode = code, SourceType = "PHYSICAL", IsDispatchEnabled = false, CreatedAt = now,
                FirstAcceptedSyncAt = now, FirstAcceptedMapKey = "pilot", FirstAcceptedFrameId = "map", CredentialHash = new byte[32], CredentialHint = "abcd", CredentialIssuedAt = now, CredentialIssuedByUserId = technicalId });
            await db.SaveChangesAsync();
        }

        public async ValueTask DisposeAsync()
        {
            await provider.DisposeAsync();
            await database.DisposeAsync();
        }
    }
}
