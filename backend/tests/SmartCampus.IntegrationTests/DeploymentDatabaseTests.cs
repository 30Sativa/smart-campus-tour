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
    [SchemaV17Fact]
    public async Task RuntimeCanIssueCredentialWithColumnGrantsAndProvisionerRemainsSeparate()
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
            await using (var confirmation = new SqlCommand("UPDATE dbo.Robots SET FirstAcceptedSyncAt=SYSDATETIMEOFFSET(), FirstAcceptedMapKey=N'map-v1', FirstAcceptedFrameId=N'map' WHERE RobotCode=N'robot_registered_sql';", connection))
                await confirmation.ExecuteNonQueryAsync();
            await using (var permissions = new SqlCommand("SELECT CONCAT(COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'SELECT'),0), COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'INSERT'),0), COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CredentialHash',N'COLUMN'),0), COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'FirstAcceptedSyncAt',N'COLUMN'),0), COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'FirstAcceptedMapKey',N'COLUMN'),0), COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'FirstAcceptedFrameId',N'COLUMN'),0), COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE'),0), COALESCE(HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'DELETE'),0));", connection))
                Assert.Equal("11111100", await permissions.ExecuteScalarAsync());
            await using var code = new SqlCommand("SELECT RobotCode FROM dbo.Robots WHERE RobotCode=N'robot_registered_sql';", connection);
            Assert.Equal("robot_registered_sql", await code.ExecuteScalarAsync());
            await using (var denied = new SqlCommand("DELETE dbo.Robots WHERE RobotCode=N'robot_registered_sql'", connection))
                Assert.Equal(229, (await Assert.ThrowsAsync<SqlException>(() => denied.ExecuteNonQueryAsync())).Number);
            // ADR-0049: the Technical Staff dispatch endpoint writes this column, so the runtime role now may; the provisioner still may not.
            await using (var dispatch = new SqlCommand("UPDATE dbo.Robots SET IsDispatchEnabled=1 WHERE RobotCode=N'robot_registered_sql'; UPDATE dbo.Robots SET IsDispatchEnabled=0 WHERE RobotCode=N'robot_registered_sql';", connection))
                await dispatch.ExecuteNonQueryAsync();
            await using (var credentialUpdate = new SqlCommand("UPDATE dbo.Robots SET CredentialHash=0x0102 WHERE RobotCode=N'robot_registered_sql';", connection))
                Assert.Equal(1, await credentialUpdate.ExecuteNonQueryAsync());
        }
        finally
        {
            await using var revert = new SqlCommand("REVERT;", connection);
            await revert.ExecuteNonQueryAsync();
        }

        string credential;
        byte[] oldCredentialHash;
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(connection).Options;
        await using (var db = new ApplicationDbContext(options))
        {
            var robot = await db.Robots.SingleAsync(item => item.RobotCode == "robot_registered_sql");
            Assert.Equal(new byte[] { 1, 2 }, robot.CredentialHash);
            oldCredentialHash = robot.CredentialHash!;
            Assert.NotNull(robot.FirstAcceptedSyncAt);
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
            var secondProvision = await new FleetRobotCredentialProvisioner().ProvisionAsync(db, "robot_registered_sql");
            Assert.NotNull(secondProvision);
            Assert.NotEqual(provisioned.Credential, secondProvision.Credential);
            credential = secondProvision.Credential;
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
            Assert.Equal(32, robot.CredentialHash!.Length);
            Assert.True(FleetRobotCredentialHash.Verify(credential, robot.CredentialHash));
            Assert.Null(robot.FirstAcceptedSyncAt);
            Assert.Null(robot.FirstAcceptedMapKey);
            Assert.Null(robot.FirstAcceptedFrameId);
            Assert.False(await new EfFleetRobotConnectionConfirmationStore(db).TryRecordFirstAcceptedAsync(
                robot.RobotCode, oldCredentialHash, "stale-map", "stale-frame", DateTimeOffset.UtcNow, CancellationToken.None));
            Assert.False(robot.IsDispatchEnabled);
            Assert.Null(robot.CurrentTourId);
            Assert.Null(robot.LastAssignedAt);
            Assert.NotNull(await new FleetRobotAuthenticator(db).AuthenticateAsync(robot.RobotCode,
                credential, CancellationToken.None));
        }
    }

    [SchemaV17Fact]
    public async Task FleetCredentialProvisioner_UsesSharedCredentialLifecycleAndRemainsColumnScoped()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
            VALUES('{Guid.NewGuid():D}',N'robot_provision_test','PHYSICAL',0x01,0,0,SYSDATETIMEOFFSET());
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
                var rotated = await new FleetRobotCredentialProvisioner()
                    .ProvisionAsync(provisionerContext, "robot_provision_test");
                Assert.NotNull(rotated);
                Assert.NotEqual(provisioned.Credential, rotated.Credential);
                provisionedCredential = rotated.Credential;
            }
            foreach (var (statement, errorNumber) in new[]
            {
                ("UPDATE dbo.Robots SET IsDispatchEnabled=1 WHERE RobotCode=N'robot_provision_test'", 230),
                ("SELECT IsDispatchEnabled FROM dbo.Robots", 230),
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
        var robot = await verify.Robots.AsNoTracking().SingleAsync(robot => robot.RobotCode == "robot_provision_test");
        Assert.Equal(32, robot.CredentialHash!.Length);
        Assert.True(FleetRobotCredentialHash.Verify(provisionedCredential!, robot.CredentialHash));
        Assert.Equal("robot_provision_test", robot.RobotCode);
        Assert.Equal(2, await verify.AuditLogs.CountAsync(log => log.RobotId == robot.Id &&
            log.Action == "ROBOT_CREDENTIAL_ROTATED" && log.DataJson!.Contains("\"source\":\"CLI\"")));
        Assert.DoesNotContain(provisionedCredential!, string.Join("\n", await verify.AuditLogs
            .Where(log => log.RobotId == robot.Id).Select(log => log.DataJson).ToArrayAsync()));
    }

    [SchemaV11Fact]
    public async Task RuntimeRole_CanPrepareRoutesAndCancelTours_ButCannotDeleteToursOrRewriteLogs()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var actor = await database.InsertUserAsync(true, username: "runtime.admin", roles: ["ADMIN"]);
        var poi = new Poi { Id = Guid.NewGuid(), Name = "Synthetic POI", MapKey = "test", MapFrame = "map", IsActive = true, CreatedAt = DateTimeOffset.UtcNow };
        await using (var db = Context(database.ConnectionString)) { db.Pois.Add(poi); await db.SaveChangesAsync(); }
        await Apply(database, "permissions.sql");
        await Apply(database, "route-revision-permissions.sql");
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
        var schedule = TourSchedule.SlotStart(DateOnly.FromDateTime(DateTime.UtcNow).AddDays(10), new TimeOnly(8, 15));
        await Assert.ThrowsAsync<NotFoundException>(() => Send(new CreateTourCommand(actor.Id,
            new CreateTourRequest(Guid.NewGuid(), new CreateTourInput("Runtime Tour", null, Guid.NewGuid(), "no-such-robot", actor.Id, schedule, null, 20)))));
        var unused = (await Send(new CreateRouteCommand(actor.Id, input))).Id;
        await Send(new DeleteRouteCommand(unused, actor.Id, (await Send(new GetRouteQuery(unused))).Version));
        foreach (var statement in new[] { "DELETE dbo.Tours WHERE 1=0", "UPDATE dbo.AuditLogs SET ResultCode='FAIL' WHERE 1=0", "DELETE dbo.TourEvents WHERE 1=0", "DELETE dbo.TourRobotReservations WHERE 1=0" })
        {
            await using var command = new SqlCommand(statement, connection);
            Assert.Equal(229, (await Assert.ThrowsAsync<SqlException>(() => command.ExecuteNonQueryAsync())).Number);
        }
        await using (var column = new SqlCommand("UPDATE dbo.TourRobotReservations SET EndsAt=EndsAt WHERE 1=0", connection))
            Assert.Equal(230, (await Assert.ThrowsAsync<SqlException>(() => column.ExecuteNonQueryAsync())).Number);
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
    public async Task Bootstrap_RequiresV15AndDoesNotAdoptOrRewriteOlderMarkers()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync("snapshot-v1.5.sql");
        await database.InsertUserAsync(true, username: "preserved.user", roles: ["STAFF"]);
        await database.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{PreviousHash}';");
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var guard = await File.ReadAllTextAsync(Schema("bootstrap-check.sql"));
        var v14Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.4.sql"))).Replace("\r\n", "\n"));
        var v15Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.5.sql"))).Replace("\r\n", "\n"));
        var v16Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.6.sql"))).Replace("\r\n", "\n"));
        var currentGuard = guard.Replace("$(SchemaHash)", v15Hash).Replace("$(SchemaHashV16)", v16Hash).Replace("$(SchemaHashV15)", v15Hash).Replace("$(SchemaHashV14)", v14Hash);
        await using (var command = new SqlCommand(currentGuard, connection))
            Assert.Equal("UPGRADE_REQUIRED", await command.ExecuteScalarAsync());
        Assert.Equal(1, await database.CountRowsAsync("dbo.Users"));
        await using (var marker = new SqlCommand("SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash'", connection))
            Assert.Equal(PreviousHash, await marker.ExecuteScalarAsync());
        await database.ExecuteAsync($"EXEC sys.sp_updateextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{new string('0', 64)}';");
        await using (var unknown = new SqlCommand(currentGuard, connection))
            Assert.Equal(51000, (await Assert.ThrowsAsync<SqlException>(() => unknown.ExecuteScalarAsync())).Number);
        await database.ExecuteAsync($"EXEC sys.sp_updateextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{v15Hash}';");
        await database.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.5';");
        await using (var current = new SqlCommand(currentGuard, connection))
            Assert.Equal("UPGRADE_REQUIRED", await current.ExecuteScalarAsync());
        await database.ExecuteAsync("EXEC sys.sp_dropextendedproperty @name=N'CampusTourSchemaVersion';");
        await database.ExecuteAsync("EXEC sys.sp_dropextendedproperty @name=N'CampusTourBootstrapHash';");
        await using var unmarked = new SqlCommand(currentGuard, connection);
        Assert.Equal(51000, (await Assert.ThrowsAsync<SqlException>(() => unmarked.ExecuteScalarAsync())).Number);
    }

    [SchemaV11Fact]
    public async Task Bootstrap_V15MarkerRequiresV16UpgradeAndPreservesOriginalBootstrapHash()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync("snapshot-v1.5.sql");
        var originalHash = PreviousHash;
        await database.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{originalHash}';");
        await database.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.5';");
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var guard = await File.ReadAllTextAsync(Schema("bootstrap-check.sql"));
        var v14Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.4.sql"))).Replace("\r\n", "\n"));
        var v15Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.5.sql"))).Replace("\r\n", "\n"));
        var v16Hash = Hash((await File.ReadAllTextAsync(Schema("snapshot-v1.6.sql"))).Replace("\r\n", "\n"));
        var currentGuard = guard.Replace("$(SchemaHash)", v15Hash).Replace("$(SchemaHashV16)", v16Hash).Replace("$(SchemaHashV15)", v15Hash).Replace("$(SchemaHashV14)", v14Hash);
        await using var command = new SqlCommand(currentGuard, connection);
        Assert.Equal("UPGRADE_REQUIRED", await command.ExecuteScalarAsync());
        await using var marker = new SqlCommand("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';", connection);
        Assert.Equal(originalHash, await marker.ExecuteScalarAsync());
    }

    [SchemaV11Fact]
    public async Task Bootstrap_AcceptsVerifiedV119SnapshotAndMarker()
    {
        Assert.Equal("READY", await RunCurrentGuardAsync("snapshot-v1.19.sql", "1.19"));
    }

    [SchemaV11Fact]
    public async Task Bootstrap_AskForTheUpgradeOnAVerifiedV118Database()
    {
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.18.sql", "1.18"));
    }

    [SchemaV11Fact]
    public async Task Bootstrap_RefusesAV119MarkerWithoutTheShortNoticeColumn()
    {
        var error = await Assert.ThrowsAsync<SqlException>(() => RunCurrentGuardAsync("snapshot-v1.18.sql", "1.19"));
        Assert.Equal(51001, error.Number);
    }

    [SchemaV11Fact]
    public async Task Bootstrap_RefusesAV118MarkerWithoutCapacityOrTheExpiredStates()
    {
        foreach (var sql in new[]
        {
            "ALTER TABLE dbo.Tours DROP CONSTRAINT CK_Tours_Capacity;",
            "ALTER TABLE dbo.Tours NOCHECK CONSTRAINT CK_Tours_Capacity;",
            "ALTER TABLE dbo.RosterRows DROP CONSTRAINT CK_RosterRows_ParticipationState; ALTER TABLE dbo.RosterRows WITH CHECK ADD CONSTRAINT CK_RosterRows_ParticipationState CHECK (ParticipationState IN ('PENDING','ACCEPTED','REJECTED','REMOVED'));",
            "ALTER TABLE dbo.RosterEmailChangeRequests DROP CONSTRAINT CK_RosterEmailChangeRequests_State; ALTER TABLE dbo.RosterEmailChangeRequests WITH CHECK ADD CONSTRAINT CK_RosterEmailChangeRequests_State CHECK (State IN ('PENDING','ACCEPTED','REJECTED'));"
        })
        {
            var error = await Assert.ThrowsAsync<SqlException>(() => RunCurrentGuardAsync("snapshot-v1.18.sql", "1.18", sql));
            Assert.Equal(51001, error.Number);
        }
    }

    [SchemaV11Fact]
    public async Task Bootstrap_RefusesAV117MarkerWithoutTheTrustedSystemReleaseCheck()
    {
        foreach (var sql in new[]
        {
            "ALTER TABLE dbo.TourRobotReservations DROP CONSTRAINT CK_TourRobotReservations_Release_Actor;",
            "ALTER TABLE dbo.TourRobotReservations NOCHECK CONSTRAINT CK_TourRobotReservations_Release_Actor;",
            "ALTER TABLE dbo.TourRobotReservations WITH CHECK ADD CONSTRAINT CK_TourRobotReservations_Release_Complete CHECK ((ReleasedAt IS NULL AND ReleasedByUserId IS NULL) OR (ReleasedAt IS NOT NULL AND ReleasedByUserId IS NOT NULL));"
        })
        {
            var error = await Assert.ThrowsAsync<SqlException>(() => RunCurrentGuardAsync("snapshot-v1.17.sql", "1.17", sql));
            Assert.Equal(51001, error.Number);
        }
    }

    [SchemaV11Fact]
    public async Task Bootstrap_RefusesMissingDisabledUntrustedOrOldOutcomeChecks()
    {
        foreach (var sql in new[]
        {
            "ALTER TABLE dbo.RobotCommands DROP CONSTRAINT CK_RobotCommands_Outcome;",
            "ALTER TABLE dbo.RobotCommands NOCHECK CONSTRAINT CK_RobotCommands_Outcome;",
            "ALTER TABLE dbo.RobotCommands NOCHECK CONSTRAINT CK_RobotCommands_Outcome; ALTER TABLE dbo.RobotCommands CHECK CONSTRAINT CK_RobotCommands_Outcome;",
            "ALTER TABLE dbo.RobotCommands DROP CONSTRAINT CK_RobotCommands_Outcome; ALTER TABLE dbo.RobotCommands WITH CHECK ADD CONSTRAINT CK_RobotCommands_Outcome CHECK ((State IN ('ARRIVED','FAILED','CANCELLED') AND Outcome=State) OR (State NOT IN ('ARRIVED','FAILED','CANCELLED') AND Outcome IS NULL));"
        })
        {
            var error = await Assert.ThrowsAsync<SqlException>(() => RunCurrentGuardAsync("snapshot-v1.17.sql", "1.17", sql));
            Assert.Equal(51001, error.Number);
        }
    }

    [SchemaV11Fact]
    public async Task Bootstrap_VerifiedV19SnapshotAndMarkerRequiresUpgrade()
    {
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.17.sql", "1.17"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.16.sql", "1.16"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.15.sql", "1.15"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.14.sql", "1.14"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.13.sql", "1.13"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.12.sql", "1.12"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.11.sql", "1.11"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.10.sql", "1.10"));
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.9.sql", "1.9"));
    }

    [SchemaV11Fact]
    public async Task Bootstrap_VerifiedV16SnapshotAndMarkerRequiresUpgrade()
    {
        Assert.Equal("UPGRADE_REQUIRED", await RunCurrentGuardAsync("snapshot-v1.6.sql", "1.6"));
    }

    // Bootstraps the snapshot with its own hash and version markers, then runs the guard with every
    // variable bound exactly as init-db.sh binds it for the current v1.19 release.
    private static async Task<object?> RunCurrentGuardAsync(string snapshot, string version, string? alteration = null)
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync(snapshot);
        await database.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{await SnapshotHashAsync(snapshot)}';");
        await database.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'{version}';");
        if (alteration is not null) await database.ExecuteAsync(alteration);
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var guard = (await File.ReadAllTextAsync(Schema("bootstrap-check.sql")))
            .Replace("$(SchemaHashV17)", await SnapshotHashAsync("snapshot-v1.7.sql"))
            .Replace("$(SchemaHashV16)", await SnapshotHashAsync("snapshot-v1.6.sql"))
            .Replace("$(SchemaHashV18)", await SnapshotHashAsync("snapshot-v1.8.sql"))
            .Replace("$(SchemaHashV19)", await SnapshotHashAsync("snapshot-v1.9.sql"))
            .Replace("$(SchemaHashV110)", await SnapshotHashAsync("snapshot-v1.10.sql"))
            .Replace("$(SchemaHashV111)", await SnapshotHashAsync("snapshot-v1.11.sql"))
            .Replace("$(SchemaHashV112)", await SnapshotHashAsync("snapshot-v1.12.sql"))
            .Replace("$(SchemaHashV113)", await SnapshotHashAsync("snapshot-v1.13.sql"))
            .Replace("$(SchemaHashV15)", await SnapshotHashAsync("snapshot-v1.5.sql"))
            .Replace("$(SchemaHashV14)", await SnapshotHashAsync("snapshot-v1.4.sql"))
            .Replace("$(SchemaHashV114)", await SnapshotHashAsync("snapshot-v1.14.sql"))
            .Replace("$(SchemaHashV115)", await SnapshotHashAsync("snapshot-v1.15.sql"))
            .Replace("$(SchemaHashV116)", await SnapshotHashAsync("snapshot-v1.16.sql"))
            .Replace("$(SchemaHashV117)", await SnapshotHashAsync("snapshot-v1.17.sql"))
            .Replace("$(SchemaHashV118)", await SnapshotHashAsync("snapshot-v1.18.sql"))
            .Replace("$(SchemaHash)", await SnapshotHashAsync("snapshot-v1.19.sql"));
        await using var command = new SqlCommand(guard, connection);
        return await command.ExecuteScalarAsync();
    }

    [SchemaV17Fact]
    public async Task CheckOnly_AcceptsExactlyWhatTheReviewedGrantScriptsApply()
    {
        await using var database = await DatabaseWithReviewedGrantsAsync();

        Assert.Equal("COMPATIBLE", await RunCheckOnlyGrantsAsync(database));
    }

    [SchemaV17Fact]
    public async Task CheckOnly_RefusesAProvisionerColumnOutsideTheReviewedGrants()
    {
        await using var database = await DatabaseWithReviewedGrantsAsync();
        await database.ExecuteAsync("GRANT SELECT (IsDispatchEnabled) ON OBJECT::dbo.Robots TO campus_fleet_provisioner;");

        var error = await Assert.ThrowsAsync<SqlException>(() => RunCheckOnlyGrantsAsync(database));

        Assert.Equal(51007, error.Number);
    }

    [SchemaV17Fact]
    public async Task CheckOnly_RefusesAProvisionerThatCannotSeeDeactivation()
    {
        await using var database = await DatabaseWithReviewedGrantsAsync();
        await database.ExecuteAsync("REVOKE SELECT (DeactivatedAt) ON OBJECT::dbo.Robots FROM campus_fleet_provisioner;");

        var error = await Assert.ThrowsAsync<SqlException>(() => RunCheckOnlyGrantsAsync(database));

        Assert.Equal(51007, error.Number);
    }

    [SchemaV17Fact]
    public async Task CheckOnly_RefusesRuntimeThatCanRewriteACommandTarget()
    {
        await using var database = await DatabaseWithReviewedGrantsAsync();
        await database.ExecuteAsync("GRANT UPDATE (X) ON OBJECT::dbo.RobotCommands TO campus_tour_app;");

        var error = await Assert.ThrowsAsync<SqlException>(() => RunCheckOnlyGrantsAsync(database));

        Assert.Equal(51005, error.Number);
    }

    [SchemaV17Fact]
    public async Task CheckOnly_RefusesRuntimeThatCannotClaimARobot()
    {
        await using var database = await DatabaseWithReviewedGrantsAsync();
        await database.ExecuteAsync("REVOKE UPDATE (CurrentTourId) ON OBJECT::dbo.Robots FROM campus_tour_app;");

        var error = await Assert.ThrowsAsync<SqlException>(() => RunCheckOnlyGrantsAsync(database));

        Assert.Equal(51005, error.Number);
    }

    // Same order as apply_runtime_grants in deploy/upgrade-db.sh.
    private static async Task<InitialAdminSeederTests.EmptySchemaDatabase> DatabaseWithReviewedGrantsAsync()
    {
        var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await Apply(database, "permissions.sql");
        await Apply(database, "map-poi-permissions.sql");
        await Apply(database, "route-revision-permissions.sql");
        await Apply(database, "runtime-permissions.sql");
        await Apply(database, "fleet-credential-provisioning-permissions.sql");
        await database.ExecuteAsync("CREATE USER smartcampus_api WITHOUT LOGIN; ALTER ROLE campus_tour_app ADD MEMBER smartcampus_api;");
        return database;
    }

    // Runs the query deploy/init-db.sh itself sends, so this test cannot drift from the deployment gate.
    private static async Task<object?> RunCheckOnlyGrantsAsync(InitialAdminSeederTests.EmptySchemaDatabase database)
    {
        var script = (await File.ReadAllTextAsync(Schema("init-db.sh"))).Replace("\r\n", "\n");
        const string opening = "if ! permissions=$(\"${sql[@]}\" -d SmartCampusTourV11 -h -1 -W -Q \"";
        var start = script.IndexOf(opening, StringComparison.Ordinal) + opening.Length;
        var end = script.IndexOf("\" | tr -d", start, StringComparison.Ordinal);
        Assert.True(start >= opening.Length && end > start, "init-db.sh no longer has the read-only grant check.");
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(script[start..end], connection);
        return await command.ExecuteScalarAsync();
    }

    private static async Task<string> SnapshotHashAsync(string snapshot) =>
        Hash((await File.ReadAllTextAsync(Schema(snapshot))).Replace("\r\n", "\n"));

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
