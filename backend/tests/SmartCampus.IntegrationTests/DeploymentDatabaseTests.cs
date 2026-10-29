using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using MediatR;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Exceptions;
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
    [SchemaV14Fact]
    public async Task RuntimeCanInsertRobotIdentityButOnlyProvisionerCanSetCredentialHash()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await Apply(database, "permissions.sql");
        await Apply(database, "runtime-permissions.sql");
        await Apply(database, "fleet-credential-provisioning-permissions.sql");
        await database.ExecuteAsync("""
            CREATE USER runtime_robot_test WITHOUT LOGIN;
            ALTER ROLE campus_tour_app ADD MEMBER runtime_robot_test;
            CREATE USER fleet_provisioner_robot_test WITHOUT LOGIN;
            ALTER ROLE campus_fleet_provisioner ADD MEMBER fleet_provisioner_robot_test;
            """);

        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using (var impersonate = new SqlCommand("EXECUTE AS USER='runtime_robot_test';", connection))
            await impersonate.ExecuteNonQueryAsync();
        try
        {
            await using var insert = new SqlCommand("""
                INSERT dbo.Robots(Id,RobotCode,SourceType,DisplayName,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
                VALUES(NEWID(),N'robot_registered_sql','PHYSICAL',N'Registered SQL Robot',0x,0,0,SYSDATETIMEOFFSET());
                """, connection);
            await insert.ExecuteNonQueryAsync();
            await using var code = new SqlCommand("SELECT RobotCode FROM dbo.Robots WHERE RobotCode=N'robot_registered_sql';", connection);
            Assert.Equal("robot_registered_sql", await code.ExecuteScalarAsync());
            foreach (var statement in new[]
            {
                "UPDATE dbo.Robots SET CredentialHash=0x0102 WHERE RobotCode=N'robot_registered_sql'",
                "UPDATE dbo.Robots SET IsDispatchEnabled=1 WHERE RobotCode=N'robot_registered_sql'",
                "DELETE dbo.Robots WHERE RobotCode=N'robot_registered_sql'"
            })
            {
                await using var denied = new SqlCommand(statement, connection);
                Assert.Equal(229, (await Assert.ThrowsAsync<SqlException>(() => denied.ExecuteNonQueryAsync())).Number);
            }
        }
        finally
        {
            await using var revert = new SqlCommand("REVERT;", connection);
            await revert.ExecuteNonQueryAsync();
        }

        string credential;
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(connection).Options;
        await using (var db = new ApplicationDbContext(options))
        {
            var robot = await db.Robots.SingleAsync(item => item.RobotCode == "robot_registered_sql");
            Assert.Empty(robot.CredentialHash);
            Assert.Null(await new FleetRobotAuthenticator(db).AuthenticateAsync(robot.RobotCode,
                FleetRobotCredentialHash.Create().Secret, CancellationToken.None));
        }

        await using (var impersonate = new SqlCommand("EXECUTE AS USER='fleet_provisioner_robot_test';", connection))
            await impersonate.ExecuteNonQueryAsync();
        try
        {
            await using var db = new ApplicationDbContext(options);
            var provisioned = await new FleetRobotCredentialProvisioner().ProvisionAsync(db, "robot_registered_sql");
            Assert.NotNull(provisioned);
            credential = provisioned.Credential;
            await using var deniedInsert = new SqlCommand("""
                INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
                VALUES(NEWID(),N'provisioner_cannot_register','PHYSICAL',0x,0,0,SYSDATETIMEOFFSET());
                """, connection);
            Assert.Equal(229, (await Assert.ThrowsAsync<SqlException>(() => deniedInsert.ExecuteNonQueryAsync())).Number);
            await using var deniedDispatch = new SqlCommand("UPDATE dbo.Robots SET IsDispatchEnabled=1 WHERE RobotCode=N'robot_registered_sql';", connection);
            Assert.Equal(230, (await Assert.ThrowsAsync<SqlException>(() => deniedDispatch.ExecuteNonQueryAsync())).Number);
        }
        finally
        {
            await using var revert = new SqlCommand("REVERT;", connection);
            await revert.ExecuteNonQueryAsync();
        }

        await using (var db = new ApplicationDbContext(options))
        {
            var robot = await db.Robots.SingleAsync(item => item.RobotCode == "robot_registered_sql");
            Assert.Equal(32, robot.CredentialHash.Length);
            Assert.True(FleetRobotCredentialHash.Verify(credential, robot.CredentialHash));
            Assert.False(robot.IsDispatchEnabled);
            Assert.Null(robot.CurrentTourId);
            Assert.Null(robot.LastAssignedAt);
            Assert.NotNull(await new FleetRobotAuthenticator(db).AuthenticateAsync(robot.RobotCode,
                credential, CancellationToken.None));
        }
    }

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
        var blocker = await Assert.ThrowsAsync<ConflictException>(() => Send(new CreateTourCommand(actor.Id,
            new CreateTourRequest(Guid.NewGuid(), route.Version, new TourInput("Runtime Tour", null, routeId, schedule, null)))));
        Assert.Equal("TOUR_DURATION_UNAVAILABLE", blocker.Code);
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
    public async Task Bootstrap_RequiresV14AndDoesNotAdoptOrRewriteOlderMarkers()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "preserved.user", roles: ["STAFF"]);
        await database.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{PreviousHash}';");
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var guard = await File.ReadAllTextAsync(Schema("bootstrap-check.sql"));
        var v14Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.4.sql"))).Replace("\r\n", "\n"));
        var v14Guard = guard.Replace("$(SchemaHash)", v14Hash).Replace("$(SchemaHashV14)", v14Hash);
        await using (var command = new SqlCommand(v14Guard, connection))
            Assert.Equal("UPGRADE_REQUIRED", await command.ExecuteScalarAsync());
        Assert.Equal(1, await database.CountRowsAsync("dbo.Users"));
        await using (var marker = new SqlCommand("SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash'", connection))
            Assert.Equal(PreviousHash, await marker.ExecuteScalarAsync());
        await database.ExecuteAsync($"EXEC sys.sp_updateextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{new string('0', 64)}';");
        await using (var unknown = new SqlCommand(v14Guard, connection))
            Assert.Equal(51000, (await Assert.ThrowsAsync<SqlException>(() => unknown.ExecuteScalarAsync())).Number);
        await database.ExecuteAsync($"EXEC sys.sp_updateextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{v14Hash}';");
        await database.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.4';");
        await using (var current = new SqlCommand(v14Guard, connection))
            Assert.Equal("READY", await current.ExecuteScalarAsync());
        await database.ExecuteAsync("EXEC sys.sp_dropextendedproperty @name=N'CampusTourSchemaVersion';");
        await database.ExecuteAsync("EXEC sys.sp_dropextendedproperty @name=N'CampusTourBootstrapHash';");
        await using var unmarked = new SqlCommand(v14Guard, connection);
        Assert.Equal(51000, (await Assert.ThrowsAsync<SqlException>(() => unmarked.ExecuteScalarAsync())).Number);
    }

    [SchemaV11Fact]
    public async Task Bootstrap_AcceptsVerifiedV14UpgradeMarkerWithoutReplacingBootstrapHash()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var originalHash = PreviousHash;
        await database.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{originalHash}';");
        await database.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.4';");
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var guard = await File.ReadAllTextAsync(Schema("bootstrap-check.sql"));
        var v14Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.4.sql"))).Replace("\r\n", "\n"));
        var v14Guard = guard.Replace("$(SchemaHash)", v14Hash).Replace("$(SchemaHashV14)", v14Hash);
        await using var command = new SqlCommand(v14Guard, connection);
        Assert.Equal("READY", await command.ExecuteScalarAsync());
        await using var marker = new SqlCommand("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';", connection);
        Assert.Equal(originalHash, await marker.ExecuteScalarAsync());
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
