using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Integrations.FleetSync;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Integrations.Invitations;
using static SmartCampus.IntegrationTests.RepresentativeEndpointTests;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// Exercises the implemented map/POI/route APIs over HTTP against an isolated SQL database.
/// Recorded deployment and route evidence are deliberately simulated backend-test inputs,
/// not evidence of a real robot run.
/// </summary>
public sealed class BusinessFlowIntegrationTests
{
    private const string Password = "integration-test-password";

    [SchemaV17Fact]
    public async Task PhysicalRobotCredentialLifecycle_EnforcesRolesIsOneShotAtomicAndAudited()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "robot-credential.admin", roles: ["ADMIN"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var admin = await Login(host.Client, "robot-credential.admin");
        _ = await CreateAccount(host.Client, admin, "robot-credential.technical", "TechnicalStaff");
        _ = await CreateAccount(host.Client, admin, "robot-credential.staff", "Staff");
        var technical = await Login(host.Client, "robot-credential.technical");
        var staff = await Login(host.Client, "robot-credential.staff");
        var emulatorId = Guid.NewGuid();
        await database.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES('{emulatorId:D}',N'credential-emulator','EMULATOR',0x01,0,0,SYSDATETIMEOFFSET());");
        using var registered = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "credential-test", displayName = "Credential Test" });
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var robotId = (await Body(registered)).GetProperty("data").GetProperty("id").GetGuid();

        using var initial = await Get(host.Client, "/api/robots/credential-test/credential", technical);
        Assert.Equal("NOT_ISSUED", (await Body(initial)).GetProperty("data").GetProperty("status").GetString());
        var initialData = (await Body(initial)).GetProperty("data");
        var initialVersion = initialData.GetProperty("rowVersion").GetString()!;
        Assert.False(initialData.TryGetProperty("secret", out _));
        using var adminIssueDenied = await Json(host.Client, HttpMethod.Post, "/api/technical/robots/credential-test/credential", admin,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion });
        using var staffIssueDenied = await Json(host.Client, HttpMethod.Post, "/api/technical/robots/credential-test/credential", staff,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion });
        using var inactiveRotate = await Json(host.Client, HttpMethod.Post, "/api/technical/robots/credential-test/credential/rotate", technical,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion });
        using var inactiveRevoke = await Json(host.Client, HttpMethod.Post, "/api/robots/credential-test/credential/revoke", technical,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion, reason = "test" });
        using var staffReadDenied = await Get(host.Client, "/api/robots/credential-test/credential", staff);
        Assert.Equal(HttpStatusCode.Forbidden, adminIssueDenied.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, staffIssueDenied.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, inactiveRotate.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, inactiveRevoke.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, staffReadDenied.StatusCode);
        using var unknownRobot = await Get(host.Client, "/api/robots/missing-physical/credential", technical);
        using var nonPhysicalRobot = await Json(host.Client, HttpMethod.Post,
            "/api/technical/robots/credential-emulator/credential", technical,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion });
        Assert.Equal(HttpStatusCode.NotFound, unknownRobot.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, nonPhysicalRobot.StatusCode);

        var issueRequestId = Guid.NewGuid();
        using var issue = await Json(host.Client, HttpMethod.Post, "/api/technical/robots/credential-test/credential", technical,
            new { requestId = issueRequestId, expectedRowVersion = initialVersion, reason = "commissioning" });
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);
        Assert.Equal("no-store", issue.Headers.CacheControl?.ToString());
        var first = (await Body(issue)).GetProperty("data");
        var firstCredential = first.GetProperty("secret").GetString()!;
        Assert.True(FleetRobotCredentialHash.IsValidFormat(firstCredential));
        Assert.Equal(firstCredential[^4..], first.GetProperty("hint").GetString());
        using var adminRotateDenied = await Json(host.Client, HttpMethod.Post,
            "/api/technical/robots/credential-test/credential/rotate", admin,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion });
        using var staffRevokeDenied = await Json(host.Client, HttpMethod.Post,
            "/api/robots/credential-test/credential/revoke", staff,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion, reason = "forbidden" });
        Assert.Equal(HttpStatusCode.Forbidden, adminRotateDenied.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, staffRevokeDenied.StatusCode);
        using var replay = await Json(host.Client, HttpMethod.Post, "/api/technical/robots/credential-test/credential", technical,
            new { requestId = issueRequestId, expectedRowVersion = initialVersion, reason = "commissioning" });
        Assert.Equal(HttpStatusCode.Conflict, replay.StatusCode);
        Assert.Contains("CREDENTIAL_REQUEST_REPLAYED", await replay.Content.ReadAsStringAsync());
        Assert.DoesNotContain(firstCredential, await replay.Content.ReadAsStringAsync());
        using var duplicateIssue = await Json(host.Client, HttpMethod.Post, "/api/technical/robots/credential-test/credential", technical,
            new { requestId = Guid.NewGuid(), expectedRowVersion = initialVersion });
        Assert.Equal(HttpStatusCode.Conflict, duplicateIssue.StatusCode);
        Assert.Contains("CREDENTIAL_ALREADY_ACTIVE", await duplicateIssue.Content.ReadAsStringAsync());

        await database.ExecuteAsync($"UPDATE dbo.Robots SET FirstAcceptedSyncAt=SYSDATETIMEOFFSET(), FirstAcceptedMapKey=N'old-map', FirstAcceptedFrameId=N'map' WHERE Id='{robotId:D}';");
        using var beforeRotate = await Get(host.Client, "/api/robots/credential-test/credential", technical);
        var rotateVersion = (await Body(beforeRotate)).GetProperty("data").GetProperty("rowVersion").GetString()!;
        using var rotate = await Json(host.Client, HttpMethod.Post, "/api/technical/robots/credential-test/credential/rotate", technical,
            new { requestId = Guid.NewGuid(), expectedRowVersion = rotateVersion, reason = "routine" });
        Assert.Equal(HttpStatusCode.OK, rotate.StatusCode);
        var rotatedCredential = (await Body(rotate)).GetProperty("data").GetProperty("secret").GetString()!;
        Assert.NotEqual(firstCredential, rotatedCredential);

        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(database.ConnectionString).Options);
        var authenticator = new FleetRobotAuthenticator(db);
        Assert.Null(await authenticator.AuthenticateAsync("credential-test", firstCredential, CancellationToken.None));
        Assert.NotNull(await authenticator.AuthenticateAsync("credential-test", rotatedCredential, CancellationToken.None));
        var robot = await db.Robots.SingleAsync(item => item.Id == robotId);
        Assert.True(FleetRobotCredentialHash.Verify(rotatedCredential, robot.CredentialHash));
        Assert.Null(robot.FirstAcceptedSyncAt);
        Assert.Null(robot.FirstAcceptedMapKey);
        Assert.Null(robot.FirstAcceptedFrameId);
        Assert.False(robot.IsDispatchEnabled);
        Assert.Null(robot.CurrentTourId);

        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE dbo.Robots SET FirstAcceptedSyncAt=SYSDATETIMEOFFSET(), FirstAcceptedMapKey=N'revoke-map', FirstAcceptedFrameId=N'map' WHERE Id={robotId};");
        await db.Entry(robot).ReloadAsync();
        using var invalidRevoke = await Json(host.Client, HttpMethod.Post, "/api/robots/credential-test/credential/revoke", admin,
            new { requestId = Guid.NewGuid(), expectedRowVersion = Convert.ToBase64String(robot.RowVersion), reason = " " });
        Assert.Equal(HttpStatusCode.BadRequest, invalidRevoke.StatusCode);
        using var adminRevoke = await Json(host.Client, HttpMethod.Post, "/api/robots/credential-test/credential/revoke", admin,
            new { requestId = Guid.NewGuid(), expectedRowVersion = Convert.ToBase64String(robot.RowVersion), reason = "emergency compromise" });
        Assert.Equal(HttpStatusCode.OK, adminRevoke.StatusCode);
        Assert.Equal("no-store", adminRevoke.Headers.CacheControl?.ToString());
        Assert.Null(await authenticator.AuthenticateAsync("credential-test", rotatedCredential, CancellationToken.None));
        await db.Entry(robot).ReloadAsync();
        Assert.Null(robot.FirstAcceptedSyncAt);
        Assert.Null(robot.FirstAcceptedMapKey);
        Assert.Null(robot.FirstAcceptedFrameId);
        using var afterRevoke = await Get(host.Client, "/api/robots/credential-test/credential", admin);
        var revoked = (await Body(afterRevoke)).GetProperty("data");
        Assert.Equal("REVOKED", revoked.GetProperty("status").GetString());
        Assert.False(revoked.TryGetProperty("secret", out _));
        Assert.Equal(3, revoked.GetProperty("history").GetArrayLength());
        var auditJson = revoked.GetProperty("history").GetRawText();
        Assert.DoesNotContain(firstCredential, auditJson);
        Assert.DoesNotContain(rotatedCredential, auditJson);
        Assert.Contains("emergency compromise", auditJson);
        using var adminAudit = await Get(host.Client, "/api/admin/audit-logs?page=1", admin);
        using var technicalAuditDenied = await Get(host.Client, "/api/admin/audit-logs?page=1", technical);
        Assert.Equal(HttpStatusCode.OK, adminAudit.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, technicalAuditDenied.StatusCode);
        var storedAudit = await db.AuditLogs.Where(row => row.RobotId == robotId && row.Action.StartsWith("ROBOT_CREDENTIAL_")).ToListAsync();
        Assert.Equal(3, storedAudit.Count);
        Assert.All(storedAudit, row => Assert.DoesNotContain(firstCredential, row.DataJson ?? string.Empty));
        Assert.All(storedAudit, row => Assert.DoesNotContain(rotatedCredential, row.DataJson ?? string.Empty));
        Assert.Equal(2, storedAudit.Count(row => row.Action is "ROBOT_CREDENTIAL_ISSUED" or "ROBOT_CREDENTIAL_ROTATED"));
    }
    [SchemaV17Fact]
    public async Task PhysicalRobotCredentialIssue_RollsBackWhenAuditInsertFails()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "robot-credential-atomic.admin", roles: ["ADMIN"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var admin = await Login(host.Client, "robot-credential-atomic.admin");
        _ = await CreateAccount(host.Client, admin, "robot-credential-atomic.technical", "TechnicalStaff");
        var technical = await Login(host.Client, "robot-credential-atomic.technical");
        using var registered = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "credential-atomic", displayName = "Credential Atomic" });
        var robotId = (await Body(registered)).GetProperty("data").GetProperty("id").GetGuid();
        using var status = await Get(host.Client, "/api/technical/physical-robots", technical);
        var rowVersion = Assert.Single((await Body(status)).GetProperty("data").EnumerateArray())
            .GetProperty("rowVersion").GetString();

        await database.ExecuteAsync("""
            CREATE TRIGGER dbo.TR_TestFailRobotCredentialAudit ON dbo.AuditLogs AFTER INSERT AS
            BEGIN
                IF EXISTS (SELECT 1 FROM inserted WHERE Action=N'ROBOT_CREDENTIAL_ISSUED')
                    THROW 52001, 'Injected credential audit failure.', 1;
            END;
            """);
        try
        {
            using var failed = await Json(host.Client, HttpMethod.Post,
                "/api/technical/robots/credential-atomic/credential", technical,
                new { requestId = Guid.NewGuid(), expectedRowVersion = rowVersion });
            Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
            await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(database.ConnectionString).Options);
            var robot = await db.Robots.SingleAsync(item => item.Id == robotId);
            Assert.Null(robot.CredentialHash);
            Assert.Null(robot.FirstAcceptedSyncAt);
            Assert.Empty(await db.AuditLogs.Where(row => row.RobotId == robotId &&
                row.Action == "ROBOT_CREDENTIAL_ISSUED").ToListAsync());
        }
        finally
        {
            await database.ExecuteAsync("DROP TRIGGER dbo.TR_TestFailRobotCredentialAudit;");
        }
    }

    [SchemaV14Fact]
    public async Task PhysicalRobotRegistration_IsTechnicalOnlySafeAtomicAndRaceProtected()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "robot-register.admin", roles: ["ADMIN"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var admin = await Login(host.Client, "robot-register.admin");
        var robotRegisterActorId = await CreateAccount(host.Client, admin, "robot-register.technical", "TechnicalStaff");
        _ = await CreateAccount(host.Client, admin, "robot-register.staff", "Staff");
        var technical = await Login(host.Client, "robot-register.technical");
        var staff = await Login(host.Client, "robot-register.staff");

        using var adminDenied = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", admin,
            new { robotCode = "forbidden_admin", displayName = "Forbidden" });
        using var staffDenied = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", staff,
            new { robotCode = "forbidden_staff", displayName = "Forbidden" });
        Assert.Equal(HttpStatusCode.Forbidden, adminDenied.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, staffDenied.StatusCode);

        using var invalidCode = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "bad code", displayName = "Invalid code" });
        using var invalidName = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "valid_code", displayName = "   " });
        using var longName = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "valid_name", displayName = new string('N', 151) });
        Assert.Equal(HttpStatusCode.BadRequest, invalidCode.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalidName.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, longName.StatusCode);

        using var registered = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "  robot_web_01  ", displayName = "  Robot Web 01  " });
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var response = (await Body(registered)).GetProperty("data");
        var robotId = response.GetProperty("id").GetGuid();
        Assert.Equal("robot_web_01", response.GetProperty("robotCode").GetString());
        Assert.Equal("Robot Web 01", response.GetProperty("displayName").GetString());
        Assert.Equal(new[] { "displayName", "id", "robotCode" }, response.EnumerateObject().Select(property => property.Name).Order().ToArray());

        using var duplicate = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "robot_web_01", displayName = "Duplicate" });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("ROBOT_CODE_CONFLICT", (await Body(duplicate)).GetProperty("errors").GetProperty("code").GetString());
        Assert.Contains("đã được đăng ký", (await Body(duplicate)).GetProperty("message").GetString(), StringComparison.OrdinalIgnoreCase);

        using (var db = new SmartCampus.Infrastructure.Persistence.ApplicationDbContext(
            new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<SmartCampus.Infrastructure.Persistence.ApplicationDbContext>()
                .UseSqlServer(database.ConnectionString).Options))
        {
            var robot = await db.Robots.SingleAsync(row => row.Id == robotId);
            Assert.Equal("PHYSICAL", robot.SourceType);
            Assert.Equal("robot_web_01", robot.RobotCode);
            Assert.Equal("Robot Web 01", robot.DisplayName);
            Assert.Null(robot.CredentialHash);
            Assert.False(robot.IsDispatchEnabled);
            Assert.False(robot.NeedsInspection);
            Assert.Null(robot.CurrentTourId);
            Assert.Null(robot.LastAssignedAt);
            Assert.Null(robot.UpdatedAt);
            var authenticator = new FleetRobotAuthenticator(db);
            Assert.Null(await authenticator.AuthenticateAsync(robot.RobotCode,
                FleetRobotCredentialHash.Create().Secret, CancellationToken.None));
            var provisioned = await new FleetRobotCredentialProvisioner().ProvisionAsync(db, robot.RobotCode);
            Assert.NotNull(provisioned);
            Assert.NotNull(await authenticator.AuthenticateAsync(robot.RobotCode,
                provisioned.Credential, CancellationToken.None));

            var audit = await db.AuditLogs.SingleAsync(row => row.Action == "PHYSICAL_ROBOT_REGISTERED");
            Assert.Equal(robotRegisterActorId, audit.ActorUserId);
            Assert.Equal(robotId, audit.RobotId);
            Assert.Equal(robot.CreatedAt, audit.OccurredAt);
        }

        using var listed = await Get(host.Client, "/api/technical/physical-robots", technical);
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        Assert.Contains((await Body(listed)).GetProperty("data").EnumerateArray(), row =>
            row.GetProperty("robotCode").GetString() == "robot_web_01");

        int beforeRace;
        await using (var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(database.ConnectionString).Options))
            beforeRace = await db.Robots.CountAsync();
        var raceOne = Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "same-race-code", displayName = "Race A" });
        var raceTwo = Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
            new { robotCode = "same-race-code", displayName = "Race B" });
        await Task.WhenAll(raceOne, raceTwo);
        using var raceResponseOne = await raceOne;
        using var raceResponseTwo = await raceTwo;
        Assert.Equal(1, new[] { raceResponseOne.StatusCode, raceResponseTwo.StatusCode }.Count(status => status == HttpStatusCode.OK));
        Assert.Equal(1, new[] { raceResponseOne.StatusCode, raceResponseTwo.StatusCode }.Count(status => status == HttpStatusCode.Conflict));
        await using (var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(database.ConnectionString).Options))
        {
            Assert.Equal(1, await db.Robots.CountAsync(row => row.RobotCode == "same-race-code"));
            Assert.Equal(beforeRace + 1, await db.Robots.CountAsync());
        }

        await database.ExecuteAsync("""
            CREATE TRIGGER dbo.TR_TestRejectPhysicalRobotAudit ON dbo.AuditLogs AFTER INSERT AS
            BEGIN
                IF EXISTS (SELECT 1 FROM inserted WHERE Action=N'PHYSICAL_ROBOT_REGISTERED')
                    THROW 51998, 'Injected robot registration audit failure.', 1;
            END;
            """);
        try
        {
            int robotsBeforeFailure;
            int auditsBeforeFailure;
            await using (var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                    .UseSqlServer(database.ConnectionString).Options))
            {
                robotsBeforeFailure = await db.Robots.CountAsync();
                auditsBeforeFailure = await db.AuditLogs.CountAsync(row => row.Action == "PHYSICAL_ROBOT_REGISTERED");
            }
            using var failedAudit = await Json(host.Client, HttpMethod.Post, "/api/technical/physical-robots", technical,
                new { robotCode = "rollback_robot", displayName = "Rollback robot" });
            Assert.Equal(HttpStatusCode.InternalServerError, failedAudit.StatusCode);
            await using (var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                    .UseSqlServer(database.ConnectionString).Options))
            {
                Assert.Equal(robotsBeforeFailure, await db.Robots.CountAsync());
                Assert.Equal(auditsBeforeFailure, await db.AuditLogs.CountAsync(row => row.Action == "PHYSICAL_ROBOT_REGISTERED"));
            }
        }
        finally
        {
            await database.ExecuteAsync("DROP TRIGGER IF EXISTS dbo.TR_TestRejectPhysicalRobotAudit;");
        }
    }

    [SchemaV14Fact]
    public async Task MapAreaAndPhysicalRobotLookups_AreCompleteSafeAndMapUploadRetriesReplayServerVersion()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "catalog.admin", roles: ["ADMIN"]);
        var robotId = Guid.NewGuid();
        var gazeboId = Guid.NewGuid();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id, RobotCode, SourceType, DisplayName, CredentialHash, IsDispatchEnabled, NeedsInspection, CreatedAt)
            VALUES ('{robotId:D}', N'catalog-physical', 'PHYSICAL', N'Physical test robot', 0x020304, 0, 0, SYSDATETIMEOFFSET()),
                   ('{gazeboId:D}', N'catalog-gazebo', 'GAZEBO', N'Gazebo robot', 0x050607, 1, 0, SYSDATETIMEOFFSET());
            """);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var admin = await Login(host.Client, "catalog.admin");
        var technicalId = await CreateAccount(host.Client, admin, "catalog.technical", "TechnicalStaff");
        var technical = await Login(host.Client, "catalog.technical");

        var extraAreas = string.Join(",", Enumerable.Range(1, 60).Select(index =>
            $"(N'catalog-area-{index:D2}', N'Catalog Area {index}', '{technicalId:D}', SYSDATETIMEOFFSET())"));
        await database.ExecuteAsync($"INSERT dbo.MapAreas(AreaKey,DisplayName,CreatedByUserId,CreatedAt) VALUES {extraAreas};");

        var package = CreateMapPackage();
        var firstRequestId = Guid.NewGuid();
        using var firstUpload = await UploadMap(host.Client, technical, "catalog-main", "Catalog Main", firstRequestId, package);
        Assert.Equal(HttpStatusCode.OK, firstUpload.StatusCode);
        var first = (await Body(firstUpload)).GetProperty("data");
        Assert.Equal(1, first.GetProperty("versionNumber").GetInt32());

        using var uploadRetry = await UploadMap(host.Client, technical, "catalog-main", "Catalog Main", firstRequestId, package);
        Assert.Equal(HttpStatusCode.OK, uploadRetry.StatusCode);
        var replay = (await Body(uploadRetry)).GetProperty("data");
        Assert.Equal(first.GetProperty("id").GetGuid(), replay.GetProperty("id").GetGuid());
        Assert.Equal(1, await database.CountRowsAsync("dbo.MapVersions"));

        using var duplicateUpload = await UploadMap(host.Client, technical, "catalog-main", "Catalog Main", Guid.NewGuid(), package);
        Assert.Equal(HttpStatusCode.Conflict, duplicateUpload.StatusCode);
        var duplicateBody = await Body(duplicateUpload);
        Assert.Equal("MAP_PACKAGE_DUPLICATE", duplicateBody.GetProperty("errors").GetProperty("code").GetString());
        Assert.Equal("Gói này đã được tải lên ở Catalog Main · v1.", duplicateBody.GetProperty("message").GetString());
        Assert.Equal(1, await database.CountRowsAsync("dbo.MapVersions"));

        using var nextUpload = await UploadMap(host.Client, technical, "catalog-main", "Catalog Main", Guid.NewGuid(), CreateMapPackage("catalog second version"));
        Assert.Equal(HttpStatusCode.OK, nextUpload.StatusCode);
        var second = (await Body(nextUpload)).GetProperty("data");
        Assert.Equal("catalog-main", second.GetProperty("areaKey").GetString());
        Assert.Equal("Catalog Main", second.GetProperty("areaName").GetString());
        Assert.Equal(2, second.GetProperty("versionNumber").GetInt32());
        Assert.Equal("catalog-main-v2", second.GetProperty("mapKey").GetString());

        using var conflictingName = await UploadMap(host.Client, technical, "catalog-main", "Different Name", Guid.NewGuid(), package);
        Assert.Equal(HttpStatusCode.Conflict, conflictingName.StatusCode);
        Assert.Equal("MAP_AREA_NAME_CONFLICT", (await Body(conflictingName)).GetProperty("errors").GetProperty("code").GetString());

        using var areaResponse = await Get(host.Client, "/api/technical/map-areas", technical);
        Assert.Equal(HttpStatusCode.OK, areaResponse.StatusCode);
        var areas = (await Body(areaResponse)).GetProperty("data").EnumerateArray().ToArray();
        Assert.Equal(61, areas.Length);
        var storedArea = Assert.Single(areas, area => area.GetProperty("areaKey").GetString() == "catalog-main");
        Assert.Equal("Catalog Main", storedArea.GetProperty("displayName").GetString());

        using var robotResponse = await Get(host.Client, "/api/technical/physical-robots", technical);
        Assert.Equal(HttpStatusCode.OK, robotResponse.StatusCode);
        var robots = (await Body(robotResponse)).GetProperty("data").EnumerateArray().ToArray();
        var listedRobot = Assert.Single(robots);
        Assert.Equal(robotId, listedRobot.GetProperty("id").GetGuid());
        Assert.Equal("catalog-physical", listedRobot.GetProperty("robotCode").GetString());
        Assert.Equal("Physical test robot", listedRobot.GetProperty("displayName").GetString());
        Assert.Equal("UNCONFIRMED", listedRobot.GetProperty("connectionStatus").GetString());
        Assert.Null(listedRobot.GetProperty("firstAcceptedSyncAt").GetString());
        Assert.Equal(new[] { "assignedAreaName", "assignedFrameId", "assignedMapKey", "assignedMapVersionId", "assignedVersionNumber", "connectionStatus", "credentialHint", "credentialIssuedAt", "credentialIssuedByName", "credentialIssuedByUserId", "credentialRevokedAt", "credentialRevokedByName", "credentialRevokedByUserId", "credentialStatus", "currentTourId", "currentTourName", "currentTourState", "deactivatedAt", "deactivationReason", "displayName", "firstAcceptedFrameId", "firstAcceptedMapKey", "firstAcceptedSyncAt", "id", "isDispatchEnabled", "lastSyncReceivedAt", "latestDeployedFrameId", "latestDeployedMapKey", "latestDeploymentPassed", "mapAssignedAt", "mapAssignedByName", "needsInspection", "robotCode", "rowVersion" }, listedRobot.EnumerateObject().Select(property => property.Name).Order().ToArray());
        Assert.Null(listedRobot.GetProperty("assignedMapKey").GetString());
        Assert.False(listedRobot.GetProperty("needsInspection").GetBoolean());
        Assert.Equal(JsonValueKind.Null, listedRobot.GetProperty("currentTourId").ValueKind);
        Assert.Equal(JsonValueKind.Null, listedRobot.GetProperty("latestDeploymentPassed").ValueKind);
        Assert.DoesNotContain(listedRobot.EnumerateObject(), property => property.Name.Contains("secret", StringComparison.OrdinalIgnoreCase) || property.Name.Contains("hash", StringComparison.OrdinalIgnoreCase));

        var beforeAssignmentRowVersion = listedRobot.GetProperty("rowVersion").GetString();
        byte[] originalCredentialHash;
        await using (var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options))
            originalCredentialHash = (await context.Robots.AsNoTracking().SingleAsync(robot => robot.Id == robotId)).CredentialHash!;
        var assignmentRequest = new { requestId = Guid.NewGuid(), expectedRowVersion = beforeAssignmentRowVersion, mapVersionId = first.GetProperty("id").GetGuid() };
        using var assignedResponse = await Json(host.Client, HttpMethod.Put, $"/api/technical/physical-robots/{robotId:D}/map-assignment", technical, assignmentRequest);
        Assert.Equal(HttpStatusCode.OK, assignedResponse.StatusCode);
        var assignedMap = (await Body(assignedResponse)).GetProperty("data");
        Assert.Equal(first.GetProperty("mapKey").GetString(), assignedMap.GetProperty("assignedMapKey").GetString());
        Assert.Equal(first.GetProperty("frameId").GetString(), assignedMap.GetProperty("assignedFrameId").GetString());
        Assert.Equal(1, await database.CountRowsAsync("dbo.AuditLogs WHERE [Action]='ROBOT_MAP_ASSIGNED'"));
        await using (var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options))
            Assert.Equal(originalCredentialHash, (await context.Robots.AsNoTracking().SingleAsync(robot => robot.Id == robotId)).CredentialHash);
        using var assignmentReplay = await Json(host.Client, HttpMethod.Put, $"/api/technical/physical-robots/{robotId:D}/map-assignment", technical, assignmentRequest);
        Assert.Equal(HttpStatusCode.OK, assignmentReplay.StatusCode);
        using var staleClear = await Json(host.Client, HttpMethod.Delete, $"/api/technical/physical-robots/{robotId:D}/map-assignment", technical,
            new { requestId = Guid.NewGuid(), expectedRowVersion = beforeAssignmentRowVersion });
        Assert.Equal(HttpStatusCode.Conflict, staleClear.StatusCode);
        using var adminForbidden = await Json(host.Client, HttpMethod.Put, $"/api/technical/physical-robots/{robotId:D}/map-assignment", admin,
            new { requestId = Guid.NewGuid(), expectedRowVersion = assignedMap.GetProperty("rowVersion").GetString(), mapVersionId = first.GetProperty("id").GetGuid() });
        Assert.Equal(HttpStatusCode.Forbidden, adminForbidden.StatusCode);        var mapSha = first.GetProperty("packageSha256").GetString();
        using var blockedPass = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{first.GetProperty("id").GetGuid()}/deployment-checks", technical,
            new { requestId = Guid.NewGuid(), robotCode = "catalog-physical", packageSha256 = mapSha, localizationPassed = true, displayPassed = true, evidenceNote = "SIMULATED BACKEND TEST; unconfirmed PASS must be blocked." });
        Assert.Equal(HttpStatusCode.Conflict, blockedPass.StatusCode);
        Assert.Equal("ROBOT_CONNECTION_UNCONFIRMED", (await Body(blockedPass)).GetProperty("errors").GetProperty("code").GetString());
        var checkRequestId = Guid.NewGuid();
        using var recorded = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{first.GetProperty("id").GetGuid()}/deployment-checks", technical,
            new { requestId = checkRequestId, robotCode = "catalog-physical", packageSha256 = mapSha, localizationPassed = false, displayPassed = false, evidenceNote = "SIMULATED BACKEND TEST; not a physical robot result." });
        Assert.Equal(HttpStatusCode.OK, recorded.StatusCode);
        var checkId = (await Body(recorded)).GetProperty("data").GetProperty("id").GetGuid();
        using var recordRetry = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{first.GetProperty("id").GetGuid()}/deployment-checks", technical,
            new { requestId = checkRequestId, robotCode = "catalog-physical", packageSha256 = mapSha, localizationPassed = false, displayPassed = false, evidenceNote = "SIMULATED BACKEND TEST; not a physical robot result." });
        Assert.Equal(HttpStatusCode.OK, recordRetry.StatusCode);
        Assert.Equal(checkId, (await Body(recordRetry)).GetProperty("data").GetProperty("id").GetGuid());
        Assert.Equal(1, await database.CountRowsAsync("dbo.MapDeploymentChecks"));

        await database.ExecuteAsync($"UPDATE dbo.Robots SET SourceType='GAZEBO' WHERE Id='{robotId:D}';");
        using var staleRobot = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{first.GetProperty("id").GetGuid()}/deployment-checks", technical,
            new { requestId = Guid.NewGuid(), robotCode = "catalog-physical", packageSha256 = mapSha, localizationPassed = true, displayPassed = true, evidenceNote = "SIMULATED BACKEND TEST; stale robot type should be rejected." });
        Assert.Equal(HttpStatusCode.NotFound, staleRobot.StatusCode);
        Assert.Equal(1, await database.CountRowsAsync("dbo.MapDeploymentChecks"));
    }

    [SchemaV14Fact]
    public async Task PoiRevisionAndSubmitRecheckEligibilityAndSerializeWithConcurrentDeploymentEvidence()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "mapgate.admin", roles: ["ADMIN"]);
        var robotId = Guid.NewGuid();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id, RobotCode, SourceType, CredentialHash, IsDispatchEnabled, NeedsInspection, CreatedAt)
            VALUES ('{robotId:D}', N'mapgate-physical', 'PHYSICAL', 0x020304, 0, 0, SYSDATETIMEOFFSET());
            """);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var admin = await Login(host.Client, "mapgate.admin");
        _ = await CreateAccount(host.Client, admin, "mapgate.technical", "TechnicalStaff");
        _ = await CreateAccount(host.Client, admin, "mapgate.staff", "Staff");
        var technical = await Login(host.Client, "mapgate.technical");
        var staff = await Login(host.Client, "mapgate.staff");
        var package = CreateMapPackage();
        using var upload = await UploadMap(host.Client, technical, "mapgate", "Map Gate", Guid.NewGuid(), package);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var map = (await Body(upload)).GetProperty("data");
        var mapId = map.GetProperty("id").GetGuid();
        var packageSha = map.GetProperty("packageSha256").GetString();

        // Race a failed technical check against POI creation. Both legal lock orders
        // leave the map ineligible and therefore must reject the proposal mutation.
        var raceCreateId = Guid.NewGuid();
        var deploymentRace = Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{mapId}/deployment-checks", technical,
            new { requestId = Guid.NewGuid(), robotCode = "mapgate-physical", packageSha256 = packageSha,
                localizationPassed = false, displayPassed = false, evidenceNote = "SIMULATED BACKEND TEST; concurrent failed map evidence." });
        var proposalRace = Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff,
            new { requestId = raceCreateId, draft = new { mapVersionId = mapId, name = "Race POI", purpose = "Entry",
                description = (string?)null, x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null } });
        await Task.WhenAll(deploymentRace, proposalRace);
        using var racedCheck = await deploymentRace;
        using var racedCreate = await proposalRace;
        Assert.Equal(HttpStatusCode.OK, racedCheck.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, racedCreate.StatusCode);
        Assert.Equal(0, await database.CountRowsAsync("dbo.PoiProposals"));
        Assert.Equal(0, await database.CountRowsAsync("dbo.PoiProposalRevisions"));
        Assert.Equal(0, await database.CountRowsAsync("dbo.PoiProposalSubmissions"));

        // A stored confirmation remains usable without any current RAM telemetry,
        // including after a backend process restart.
        await database.ExecuteAsync($"UPDATE dbo.Robots SET FirstAcceptedSyncAt=SYSDATETIMEOFFSET(), FirstAcceptedMapKey=N'campus-v1', FirstAcceptedFrameId=N'map' WHERE Id='{robotId:D}';");
        using (var robotStatus = await Get(host.Client, "/api/technical/physical-robots", technical))
        {
            var item = Assert.Single((await Body(robotStatus)).GetProperty("data").EnumerateArray());
            Assert.Equal("AWAITING_DATA", item.GetProperty("connectionStatus").GetString());
        }

        using var passingCheck = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{mapId}/deployment-checks", technical,
            new { requestId = Guid.NewGuid(), robotCode = "mapgate-physical", packageSha256 = packageSha,
                localizationPassed = true, displayPassed = true, evidenceNote = "SIMULATED BACKEND TEST; not a physical robot result." });
        Assert.Equal(HttpStatusCode.OK, passingCheck.StatusCode);

        object Draft(decimal x, string camera) => new { requestId = Guid.NewGuid(), draft = new { mapVersionId = mapId, name = "Library", purpose = "Entry",
            description = (string?)null, x, y = 0.5m, yaw = 0m, cameraPreset = camera, narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null } };
        using var badCamera = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff, Draft(0.5m, "UP"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badCamera.StatusCode);
        var badCameraBody = await Body(badCamera);
        Assert.Equal("Hướng camera chỉ được là Phía trước, Bên trái hoặc Bên phải.", badCameraBody.GetProperty("message").GetString());
        Assert.Equal("POI_CAMERA_PRESET_INVALID", badCameraBody.GetProperty("errors").GetProperty("code").GetString());
        using var tooClose = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff, Draft(0.1m, "FRONT"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, tooClose.StatusCode);
        var tooCloseBody = await Body(tooClose);
        Assert.Equal("Điểm quá sát vật cản (cần trống bán kính 0,30 m).", tooCloseBody.GetProperty("message").GetString());
        Assert.Equal("POSE_CLEARANCE_INSUFFICIENT", tooCloseBody.GetProperty("errors").GetProperty("code").GetString());

        var createRequestId = Guid.NewGuid();
        var createBody = new { requestId = createRequestId, draft = new { mapVersionId = mapId, name = "Library", purpose = "Entry",
            description = (string?)null, x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null } };
        using var created = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff, createBody);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var proposal = (await Body(created)).GetProperty("data");
        var proposalId = proposal.GetProperty("id").GetGuid();
        using var createRetry = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff, createBody);
        Assert.Equal(HttpStatusCode.OK, createRetry.StatusCode);
        Assert.Equal(proposalId, (await Body(createRetry)).GetProperty("data").GetProperty("id").GetGuid());

        var revisionRequestId = Guid.NewGuid();
        var revisedDraft = new { mapVersionId = mapId, name = "Library revised", purpose = "Entry", description = (string?)null,
            x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null };
        var revisionBody = new { requestId = revisionRequestId, expectedCurrentRevision = 1,
            expectedRowVersion = proposal.GetProperty("rowVersion").GetString(), draft = revisedDraft };
        using var revised = await Json(host.Client, HttpMethod.Put, $"/api/staff/poi-proposals/{proposalId}/draft", staff, revisionBody);
        Assert.Equal(HttpStatusCode.OK, revised.StatusCode);
        var revision = (await Body(revised)).GetProperty("data");
        Assert.Equal(2, revision.GetProperty("currentRevision").GetInt32());
        using var revisionRetry = await Json(host.Client, HttpMethod.Put, $"/api/staff/poi-proposals/{proposalId}/draft", staff, revisionBody);
        Assert.Equal(HttpStatusCode.OK, revisionRetry.StatusCode);
        Assert.Equal(2, (await Body(revisionRetry)).GetProperty("data").GetProperty("currentRevision").GetInt32());

        var submitRequestId = Guid.NewGuid();
        var submitBody = new { requestId = submitRequestId, expectedRevisionNumber = 2,
            expectedRowVersion = revision.GetProperty("rowVersion").GetString() };
        using var submitted = await Json(host.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{proposalId}/submit", staff, submitBody);
        Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
        using var submitRetry = await Json(host.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{proposalId}/submit", staff, submitBody);
        Assert.Equal(HttpStatusCode.OK, submitRetry.StatusCode);
        Assert.True((await Body(submitRetry)).GetProperty("data").GetProperty("revision").GetProperty("isSubmitted").GetBoolean());

        var submittedProposal = (await Body(submitted)).GetProperty("data");
        using var poiPass = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/poi-proposals/{proposalId}/revisions/2/verification", technical,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = 2, expectedRowVersion = submittedProposal.GetProperty("rowVersion").GetString(),
                robotCode = "mapgate-physical", resultCode = "PASS", reached = true, stopped = true,
                localizationPassed = true, cameraPresetConfirmed = true, reason = (string?)null,
                evidenceNote = "SIMULATED BACKEND TEST; not a physical robot result." });
        Assert.Equal(HttpStatusCode.OK, poiPass.StatusCode);
        using var history = await Get(host.Client, $"/api/staff/poi-proposals/{proposalId}/history", staff);
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
        var historyData = (await Body(history)).GetProperty("data");
        Assert.Equal(2, historyData.GetProperty("revisions").GetArrayLength());
        Assert.Single(historyData.GetProperty("verificationRecords").EnumerateArray());

        var secondProposalBody = new { requestId = Guid.NewGuid(), draft = new { mapVersionId = mapId, name = "Second POI", purpose = "Exit",
            description = (string?)null, x = 1.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null } };
        using var secondCreated = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff, secondProposalBody);
        Assert.Equal(HttpStatusCode.OK, secondCreated.StatusCode);
        var secondProposal = (await Body(secondCreated)).GetProperty("data");
        var secondProposalId = secondProposal.GetProperty("id").GetGuid();

        using var newerFailure = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{mapId}/deployment-checks", technical,
            new { requestId = Guid.NewGuid(), robotCode = "mapgate-physical", packageSha256 = packageSha,
                localizationPassed = false, displayPassed = true, evidenceNote = "SIMULATED BACKEND TEST; newer failure supersedes prior pass." });
        Assert.Equal(HttpStatusCode.OK, newerFailure.StatusCode);

        var beforeBlockedRevisionCount = await database.CountRowsAsync("dbo.PoiProposalRevisions");
        var beforeBlockedSubmissionCount = await database.CountRowsAsync("dbo.PoiProposalSubmissions");
        var beforeBlockedAuditCount = await database.CountRowsAsync("dbo.AuditLogs");
        using var blockedRevision = await Json(host.Client, HttpMethod.Put, $"/api/staff/poi-proposals/{proposalId}/draft", staff,
            new { requestId = Guid.NewGuid(), expectedCurrentRevision = 2,
                expectedRowVersion = (await Body(await Get(host.Client, $"/api/staff/poi-proposals/{proposalId}", staff))).GetProperty("data").GetProperty("rowVersion").GetString(),
                draft = new { mapVersionId = mapId, name = "Should not persist", purpose = "Entry", description = (string?)null,
                    x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.Conflict, blockedRevision.StatusCode);
        Assert.Equal("TECHNICAL_CHECK_NOT_PASSED", (await Body(blockedRevision)).GetProperty("errors").GetProperty("code").GetString());
        using var blockedSubmit = await Json(host.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{secondProposalId}/submit", staff,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = 1, expectedRowVersion = secondProposal.GetProperty("rowVersion").GetString() });
        Assert.Equal(HttpStatusCode.Conflict, blockedSubmit.StatusCode);
        Assert.Equal("TECHNICAL_CHECK_NOT_PASSED", (await Body(blockedSubmit)).GetProperty("errors").GetProperty("code").GetString());
        Assert.Equal(beforeBlockedRevisionCount, await database.CountRowsAsync("dbo.PoiProposalRevisions"));
        Assert.Equal(beforeBlockedSubmissionCount, await database.CountRowsAsync("dbo.PoiProposalSubmissions"));
        Assert.Equal(beforeBlockedAuditCount, await database.CountRowsAsync("dbo.AuditLogs"));
    }

    [SchemaV14Fact]
    public async Task VersionedMapPoiRouteChain_RecordsSimulatedEvidence_AndSchedulesATour()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "flow.admin", roles: ["ADMIN"]);
        var robotId = Guid.NewGuid();
        var robotCredential = FleetRobotCredentialHash.Create();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id, RobotCode, SourceType, CredentialHash, IsDispatchEnabled, NeedsInspection, CreatedAt)
            VALUES ('{robotId:D}', N'flow_physical', 'PHYSICAL', 0x{Convert.ToHexString(robotCredential.Hash)}, 0, 1, SYSDATETIMEOFFSET());
            """);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);

        var adminToken = await Login(host.Client, "flow.admin");
        var technicalId = await CreateAccount(host.Client, adminToken, "flow.technical", "TechnicalStaff");
        var staffId = await CreateAccount(host.Client, adminToken, "flow.staff", "Staff");
        Assert.Equal("TECHNICAL_STAFF", await database.GetOnlyRoleAsync(technicalId));
        Assert.Equal("STAFF", await database.GetOnlyRoleAsync(staffId));
        var technicalToken = await Login(host.Client, "flow.technical");
        var staffToken = await Login(host.Client, "flow.staff");

        // Map upload and manual deployment-check entry are HTTP API operations. This test's
        // deployment evidence is simulated; uploading a package itself does not deploy it.
        using var uploadContent = new MultipartFormDataContent();
        uploadContent.Add(new StringContent("flow-area"), "areaKey");
        uploadContent.Add(new StringContent("Flow Test Area"), "areaName");
        uploadContent.Add(new StringContent(Guid.NewGuid().ToString()), "requestId");
        var package = CreateMapPackage();
        var packageContent = new ByteArrayContent(package);
        packageContent.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        uploadContent.Add(packageContent, "package", "flow-map.zip");
        using var mapUpload = await Send(host.Client, HttpMethod.Post, "/api/technical/map-versions", technicalToken, uploadContent);
        Assert.Equal(HttpStatusCode.OK, mapUpload.StatusCode);
        var map = (await Body(mapUpload)).GetProperty("data");
        var mapId = map.GetProperty("id").GetGuid();
        Assert.Equal("VALID", map.GetProperty("validationStatus").GetString());
        var mapHash = map.GetProperty("packageSha256").GetString();
        using (var robotList = await Get(host.Client, "/api/technical/physical-robots", technicalToken))
        {
            Assert.Equal(HttpStatusCode.OK, robotList.StatusCode);
            var robot = Assert.Single((await Body(robotList)).GetProperty("data").EnumerateArray());
            using var assignment = await Json(host.Client, HttpMethod.Put,
                $"/api/technical/physical-robots/{robotId:D}/map-assignment", technicalToken,
                new { requestId = Guid.NewGuid(), expectedRowVersion = robot.GetProperty("rowVersion").GetString(), mapVersionId = mapId });
            Assert.Equal(HttpStatusCode.OK, assignment.StatusCode);
        }
        // This backend integration uses a simulated Fleet Sync client with a valid
        // provisioned credential/context. It is not evidence from a physical robot.
        using var syncRequest = new HttpRequestMessage(HttpMethod.Post, "/api/fleet/v1/sync")
        {
            Content = JsonContent.Create(new
            {
                robotId = "flow_physical", streamId = Guid.NewGuid(), seq = 1,
                reportedAt = DateTimeOffset.UtcNow, mapKey = map.GetProperty("mapKey").GetString(),
                frameId = map.GetProperty("frameId").GetString(), pose = (object?)null,
                status = "IDLE", legId = (Guid?)null, localized = (bool?)null,
                motionReady = (bool?)null, faultCode = (string?)null, batteryPercent = (double?)null
            })
        };
        syncRequest.Headers.Add("X-Robot-Code", "flow_physical");
        syncRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", robotCredential.Secret);
        using var sync = await host.Client.SendAsync(syncRequest);
        Assert.Equal(HttpStatusCode.OK, sync.StatusCode);
        Assert.True((await Body(sync)).GetProperty("data").GetProperty("accepted").GetBoolean());

        using var pendingMaps = await Get(host.Client, "/api/maps/versions?areaKey=flow-area", staffToken);
        Assert.Equal(HttpStatusCode.OK, pendingMaps.StatusCode);
        var pendingMap = Assert.Single((await Body(pendingMaps)).GetProperty("data").EnumerateArray());
        Assert.Equal("PENDING", pendingMap.GetProperty("technicalCheckStatus").GetString());
        Assert.False(pendingMap.GetProperty("canUseForPoiPreparation").GetBoolean());
        Assert.Equal("TECHNICAL_CHECK_PENDING", pendingMap.GetProperty("preparationBlockReasonCode").GetString());

        var auditsBeforeBlockedProposal = await database.CountRowsAsync("dbo.AuditLogs");
        using var blockedProposal = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staffToken,
            new { requestId = Guid.NewGuid(), draft = new { mapVersionId = mapId, name = "Library", purpose = "Entrance",
                description = "Should remain unpersisted", x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.Conflict, blockedProposal.StatusCode);
        var blockedBody = await Body(blockedProposal);
        Assert.Equal("TECHNICAL_CHECK_PENDING", blockedBody.GetProperty("errors").GetProperty("code").GetString());
        Assert.Equal(0, await database.CountRowsAsync("dbo.PoiProposals"));
        Assert.Equal(0, await database.CountRowsAsync("dbo.PoiProposalRevisions"));
        Assert.Equal(0, await database.CountRowsAsync("dbo.PoiProposalSubmissions"));
        Assert.Equal(auditsBeforeBlockedProposal, await database.CountRowsAsync("dbo.AuditLogs"));

        using var deployment = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{mapId}/deployment-checks", technicalToken,
            new { requestId = Guid.NewGuid(), robotCode = "flow_physical", packageSha256 = mapHash,
                localizationPassed = true, displayPassed = true,
                evidenceNote = "SIMULATED BACKEND TEST evidence; not a physical robot result." });
        Assert.Equal(HttpStatusCode.OK, deployment.StatusCode);
        Assert.True((await Body(deployment)).GetProperty("data").GetProperty("passed").GetBoolean());
        using var eligibleMaps = await Get(host.Client, "/api/maps/versions?areaKey=flow-area", staffToken);
        var eligibleMap = Assert.Single((await Body(eligibleMaps)).GetProperty("data").EnumerateArray());
        Assert.Equal("PASSED", eligibleMap.GetProperty("technicalCheckStatus").GetString());
        Assert.True(eligibleMap.GetProperty("canUseForPoiPreparation").GetBoolean());
        Assert.Equal("flow_physical", eligibleMap.GetProperty("preparationEvidence").GetProperty("robotCode").GetString());
        Assert.False(eligibleMap.GetProperty("preparationEvidence").GetProperty("id").GetGuid() == Guid.Empty);

        using var createPoi = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staffToken,
            new { requestId = Guid.NewGuid(), draft = new { mapVersionId = mapId, name = "Library", purpose = "Entrance",
                description = "Integration test", x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin điểm tham quan.", fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.OK, createPoi.StatusCode);
        var proposal = (await Body(createPoi)).GetProperty("data");
        var proposalId = proposal.GetProperty("id").GetGuid();
        var rowVersion = proposal.GetProperty("rowVersion").GetString()!;
        var poiRevision = proposal.GetProperty("revision");
        var poiRevisionId = poiRevision.GetProperty("id").GetGuid();
        Assert.Equal(mapId, poiRevision.GetProperty("mapVersionId").GetGuid());
        Assert.Equal("NOT_CHECKED", poiRevision.GetProperty("navigationStatus").GetString());

        using var submitPoi = await Json(host.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{proposalId}/submit", staffToken,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = 1, expectedRowVersion = rowVersion });
        Assert.Equal(HttpStatusCode.OK, submitPoi.StatusCode);
        var submittedPoi = (await Body(submitPoi)).GetProperty("data");
        Assert.Equal("NOT_CHECKED", submittedPoi.GetProperty("revision").GetProperty("navigationStatus").GetString());

        // Exercise the Technical queue DTO used by the real UI. It supplies the
        // exact submitted revision and current proposal rowversion for the decision.
        using var verificationQueue = await Get(host.Client,
            $"/api/technical/poi-verifications?mapVersionId={mapId}", technicalToken);
        Assert.Equal(HttpStatusCode.OK, verificationQueue.StatusCode);
        var queuedProposal = Assert.Single((await Body(verificationQueue)).GetProperty("data").EnumerateArray());
        Assert.Equal(proposalId, queuedProposal.GetProperty("proposalId").GetGuid());
        Assert.Equal(1, queuedProposal.GetProperty("currentRevision").GetInt32());
        Assert.Equal(poiRevisionId, queuedProposal.GetProperty("revision").GetProperty("id").GetGuid());
        Assert.Equal(rowVersion, queuedProposal.GetProperty("rowVersion").GetString());

        using var verifyPoi = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/poi-proposals/{proposalId}/revisions/1/verification", technicalToken,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = queuedProposal.GetProperty("currentRevision").GetInt32(),
                expectedRowVersion = queuedProposal.GetProperty("rowVersion").GetString(),
                robotCode = "flow_physical", resultCode = "PASS", reached = true, stopped = true,
                localizationPassed = true, cameraPresetConfirmed = true, reason = (string?)null,
                evidenceNote = "SIMULATED BACKEND TEST evidence; no physical robot test was run." });
        Assert.Equal(HttpStatusCode.OK, verifyPoi.StatusCode);
        var poiVerification = (await Body(verifyPoi)).GetProperty("data");
        Assert.Equal(poiRevisionId, poiVerification.GetProperty("proposalRevisionId").GetGuid());
        Assert.Equal("PASS", poiVerification.GetProperty("resultCode").GetString());

        // A route needs a second stop at least one metre away (docs/lich-tour-theo-ca.md §2).
        using var createLab = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staffToken,
            new { requestId = Guid.NewGuid(), draft = new { mapVersionId = mapId, name = "Lab", purpose = "Lab",
                description = "Integration test", x = 1.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT", narrationText = "Thông tin phòng lab.", fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.OK, createLab.StatusCode);
        var labProposal = (await Body(createLab)).GetProperty("data");
        var labProposalId = labProposal.GetProperty("id").GetGuid();
        var labRevisionId = labProposal.GetProperty("revision").GetProperty("id").GetGuid();
        using var submitLab = await Json(host.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{labProposalId}/submit", staffToken,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = 1, expectedRowVersion = labProposal.GetProperty("rowVersion").GetString() });
        Assert.Equal(HttpStatusCode.OK, submitLab.StatusCode);
        using var verifyLab = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/poi-proposals/{labProposalId}/revisions/1/verification", technicalToken,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = 1,
                expectedRowVersion = (await Body(submitLab)).GetProperty("data").GetProperty("rowVersion").GetString(),
                robotCode = "flow_physical", resultCode = "PASS", reached = true, stopped = true,
                localizationPassed = true, cameraPresetConfirmed = true, reason = (string?)null,
                evidenceNote = "SIMULATED BACKEND TEST evidence; no physical robot test was run." });
        Assert.Equal(HttpStatusCode.OK, verifyLab.StatusCode);
        Assert.Equal(2, eligibleMap.GetProperty("routeMinStops").GetInt32());
        Assert.Equal(1.0m, eligibleMap.GetProperty("routeMinStopSeparationMeters").GetDecimal());

        var routeStops = new[]
        {
            new { poiRevisionId, dwellSeconds = 15, headSteps = new[] { new { preset = "FRONT", holdSeconds = 5 } } },
            new { poiRevisionId = labRevisionId, dwellSeconds = 15, headSteps = new[] { new { preset = "FRONT", holdSeconds = 5 } } }
        };
        // A start on the first stop's own position leaves the robot nowhere to go.
        using var startOnStop = await Json(host.Client, HttpMethod.Post, "/api/staff/routes", staffToken,
            new { requestId = Guid.NewGuid(), expectedCurrentRevision = 0, name = "Flow Route", description = "API integration test",
                mapVersionId = mapId, startX = 0.5m, startY = 0.5m, startYaw = 0m, endMode = "LAST_POI",
                endX = (decimal?)null, endY = (decimal?)null, endYaw = (decimal?)null, stops = routeStops });
        Assert.Equal(HttpStatusCode.Conflict, startOnStop.StatusCode);
        var startOnStopError = (await Body(startOnStop)).GetProperty("errors");
        Assert.Equal("ROUTE_STOP_TOO_CLOSE", startOnStopError.GetProperty("code").GetString());

        var routeDraft = new { requestId = Guid.NewGuid(), expectedCurrentRevision = 0, name = "Flow Route",
            description = "API integration test", mapVersionId = mapId, startX = 0.5m, startY = 1.5m, startYaw = 0m,
            endMode = "LAST_POI", endX = (decimal?)null, endY = (decimal?)null, endYaw = (decimal?)null,
            stops = routeStops };
        using var createRoute = await Json(host.Client, HttpMethod.Post, "/api/staff/routes", staffToken, routeDraft);
        Assert.Equal(HttpStatusCode.OK, createRoute.StatusCode);
        var route = (await Body(createRoute)).GetProperty("data");
        var routeId = route.GetProperty("routeId").GetGuid();
        var routeRevisionId = route.GetProperty("revisionId").GetGuid();
        Assert.Equal(mapId, route.GetProperty("mapVersionId").GetGuid());
        Assert.Equal(poiRevisionId, route.GetProperty("stops")[0].GetProperty("poiRevisionId").GetGuid());
        Assert.Equal("NOT_TESTED", route.GetProperty("verificationStatus").GetString());

        using var submitRoute = await Json(host.Client, HttpMethod.Post,
            $"/api/staff/routes/{routeId}/revisions/{routeRevisionId}/submit", staffToken,
            new { requestId = Guid.NewGuid(), expectedCurrentRevision = 1 });
        Assert.Equal(HttpStatusCode.OK, submitRoute.StatusCode);

        using var routeRun = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/routes/{routeId}/revisions/{routeRevisionId}/test-runs", technicalToken,
            new { requestId = Guid.NewGuid(), robotCode = "flow_physical", participatingStaffUserId = staffId,
                resultCode = "PASS", allStopsReached = true, safelyStopped = true, localizationPassed = true,
                measuredDurationSeconds = 40, failureReason = (string?)null,
                evidenceNote = "SIMULATED BACKEND TEST evidence; this is not a physical robot run." });
        Assert.Equal(HttpStatusCode.OK, routeRun.StatusCode);
        var passingRun = (await Body(routeRun)).GetProperty("data");
        Assert.Equal(routeRevisionId, passingRun.GetProperty("revisionId").GetGuid());
        Assert.Equal("PASS", passingRun.GetProperty("verificationStatus").GetString());
        Assert.NotEqual(Guid.Empty, passingRun.GetProperty("effectiveTestRunId").GetGuid());

        // A changed navigation revision must not inherit the prior route test result.
        var secondDraft = new { requestId = Guid.NewGuid(), expectedCurrentRevision = 1, routeDraft.name, routeDraft.description,
            routeDraft.mapVersionId, startX = 1.5m, routeDraft.startY, routeDraft.startYaw, routeDraft.endMode,
            routeDraft.endX, routeDraft.endY, routeDraft.endYaw, routeDraft.stops };
        using var reviseRoute = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/revisions", staffToken, secondDraft);
        Assert.Equal(HttpStatusCode.OK, reviseRoute.StatusCode);
        var newRouteRevision = (await Body(reviseRoute)).GetProperty("data");
        Assert.Equal(2, newRouteRevision.GetProperty("revisionNumber").GetInt32());
        Assert.Equal("NOT_TESTED", newRouteRevision.GetProperty("verificationStatus").GetString());
        using var routeHistory = await Get(host.Client, $"/api/routes/{routeId}/revisions", staffToken);
        Assert.Equal(HttpStatusCode.OK, routeHistory.StatusCode);
        var history = (await Body(routeHistory)).GetProperty("data").GetProperty("revisionHistory");
        var priorRevision = Assert.Single(history.EnumerateArray(), item => item.GetProperty("revisionId").GetGuid() == routeRevisionId);
        Assert.Equal("PASS", priorRevision.GetProperty("verificationStatus").GetString());

        // ADR-0034/0035: the tested revision can be scheduled on a free slot, and the reservation follows the PASS run.
        var slotDate = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime).AddDays(5);
        var slotPath = $"/api/staff/manage/tours/slots?routeRevisionId={routeRevisionId}&robotCode=flow_physical&from={slotDate:yyyy-MM-dd}&to={slotDate:yyyy-MM-dd}";
        using var slots = await Get(host.Client, slotPath, staffToken);
        Assert.Equal(HttpStatusCode.OK, slots.StatusCode);
        // docs/lich-tour-theo-ca.md §3: one item per configured shift, each holding the robot for the whole shift.
        var slotData = (await Body(slots)).GetProperty("data");
        Assert.Equal(3600, slotData.GetProperty("recommendedMaxSeconds").GetInt32());
        Assert.False(slotData.TryGetProperty("customStartEarliest", out _));
        Assert.Equal(["S1", "S2", "S3"], slotData.GetProperty("days")[0].GetProperty("slots").EnumerateArray().Select(slot => slot.GetProperty("shiftCode").GetString()));
        var firstSlot = slotData.GetProperty("days")[0].GetProperty("slots")[0];
        Assert.Equal("08:15", firstSlot.GetProperty("time").GetString());
        Assert.Equal("Ca sáng", firstSlot.GetProperty("shiftName").GetString());
        Assert.Equal(5400, firstSlot.GetProperty("maxDurationSeconds").GetInt32());
        Assert.Equal(firstSlot.GetProperty("startsAt").GetDateTimeOffset().AddMinutes(-15), firstSlot.GetProperty("reservationStartsAt").GetDateTimeOffset());
        Assert.Equal(firstSlot.GetProperty("startsAt").GetDateTimeOffset().AddMinutes(105), firstSlot.GetProperty("reservationEndsAt").GetDateTimeOffset());
        Assert.True(firstSlot.GetProperty("available").GetBoolean());
        using var shifts = await Get(host.Client, $"/api/staff/manage/tours/shifts?from={slotDate:yyyy-MM-dd}&to={slotDate.AddDays(6):yyyy-MM-dd}", staffToken);
        Assert.Equal(HttpStatusCode.OK, shifts.StatusCode);
        var shiftDays = (await Body(shifts)).GetProperty("data").GetProperty("days");
        Assert.Equal(7, shiftDays.GetArrayLength());
        Assert.Equal("13:15", shiftDays[0].GetProperty("shifts")[1].GetProperty("time").GetString());
        using var shiftsAsTechnical = await Get(host.Client, $"/api/staff/manage/tours/shifts?from={slotDate:yyyy-MM-dd}&to={slotDate:yyyy-MM-dd}", technicalToken);
        Assert.Equal(HttpStatusCode.Forbidden, shiftsAsTechnical.StatusCode);
        using var slotsTooWide = await Get(host.Client, $"/api/staff/manage/tours/slots?routeRevisionId={routeRevisionId}&robotCode=flow_physical&from={slotDate:yyyy-MM-dd}&to={slotDate.AddDays(31):yyyy-MM-dd}", staffToken);
        Assert.Equal(HttpStatusCode.BadRequest, slotsTooWide.StatusCode);
        using var operators = await Get(host.Client, "/api/staff/manage/tours/operators", staffToken);
        Assert.Equal(HttpStatusCode.OK, operators.StatusCode);
        var operatorId = (await Body(operators)).GetProperty("data")[0].GetProperty("userId").GetGuid();
        // A start that is not a shift's Tour start, such as the old 09:00 slot, is refused.
        using var offShift = await Json(host.Client, HttpMethod.Post, "/api/staff/manage/tours", staffToken,
            new { requestId = Guid.NewGuid(), configuration = new
                { name = "Off shift", description = (string?)null, routeRevisionId = routeRevisionId,
                    robotCode = "flow_physical", operatorUserId = operatorId,
                    capacity = 20, scheduledStartAt = firstSlot.GetProperty("startsAt").GetDateTimeOffset().AddMinutes(45),
                    fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.Conflict, offShift.StatusCode);
        Assert.Equal("TOUR_SLOT_NOT_ALLOWED", (await Body(offShift)).GetProperty("errors").GetProperty("code").GetString());
        using var schedule = await Json(host.Client, HttpMethod.Post, "/api/staff/manage/tours", staffToken,
            new { requestId = Guid.NewGuid(), configuration = new
                { name = "Scheduled from a tested revision", description = (string?)null, routeRevisionId = routeRevisionId,
                    robotCode = "flow_physical", operatorUserId = operatorId, capacity = 20,
                    scheduledStartAt = firstSlot.GetProperty("startsAt").GetDateTimeOffset(),
                    fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.OK, schedule.StatusCode);
        var tourId = (await Body(schedule)).GetProperty("data").GetProperty("id").GetGuid();
        using var tourDetail = await Get(host.Client, $"/api/staff/manage/tours/{tourId}", staffToken);
        var tourData = (await Body(tourDetail)).GetProperty("data");
        Assert.Equal(JsonValueKind.Null, tourData.GetProperty("route").ValueKind);
        Assert.Equal(routeRevisionId, tourData.GetProperty("routeRevision").GetProperty("revisionId").GetGuid());
        Assert.Equal("flow_physical", tourData.GetProperty("reservation").GetProperty("robotCode").GetString());
        Assert.Equal(1, await database.CountRowsAsync("dbo.TourRobotReservations"));

        // docs/lich-tour-theo-ca.md §5: only Admin closes a shift; a shift with a Tour cannot be closed, and Staff sees the reason.
        object BlockBody(string? shiftCode) => new { requestId = Guid.NewGuid(), date = slotDate.ToString("yyyy-MM-dd"), shiftCode, reason = "Bảo trì robot" };
        using (var asStaff = await Json(host.Client, HttpMethod.Post, "/api/admin/schedule-blocks", staffToken, BlockBody("S2")))
            Assert.Equal(HttpStatusCode.Forbidden, asStaff.StatusCode);
        using (var listAsStaff = await Get(host.Client, $"/api/admin/schedule-blocks?from={slotDate:yyyy-MM-dd}&to={slotDate:yyyy-MM-dd}", staffToken))
            Assert.Equal(HttpStatusCode.Forbidden, listAsStaff.StatusCode);
        using (var asTechnical = await Json(host.Client, HttpMethod.Post, "/api/admin/schedule-blocks", technicalToken, BlockBody("S2")))
            Assert.Equal(HttpStatusCode.Forbidden, asTechnical.StatusCode);
        using (var occupied = await Json(host.Client, HttpMethod.Post, "/api/admin/schedule-blocks", adminToken, BlockBody("S1")))
        {
            Assert.Equal(HttpStatusCode.Conflict, occupied.StatusCode);
            var errors = (await Body(occupied)).GetProperty("errors");
            Assert.Equal("SHIFT_HAS_TOURS", errors.GetProperty("code").GetString());
            Assert.Contains("Scheduled from a tested revision", errors.GetProperty("blockers")[0].GetProperty("message").GetString());
        }
        var yesterday = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime).AddDays(-1);
        using (var pastDay = await Json(host.Client, HttpMethod.Post, "/api/admin/schedule-blocks", adminToken,
            new { requestId = Guid.NewGuid(), date = yesterday.ToString("yyyy-MM-dd"), shiftCode = "S2", reason = "Bảo trì robot" }))
            Assert.Equal(HttpStatusCode.BadRequest, pastDay.StatusCode);
        using var closeShift = await Json(host.Client, HttpMethod.Post, "/api/admin/schedule-blocks", adminToken, BlockBody("S2"));
        Assert.Equal(HttpStatusCode.OK, closeShift.StatusCode);
        var closedId = (await Body(closeShift)).GetProperty("data").GetProperty("id").GetGuid();
        using (var staffCalendar = await Get(host.Client, $"/api/staff/manage/tours/shifts?from={slotDate:yyyy-MM-dd}&to={slotDate:yyyy-MM-dd}", staffToken))
        {
            var calendarShifts = (await Body(staffCalendar)).GetProperty("data").GetProperty("days")[0].GetProperty("shifts");
            Assert.Equal(JsonValueKind.Null, calendarShifts[0].GetProperty("block").ValueKind);
            Assert.Equal("Bảo trì robot", calendarShifts[1].GetProperty("block").GetProperty("reason").GetString());
        }
        using (var blockedSlots = await Get(host.Client, slotPath, staffToken))
            Assert.Equal("SHIFT_BLOCKED", (await Body(blockedSlots)).GetProperty("data").GetProperty("days")[0].GetProperty("slots")[1].GetProperty("reasonCode").GetString());
        using (var removeAsStaff = await Json(host.Client, HttpMethod.Post, $"/api/admin/schedule-blocks/{closedId}/remove", staffToken, new { requestId = Guid.NewGuid() }))
            Assert.Equal(HttpStatusCode.Forbidden, removeAsStaff.StatusCode);
        using (var reopen = await Json(host.Client, HttpMethod.Post, $"/api/admin/schedule-blocks/{closedId}/remove", adminToken, new { requestId = Guid.NewGuid() }))
            Assert.Equal(HttpStatusCode.OK, reopen.StatusCode);

        // ADR-0037: deactivating stops new Tours only, and leaves history and existing Tours alone.
        async Task<JsonElement> ListedRoute(string query)
        {
            using var list = await Get(host.Client, "/api/routes" + query, staffToken);
            Assert.Equal(HttpStatusCode.OK, list.StatusCode);
            return (await Body(list)).GetProperty("data");
        }
        async Task ExpectConflict(HttpResponseMessage refused, string code)
        {
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Equal(code, (await Body(refused)).GetProperty("errors").GetProperty("code").GetString());
        }
        var newTour = new { requestId = Guid.NewGuid(), configuration = new
            { name = "On a stopped route", description = (string?)null, routeRevisionId = routeRevisionId, robotCode = "flow_physical", operatorUserId = operatorId, capacity = 20,
                scheduledStartAt = firstSlot.GetProperty("startsAt").GetDateTimeOffset().AddDays(1), fallbackVideoUrl = (string?)null } };
        var routeVersion = Assert.Single((await ListedRoute("?isActive=true")).EnumerateArray()).GetProperty("rowVersion").GetString()!;
        Assert.Empty((await ListedRoute("?isActive=false")).EnumerateArray());
        var deactivate = new { requestId = Guid.NewGuid(), expectedRowVersion = routeVersion };
        using (var forbidden = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/deactivate", technicalToken, deactivate))
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        using (var forbiddenRead = await Get(host.Client, $"/api/staff/routes/{routeId}/scheduled-tours", technicalToken))
            Assert.Equal(HttpStatusCode.Forbidden, forbiddenRead.StatusCode);
        using (var anonymous = await host.Client.PostAsJsonAsync($"/api/staff/routes/{routeId}/activate", deactivate))
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        using (var preview = await Get(host.Client, $"/api/staff/routes/{routeId}/scheduled-tours", staffToken))
            Assert.Equal(tourId, Assert.Single((await Body(preview)).GetProperty("data").EnumerateArray()).GetProperty("id").GetGuid());
        var routeAudits = "dbo.AuditLogs WHERE [Action] IN ('ROUTE_DEACTIVATED','ROUTE_ACTIVATED')";
        var testRuns = await database.CountRowsAsync("dbo.RouteTestRuns");
        var revisions = await database.CountRowsAsync("dbo.RouteRevisions");
        using var deactivated = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/deactivate", staffToken, deactivate);
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        var availability = (await Body(deactivated)).GetProperty("data");
        Assert.False(availability.GetProperty("isActive").GetBoolean());
        Assert.Equal(tourId, Assert.Single(availability.GetProperty("scheduledTours").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(1, await database.CountRowsAsync($"{routeAudits} AND DataJson LIKE '%\"affectedTourCount\":1%' AND DataJson LIKE '%{routeId}%' AND CorrelationId = '{deactivate.requestId}'"));
        Assert.Equal((testRuns, revisions), (await database.CountRowsAsync("dbo.RouteTestRuns"), await database.CountRowsAsync("dbo.RouteRevisions")));

        Assert.Empty((await ListedRoute("?isActive=true")).EnumerateArray());
        Assert.Single((await ListedRoute("?isActive=false")).EnumerateArray());
        Assert.Single((await ListedRoute("")).EnumerateArray());
        using (var refusedSlots = await Get(host.Client, slotPath, staffToken)) await ExpectConflict(refusedSlots, "ROUTE_UNAVAILABLE");
        using (var refusedCreate = await Json(host.Client, HttpMethod.Post, "/api/staff/manage/tours", staffToken, newTour)) await ExpectConflict(refusedCreate, "ROUTE_UNAVAILABLE");
        using (var stillReadable = await Get(host.Client, $"/api/staff/manage/tours/{tourId}", staffToken))
        {
            var readable = (await Body(stillReadable)).GetProperty("data");
            Assert.Equal("SCHEDULED", readable.GetProperty("tour").GetProperty("state").GetString());
            Assert.Equal(routeRevisionId, readable.GetProperty("routeRevision").GetProperty("revisionId").GetGuid());
        }
        using (var stoppedHistory = await Get(host.Client, $"/api/routes/{routeId}/revisions?revisionId={routeRevisionId}", staffToken))
        {
            var stopped = (await Body(stoppedHistory)).GetProperty("data");
            Assert.Equal("PASS", stopped.GetProperty("verificationStatus").GetString());
            Assert.False(stopped.GetProperty("isActive").GetBoolean());
        }

        using (var replay = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/deactivate", staffToken, deactivate))
            Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(1, await database.CountRowsAsync(routeAudits));
        using (var reused = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/activate", staffToken, deactivate)) await ExpectConflict(reused, "IDEMPOTENCY_CONFLICT");
        using (var stale = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/activate", staffToken, new { requestId = Guid.NewGuid(), expectedRowVersion = routeVersion }))
            await ExpectConflict(stale, "STALE_ROUTE");
        Assert.Equal(1, await database.CountRowsAsync(routeAudits));

        var currentVersion = Assert.Single((await ListedRoute("?isActive=false")).EnumerateArray()).GetProperty("rowVersion").GetString();
        using (var activated = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/activate", staffToken, new { requestId = Guid.NewGuid(), expectedRowVersion = currentVersion }))
        {
            Assert.Equal(HttpStatusCode.OK, activated.StatusCode);
            Assert.True((await Body(activated)).GetProperty("data").GetProperty("isActive").GetBoolean());
        }
        Assert.Equal(1, await database.CountRowsAsync("dbo.AuditLogs WHERE [Action] = 'ROUTE_ACTIVATED'"));
        using (var reopened = await Get(host.Client, slotPath, staffToken)) Assert.Equal(HttpStatusCode.OK, reopened.StatusCode);

        // A row from before ADR-0037 was stored inactive though nobody turned it off: it stays open.
        await database.ExecuteAsync($"UPDATE dbo.Routes SET IsActive = 0, UpdatedAt = NULL WHERE Id = '{routeId}';");
        Assert.Single((await ListedRoute("?isActive=true")).EnumerateArray());
        using (var untouched = await Get(host.Client, slotPath, staffToken)) Assert.Equal(HttpStatusCode.OK, untouched.StatusCode);
    }

    [SchemaV14Fact]
    public async Task AddingPendingRosterRow_PreservesAcceptedRowsInvitationAndViewerSession()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(
            fixture.Database.ConnectionString, InvitationSettings());
        var representative = await LoginAsync(host.Client, "rep.one");
        var staff = await LoginAsync(host.Client, "review.staff");
        fixture.Bind(host.Client, representative);

        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var submitted = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations",
            Input(tour, "Stable accepted row", "accepted@example.test"), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, submitted.Status);
        var registrationId = submitted.Data.GetProperty("id").GetGuid();

        var detail = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/staff/manage/registrations/{registrationId}", token: staff)).Data;
        var acceptedRow = detail.GetProperty("roster")[0];
        var acceptedRowId = acceptedRow.GetProperty("id").GetGuid();
        var accepted = await fixture.SendAsync(HttpMethod.Post,
            $"/api/staff/manage/registrations/{registrationId}/rows/{acceptedRowId}/accept", new
            {
                requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(detail),
                expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
                expectedRowVersion = Version(acceptedRow)
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, accepted.Status);

        var invitations = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/registrations/{registrationId}/invitations")).Data;
        var invitationId = Assert.Single(invitations.GetProperty("items").EnumerateArray())
            .GetProperty("id").GetGuid();
        var code = await CodeAsync(fixture, invitationId);
        var joined = await StudentAccess(host.Client, fixture.TourId, "join", code);
        Assert.Equal(HttpStatusCode.OK, joined.Status);
        var cookie = CookieHeader(joined.Cookie!);
        Assert.Equal(HttpStatusCode.OK,
            (await StudentAccess(host.Client, fixture.TourId, "session", cookie: cookie)).Status);

        var ownerDetails = await fixture.DataAsync($"/registrations/{registrationId}");
        var update = await fixture.SendAsync(HttpMethod.Put, $"/registrations/{registrationId}", new
        {
            input = Input(tour, "Stable accepted row", "accepted@example.test", mixed: true, rowIds: [acceptedRowId]),
            expectedRowVersion = Version(ownerDetails)
        });
        Assert.True(update.Status == HttpStatusCode.OK, update.Body.GetRawText());

        var after = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/staff/manage/registrations/{registrationId}", token: staff)).Data;
        var rows = after.GetProperty("roster").EnumerateArray().ToArray();
        Assert.Equal("ACCEPTED", rows.Single(row => row.GetProperty("id").GetGuid() == acceptedRowId)
            .GetProperty("participationState").GetString());
        Assert.Equal("PENDING", Assert.Single(rows, row => row.GetProperty("id").GetGuid() != acceptedRowId)
            .GetProperty("participationState").GetString());
        Assert.Equal("APPROVED", after.GetProperty("summary").GetProperty("state").GetString());
        var pendingQueue = await fixture.SendAsync(HttpMethod.Get,
            "/api/staff/manage/registrations?state=SUBMITTED", token: staff);
        Assert.Contains(pendingQueue.Data.EnumerateArray(), item => item.GetProperty("id").GetGuid() == registrationId);
        var invitationsAfter = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/registrations/{registrationId}/invitations")).Data.GetProperty("items");
        var invitation = Assert.Single(invitationsAfter.EnumerateArray());
        Assert.Equal(invitationId, invitation.GetProperty("id").GetGuid());
        Assert.Equal(JsonValueKind.Null, invitation.GetProperty("revokedAt").ValueKind);
        Assert.Equal(HttpStatusCode.OK,
            (await StudentAccess(host.Client, fixture.TourId, "session", cookie: cookie)).Status);
    }

    private static async Task<Guid> CreateAccount(HttpClient client, string adminToken, string username, string role)
    {
        using var response = await Json(client, HttpMethod.Post, "/api/admin/accounts", adminToken,
            new { username, fullName = username, role, initialPassword = Password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = (await Body(response)).GetProperty("data");
        Assert.Equal(role, data.GetProperty("role").GetString());
        return data.GetProperty("id").GetGuid();
    }

    private static async Task<string> Login(HttpClient client, string username)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = Password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await Body(response)).GetProperty("accessToken").GetString()!;
    }

    private static async Task<HttpResponseMessage> UploadMap(HttpClient client, string token, string areaKey,
        string areaName, Guid requestId, byte[] package)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(areaKey), "areaKey");
        content.Add(new StringContent(areaName), "areaName");
        content.Add(new StringContent(requestId.ToString()), "requestId");
        var packageContent = new ByteArrayContent(package);
        packageContent.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        content.Add(packageContent, "package", "catalog-map.zip");
        return await Send(client, HttpMethod.Post, "/api/technical/map-versions", token, content);
    }

    private static async Task<HttpResponseMessage> Json(HttpClient client, HttpMethod method, string path, string token, object body)
    {
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string token, HttpContent content)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Get(HttpClient client, string path, string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client.SendAsync(request);
    }

    private static IReadOnlyDictionary<string, string> InvitationSettings() =>
        InvitationPrimitiveTests.ConfigurationValues()
            .ToDictionary(pair => pair.Key.Replace(":", "__"), pair => pair.Value);

    private static async Task<string> CodeAsync(Fixture fixture, Guid invitationId)
    {
        await using var db = fixture.Context();
        var invitation = await db.Invitations.SingleAsync(item => item.Id == invitationId);
        return new InvitationCodeService(InvitationPrimitiveTests.Configuration())
            .Reveal(invitation.Id, invitation.AccessVersion, invitation.AccessCodeProtected);
    }

    private static async Task<(HttpStatusCode Status, string? Cookie)> StudentAccess(
        HttpClient client, Guid tourId, string action, string? code = null, string? cookie = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{tourId}/{action}");
        if (code is not null) request.Content = JsonContent.Create(new { accessCode = code });
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        using var response = await client.SendAsync(request);
        var setCookie = response.Headers.TryGetValues("Set-Cookie", out var cookies)
            ? string.Join("\n", cookies)
            : null;
        return (response.StatusCode, setCookie);
    }

    private static string CookieHeader(string setCookie) => string.Join("; ",
        setCookie.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(cookie => cookie.Split(';')[0]));

    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }

    private static byte[] CreateMapPackage(string marker = "pilot map")
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var yaml = archive.CreateEntry("pilot.yaml");
            using (var yamlStream = yaml.Open())
                yamlStream.Write(Encoding.UTF8.GetBytes($"# {marker}\nimage: pilot.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n"));
            var pgm = archive.CreateEntry("pilot.pgm");
            using var output = pgm.Open();
            output.Write(Encoding.ASCII.GetBytes("P2\n2 2\n255\n255 255 255 255\n"));
        }
        return stream.ToArray();
    }
}
