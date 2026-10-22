using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using MediatR;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Routes.Commands.CreateRoute;
using SmartCampus.Application.Features.Routes.Commands.UpdateRoute;
using SmartCampus.Application.Features.Routes.Commands.DeleteRoute;
using SmartCampus.Application.Features.Routes.Commands.SetRouteAvailability;
using SmartCampus.Application.Features.Routes.Queries.GetRoute;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Integrations.FleetSync;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class DeploymentDatabaseTests
{
    [SchemaV11Fact]
    public async Task FleetCredentialProvisioner_CanUpdateOnlyCredentialHashForAnExistingRobot()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
            VALUES('{Guid.NewGuid():D}',N'robot_provision_test','EMULATOR',0x01,0,0,SYSDATETIMEOFFSET());
            """);
        await Apply(database, "fleet-credential-provisioning-permissions.sql");
        await database.ExecuteAsync("CREATE USER fleet_provisioner_test WITHOUT LOGIN; ALTER ROLE campus_fleet_provisioner ADD MEMBER fleet_provisioner_test;");

        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        string? provisionedCredential = null;
        await using (var impersonate = new SqlCommand("EXECUTE AS USER='fleet_provisioner_test';", connection))
            await impersonate.ExecuteNonQueryAsync();
        try
        {
            await using (var readCode = new SqlCommand("SELECT RobotCode FROM dbo.Robots;", connection))
                Assert.Equal("robot_provision_test", await readCode.ExecuteScalarAsync());
            var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(connection).Options;
            await using (var provisionerContext = new ApplicationDbContext(options))
            {
                var provisioned = await new FleetRobotCredentialProvisioner()
                    .ProvisionAsync(provisionerContext, "robot_provision_test");
                Assert.NotNull(provisioned);
                Assert.Equal("robot_provision_test", provisioned.RobotCode);
                Assert.True(FleetRobotCredentialHash.IsValidFormat(provisioned.Credential));
                provisionedCredential = provisioned.Credential;
            }
            foreach (var (statement, errorNumber) in new[]
            {
                ("UPDATE dbo.Robots SET IsDispatchEnabled=1 WHERE RobotCode=N'robot_provision_test'", 230),
                ("SELECT CredentialHash FROM dbo.Robots", 230),
                ("INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES(NEWID(),N'other','EMULATOR',0x01,0,0,SYSDATETIMEOFFSET())", 229)
            })
            {
                await using var denied = new SqlCommand(statement, connection);
                Assert.Equal(errorNumber, (await Assert.ThrowsAsync<SqlException>(() => denied.ExecuteNonQueryAsync())).Number);
            }
        }
        finally
        {
            await using var revert = new SqlCommand("REVERT;", connection);
            await revert.ExecuteNonQueryAsync();
        }

        await using var verify = Context(database.ConnectionString);
        var storedHash = await verify.Robots.AsNoTracking()
            .Where(robot => robot.RobotCode == "robot_provision_test")
            .Select(robot => robot.CredentialHash)
            .SingleAsync();
        Assert.Equal(32, storedHash.Length);
        Assert.True(FleetRobotCredentialHash.Verify(provisionedCredential!, storedHash));
    }

    [SchemaV11Fact]
    public async Task RuntimeRole_CanPrepareRoutesAndCancelTours_ButCannotDeleteToursOrRewriteLogs()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var actor = await database.InsertUserAsync(true, username: "runtime.admin", roles: ["ADMIN"]);
        var poi = new Poi { Id = Guid.NewGuid(), Name = "Synthetic POI", MapKey = "test", MapFrame = "map", IsActive = true, CreatedAt = DateTimeOffset.UtcNow };
        await using (var db = Context(database.ConnectionString)) { db.Pois.Add(poi); await db.SaveChangesAsync(); }
        await Apply(database, "permissions.sql");
        await Apply(database, "runtime-permissions.sql");
        await database.ExecuteAsync("CREATE USER runtime_test WITHOUT LOGIN; ALTER ROLE campus_tour_app ADD MEMBER runtime_test;");
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using (var impersonate = new SqlCommand("EXECUTE AS USER='runtime_test';", connection)) await impersonate.ExecuteNonQueryAsync();
        await using var provider = AccountConcurrencyTests.Provider(database.ConnectionString,
            services => services.AddScoped(_ => new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(connection).Options)));
        async Task<T> Send<T>(IRequest<T> request)
        {
            await using var scope = provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
        }
        var input = new RouteInput("Runtime route", null, "test", "map", 0, 0, 0, "LAST_POI", null, null, null,
            [new RouteStopInput(poi.Id, 30, [new RouteHeadStep("FRONT", 30)])]);
        var routeId = (await Send(new CreateRouteCommand(actor.Id, input))).Id;
        var route = await Send(new GetRouteQuery(routeId));
        await Send(new UpdateRouteCommand(routeId, actor.Id, new UpdateRouteInput(route.Version,
            input with { Stops = [new RouteStopInput(poi.Id, 40, [new RouteHeadStep("FRONT", 40)])] })));
        route = await Send(new GetRouteQuery(routeId));
        await Send(new SetRouteAvailabilityCommand(routeId, actor.Id, route.Version, true));
        route = await Send(new GetRouteQuery(routeId));
        var schedule = DateTimeOffset.FromUnixTimeMilliseconds(DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds());
        var tour = await Send(new CreateTourCommand(actor.Id, new CreateTourRequest(Guid.NewGuid(), route.Version,
            new TourInput("Runtime Tour", null, routeId, schedule, null))));
        var detail = await Send(new GetTourQuery(tour.Id));
        await Send(new CancelTourCommand(tour.Id, actor.Id, new CancelTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, "Test cancel")));
        Assert.Equal("CANCELLED", (await Send(new GetTourQuery(tour.Id))).Tour.State);
        var unused = (await Send(new CreateRouteCommand(actor.Id, input))).Id;
        await Send(new DeleteRouteCommand(unused, actor.Id, (await Send(new GetRouteQuery(unused))).Version));
        foreach (var statement in new[] { "DELETE dbo.Tours WHERE 1=0", "UPDATE dbo.AuditLogs SET ResultCode='FAIL' WHERE 1=0", "DELETE dbo.TourEvents WHERE 1=0" })
        {
            await using var command = new SqlCommand(statement, connection);
            Assert.Equal(229, (await Assert.ThrowsAsync<SqlException>(() => command.ExecuteNonQueryAsync())).Number);
        }
        await using var revert = new SqlCommand("REVERT;", connection);
        await revert.ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task RecognizedSnapshotCompatibility_IsExactlyTheTwoCommentChanges()
    {
        var current = (await File.ReadAllTextAsync(Schema("snapshot.sql"))).Replace("\r\n", "\n");
        var previous = current
            .Replace("-- 04. Routes — Cấu hình hành trình do Admin CRUD quản lý (ADR-0017); không tự chứng nhận kiểm chứng vật lý.",
                "-- 04. Routes — Tuyến hoàn chỉnh đã được đội kỹ thuật chuẩn bị/kiểm chứng.")
            .Replace("-- Thời gian quan sát cố định theo Route, giây; Admin CRUD trước khi có tham chiếu, kỹ thuật kiểm chứng; không chỉnh riêng theo Tour (ADR-0017).",
                "-- Thời gian quan sát cố định theo Route, giây; kỹ thuật seed/kiểm chứng, Admin không chỉnh riêng theo Tour.");
        Assert.Equal(CurrentHash, Hash(current));
        Assert.Equal(PreviousHash, Hash(previous));
        // The exact replacement hashes bind the compatibility pair; no SQL-comment parser runs in deployment.
        Assert.NotEqual(current, previous);
    }

    [SchemaV11Fact]
    public async Task Bootstrap_AcceptsOnlyKnownEquivalentMarker_AndDoesNotRewriteItOrData()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "preserved.user", roles: ["STAFF"]);
        await database.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{PreviousHash}';");
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var guard = await File.ReadAllTextAsync(Schema("bootstrap-check.sql"));
        await using (var command = new SqlCommand(guard.Replace("$(SchemaHash)", CurrentHash), connection))
            Assert.Equal("READY", await command.ExecuteScalarAsync());
        Assert.Equal(1, await database.CountRowsAsync("dbo.Users"));
        await using (var marker = new SqlCommand("SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash'", connection))
            Assert.Equal(PreviousHash, await marker.ExecuteScalarAsync());
        await using (var changedSnapshot = new SqlCommand(guard.Replace("$(SchemaHash)", new string('0', 64)), connection))
            Assert.Equal(51000, (await Assert.ThrowsAsync<SqlException>(() => changedSnapshot.ExecuteScalarAsync())).Number);
        await database.ExecuteAsync("EXEC sys.sp_dropextendedproperty @name=N'CampusTourBootstrapHash';");
        await using var unmarked = new SqlCommand(guard.Replace("$(SchemaHash)", CurrentHash), connection);
        Assert.Equal(51000, (await Assert.ThrowsAsync<SqlException>(() => unmarked.ExecuteScalarAsync())).Number);
    }

    private const string CurrentHash = "96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68";
    private const string PreviousHash = "2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67";
    private static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    private static string Schema(string file) => Path.Combine(AppContext.BaseDirectory, "Schema", file);
    private static ApplicationDbContext Context(string cs) => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(cs).Options);
    private static async Task Apply(InitialAdminSeederTests.EmptySchemaDatabase database, string file)
    {
        foreach (var batch in Regex.Split(await File.ReadAllTextAsync(Schema(file)), @"^\s*GO\s*\r?$", RegexOptions.Multiline))
            if (!string.IsNullOrWhiteSpace(batch)) await database.ExecuteAsync(batch);
    }
}
