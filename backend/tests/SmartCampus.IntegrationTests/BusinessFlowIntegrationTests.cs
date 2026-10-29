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

    [SchemaV15Fact]
    public async Task PhysicalRobotCredentialIssueAndRotation_AreTechnicalOnlyOneShotAndAtomic()
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
        using var status = await Get(host.Client, "/api/technical/physical-robots", technical);
        var statusItem = Assert.Single((await Body(status)).GetProperty("data").EnumerateArray());
        Assert.False(statusItem.GetProperty("credentialProvisioned").GetBoolean());
        Assert.False(statusItem.GetProperty("mapContextConfigured").GetBoolean());
        var initialVersion = statusItem.GetProperty("rowVersion").GetString()!;

        using var missing = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/physical-robots/{Guid.NewGuid():D}/credential", technical,
            new { expectedRowVersion = initialVersion });
        using var nonPhysical = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/physical-robots/{emulatorId:D}/credential", technical,
            new { expectedRowVersion = initialVersion });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, nonPhysical.StatusCode);

        using var staffDenied = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/physical-robots/{robotId}/credential", staff,
            new { expectedRowVersion = initialVersion });
        Assert.Equal(HttpStatusCode.Forbidden, staffDenied.StatusCode);

        var issueRequests = await Task.WhenAll(
            Json(host.Client, HttpMethod.Post, $"/api/technical/physical-robots/{robotId}/credential", technical,
                new { expectedRowVersion = initialVersion }),
            Json(host.Client, HttpMethod.Post, $"/api/technical/physical-robots/{robotId}/credential", technical,
                new { expectedRowVersion = initialVersion }));
        var issue = Assert.Single(issueRequests, response => response.IsSuccessStatusCode);
        var concurrentConflict = Assert.Single(issueRequests, response => response.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);
        Assert.Equal("no-store", issue.Headers.CacheControl?.ToString());
        Assert.Contains("ROBOT_CREDENTIAL_ALREADY_PROVISIONED", await concurrentConflict.Content.ReadAsStringAsync());
        var first = (await Body(issue)).GetProperty("data");
        var firstCredential = first.GetProperty("credential").GetString()!;
        Assert.True(FleetRobotCredentialHash.IsValidFormat(firstCredential));
        Assert.False((await issue.Content.ReadAsStringAsync()).Contains("credentialHash", StringComparison.OrdinalIgnoreCase));

        using var duplicateIssue = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/physical-robots/{robotId}/credential", technical,
            new { expectedRowVersion = initialVersion });
        Assert.Equal(HttpStatusCode.Conflict, duplicateIssue.StatusCode);
        Assert.Contains("ROBOT_CREDENTIAL_ALREADY_PROVISIONED", await duplicateIssue.Content.ReadAsStringAsync());
        issue.Dispose();
        concurrentConflict.Dispose();

        await database.ExecuteAsync($"UPDATE dbo.Robots SET FirstAcceptedSyncAt=SYSDATETIMEOFFSET(), FirstAcceptedMapKey=N'old-map', FirstAcceptedFrameId=N'map' WHERE Id='{robotId:D}';");
        using var beforeRotate = await Get(host.Client, "/api/technical/physical-robots", technical);
        var rotateVersion = Assert.Single((await Body(beforeRotate)).GetProperty("data").EnumerateArray())
            .GetProperty("rowVersion").GetString()!;
        using var rotate = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/physical-robots/{robotId}/credential/rotate", technical,
            new { expectedRowVersion = rotateVersion });
        Assert.Equal(HttpStatusCode.OK, rotate.StatusCode);
        var rotatedCredential = (await Body(rotate)).GetProperty("data").GetProperty("credential").GetString()!;
        Assert.NotEqual(firstCredential, rotatedCredential);

        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(database.ConnectionString).Options);
        var robot = await db.Robots.SingleAsync(item => item.Id == robotId);
        Assert.True(FleetRobotCredentialHash.Verify(rotatedCredential, robot.CredentialHash));
        Assert.False(FleetRobotCredentialHash.Verify(firstCredential, robot.CredentialHash));
        var authenticator = new FleetRobotAuthenticator(db);
        Assert.Null(await authenticator.AuthenticateAsync(robot.RobotCode, firstCredential, CancellationToken.None));
        Assert.NotNull(await authenticator.AuthenticateAsync(robot.RobotCode, rotatedCredential, CancellationToken.None));
        Assert.Null(robot.FirstAcceptedSyncAt);
        Assert.Null(robot.FirstAcceptedMapKey);
        Assert.Null(robot.FirstAcceptedFrameId);
        Assert.False(robot.IsDispatchEnabled);
        Assert.Null(robot.CurrentTourId);
        var credentialAudits = await db.AuditLogs.Where(row => row.RobotId == robotId &&
            row.Action.Contains("CREDENTIAL")).OrderBy(row => row.Action).ToListAsync();
        Assert.Equal(2, credentialAudits.Count);
        Assert.All(credentialAudits, row => Assert.Null(row.DataJson));
        Assert.DoesNotContain(credentialAudits, row => row.EntityId.Contains(firstCredential, StringComparison.Ordinal) ||
            row.EntityId.Contains(rotatedCredential, StringComparison.Ordinal));

        using var staleRotate = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/physical-robots/{robotId}/credential/rotate", technical,
            new { expectedRowVersion = rotateVersion });
        Assert.Equal(HttpStatusCode.Conflict, staleRotate.StatusCode);
        Assert.Contains("ROBOT_CONCURRENCY_CONFLICT", await staleRotate.Content.ReadAsStringAsync());
    }

    [SchemaV15Fact]
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
                IF EXISTS (SELECT 1 FROM inserted WHERE Action=N'PHYSICAL_ROBOT_CREDENTIAL_ISSUED')
                    THROW 52001, 'Injected credential audit failure.', 1;
            END;
            """);
        try
        {
            using var failed = await Json(host.Client, HttpMethod.Post,
                $"/api/technical/physical-robots/{robotId}/credential", technical,
                new { expectedRowVersion = rowVersion });
            Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
            await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(database.ConnectionString).Options);
            var robot = await db.Robots.SingleAsync(item => item.Id == robotId);
            Assert.Empty(robot.CredentialHash);
            Assert.Null(robot.FirstAcceptedSyncAt);
            Assert.Empty(await db.AuditLogs.Where(row => row.RobotId == robotId &&
                row.Action == "PHYSICAL_ROBOT_CREDENTIAL_ISSUED").ToListAsync());
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
            Assert.Empty(robot.CredentialHash);
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

        using var nextUpload = await UploadMap(host.Client, technical, "catalog-main", "Catalog Main", Guid.NewGuid(), package);
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
        Assert.Equal(new[] { "connectionStatus", "displayName", "firstAcceptedFrameId", "firstAcceptedMapKey", "firstAcceptedSyncAt", "id", "lastSyncReceivedAt", "robotCode" }, listedRobot.EnumerateObject().Select(property => property.Name).Order().ToArray());

        var mapSha = first.GetProperty("packageSha256").GetString();
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
                description = (string?)null, x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" } });
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

        var createRequestId = Guid.NewGuid();
        var createBody = new { requestId = createRequestId, draft = new { mapVersionId = mapId, name = "Library", purpose = "Entry",
            description = (string?)null, x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" } };
        using var created = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff, createBody);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var proposal = (await Body(created)).GetProperty("data");
        var proposalId = proposal.GetProperty("id").GetGuid();
        using var createRetry = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staff, createBody);
        Assert.Equal(HttpStatusCode.OK, createRetry.StatusCode);
        Assert.Equal(proposalId, (await Body(createRetry)).GetProperty("data").GetProperty("id").GetGuid());

        var revisionRequestId = Guid.NewGuid();
        var revisedDraft = new { mapVersionId = mapId, name = "Library revised", purpose = "Entry", description = (string?)null,
            x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" };
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
            description = (string?)null, x = 1.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" } };
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
                    x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" } });
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
    public async Task VersionedMapPoiRouteChain_RecordsSimulatedEvidence_AndStopsAtSchedulingDependency()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "flow.admin", roles: ["ADMIN"]);
        var robotId = Guid.NewGuid();
        var robotCredential = FleetRobotCredentialHash.Create();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id, RobotCode, SourceType, CredentialHash, IsDispatchEnabled, NeedsInspection, CreatedAt)
            VALUES ('{robotId:D}', N'flow_physical', 'PHYSICAL', 0x{Convert.ToHexString(robotCredential.Hash)}, 0, 1, SYSDATETIMEOFFSET());
            """);
        var syncSettings = new Dictionary<string, string>
        {
            ["FleetSync:RobotContexts:flow_physical:MapKey"] = "flow-area-v1",
            ["FleetSync:RobotContexts:flow_physical:FrameId"] = "map"
        };
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString, syncSettings);

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
                description = "Should remain unpersisted", x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" } });
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
                description = "Integration test", x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" } });
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

        var routeDraft = new { requestId = Guid.NewGuid(), expectedCurrentRevision = 0, name = "Flow Route",
            description = "API integration test", mapVersionId = mapId, startX = 0.5m, startY = 0.5m, startYaw = 0m,
            endMode = "LAST_POI", endX = (decimal?)null, endY = (decimal?)null, endYaw = (decimal?)null,
            stops = new[] { new { poiRevisionId, dwellSeconds = 10, headSteps = new[] { new { preset = "FRONT", holdSeconds = 5 } } } } };
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

        // Scheduling has no integration from versioned route/revision to the legacy Tour model.
        // Confirm the legacy aliases fail closed and don't persist a Tour or reservation.
        var beforeTours = await database.CountRowsAsync("dbo.Tours");
        var beforeEvents = await database.CountRowsAsync("dbo.TourEvents");
        using var schedule = await Json(host.Client, HttpMethod.Post, "/api/staff/manage/tours", staffToken,
            new { requestId = Guid.NewGuid(), expectedRouteVersion = new string('0', 64), configuration = new
                { name = "Must not schedule", description = (string?)null, routeId,
                    scheduledStartAt = DateTimeOffset.FromUnixTimeMilliseconds(DateTimeOffset.UtcNow.AddDays(2).ToUnixTimeMilliseconds()),
                    fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.NotFound, schedule.StatusCode);
        Assert.Equal(beforeTours, await database.CountRowsAsync("dbo.Tours"));
        Assert.Equal(beforeEvents, await database.CountRowsAsync("dbo.TourEvents"));
        // The current schema has no reservation/booking entity or table.
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

    private static byte[] CreateMapPackage()
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var yaml = archive.CreateEntry("pilot.yaml");
            using (var yamlStream = yaml.Open())
                yamlStream.Write(Encoding.UTF8.GetBytes("image: pilot.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n"));
            var pgm = archive.CreateEntry("pilot.pgm");
            using var output = pgm.Open();
            output.Write(Encoding.ASCII.GetBytes("P2\n2 2\n255\n255 255 255 255\n"));
        }
        return stream.ToArray();
    }
}
