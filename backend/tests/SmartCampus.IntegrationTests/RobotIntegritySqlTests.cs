using System.IO.Compression;
using System.Text;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.RobotCredentials;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;
using SmartCampus.Application.Features.Tours.Queries.ListTourRobots;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class RobotIntegritySqlTests
{
    private const string First = "amr_first";
    private const string Second = "amr_second";

    [SchemaV11Fact]
    public async Task SecondRobotOnAnArea_IsRefused_NamingTheHolder()
    {
        await using var h = await Harness.Create();
        await h.Assign(First, h.PilotMap.Id);

        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Assign(Second, h.PilotMap.Id));

        Assert.Equal("MAP_AREA_ALREADY_ASSIGNED", error.Code);
        Assert.Equal($"Khu vực Pilot đang được gán cho {First}. Bỏ gán robot đó trước.", error.Message);
        Assert.Null((await h.Robot(Second)).AssignedAreaKey);
    }

    [SchemaV11Fact]
    public async Task ConcurrentAssigns_LeaveOneHolder_AndTheLoserGetsTheSameConflict()
    {
        await using var h = await Harness.Create();
        var first = await h.Robot(First);
        var second = await h.Robot(Second);

        var results = await Task.WhenAll(
            Capture(h.Send(new ChangePhysicalRobotMapAssignmentCommand(first.Id, h.TechnicalId, Guid.NewGuid(), Convert.ToBase64String(first.RowVersion), h.PilotMap.Id))),
            Capture(h.Send(new ChangePhysicalRobotMapAssignmentCommand(second.Id, h.TechnicalId, Guid.NewGuid(), Convert.ToBase64String(second.RowVersion), h.PilotMap.Id))));

        Assert.Single(results, error => error is null);
        Assert.Equal("MAP_AREA_ALREADY_ASSIGNED", Assert.IsType<ConflictException>(Assert.Single(results, error => error is not null)).Code);
        await using var db = h.Context();
        Assert.Equal(1, await db.Robots.CountAsync(robot => robot.AssignedAreaKey == "pilot"));
    }

    [SchemaV11Fact]
    public async Task ChangingMap_FreesTheOldArea_AndClearingKeepsBothColumnsTogether()
    {
        await using var h = await Harness.Create();
        await h.Assign(First, h.PilotMap.Id);
        await h.Assign(First, h.PilotMapV2.Id);
        Assert.Equal("pilot", (await h.Robot(First)).AssignedAreaKey);

        await h.Assign(First, h.OtherMap.Id);
        Assert.Equal("other", (await h.Robot(First)).AssignedAreaKey);
        await h.Assign(Second, h.PilotMap.Id);
        Assert.Equal("pilot", (await h.Robot(Second)).AssignedAreaKey);

        await h.Assign(Second, null);
        var cleared = await h.Robot(Second);
        Assert.Null(cleared.AssignedAreaKey);
        Assert.Null(cleared.AssignedMapVersionId);
    }

    [SchemaV11Fact]
    public async Task ChangingMap_ListsToursThatCannotRunOnIt_WithoutCancellingThem()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        var tour = await h.CreateTour(tested, First);
        await h.Assign(First, h.PilotMap.Id);

        Assert.Empty(await h.Send(new ListRobotAffectedToursQuery((await h.Robot(First)).Id, h.PilotMap.Id)));
        var preview = await h.Send(new ListRobotAffectedToursQuery((await h.Robot(First)).Id, h.OtherMap.Id));
        var change = await h.Assign(First, h.OtherMap.Id);

        Assert.Equal(tour, Assert.Single(preview).TourId);
        Assert.Equal(tour, Assert.Single(change.AffectedTours).TourId);
        await using var db = h.Context();
        Assert.Equal("SCHEDULED", (await db.Tours.SingleAsync()).State);
    }

    [SchemaV11Fact]
    public async Task UsableRobot_CreatesATour_AndIsOfferedByTheFormList()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();

        Assert.True(Assert.Single(await h.TourRobots(tested), robot => robot.RobotCode == First).Usable);
        Assert.NotEmpty((await h.Slots(tested, First)).Days);
        Assert.NotEqual(Guid.Empty, await h.CreateTour(tested, First));
    }

    [SchemaV11Fact]
    public async Task UnconfirmedRobot_IsBlockedEverywhere()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        await h.Database.ExecuteAsync($"UPDATE dbo.Robots SET FirstAcceptedSyncAt=NULL, FirstAcceptedMapKey=NULL, FirstAcceptedFrameId=NULL WHERE RobotCode=N'{First}';");

        await h.AssertBlocked(tested, First, "Robot chưa xác nhận kết nối.");
    }

    [SchemaV11Fact]
    public async Task RobotLastCheckedOnAnotherMap_IsBlockedEverywhere()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        await h.RecordDeployment(h.OtherMap, First, passed: true);

        await h.AssertBlocked(tested, First, "Robot chưa triển khai đúng bản đồ của tuyến.");
    }

    [SchemaV11Fact]
    public async Task RobotWhoseLatestCheckFailed_IsBlockedEverywhere()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        // Another robot keeps the map itself eligible, so only this robot's own check blocks it.
        await h.RecordDeployment(h.PilotMap, Second, passed: true);
        await h.RecordDeployment(h.PilotMap, First, passed: false);

        await h.AssertBlocked(tested, First, "Robot chưa triển khai đúng bản đồ của tuyến.");
    }

    [SchemaV11Fact]
    public async Task DeactivatedRobot_IsRefusedByCreateAndSlots_AndLeavesTheFormList()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        await h.Deactivate(First);

        var create = await Assert.ThrowsAsync<ConflictException>(() => h.CreateTour(tested, First));
        var slots = await Assert.ThrowsAsync<ConflictException>(() => h.Slots(tested, First));

        Assert.Equal("ROBOT_NOT_READY_FOR_ROUTE", create.Code);
        Assert.Equal("Robot đã ngừng sử dụng.", create.Message);
        Assert.Equal("ROBOT_NOT_READY_FOR_ROUTE", slots.Code);
        Assert.DoesNotContain(await h.TourRobots(tested), robot => robot.RobotCode == First);
    }

    [SchemaV11Fact]
    public async Task Deactivate_RevokesTheKey_ClearsTheMap_HidesTheRobot_AndKeepsTours()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        var tour = await h.CreateTour(tested, First);
        await h.Assign(First, h.PilotMap.Id);

        var result = await h.Deactivate(First);

        Assert.Equal(tour, Assert.Single(result.AffectedTours).TourId);
        var robot = await h.Robot(First);
        Assert.NotNull(robot.DeactivatedAt);
        Assert.Equal(h.TechnicalId, robot.DeactivatedByUserId);
        Assert.Equal("Hỏng động cơ", robot.DeactivationReason);
        Assert.False(robot.IsDispatchEnabled);
        Assert.Null(robot.CredentialHash);
        Assert.NotNull(robot.CredentialRevokedAt);
        Assert.Null(robot.FirstAcceptedSyncAt);
        Assert.Null(robot.AssignedMapVersionId);
        Assert.Null(robot.AssignedAreaKey);

        Assert.DoesNotContain(await h.Send(new ListPhysicalRobotsQuery()), item => item.RobotCode == First);
        var all = Assert.Single(await h.Send(new ListPhysicalRobotsQuery(IncludeDeactivated: true)), item => item.RobotCode == First);
        Assert.Equal("Hỏng động cơ", all.DeactivationReason);

        await using var db = h.Context();
        Assert.Equal("SCHEDULED", (await db.Tours.SingleAsync()).State);
        var actions = await db.AuditLogs.AsNoTracking().Where(audit => audit.RobotId == robot.Id).Select(audit => audit.Action).ToArrayAsync();
        Assert.Contains("ROBOT_DEACTIVATED", actions);
        Assert.Contains("ROBOT_CREDENTIAL_REVOKED", actions);
        Assert.Contains("ROBOT_MAP_CLEARED", actions);
        await h.Assign(Second, h.PilotMap.Id);
    }

    [SchemaV11Fact]
    public async Task Deactivate_RollsBackEverything_WhenAnyPartFails()
    {
        await using var h = await Harness.Create();
        await h.Assign(First, h.PilotMap.Id);
        await h.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestDeactivate CHECK (Action <> 'ROBOT_DEACTIVATED');");

        await Assert.ThrowsAnyAsync<Exception>(() => h.Deactivate(First));

        await h.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestDeactivate;");
        var robot = await h.Robot(First);
        Assert.Null(robot.DeactivatedAt);
        Assert.NotNull(robot.CredentialHash);
        Assert.Equal("pilot", robot.AssignedAreaKey);
    }

    [SchemaV11Fact]
    public async Task DeactivatedRobot_CannotBeUsedByAnyWriter()
    {
        await using var h = await Harness.Create();
        await h.Deactivate(First);

        static Task<ConflictException> Refused(Func<Task> act) => Assert.ThrowsAsync<ConflictException>(act);
        Assert.Equal("ROBOT_DEACTIVATED", (await Refused(() => h.RecordDeployment(h.PilotMap, First, passed: true))).Code);
        Assert.Equal("ROBOT_DEACTIVATED", (await Refused(() => h.Assign(First, h.PilotMap.Id))).Code);
        Assert.Equal("ROBOT_DEACTIVATED", (await Refused(() => h.Send(new ChangeRobotCredentialCommand(First, h.TechnicalId, Guid.NewGuid(),
            Convert.ToBase64String((h.Robot(First).Result).RowVersion), null, RobotCredentialOperation.Issue)))).Code);
        Assert.Equal("ROBOT_DEACTIVATED", (await Refused(() => h.Send(new PreviewPoiImportQuery(new(h.PilotMap.Id, First, [new("a.yaml", [1])]))))).Code);
    }

    [SchemaV11Fact]
    public async Task Activate_LiftsOnlyTheStop_AndAuditsIt()
    {
        await using var h = await Harness.Create();
        await h.Deactivate(First);
        var before = await h.Robot(First);

        var result = await h.Send(new ActivatePhysicalRobotCommand(before.Id, h.TechnicalId, new(Guid.NewGuid(), Convert.ToBase64String(before.RowVersion))));

        Assert.Null(result.DeactivatedAt);
        var robot = await h.Robot(First);
        Assert.Null(robot.DeactivatedAt);
        Assert.Null(robot.DeactivatedByUserId);
        Assert.Null(robot.DeactivationReason);
        Assert.Null(robot.CredentialHash);
        Assert.Null(robot.AssignedMapVersionId);
        Assert.False(robot.IsDispatchEnabled);
        await using var db = h.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "ROBOT_ACTIVATED" && audit.RobotId == robot.Id));
    }

    [SchemaV11Fact]
    public async Task Lifecycle_ReplaysARetry_AndRefusesStaleOrRepeatedRequests()
    {
        await using var h = await Harness.Create();
        var robot = await h.Robot(First);
        var request = new DeactivatePhysicalRobotRequest(Guid.NewGuid(), Convert.ToBase64String(robot.RowVersion), "Bảo trì");

        await h.Send(new DeactivatePhysicalRobotCommand(robot.Id, h.TechnicalId, request));
        var retry = await h.Send(new DeactivatePhysicalRobotCommand(robot.Id, h.TechnicalId, request));

        Assert.NotNull(retry.DeactivatedAt);
        await using (var db = h.Context())
            Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "ROBOT_DEACTIVATED"));
        var stale = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new DeactivatePhysicalRobotCommand(robot.Id, h.TechnicalId,
            new(Guid.NewGuid(), request.ExpectedRowVersion, "Lần nữa"))));
        Assert.Equal("ROBOT_CONCURRENCY_CONFLICT", stale.Code);
        var current = await h.Robot(First);
        var repeated = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new DeactivatePhysicalRobotCommand(robot.Id, h.TechnicalId,
            new(Guid.NewGuid(), Convert.ToBase64String(current.RowVersion), "Lần nữa"))));
        Assert.Equal("ROBOT_ALREADY_DEACTIVATED", repeated.Code);
        var active = await h.Robot(Second);
        var notStopped = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new ActivatePhysicalRobotCommand(active.Id, h.TechnicalId,
            new(Guid.NewGuid(), Convert.ToBase64String(active.RowVersion)))));
        Assert.Equal("ROBOT_NOT_DEACTIVATED", notStopped.Code);
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

    private sealed class Harness(InitialAdminSeederTests.EmptySchemaDatabase database, ServiceProvider provider, Guid technicalId, Guid staffId, Guid operatorId,
        MapVersionView pilotMap, MapVersionView pilotMapV2, MapVersionView otherMap) : IAsyncDisposable
    {
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public Guid TechnicalId => technicalId;
        public MapVersionView PilotMap => pilotMap;
        public MapVersionView PilotMapV2 => pilotMapV2;
        public MapVersionView OtherMap => otherMap;
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);

        public static async Task<Harness> Create()
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            var technical = await database.InsertUserAsync(true, username: "robot.technical", roles: ["TECHNICAL_STAFF"]);
            var staff = await database.InsertUserAsync(true, username: "robot.staff", roles: ["STAFF"]);
            var operatorUser = await database.InsertUserAsync(true, username: "robot.operator", roles: ["STAFF"]);
            var settings = InvitationPrimitiveTests.ConfigurationValues().ToDictionary(pair => pair.Key, pair => (string?)pair.Value);
            settings["ConnectionStrings:DefaultConnection"] = database.ConnectionString;
            settings["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey;
            settings["Tours:StartSlots:0"] = "09:00";
            settings["Tours:CustomStartEarliest"] = "08:00";
            settings["Tours:CustomStartLatest"] = "17:00";
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddApplication();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddInfrastructure(configuration);
            services.AddSingleton(new FleetSyncSettings(TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1), TimeSpan.FromSeconds(5)));
            var provider = services.BuildServiceProvider();

            async Task<MapVersionView> Upload(string area, string marker)
            {
                await using var scope = provider.CreateAsyncScope();
                return await scope.ServiceProvider.GetRequiredService<ISender>().Send(
                    new CreateMapVersionCommand(technical.Id, new(area, area == "pilot" ? "Pilot" : "Other", Guid.NewGuid(), MapPackage(marker))));
            }
            var pilot = await Upload("pilot", "a");
            var pilotV2 = await Upload("pilot", "b");
            var other = await Upload("other", "c");
            var harness = new Harness(database, provider, technical.Id, staff.Id, operatorUser.Id, pilot, pilotV2, other);
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

        public async Task<RobotLifecycleResult> Deactivate(string code)
        {
            var robot = await Robot(code);
            return await Send(new DeactivatePhysicalRobotCommand(robot.Id, technicalId, new(Guid.NewGuid(), Convert.ToBase64String(robot.RowVersion), "Hỏng động cơ")));
        }

        public Task RecordDeployment(MapVersionView map, string robot, bool passed) =>
            Send(new RecordMapDeploymentCommand(technicalId, map.Id, new(Guid.NewGuid(), robot, map.PackageSha256, passed, true, "Kiểm tra triển khai.")));

        public async Task<RouteRevisionView> TestedRoute()
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
            var route = await Send(new SaveRouteRevisionCommand(staffId, null, new(Guid.NewGuid(), 0, "Tuyến robot", null, pilotMap.Id, 2.5m, 2.5m, 0m, "LAST_POI", null, null, null,
                stops)));
            await Send(new SubmitRouteRevisionCommand(staffId, route.RouteId, route.RevisionId, new(Guid.NewGuid(), 1)));
            return await Send(new RecordRouteTestRunCommand(technicalId, route.RouteId, route.RevisionId,
                new(Guid.NewGuid(), First, staffId, "PASS", true, true, true, 260, null, "Chạy thử đạt.")));
        }

        public async Task<Guid> CreateTour(RouteRevisionView route, string robot)
        {
            var start = new DateTimeOffset(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)).ToDateTime(new TimeOnly(9, 0)), TimeSpan.FromHours(7));
            var created = await Send(new CreateTourCommand(staffId, new(Guid.NewGuid(), new("Tour robot", null, route.RevisionId, robot, operatorId, start, null))));
            await using var db = Context();
            return (await db.Tours.AsNoTracking().OrderByDescending(tour => tour.CreatedAt).FirstAsync()).Id;
        }

        public Task<TourSlotsView> Slots(RouteRevisionView route, string robot)
        {
            var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10));
            return Send(new GetTourSlotsQuery(route.RevisionId, robot, day, day));
        }

        public Task<IReadOnlyList<TourRobotOption>> TourRobots(RouteRevisionView route) => Send(new ListTourRobotsQuery(route.RevisionId));

        public async Task AssertBlocked(RouteRevisionView route, string robot, string reason)
        {
            var create = await Assert.ThrowsAsync<ConflictException>(() => CreateTour(route, robot));
            var slots = await Assert.ThrowsAsync<ConflictException>(() => Slots(route, robot));
            Assert.Equal("ROBOT_NOT_READY_FOR_ROUTE", create.Code);
            Assert.Equal(reason, create.Message);
            Assert.Equal("ROBOT_NOT_READY_FOR_ROUTE", slots.Code);
            var option = Assert.Single(await TourRobots(route), item => item.RobotCode == robot);
            Assert.False(option.Usable);
            Assert.Equal(reason, option.BlockReason);
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
