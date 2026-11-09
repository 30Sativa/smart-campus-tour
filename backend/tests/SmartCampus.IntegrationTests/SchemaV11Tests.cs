using System.Text.RegularExpressions;
using System.IO.Compression;
using System.Text;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MediatR;
using Microsoft.Data.SqlClient;
using SmartCampus.Application;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Repositories;
using SmartCampus.Infrastructure.Integrations.FleetSync;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Domain.Entities;
using Xunit.Abstractions;
using Xunit.Sdk;

namespace SmartCampus.IntegrationTests;

// Opt-in real SQL Server tests. Each test owns a new database; no existing DB is modified.
[TraitDiscoverer("SmartCampus.IntegrationTests.SqlIntegrationTraitDiscoverer", "SmartCampus.IntegrationTests")]
public sealed class SchemaV11FactAttribute : FactAttribute, ITraitAttribute
{
    public SchemaV11FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }

}

public sealed class SchemaV12FactAttribute : FactAttribute, ITraitAttribute
{
    public SchemaV12FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }
}

public sealed class SchemaV13FactAttribute : FactAttribute, ITraitAttribute
{
    public SchemaV13FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }
}

public sealed class SchemaV14FactAttribute : FactAttribute, ITraitAttribute
{
    public SchemaV14FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }
}

public sealed class SchemaV15FactAttribute : FactAttribute, ITraitAttribute
{
    public SchemaV15FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }
}

public sealed class SchemaV16FactAttribute : FactAttribute, ITraitAttribute
{
    public SchemaV16FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }
}

public sealed class SchemaV17FactAttribute : FactAttribute, ITraitAttribute
{
    public SchemaV17FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }
}

public sealed class SqlIntegrationTraitDiscoverer : ITraitDiscoverer
{
    public IEnumerable<KeyValuePair<string, string>> GetTraits(IAttributeInfo traitAttribute)
    {
        yield return new KeyValuePair<string, string>("Category", "SqlIntegration");
    }
}

public sealed class SchemaV11Tests
{
    private static string Id(int value) => $"00000000-0000-0000-0000-{value:D12}";
    private const string RouteAdminPassword = "route-test-admin-password";
    private const string RouteAccountPassword = "route-test-account-password";

    private static async Task<string> ApiLoginAsync(HttpClient client, string username, string password)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("accessToken").GetString()!;
    }

    private static async Task<Guid> CreateAccountViaApiAsync(HttpClient client, string adminToken,
        string username, string role)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/admin/accounts")
        {
            Content = JsonContent.Create(new { username, fullName = username, role, initialPassword = RouteAccountPassword })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("data").GetProperty("id").GetGuid();
    }

    [SchemaV13Fact]
    public async Task V13Snapshot_PreservesLegacyRoutesAndCreatesAppendOnlyRevisionSchema()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.3.sql");
        Assert.Equal(4, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name IN ('RouteRevisions','RouteRevisionStops','RouteRevisionSubmissions','RouteTestRuns');"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.Routes WHERE AuthoringMode='LEGACY';"));
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.RouteRevisions;"));
        await db.ExecuteAsync($"INSERT dbo.Routes(Id,Name,MapKey,MapFrame,StartX,StartY,StartYaw,EndMode,IsActive,CreatedAt) VALUES('{Id(99)}',N'Legacy',N'm',N'map',0,0,0,'LAST_POI',0,SYSDATETIMEOFFSET());");
        Assert.Equal("LEGACY", await db.ScalarAsync<string>($"SELECT AuthoringMode FROM dbo.Routes WHERE Id='{Id(99)}';"));
        Assert.Equal(4, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.foreign_keys WHERE name IN ('FK_RouteRevisionStops_PoiMapFingerprint','FK_RouteRevisionStops_SourceEvidence','FK_RouteTestRuns_ExactRevision','FK_RouteTestRuns_Deployment');"));
    }

    [SchemaV13Fact]
    public async Task V12ToV13Patch_IsAdditiveAndIdempotent()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.2.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68';");
        await db.ApplyFileAsync("upgrade-v1.2-to-v1.3-route-revisions.sql");
        await db.ApplyFileAsync("upgrade-v1.2-to-v1.3-route-revisions.sql");
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.Routes WHERE AuthoringMode='LEGACY';"));
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.RouteRevisions;"));
        Assert.Equal(4, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name IN ('RouteRevisions','RouteRevisionStops','RouteRevisionSubmissions','RouteTestRuns');"));
    }

    [SchemaV14Fact]
    public async Task V13ToV14Patch_IsAdditiveIdempotentAndBackfillsRowDecisions()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.3.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68';");
        await db.ApplyFileAsync("upgrade-v1.3-to-v1.4-row-registration.sql");
        await db.ApplyFileAsync("upgrade-v1.3-to-v1.4-row-registration.sql");
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.RosterRows WHERE ParticipationState='ACCEPTED';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name='RosterEmailChangeRequests';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.BrowserSessions') AND name='DeviceTokenHash';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.check_constraints WHERE name='CK_RosterRows_ParticipationState';"));
    }

    [SchemaV15Fact]
    public async Task V14ToV15Patch_IsAdditiveIdempotentAndPreservesDataAndBootstrapHash()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.4.sql");
        const string originalHash = "b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43";
        await db.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{originalHash}'; EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.4';");
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES('{Id(120)}',N'confirm-migration','PHYSICAL',0x0102,0,0,SYSDATETIMEOFFSET());");

        await db.ApplyFileAsync("upgrade-v1.4-to-v1.5-robot-connection-confirmation.sql");
        await db.ApplyFileAsync("upgrade-v1.4-to-v1.5-robot-connection-confirmation.sql");

        Assert.Equal("1.5", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(originalHash, await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';"));
        Assert.Equal("confirm-migration", await db.ScalarAsync<string>($"SELECT RobotCode FROM dbo.Robots WHERE Id='{Id(120)}';"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name IN ('FirstAcceptedSyncAt','FirstAcceptedMapKey','FirstAcceptedFrameId');"));
        await db.ExpectErrorAsync(547, $"UPDATE dbo.Robots SET FirstAcceptedSyncAt=SYSDATETIMEOFFSET() WHERE Id='{Id(120)}';");
    }

    [SchemaV14Fact]
    public async Task PendingDecisionPredicate_CoversRowAndEmailRequestsButNotResolvedHistory()
    {
        await using var db = await TestDatabase.CreateAsync();
        await using var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(db.ConnectionString).Options);
        var repository = new EfRegistrationRepository(context);
        Assert.False(await repository.HasPendingDecisionsAsync(Guid.Parse(Id(41)), default));
        await db.ExecuteAsync($"""
            INSERT dbo.RosterRows(Id,RegistrationId,RowNumber,RowType,DisplayName,Email,IsActive,CreatedAt)
            VALUES('{Id(99)}','{Id(44)}',2,'SHARED_VIEWING',N'Room',N'room99@example.invalid',1,SYSDATETIMEOFFSET());
            """);
        Assert.True(await repository.HasPendingDecisionsAsync(Guid.Parse(Id(41)), default));
        await db.ExecuteAsync($"UPDATE dbo.RosterRows SET ParticipationState='REJECTED' WHERE Id='{Id(99)}';");
        Assert.False(await repository.HasPendingDecisionsAsync(Guid.Parse(Id(41)), default));
        await db.ExecuteAsync($"""
            INSERT dbo.RosterEmailChangeRequests(Id,RosterRowId,RequestId,CurrentEmail,ProposedEmail,RequestedByUserId,State,CreatedAt)
            VALUES('{Id(98)}','{Id(61)}','{Id(97)}',N'student1@example.invalid',N'new@example.invalid','{Id(1)}','PENDING',SYSDATETIMEOFFSET());
            """);
        Assert.True(await repository.HasPendingDecisionsAsync(Guid.Parse(Id(41)), default));
        await db.ExecuteAsync($"UPDATE dbo.RosterEmailChangeRequests SET State='REJECTED', ReviewedAt=SYSDATETIMEOFFSET(), ReviewedByUserId='{Id(2)}' WHERE Id='{Id(98)}';");
        Assert.False(await repository.HasPendingDecisionsAsync(Guid.Parse(Id(41)), default));
    }
    [SchemaV17Fact]
    public async Task V17ToV18RobotMapAssignmentPatch_IsIdempotentAndPreservesRobotCredentialAndConfirmation()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.7.sql");
        const string originalHash = "b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43";
        await db.ExecuteAsync($"""
            EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{originalHash}';
            EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.7';
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,
                FirstAcceptedSyncAt,FirstAcceptedMapKey,FirstAcceptedFrameId,CreatedAt)
            VALUES('{Id(850)}',N'map-context-preservation','PHYSICAL',0x0123456789ABCDEF,0,0,
                '2026-10-29T10:00:00+00:00',N'old-map-v1',N'map',SYSDATETIMEOFFSET());
            """);

        await db.ApplyFileAsync("upgrade-v1.7-to-v1.8-robot-map-assignment.sql");
        await db.ApplyFileAsync("upgrade-v1.7-to-v1.8-robot-map-assignment.sql");

        Assert.Equal("1.8", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(originalHash, await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';"));
        Assert.Equal("0123456789ABCDEF", await db.ScalarAsync<string>($"SELECT CONVERT(varchar(64),CredentialHash,2) FROM dbo.Robots WHERE Id='{Id(850)}';"));
        Assert.Equal("old-map-v1|map", await db.ScalarAsync<string>($"SELECT CONCAT(FirstAcceptedMapKey,N'|',FirstAcceptedFrameId) FROM dbo.Robots WHERE Id='{Id(850)}';"));
        Assert.Equal(1, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.Robots WHERE Id='{Id(850)}' AND AssignedMapVersionId IS NULL AND MapAssignedAt IS NULL AND MapAssignedByUserId IS NULL;"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_MapAssignment_Complete' AND is_disabled=0 AND is_not_trusted=0;"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_AssignedMapVersionId' AND is_disabled=0 AND is_not_trusted=0;"));
    }
    [SchemaV16Fact]
    public async Task LatestPhysicalRobotDeploymentChecks_AreAcrossMapsAndExcludeEmulators()
    {
        await using var db = await TestDatabase.CreateAsync();
        const string shaA = "0x1111111111111111111111111111111111111111111111111111111111111111";
        const string shaB = "0x2222222222222222222222222222222222222222222222222222222222222222";
        await db.ExecuteAsync($"""
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
            VALUES('{Id(501)}',N'amr-a','PHYSICAL',NULL,0,0,SYSDATETIMEOFFSET()),
                  ('{Id(502)}',N'amr-b','PHYSICAL',NULL,0,0,SYSDATETIMEOFFSET());
            INSERT dbo.MapAreas(AreaKey,DisplayName,CreatedByUserId,CreatedAt)
            VALUES(N'area',N'Area','{Id(1)}',SYSDATETIMEOFFSET());
            INSERT dbo.MapVersions(Id,AreaKey,VersionNumber,MapKey,PackageFileName,PackageSha256,RequestHash,PackageBytes,
                ImageFileName,ImageWidth,ImageHeight,Resolution,OriginX,OriginY,OriginYaw,Negate,OccupiedThreshold,FreeThreshold,
                FrameId,ValidationStatus,UploadedByUserId,UploadRequestId,UploadedAt)
            VALUES('{Id(601)}',N'area',1,N'area-v1',N'v1.zip',{shaA},{shaA},0x01,N'map.pgm',1,1,0.05,0,0,0,0,0.65,0.25,N'map','VALID','{Id(1)}','{Id(701)}',SYSDATETIMEOFFSET()),
                  ('{Id(602)}',N'area',2,N'area-v2',N'v2.zip',{shaB},{shaB},0x02,N'map.pgm',1,1,0.05,0,0,0,0,0.65,0.25,N'map','VALID','{Id(1)}','{Id(702)}',SYSDATETIMEOFFSET());
            INSERT dbo.MapDeploymentChecks(Id,MapVersionId,RobotId,PackageSha256,LocalizationPassed,DisplayPassed,EvidenceNote,
                CheckedByUserId,RequestId,RequestHash,CheckedAt)
            VALUES('{Id(801)}','{Id(601)}','{Id(501)}',{shaA},1,1,N'earlier pass','{Id(1)}','{Id(811)}',{shaA},'2026-10-29T09:00:00+00:00'),
                  ('{Id(802)}','{Id(602)}','{Id(501)}',{shaB},0,1,N'latest fail','{Id(1)}','{Id(812)}',{shaB},'2026-10-29T10:00:00+00:00'),
                  ('{Id(803)}','{Id(602)}','{Id(502)}',{shaB},1,1,N'robot b pass','{Id(1)}','{Id(813)}',{shaB},'2026-10-29T10:00:00+00:00'),
                  ('{Id(804)}','{Id(601)}','{Id(81)}',{shaA},1,1,N'emulator pass','{Id(1)}','{Id(814)}',{shaA},'2026-10-29T11:00:00+00:00');
            """);

        await using var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(db.ConnectionString).Options);
        var repository = new EfVersionedMapPoiRepository(context);
        var latest = await repository.ListLatestDeploymentChecksForPhysicalRobotsAsync(default);

        Assert.Equal(2, latest.Count);
        Assert.Equal(Id(802), latest.Single(check => check.Robot.RobotCode == "amr-a").Id.ToString("D"));
        Assert.Equal("area-v2", latest.Single(check => check.Robot.RobotCode == "amr-a").MapVersion.MapKey);
        Assert.Equal("amr-b", latest.Single(check => check.Robot.RobotCode == "amr-b").Robot.RobotCode);
        Assert.DoesNotContain(latest, check => check.Robot.SourceType != "PHYSICAL");
        Assert.Empty(MapCurrentlyDeployedOn.ForMap(new MapVersion { Id = Guid.Parse(Id(601)), PackageSha256 = Convert.FromHexString(shaA[2..]) }, latest));
        Assert.Equal("amr-b", Assert.Single(MapCurrentlyDeployedOn.ForMap(
            new MapVersion { Id = Guid.Parse(Id(602)), PackageSha256 = Convert.FromHexString(shaB[2..]) }, latest)).RobotCode);
    }

    [SchemaV16Fact]

    public async Task FixedRouteLifecycle_FailThenNewRevisionPass_KeepsEveryVersionAndRun()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,FirstAcceptedSyncAt,FirstAcceptedMapKey,FirstAcceptedFrameId,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,0,0,SYSDATETIMEOFFSET(),N'pilot-v1',N'map',SYSDATETIMEOFFSET()); INSERT dbo.UserRoles(UserId,Role) VALUES('{Id(1)}',N'TechnicalStaff'),('{Id(2)}',N'Staff');");
        var passwordHash = new IdentityPasswordHasher().Hash(RouteAdminPassword);
        await db.ExecuteAsync($"INSERT dbo.Users(Id,Username,NormalizedUsername,PasswordHash,FullName,IsActive,CreatedAt) VALUES('{Id(3)}',N'route.admin',N'ROUTE.ADMIN',N'{passwordHash}',N'Route Test Admin',1,SYSDATETIMEOFFSET()); INSERT dbo.UserRoles(UserId,Role) VALUES('{Id(3)}',N'ADMIN');");
        await using var api = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(db.ConnectionString);
        var adminToken = await ApiLoginAsync(api.Client, "route.admin", RouteAdminPassword);
        var participatingStaffId = await CreateAccountViaApiAsync(api.Client, adminToken, "route.participant", "Staff");
        var technicalStaffId = await CreateAccountViaApiAsync(api.Client, adminToken, "route.technical", "TechnicalStaff");
        var lockedStaffId = await CreateAccountViaApiAsync(api.Client, adminToken, "route.locked", "Staff");
        var representativeId = await CreateAccountViaApiAsync(api.Client, adminToken, "route.representative", "Representative");
        var multiRoleStaffId = await CreateAccountViaApiAsync(api.Client, adminToken, "route.multi", "Staff");
        using (var deactivate = new HttpRequestMessage(HttpMethod.Post, $"/api/admin/accounts/{lockedStaffId:D}/deactivate"))
        {
            deactivate.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
            using var response = await api.Client.SendAsync(deactivate);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        await db.ExecuteAsync($"INSERT dbo.UserRoles(UserId,Role) VALUES('{multiRoleStaffId:D}',N'SCHOOL_REPRESENTATIVE');");
        await using var services = db.BuildFeatureServiceProvider();
        await using var scope = services.CreateAsyncScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();
        var map = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), CreateMapPackage("-2, -2, 0"))));
        await sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), map.Id,
            new(Guid.NewGuid(), "physical_1", map.PackageSha256, true, true, "Manual localization and display check.")));
        var proposal = await sender.Send(new CreatePoiProposalCommand(Guid.Parse(Id(2)),
            new(Guid.NewGuid(), new(map.Id, "Library", "Entrance", null, -1.5m, -1.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion)));
        await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 1,
            new(Guid.NewGuid(), 1, proposal.RowVersion, "physical_1", "PASS", true, true, true, true, null, "Manual POI PASS.")));
        var verifiedPoiNavigationFingerprint = proposal.Revision.NavigationFingerprint;
        // A route needs at least two stops one metre apart (docs/lich-tour-theo-ca.md §2).
        var lab = await sender.Send(new CreatePoiProposalCommand(Guid.Parse(Id(2)),
            new(Guid.NewGuid(), new(map.Id, "Lab", "Lab", null, -0.5m, -1.5m, 0m, "FRONT", "Thuyết minh phòng lab", null))));
        lab = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), lab.Id, new(Guid.NewGuid(), 1, lab.RowVersion)));
        await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), lab.Id, 1,
            new(Guid.NewGuid(), 1, lab.RowVersion, "physical_1", "PASS", true, true, true, true, null, "Manual POI PASS.")));
        RouteRevisionStopInput LabStop() => new(lab.Revision.Id, 30, [new("FRONT", 30)]);

        var draft1 = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), null,
            new(Guid.NewGuid(), 0, "Pilot", null, map.Id, -1.5m, -0.5m, 0m, "POSE", -0.5m, -0.5m, 0m,
                [new(proposal.Revision.Id, 30, [new("FRONT", 30)]), LabStop()])));
        Assert.Equal("NOT_TESTED", draft1.VerificationStatus);
        Assert.Contains(await sender.Send(new ListRouteTestParticipantsQuery()), person => person.UserId == participatingStaffId);
        Assert.Equal(map.PackageSha256, draft1.MapPackageSha256);
        Assert.Equal("Nội dung thuyết minh", draft1.Stops[0].NarrationText);
        Assert.Equal(await db.ScalarAsync<Guid>($"SELECT Id FROM dbo.RouteRevisionStops WHERE RouteRevisionId='{draft1.RevisionId:D}' AND StopOrder=1;"),
            draft1.Stops[0].Id);
        Assert.Equal("Nội dung thuyết minh", await db.ScalarAsync<string>($"SELECT NarrationText FROM dbo.RouteRevisionStops WHERE RouteRevisionId='{draft1.RevisionId}' AND StopOrder=1;"));
        await sender.Send(new SubmitRouteRevisionCommand(Guid.Parse(Id(2)), draft1.RouteId, draft1.RevisionId,
            new(Guid.NewGuid(), 1)));

        async Task RejectParticipant(Guid userId)
        {
            var error = await Assert.ThrowsAsync<ConflictException>(() => sender.Send(new RecordRouteTestRunCommand(technicalStaffId, draft1.RouteId, draft1.RevisionId,
                new(Guid.NewGuid(), "physical_1", userId, "FAIL", false, true, true, 240,
                    "Invalid participant.", "Expected participant account rejection."))));
            Assert.Equal("STAFF_PARTICIPANT_REQUIRED", error.Code);
        }
        await RejectParticipant(lockedStaffId);
        await RejectParticipant(representativeId);
        await RejectParticipant(multiRoleStaffId);

        var staffToken = await ApiLoginAsync(api.Client, "route.participant", RouteAccountPassword);
        var technicalToken = await ApiLoginAsync(api.Client, "route.technical", RouteAccountPassword);
        using (var listRequest = new HttpRequestMessage(HttpMethod.Get, $"/api/routes?mapVersionId={map.Id:D}&page=1&size=10"))
        {
            listRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", staffToken);
            using var listResponse = await api.Client.SendAsync(listRequest);
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            using var listed = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
            var routeItem = Assert.Single(listed.RootElement.GetProperty("data").EnumerateArray());
            Assert.Equal(draft1.RouteId, routeItem.GetProperty("routeId").GetGuid());
            Assert.Equal(draft1.RevisionId, routeItem.GetProperty("revisionId").GetGuid());
        }
        using (var techListRequest = new HttpRequestMessage(HttpMethod.Get, "/api/routes"))
        {
            techListRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", technicalToken);
            using var response = await api.Client.SendAsync(techListRequest);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        using (var adminListRequest = new HttpRequestMessage(HttpMethod.Get, "/api/routes"))
        {
            adminListRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
            using var response = await api.Client.SendAsync(adminListRequest);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
        var secondRoute = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), null,
            new(Guid.NewGuid(), 0, "Pilot Secondary", null, map.Id, -1.5m, -0.5m, 0m, "POSE", -0.5m, -0.5m, 0m,
                [new(proposal.Revision.Id, 30, [new("FRONT", 30)]), LabStop()])));
        using (var pageOneRequest = new HttpRequestMessage(HttpMethod.Get, "/api/routes?page=1&size=1&sort=name"))
        using (var pageTwoRequest = new HttpRequestMessage(HttpMethod.Get, "/api/routes?page=2&size=1&sort=name"))
        {
            pageOneRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", staffToken);
            pageTwoRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", staffToken);
            using var pageOne = await api.Client.SendAsync(pageOneRequest);
            using var pageTwo = await api.Client.SendAsync(pageTwoRequest);
            using var pageOneJson = JsonDocument.Parse(await pageOne.Content.ReadAsStringAsync());
            using var pageTwoJson = JsonDocument.Parse(await pageTwo.Content.ReadAsStringAsync());
            Assert.Equal(2, pageOneJson.RootElement.GetProperty("pagination").GetProperty("totalItems").GetInt32());
            Assert.NotEqual(
                pageOneJson.RootElement.GetProperty("data")[0].GetProperty("routeId").GetGuid(),
                pageTwoJson.RootElement.GetProperty("data")[0].GetProperty("routeId").GetGuid());
        }
        using (var searchRequest = new HttpRequestMessage(HttpMethod.Get, "/api/routes?search=Secondary&page=1&size=10"))
        {
            searchRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", staffToken);
            using var searchResponse = await api.Client.SendAsync(searchRequest);
            using var searchJson = JsonDocument.Parse(await searchResponse.Content.ReadAsStringAsync());
            Assert.Equal(secondRoute.RouteId, Assert.Single(searchJson.RootElement.GetProperty("data").EnumerateArray())
                .GetProperty("routeId").GetGuid());
        }

        // A later deployment of map B must block a route test for map A until A is deployed again.
        var mapB = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), CreateMapPackage(marker: "map B"))));
        await sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), mapB.Id,
            new(Guid.NewGuid(), "physical_1", mapB.PackageSha256, true, true, "Manual check after deploying map B.")));
        var mapMismatch = await Assert.ThrowsAsync<ConflictException>(() => sender.Send(new RecordRouteTestRunCommand(technicalStaffId, draft1.RouteId, draft1.RevisionId,
            new(Guid.NewGuid(), "physical_1", participatingStaffId, "FAIL", false, true, true, 240,
                "Map A was not deployed.", "Expected rejection while map B is current."))));
        Assert.Equal("MAP_NOT_CURRENTLY_DEPLOYED", mapMismatch.Code);
        await sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), map.Id,
            new(Guid.NewGuid(), "physical_1", map.PackageSha256, true, true, "Manual check after restoring map A.")));

        var failed = await sender.Send(new RecordRouteTestRunCommand(technicalStaffId, draft1.RouteId, draft1.RevisionId,
                new(Guid.NewGuid(), "physical_1", participatingStaffId, "FAIL", false, true, true, 240,
                "Did not arrive at the stop.", "Human-observed failed whole-route run.")));
        Assert.Equal("FAIL", failed.VerificationStatus);

        var draft2 = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), draft1.RouteId,
            new(Guid.NewGuid(), 1, "Pilot", "Corrected start pose", map.Id, -1m, -0.4m, 0m, "POSE", -0.5m, -0.5m, 0m,
                [new(proposal.Revision.Id, 30, [new("FRONT", 30)]), LabStop()])));
        Assert.Equal(2, draft2.RevisionNumber);
        Assert.Equal("NOT_TESTED", draft2.VerificationStatus);
        await sender.Send(new SubmitRouteRevisionCommand(Guid.Parse(Id(2)), draft2.RouteId, draft2.RevisionId,
            new(Guid.NewGuid(), 2)));
        var passed = await sender.Send(new RecordRouteTestRunCommand(technicalStaffId, draft2.RouteId, draft2.RevisionId,
                new(Guid.NewGuid(), "physical_1", participatingStaffId, "PASS", true, true, true, 260,
                null, "Human-observed successful whole-route run.")));
        Assert.Equal("PASS", passed.VerificationStatus);
        Assert.Equal("INCOMPLETE_CONTENT_AUDIO_DATA", passed.DurationStatus);
        Assert.Equal(60, passed.DwellDurationSeconds);

        var tourActor = Guid.Parse(Id(2));
        var tourStart = TourSlot(4, "S1");
        CreateTourRequest NewTour(DateTimeOffset start, Guid? revision = null, Guid? operatorUser = null) => new(Guid.NewGuid(),
            new("Pilot Tour", null, revision ?? draft2.RevisionId, "physical_1", operatorUser ?? participatingStaffId, start, null, 20));
        Assert.Equal("ROUTE_TEST_PASS_REQUIRED", (await Assert.ThrowsAsync<ConflictException>(() =>
            sender.Send(new CreateTourCommand(tourActor, NewTour(tourStart, draft1.RevisionId))))).Code);
        Assert.Equal("OPERATOR_REQUIRED", (await Assert.ThrowsAsync<ConflictException>(() =>
            sender.Send(new CreateTourCommand(tourActor, NewTour(tourStart, operatorUser: lockedStaffId))))).Code);
        var tour = await sender.Send(new CreateTourCommand(tourActor, NewTour(tourStart)));
        // One Tour per robot per shift: the same shift is taken, the next shift is not.
        Assert.Equal("ROBOT_RESERVATION_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() =>
            sender.Send(new CreateTourCommand(tourActor, NewTour(tourStart))))).Code);
        var later = await sender.Send(new CreateTourCommand(tourActor, NewTour(TourSlot(4, "S2"))));
        var tourDetail = await sender.Send(new GetTourQuery(tour.Id));
        Assert.Null(tourDetail.Route);
        Assert.Equal(draft2.RevisionId, tourDetail.RouteRevision!.RevisionId);
        Assert.Equal(participatingStaffId, tourDetail.Operator!.UserId);
        Assert.Equal("physical_1", tourDetail.Reservation!.RobotCode);
        // The hold is the whole 08:00-10:00 shift, not the measured run plus buffers.
        Assert.Equal(tourStart.AddMinutes(-15), tourDetail.Reservation.StartsAt);
        Assert.Equal(tourStart.AddMinutes(105), tourDetail.Reservation.EndsAt);
        Assert.Equal(260, tourDetail.Reservation.ExpectedDurationSeconds);
        Assert.Equal(new[] { "Library", "Lab" }, (await scope.ServiceProvider.GetRequiredService<IStudentTourViewReader>().LoadAsync(tour.Id, default))!.Stops.Select(stop => stop.Name));
        await sender.Send(new CancelTourCommand(tour.Id, tourActor, new(Guid.NewGuid(), tourDetail.Tour.RowVersion, "Rescheduling")));
        Assert.NotNull((await sender.Send(new GetTourQuery(tour.Id))).Reservation!.ReleasedAt);
        Assert.NotEqual(Guid.Empty, (await sender.Send(new CreateTourCommand(tourActor, NewTour(tourStart)))).Id);
        Assert.NotEqual(tour.Id, later.Id);

        var dwellOnly = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), draft1.RouteId,
            new(Guid.NewGuid(), 2, "Pilot", "Dwell adjustment only", map.Id, -1m, -0.4m, 0m, "POSE", -0.5m, -0.5m, 0m,
                [new(proposal.Revision.Id, 45, [new("FRONT", 30)]), LabStop()])));
        Assert.Equal(3, dwellOnly.RevisionNumber);
        Assert.Equal("PASS", dwellOnly.VerificationStatus);
        Assert.Equal(passed.EffectiveTestRunId, dwellOnly.EffectiveTestRunId);
        Assert.Equal(passed.EffectiveTestRunId, Assert.Single(dwellOnly.TestRuns).Id);
        Assert.Equal(75, dwellOnly.DwellDurationSeconds);
        Assert.Equal("INCOMPLETE_CONTENT_AUDIO_DATA", dwellOnly.DurationStatus);
        await sender.Send(new SubmitRouteRevisionCommand(Guid.Parse(Id(2)), dwellOnly.RouteId, dwellOnly.RevisionId,
            new(Guid.NewGuid(), 3)));

        // ADR-0035: the slot list and create share one calculation, so each refusal matches.
        Assert.Equal(RouteMeasurementBasis.TotalWithDwell, passed.TestRuns.Single(run => run.Id == passed.EffectiveTestRunId).MeasurementBasis);
        async Task<string> Refused(CreateTourRequest request) =>
            (await Assert.ThrowsAsync<ConflictException>(() => sender.Send(new CreateTourCommand(tourActor, request)))).Code;
        async Task<TourSlotView> SlotOf(DateTimeOffset start)
        {
            var date = DateOnly.FromDateTime(start.ToOffset(TimeSpan.FromHours(7)).DateTime);
            return (await sender.Send(new GetTourSlotsQuery(dwellOnly.RevisionId, "physical_1", date, date))).Days.Single().Slots.Single(slot => slot.StartsAt == start);
        }

        // The dwell-only revision adds 15 s to the 260 s measured on revision 2.
        var dwellStart = TourSlot(5, "S1");
        var dwellTour = await sender.Send(new CreateTourCommand(tourActor, NewTour(dwellStart, dwellOnly.RevisionId)));
        var dwellReservation = (await sender.Send(new GetTourQuery(dwellTour.Id))).Reservation!;
        Assert.Equal(260, dwellReservation.MeasuredDurationSeconds);
        Assert.Equal(275, dwellReservation.ExpectedDurationSeconds);
        Assert.Equal(dwellStart.AddMinutes(105), dwellReservation.EndsAt);
        Assert.Equal(dwellStart.AddHours(-48), (await SlotOf(dwellStart)).RegistrationClosesAt);
        Assert.Equal(("FITS", 275), (await sender.Send(new GetRouteRevisionQuery(dwellOnly.RouteId, dwellOnly.RevisionId, false))) is var fit
            ? (fit.ScheduleFit, fit.ExpectedDurationSeconds!.Value) : default);

        var overlap = await SlotOf(dwellStart);
        Assert.False(overlap.Available);
        Assert.Equal("RESERVATION_OVERLAP", overlap.ReasonCode);
        Assert.Equal("Trùng khung giữ robot của Tour Pilot Tour", overlap.Reason);
        Assert.Equal("ROBOT_RESERVATION_CONFLICT", await Refused(NewTour(dwellStart, dwellOnly.RevisionId)));
        var free = await SlotOf(TourSlot(5, "S2"));
        Assert.True(free.Available);
        Assert.Equal(("S2", "Ca chiều 1", "13:15", 5400), (free.ShiftCode, free.ShiftName, free.Time, free.MaxDurationSeconds));
        Assert.Equal(free.StartsAt.AddMinutes(-15), free.ReservationStartsAt);
        Assert.Equal(free.StartsAt.AddMinutes(105), free.ReservationEndsAt);

        var tooClose = TourSlot(1, "S1");
        Assert.Equal("LEAD_TIME_TOO_SHORT", (await SlotOf(tooClose)).ReasonCode);
        Assert.Equal("TOUR_LEAD_TIME_TOO_SHORT", await Refused(NewTour(tooClose, dwellOnly.RevisionId)));

        // docs/lich-tour-theo-ca.md §3: only a shift's Tour start is accepted; a typed time or one minute off is not.
        var oddDay = TourSlot(10, "S1");
        Assert.Equal("TOUR_SLOT_NOT_ALLOWED", await Refused(NewTour(oddDay.AddMinutes(1), dwellOnly.RevisionId)));
        Assert.Equal("TOUR_SLOT_NOT_ALLOWED", await Refused(NewTour(oddDay.AddHours(3).AddMinutes(5), dwellOnly.RevisionId)));
        Assert.Equal(3, (await sender.Send(new GetTourSlotsQuery(dwellOnly.RevisionId, "physical_1", DateOnly.FromDateTime(oddDay.ToOffset(TimeSpan.FromHours(7)).DateTime),
            DateOnly.FromDateTime(oddDay.ToOffset(TimeSpan.FromHours(7)).DateTime)))).Days.Single().Slots.Count);

        // A Tour from before the shifts keeps its odd-hour hold, and that hold still blocks the shift it reaches into.
        var legacy = await sender.Send(new CreateTourCommand(tourActor, NewTour(TourSlot(10, "S2"), dwellOnly.RevisionId)));
        await db.ExecuteAsync($"UPDATE dbo.TourRobotReservations SET StartsAt='{oddDay.AddMinutes(50):O}', EndsAt='{oddDay.AddMinutes(110):O}' WHERE TourId='{legacy.Id:D}';");
        var reachedInto = await SlotOf(oddDay);
        Assert.Equal("RESERVATION_OVERLAP", reachedInto.ReasonCode);
        Assert.Equal("Trùng khung giữ robot của Tour Pilot Tour", reachedInto.Reason);
        Assert.Equal("ROBOT_RESERVATION_CONFLICT", await Refused(NewTour(oddDay, dwellOnly.RevisionId)));
        Assert.True((await SlotOf(TourSlot(10, "S2"))).Available);

        // Create decides on the server clock at the moment of saving: 71h59m is refused, 72h is accepted.
        var boundary = TourSlot(9, "S1");
        db.Clock.Fixed = boundary.AddHours(-72).AddMinutes(1);
        Assert.Equal("TOUR_LEAD_TIME_TOO_SHORT", await Refused(NewTour(boundary, dwellOnly.RevisionId)));
        db.Clock.Fixed = boundary.AddHours(-72);
        Assert.NotEqual(Guid.Empty, (await sender.Send(new CreateTourCommand(tourActor, NewTour(boundary, dwellOnly.RevisionId)))).Id);
        db.Clock.Fixed = null;

        // Two Staff racing for one slot: the robot lock lets exactly one through.
        var contested = TourSlot(8, "S2");
        async Task<object> Attempt()
        {
            using var attempt = services.CreateScope();
            try { return await attempt.ServiceProvider.GetRequiredService<ISender>().Send(new CreateTourCommand(tourActor, NewTour(contested, dwellOnly.RevisionId))); }
            catch (ConflictException failure) { return failure.Code; }
        }
        var outcomes = await Task.WhenAll(Attempt(), Attempt());
        Assert.Single(outcomes.OfType<TourMutationResult>());
        Assert.Equal("ROBOT_RESERVATION_CONFLICT", Assert.Single(outcomes.OfType<string>()));
        Assert.Equal(1, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.TourRobotReservations WHERE StartsAt='{contested.AddMinutes(-15):O}' AND ReleasedAt IS NULL;"));

        // docs/lich-tour-theo-ca.md §4: a PASS over the 90 minutes a shift holds stays PASS, but fits no shift.
        var tooLong = await sender.Send(new RecordRouteTestRunCommand(technicalStaffId, dwellOnly.RouteId, dwellOnly.RevisionId,
            new(Guid.NewGuid(), "physical_1", participatingStaffId, "PASS", true, true, true, 5401,
                null, "Whole-route measurement including dwell.")));
        Assert.Equal(("PASS", "TOO_LONG_FOR_SHIFT", 5401), (tooLong.VerificationStatus, tooLong.ScheduleFit, tooLong.ExpectedDurationSeconds!.Value));
        Assert.DoesNotContain(tooLong.EligibilityIssues, issue => issue.Contains("SHIFT"));
        var noShift = await SlotOf(TourSlot(6, "S1"));
        Assert.Equal("ROUTE_TOO_LONG_FOR_SHIFT", noShift.ReasonCode);
        Assert.Equal("Tuyến cần 90 phút 1 giây, ca này chỉ chứa được 90 phút", noShift.Reason);
        Assert.Equal("ROUTE_TOO_LONG_FOR_SHIFT", await Refused(NewTour(TourSlot(6, "S1"), dwellOnly.RevisionId)));

        // Over the 60 minutes recommended is only a warning: the Tour is still created.
        var longRun = await sender.Send(new RecordRouteTestRunCommand(technicalStaffId, dwellOnly.RouteId, dwellOnly.RevisionId,
            new(Guid.NewGuid(), "physical_1", participatingStaffId, "PASS", true, true, true, 4000,
                null, "Longer whole-route measurement including dwell.")));
        Assert.Equal("OVER_RECOMMENDED", longRun.ScheduleFit);
        Assert.Equal("OVER_RECOMMENDED", Assert.Single((await sender.Send(new ListVersionedRoutesQuery("Dwell adjustment only", map.Id, 1, 10, "name"))).Items).ScheduleFit);
        Assert.NotEqual(Guid.Empty, (await sender.Send(new CreateTourCommand(tourActor, NewTour(TourSlot(6, "S1"), dwellOnly.RevisionId)))).Id);

        // A run from before the definition cannot size a reservation, however good its result.
        await db.ExecuteAsync($"UPDATE dbo.RouteTestRuns SET MeasurementBasis=NULL WHERE Id='{longRun.EffectiveTestRunId:D}';");
        Assert.Equal("UNKNOWN", (await sender.Send(new GetRouteRevisionQuery(dwellOnly.RouteId, dwellOnly.RevisionId, false))).ScheduleFit);
        var remeasure = await SlotOf(TourSlot(7, "S1"));
        Assert.Equal("ROUTE_TEST_REMEASURE_REQUIRED", remeasure.ReasonCode);
        Assert.Equal("Cần chạy thử lại tuyến để đo theo định nghĩa mới", remeasure.Reason);
        Assert.Equal("ROUTE_TEST_REMEASURE_REQUIRED", await Refused(NewTour(TourSlot(7, "S1"), dwellOnly.RevisionId)));
        await db.ExecuteAsync($"UPDATE dbo.RouteTestRuns SET MeasurementBasis='TOTAL_WITH_DWELL' WHERE Id='{longRun.EffectiveTestRunId:D}';");

        var newerFail = await sender.Send(new RecordRouteTestRunCommand(technicalStaffId, dwellOnly.RouteId, dwellOnly.RevisionId,
            new(Guid.NewGuid(), "physical_1", participatingStaffId, "FAIL", false, true, true, 270,
                "The revised dwell configuration was observed with a route failure.", "Newer run for unchanged navigation.")));
        Assert.Equal("FAIL", newerFail.VerificationStatus);

        // Content-only POI revisions keep the navigation fingerprint and may reuse the route PASS.
        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion,
                new(map.Id, "Library entrance", "Entrance", "Narration wording corrected", -1.5m, -1.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        Assert.Equal(verifiedPoiNavigationFingerprint, proposal.Revision.NavigationFingerprint);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 2, proposal.RowVersion)));
        var contentOnlyDraft = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), draft1.RouteId,
            new(Guid.NewGuid(), 3, "Pilot", "Content wording update", map.Id, -1m, -0.4m, 0m, "POSE", -0.5m, -0.5m, 0m,
                [new(proposal.Revision.Id, 45, [new("FRONT", 30)]), LabStop()])));
        Assert.Equal(4, contentOnlyDraft.RevisionNumber);
        Assert.Equal("FAIL", contentOnlyDraft.VerificationStatus);
        Assert.Equal(newerFail.EffectiveTestRunId, contentOnlyDraft.EffectiveTestRunId);
        await sender.Send(new SubmitRouteRevisionCommand(Guid.Parse(Id(2)), contentOnlyDraft.RouteId, contentOnlyDraft.RevisionId,
            new(Guid.NewGuid(), 4)));

        var history = await sender.Send(new GetRouteRevisionQuery(contentOnlyDraft.RouteId, null, true));
        Assert.Equal(4, history.RevisionHistory.Count);
        Assert.Equal(5, history.TestRuns.Count);
        Assert.Equal("FAIL", history.TestRuns[0].ResultCode);
        Assert.Equal("PASS", history.TestRuns[1].ResultCode);
        Assert.Equal("PASS", history.TestRuns[2].ResultCode);
        Assert.Equal("PASS", history.TestRuns[3].ResultCode);
        Assert.Equal("FAIL", history.TestRuns[4].ResultCode);
        Assert.Equal("FAIL", (await sender.Send(new GetRouteRevisionQuery(draft1.RouteId, draft1.RevisionId, false))).VerificationStatus);
        var currentCatalog = await sender.Send(new ListVersionedRoutesQuery("Content wording update", map.Id, 1, 10, "name"));
        var currentItem = Assert.Single(currentCatalog.Items);
        Assert.Equal(4, currentItem.RevisionNumber);
        Assert.Equal(contentOnlyDraft.RevisionId, currentItem.RevisionId);
        Assert.Equal(contentOnlyDraft.EffectiveTestRunId, currentItem.EffectiveTestRunId);
    }

    [SchemaV12Fact]
    public async Task V12Snapshot_CreatesVersionedMapPoiTablesAndEnforcesVersionUniqueness()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.2.sql");
        Assert.Equal(24, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0;"));
        Assert.Equal(7, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name IN ('MapAreas','MapVersions','MapDeploymentChecks','PoiProposals','PoiProposalRevisions','PoiProposalSubmissions','PoiVerificationRecords');"));
        await db.ExecuteAsync($"INSERT dbo.MapAreas(AreaKey,DisplayName,CreatedByUserId,CreatedAt) VALUES(N'pilot',N'Pilot Area','{Id(1)}',SYSDATETIMEOFFSET());");
        var mapId = Guid.NewGuid();
        await db.ExecuteAsync($"""
            INSERT dbo.MapVersions(Id,AreaKey,VersionNumber,MapKey,PackageFileName,PackageSha256,RequestHash,PackageBytes,
                ImageFileName,ImageWidth,ImageHeight,Resolution,OriginX,OriginY,OriginYaw,Negate,OccupiedThreshold,
                FreeThreshold,FrameId,ValidationStatus,UploadedByUserId,UploadRequestId,UploadedAt)
            VALUES('{mapId}',N'pilot',1,N'pilot-v1',N'pilot-v1.zip',CONVERT(binary(32),1),CONVERT(binary(32),2),0x01,
                N'pilot.pgm',1,1,0.05,0,0,0,0,0.65,0.196,N'map','VALID','{Id(1)}','{Id(3)}',SYSDATETIMEOFFSET());
            """);
        await db.ExpectErrorAsync(2627, $"""
            INSERT dbo.MapVersions(Id,AreaKey,VersionNumber,MapKey,PackageFileName,PackageSha256,RequestHash,PackageBytes,
                ImageFileName,ImageWidth,ImageHeight,Resolution,OriginX,OriginY,OriginYaw,Negate,OccupiedThreshold,
                FreeThreshold,FrameId,ValidationStatus,UploadedByUserId,UploadRequestId,UploadedAt)
            SELECT NEWID(),AreaKey,VersionNumber,N'other-v1',N'other-v1.zip',PackageSha256,RequestHash,PackageBytes,
                ImageFileName,ImageWidth,ImageHeight,Resolution,OriginX,OriginY,OriginYaw,Negate,OccupiedThreshold,
                FreeThreshold,FrameId,ValidationStatus,UploadedByUserId,NEWID(),SYSDATETIMEOFFSET()
            FROM dbo.MapVersions WHERE Id='{mapId}';
            """);
        Assert.Equal("pilot-v1", await db.ScalarAsync<string>($"SELECT MapKey FROM dbo.MapVersions WHERE Id='{mapId}';"));
    }

    [SchemaV12Fact]
    public async Task V12RuntimeGrants_AreAppendOnlyForMapAndPoiVerificationRecords()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.2.sql");
        await db.ApplyFileAsync("permissions.sql");
        await db.ApplyFileAsync("map-poi-permissions.sql");
        await db.ExecuteAsync("CREATE USER map_poi_permission_test WITHOUT LOGIN; ALTER ROLE campus_tour_app ADD MEMBER map_poi_permission_test;");
        await using var connection = await db.OpenAsync();
        await ExecuteAsync(connection, "EXECUTE AS USER='map_poi_permission_test';");
        try
        {
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.MapVersions','OBJECT','SELECT');"));
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.MapVersions','OBJECT','INSERT');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.MapVersions','OBJECT','UPDATE');"));
            await ExecuteAsync(connection, $"UPDATE dbo.PoiProposals SET CurrentRevision=CurrentRevision WHERE Id='{Id(999)}';");
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.PoiVerificationRecords','OBJECT','UPDATE');"));
            await ExpectErrorAsync(connection, 229, "UPDATE dbo.MapVersions SET ValidationStatus='INVALID';");
            await ExpectErrorAsync(connection, 230, $"UPDATE dbo.PoiProposals SET CreatedAt=CreatedAt WHERE Id='{Id(999)}';");
            await ExpectErrorAsync(connection, 229, "DELETE FROM dbo.PoiVerificationRecords;");
        }
        finally { await ExecuteAsync(connection, "REVERT;"); }
    }

    [SchemaV12Fact]
    public async Task V11ToV12Upgrade_IsAdditiveAndRerunnableForRecognizedV12Marker()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68';");
        await db.ApplyFileAsync("upgrade-v1.1-to-v1.2-map-poi.sql");
        await db.ApplyFileAsync("upgrade-v1.1-to-v1.2-map-poi.sql");
        Assert.Equal(24, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0;"));
        Assert.Equal("b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43",
            await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties WHERE name=N'CampusTourBootstrapHash';"));
        Assert.Equal("USER1", await db.ScalarAsync<string>($"SELECT NormalizedUsername FROM dbo.Users WHERE Id='{Id(1)}';"));
    }

    [SchemaV17Fact]
    public async Task V11ToV18DatabaseFirstUpgrade_PreservesRowsAndAppliesRuntimeGrants()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot.sql");
        await db.ExecuteAsync("""
            EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68';
            CREATE USER smartcampus_api WITHOUT LOGIN;
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES
                ('80000000-0000-0000-0000-000000000001',N'upgrade-unissued-empty-hash','PHYSICAL',0x,0,0,SYSDATETIMEOFFSET()),
                ('80000000-0000-0000-0000-000000000002',N'upgrade-provisioned-real-hash','PHYSICAL',0x0123456789ABCDEF,0,0,SYSDATETIMEOFFSET());
            """);

        // Production starts from the recognized v1.1 marker. This verifies the
        // exact ordered path, not isolated patches against later snapshots.
        await db.ApplyFileAsync("add-poi-rowversion-v1.1.sql");
        await db.ApplyFileAsync("upgrade-v1.1-to-v1.2-map-poi.sql");
        await db.ApplyFileAsync("upgrade-v1.1-to-v1.2-map-poi.sql");
        await db.ApplyFileAsync("permissions.sql");
        await db.ApplyFileAsync("map-poi-permissions.sql");
        await db.ApplyFileAsync("upgrade-v1.2-to-v1.3-route-revisions.sql");
        await db.ApplyFileAsync("upgrade-v1.2-to-v1.3-route-revisions.sql");
        await db.ApplyFileAsync("route-revision-permissions.sql");
        await db.ApplyFileAsync("upgrade-v1.3-to-v1.4-row-registration.sql");
        await db.ApplyFileAsync("upgrade-v1.3-to-v1.4-row-registration.sql");
        await db.ApplyFileAsync("upgrade-v1.4-to-v1.5-robot-connection-confirmation.sql");
        await db.ApplyFileAsync("upgrade-v1.4-to-v1.5-robot-connection-confirmation.sql");
        await db.ApplyFileAsync("upgrade-v1.5-to-v1.6-robot-credential-lifecycle.sql");
        await db.ApplyFileAsync("upgrade-v1.5-to-v1.6-robot-credential-lifecycle.sql");
        await db.ApplyFileAsync("upgrade-v1.6-to-v1.7-poi-narration.sql");
        await db.ApplyFileAsync("upgrade-v1.6-to-v1.7-poi-narration.sql");
        await db.ApplyFileAsync("upgrade-v1.7-to-v1.8-robot-map-assignment.sql");
        await db.ApplyFileAsync("upgrade-v1.7-to-v1.8-robot-map-assignment.sql");
        await db.ApplyFileAsync("upgrade-v1.8-to-v1.9-tour-route-revision.sql");
        await db.ApplyFileAsync("upgrade-v1.8-to-v1.9-tour-route-revision.sql");
        await db.ApplyFileAsync("upgrade-v1.9-to-v1.10-tour-scheduling.sql");
        await db.ApplyFileAsync("upgrade-v1.9-to-v1.10-tour-scheduling.sql");
        await db.ApplyFileAsync("upgrade-v1.10-to-v1.11-poi-pose-import.sql");
        await db.ApplyFileAsync("upgrade-v1.10-to-v1.11-poi-pose-import.sql");
        await db.ApplyFileAsync("upgrade-v1.11-to-v1.12-robot-lifecycle.sql");
        await db.ApplyFileAsync("upgrade-v1.11-to-v1.12-robot-lifecycle.sql");
        await db.ApplyFileAsync("upgrade-v1.12-to-v1.13-map-package-uniqueness.sql");
        await db.ApplyFileAsync("upgrade-v1.12-to-v1.13-map-package-uniqueness.sql");
        await db.ApplyFileAsync("upgrade-v1.13-to-v1.14-robot-commands.sql");
        await db.ApplyFileAsync("upgrade-v1.13-to-v1.14-robot-commands.sql");
        await db.ApplyFileAsync("upgrade-v1.14-to-v1.15-command-outcome.sql");
        await db.ApplyFileAsync("upgrade-v1.15-to-v1.16-schedule-blocks.sql");
        await db.ApplyFileAsync("upgrade-v1.15-to-v1.16-schedule-blocks.sql");
        await db.ApplyFileAsync("upgrade-v1.16-to-v1.17-system-reservation-release.sql");
        await db.ApplyFileAsync("upgrade-v1.16-to-v1.17-system-reservation-release.sql");
        await db.ApplyFileAsync("upgrade-v1.17-to-v1.18-capacity-and-expiry.sql");
        await db.ApplyFileAsync("upgrade-v1.17-to-v1.18-capacity-and-expiry.sql");
        await db.ApplyFileAsync("upgrade-v1.18-to-v1.19-short-notice-tour.sql");
        await db.ApplyFileAsync("upgrade-v1.18-to-v1.19-short-notice-tour.sql");
        await db.ApplyFileAsync("upgrade-v1.19-to-v1.20-poi-discard.sql");
        await db.ApplyFileAsync("upgrade-v1.19-to-v1.20-poi-discard.sql");
        await db.ApplyFileAsync("runtime-permissions.sql");
        await db.ApplyFileAsync("fleet-credential-provisioning-permissions.sql");
        await db.ExecuteAsync("ALTER ROLE campus_tour_app ADD MEMBER smartcampus_api;");

        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.Users;"));
        Assert.Equal(1, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.Pois WHERE Id='{Id(10)}';"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.Routes WHERE AuthoringMode='LEGACY';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name='RosterEmailChangeRequests';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Pois') AND name='RowVersion';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RosterRows') AND name='ParticipationState';"));
        Assert.Equal("1.20", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposals') AND name='DiscardedAt' AND is_nullable=1;"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name='RobotCommands';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name='TourScheduleBlocks';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Tours') AND name='CurrentRevisionStopId' AND is_nullable=1;"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name='DeactivatedAt' AND is_nullable=1;"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name='TourRobotReservations';"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RouteTestRuns') AND name='MeasurementBasis' AND is_nullable=1;"));
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name='ExpectedDurationSeconds' AND is_nullable=1;"));
        Assert.Equal("b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43",
            await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE name=N'CampusTourBootstrapHash';"));
        Assert.Equal("NULL:NOT_ISSUED", await db.ScalarAsync<string>("SELECT CONCAT(COALESCE(CONVERT(varchar(64),CredentialHash,2),'NULL'),':',CASE WHEN CredentialHash IS NULL THEN 'NOT_ISSUED' ELSE 'ACTIVE' END) FROM dbo.Robots WHERE RobotCode=N'upgrade-unissued-empty-hash';"));
        Assert.Equal("0123456789ABCDEF:ACTIVE", await db.ScalarAsync<string>("SELECT CONCAT(CONVERT(varchar(64),CredentialHash,2),':',CASE WHEN CredentialHash IS NULL THEN 'NOT_ISSUED' ELSE 'ACTIVE' END) FROM dbo.Robots WHERE RobotCode=N'upgrade-provisioned-real-hash';"));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name IN (N'CK_Robots_CredentialIssueMetadata',N'CK_Robots_CredentialRevocationMetadata') AND is_disabled=0 AND is_not_trusted=0;"));

        await using var connection = await db.OpenAsync();
        await ExecuteAsync(connection, "EXECUTE AS USER='smartcampus_api';");
        try
        {
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.MapVersions','OBJECT','SELECT');"));
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.RouteRevisions','OBJECT','INSERT');"));
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.RosterEmailChangeRequests','OBJECT','INSERT');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.MapVersions','OBJECT','UPDATE');"));
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.PoiImportReceipts','OBJECT','INSERT');"));
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.PoiImportReceipts','OBJECT','SELECT');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.PoiImportReceipts','OBJECT','UPDATE');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.PoiImportReceipts','OBJECT','DELETE');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.PoiVerificationRecords','OBJECT','UPDATE');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.PoiVerificationRecords','OBJECT','DELETE');"));
            // Admin blocks are added and stamped as removed, never rewritten or deleted.
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.TourScheduleBlocks','OBJECT','INSERT');"));
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.TourScheduleBlocks','OBJECT','UPDATE','RemovedAt','COLUMN');"));
            Assert.Equal(1, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.TourScheduleBlocks','OBJECT','UPDATE','RemovedByUserId','COLUMN');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.TourScheduleBlocks','OBJECT','UPDATE','Reason','COLUMN');"));
            Assert.Equal(0, await ScalarAsync<int>(connection, "SELECT HAS_PERMS_BY_NAME('dbo.TourScheduleBlocks','OBJECT','DELETE');"));
        }
        finally { await ExecuteAsync(connection, "REVERT;"); }
    }

    [SchemaV17Fact]
    public async Task RobotLifecycleUpgrade_BackfillsTheArea_AndGuardsItsRules()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.11.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.11';");
        await db.ExecuteAsync(RobotFixture(Id(93)));
        await db.ExecuteAsync($"UPDATE dbo.Robots SET AssignedMapVersionId='{Id(94)}', MapAssignedAt=SYSDATETIMEOFFSET(), MapAssignedByUserId='{Id(1)}' WHERE RobotCode=N'upgrade_a';");

        await db.ApplyFileAsync("upgrade-v1.11-to-v1.12-robot-lifecycle.sql");
        await db.ApplyFileAsync("upgrade-v1.11-to-v1.12-robot-lifecycle.sql");

        Assert.Equal("1.12", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal("pilot", await db.ScalarAsync<string>("SELECT AssignedAreaKey FROM dbo.Robots WHERE RobotCode=N'upgrade_a';"));
        await using var connection = await db.OpenAsync();
        await ExpectErrorAsync(connection, 2601, $"UPDATE dbo.Robots SET AssignedMapVersionId='{Id(94)}', AssignedAreaKey=N'pilot', MapAssignedAt=SYSDATETIMEOFFSET(), MapAssignedByUserId='{Id(1)}' WHERE RobotCode=N'upgrade_b';");
        await ExpectErrorAsync(connection, 547, $"UPDATE dbo.Robots SET AssignedMapVersionId=NULL, MapAssignedAt=NULL, MapAssignedByUserId=NULL WHERE RobotCode=N'upgrade_a';");
        await ExpectErrorAsync(connection, 547, "UPDATE dbo.Robots SET DeactivatedAt=SYSDATETIMEOFFSET() WHERE RobotCode=N'upgrade_b';");
        await ExecuteAsync(connection, $"UPDATE dbo.Robots SET DeactivatedAt=SYSDATETIMEOFFSET(), DeactivatedByUserId='{Id(1)}', DeactivationReason=N'test' WHERE RobotCode=N'upgrade_b';");
    }

    [SchemaV17Fact]
    public async Task RobotLifecycleUpgrade_StopsWithTheRobotsNamed_WhenAnAreaIsAlreadyShared()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.11.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.11';");
        await db.ExecuteAsync(RobotFixture(Id(93)));
        await db.ExecuteAsync($"UPDATE dbo.Robots SET AssignedMapVersionId='{Id(94)}', MapAssignedAt=SYSDATETIMEOFFSET(), MapAssignedByUserId='{Id(1)}' WHERE RobotCode LIKE N'upgrade[_]%';");

        var error = await Assert.ThrowsAnyAsync<Exception>(() => db.ApplyFileAsync("upgrade-v1.11-to-v1.12-robot-lifecycle.sql"));

        Assert.Contains("upgrade_a", error.Message);
        Assert.Contains("upgrade_b", error.Message);
        Assert.Equal("1.11", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.Robots WHERE RobotCode LIKE N'upgrade[_]%' AND AssignedMapVersionId IS NOT NULL;"));
    }

    [SchemaV17Fact]
    public async Task MapPackageUniquenessUpgrade_AppliesOnce_AndThenAreaAndPackagePairsAreUnique()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.12.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.12';");
        await db.ExecuteAsync(MapVersionFixture(Id(94), 1, 'A'));
        await db.ExecuteAsync(MapVersionFixture(Id(95), 2, 'B'));

        await db.ApplyFileAsync("upgrade-v1.12-to-v1.13-map-package-uniqueness.sql");
        await db.ApplyFileAsync("upgrade-v1.12-to-v1.13-map-package-uniqueness.sql");

        Assert.Equal("1.13", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        await db.ExpectErrorAsync(2601, MapVersionInsert(Id(96), 3, 'A'));
        await db.ExecuteAsync("INSERT dbo.MapAreas(AreaKey,DisplayName,CreatedByUserId,CreatedAt) VALUES(N'other',N'Other','" + Id(1) + "',SYSDATETIMEOFFSET());");
        await db.ExecuteAsync(MapVersionInsert(Id(96), 1, 'A', "other"));
    }

    [SchemaV17Fact]
    public async Task MapPackageUniquenessUpgrade_StopsListingTheDuplicates_AndChangesNothing()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.12.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.12';");
        await db.ExecuteAsync(MapVersionFixture(Id(94), 1, 'A'));
        await db.ExecuteAsync(MapVersionInsert(Id(95), 2, 'A'));
        await db.ExecuteAsync(MapVersionInsert(Id(96), 3, 'B'));

        var error = await Assert.ThrowsAnyAsync<Exception>(() => db.ApplyFileAsync("upgrade-v1.12-to-v1.13-map-package-uniqueness.sql"));

        Assert.Contains("pilot (v1, v2)", error.Message);
        Assert.Contains(new string('A', 64), error.Message);
        Assert.DoesNotContain("v3", error.Message);
        Assert.Equal("1.12", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.MapVersions WHERE AreaKey=N'pilot';"));
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.indexes WHERE name=N'UX_MapVersions_Area_PackageSha256';"));
    }

    [SchemaV17Fact]
    public async Task RobotCommandsUpgrade_AppliesOnce_AndRerunsWithoutChange()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.13.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.13';");

        await db.ApplyFileAsync("upgrade-v1.13-to-v1.14-robot-commands.sql");
        await db.ApplyFileAsync("upgrade-v1.13-to-v1.14-robot-commands.sql");

        Assert.Equal("1.14", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND is_unique=1 AND has_filter=1;"));
        Assert.Equal(13, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RobotCommands') AND is_disabled=0 AND is_not_trusted=0;"));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name IN (N'FK_Tours_CurrentRevisionStopId',N'FK_Tours_LastArrivedRevisionStopId');"));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.Tours;"));
        // The patch builds the same structure as the snapshot.
        await using var snapshot = await TestDatabase.CreateAsync("snapshot-v1.14.sql");
        const string checks = """
            SELECT STRING_AGG(CONVERT(nvarchar(max), CONCAT(name, ':', definition)), '|') WITHIN GROUP (ORDER BY name)
            FROM sys.check_constraints WHERE parent_object_id IN (OBJECT_ID(N'dbo.RobotCommands'), OBJECT_ID(N'dbo.Tours'));
            """;
        Assert.Equal(await snapshot.ScalarAsync<string>(checks), await db.ScalarAsync<string>(checks));
        const string columns = """
            SELECT STRING_AGG(CONVERT(nvarchar(max), CONCAT(OBJECT_NAME(object_id), '.', name, ':', TYPE_NAME(user_type_id), ':', max_length, ':', precision, ':', scale, ':', is_nullable)), '|')
                WITHIN GROUP (ORDER BY OBJECT_NAME(object_id), column_id)
            FROM sys.columns WHERE object_id IN (OBJECT_ID(N'dbo.RobotCommands'), OBJECT_ID(N'dbo.Tours'));
            """;
        Assert.Equal(await snapshot.ScalarAsync<string>(columns), await db.ScalarAsync<string>(columns));
        const string indexes = """
            SELECT STRING_AGG(CONVERT(nvarchar(max), CONCAT(name, ':', is_unique, ':', filter_definition)), '|') WITHIN GROUP (ORDER BY name)
            FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.RobotCommands') AND name IS NOT NULL;
            """;
        Assert.Equal(await snapshot.ScalarAsync<string>(indexes), await db.ScalarAsync<string>(indexes));
    }

    [SchemaV17Fact]
    public async Task RobotCommandsUpgrade_StopsWhenAVersionedTourUsesLegacyStops_AndChangesNothing()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.13.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.13';");
        await db.ExecuteAsync($"""
            ALTER TABLE dbo.Tours NOCHECK CONSTRAINT FK_Tours_RouteRevisionId;
            UPDATE dbo.Tours SET RouteRevisionId = NEWID(), OperatorUserId = '{Id(1)}', CurrentRouteStopId = '{Id(21)}' WHERE Id = '{Id(41)}';
            """);

        var error = await Assert.ThrowsAnyAsync<Exception>(() => db.ApplyFileAsync("upgrade-v1.13-to-v1.14-robot-commands.sql"));

        Assert.Contains(Id(41), error.Message);
        Assert.DoesNotContain(Id(42), error.Message);
        Assert.Equal("1.13", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name='RobotCommands';"));
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Tours') AND name='CurrentRevisionStopId';"));
    }

    [SchemaV17Fact]
    public async Task RobotCommands_FilteredUniqueIndexes_AllowOneOpenGoToPerRobot_OneGoToPerLeg_OneOpenCancelPerLeg()
    {
        await using var db = await TestDatabase.CreateAsync();
        var legA = Id(201); var legB = Id(202); var legC = Id(203);
        await db.ExecuteAsync(Command(Id(101), Id(81), legA));
        // A second open GoTo on the same robot is refused, whatever its leg.
        await db.ExpectErrorAsync(2601, Command(Id(102), Id(81), legB));
        // UNKNOWN still holds the robot.
        await db.ExecuteAsync(Moved(Id(101), "UNKNOWN", 1));
        await db.ExpectErrorAsync(2601, Command(Id(102), Id(81), legB));
        // Once reconciled the robot is free for a new leg.
        await db.ExecuteAsync(Moved(Id(101), "RECONCILED", 0, $", ResolvedByUserId='{Id(1)}', ResolvedAt=SYSDATETIMEOFFSET(), ResolutionNote=N'Đã kiểm tra tại chỗ.'"));
        await db.ExecuteAsync(Command(Id(102), Id(81), legB));
        // One GoTo per leg, even on another robot and even when the first is closed: a retry is a new leg.
        await db.ExpectErrorAsync(2601, Command(Id(103), Id(82), legA));
        await db.ExecuteAsync(Command(Id(103), Id(82), legC));

        await db.ExecuteAsync(Cancel(Id(111), Id(81), legB, Id(102)));
        await db.ExpectErrorAsync(2601, Cancel(Id(112), Id(81), legB, Id(102)));
        await db.ExecuteAsync($"UPDATE dbo.RobotCommands SET State='REJECTED', IsOpen=0, DeliveredAt=SYSDATETIMEOFFSET(), DeliveredStreamId=NEWID(), CompletedAt=SYSDATETIMEOFFSET() WHERE Id='{Id(111)}';");
        await db.ExecuteAsync(Cancel(Id(112), Id(81), legB, Id(102)));
    }

    [SchemaV17Fact]
    public async Task RobotCommands_ChecksRefuseEachInconsistentRow()
    {
        await using var db = await TestDatabase.CreateAsync();
        var n = 300;
        // SQL Server names one violated CHECK; an unknown kind or state breaks every rule that reads it.
        async Task Refused(string constraint, string sql, params string[] alsoBroken)
        {
            var error = await Assert.ThrowsAsync<SqlException>(() => db.ExecuteAsync(sql));
            Assert.Equal(547, error.Number);
            Assert.Contains(new[] { constraint }.Concat(alsoBroken), name => error.Message.Contains($"\"{name}\"", StringComparison.Ordinal));
        }
        string Row(Dictionary<string, string> overrides) => Command(Id(++n), Id(81), Id(++n), overrides);

        await Refused("CK_RobotCommands_Kind", Row(new() { ["Kind"] = "'Move'" }), "CK_RobotCommands_Target", "CK_RobotCommands_IsOpen");
        await Refused("CK_RobotCommands_State", Row(new() { ["State"] = "'DONE'" }), "CK_RobotCommands_IsOpen", "CK_RobotCommands_Delivery",
            "CK_RobotCommands_Accepted", "CK_RobotCommands_Completed");
        await Refused("CK_RobotCommands_LegKind", Row(new() { ["LegKind"] = "'TO_START'" }), "CK_RobotCommands_Stop");
        await Refused("CK_RobotCommands_Stop", Row(new() { ["LegKind"] = "'TO_POI'" }));
        await Refused("CK_RobotCommands_AcceptBy", Row(new() { ["AcceptBy"] = "DATEADD(SECOND,-1,SYSDATETIMEOFFSET())" }));
        await Refused("CK_RobotCommands_Target", Row(new() { ["MapKey"] = "NULL" }));
        await Refused("CK_RobotCommands_IsOpen", Row(new() { ["IsOpen"] = "0" }));
        await Refused("CK_RobotCommands_Outcome", Row(new() { ["Outcome"] = "'ARRIVED'" }));
        foreach (var state in new[] { "ARRIVED", "FAILED", "CANCELLED" })
            await Refused("CK_RobotCommands_Outcome", Row(Closed(state, outcome: "NULL")));
        await Refused("CK_RobotCommands_Outcome", Row(Closed("ARRIVED", outcome: "'FAILED'")));
        await Refused("CK_RobotCommands_Delivery", Row(new() { ["DeliveredStreamId"] = "NEWID()", ["DeliveredAt"] = "SYSDATETIMEOFFSET()" }));
        await Refused("CK_RobotCommands_Delivery", Row(new() { ["State"] = "'DELIVERED'", ["DeliveredAt"] = "SYSDATETIMEOFFSET()" }));
        await Refused("CK_RobotCommands_Accepted", Row(new() { ["State"] = "'ACCEPTED'", ["DeliveredStreamId"] = "NEWID()", ["DeliveredAt"] = "SYSDATETIMEOFFSET()" }));
        await Refused("CK_RobotCommands_Completed", Row(new() { ["CompletedAt"] = "SYSDATETIMEOFFSET()" }));
        await Refused("CK_RobotCommands_Completed", Row(Closed("FAILED", completedAt: "NULL")));
        await Refused("CK_RobotCommands_Resolution", Row(Closed("RECONCILED")));
        await Refused("CK_RobotCommands_Resolution", Row(Closed("FAILED", extra: new() { ["ResolutionNote"] = "N'note'" })));

        // A Cancel carries no target, needs its GoTo and never holds a navigation outcome.
        await db.ExecuteAsync(Command(Id(399), Id(82), Id(398)));
        await Refused("CK_RobotCommands_Target", Cancel(Id(397), Id(82), Id(398), Id(399), new() { ["X"] = "1" }));
        await Refused("CK_RobotCommands_Target", Cancel(Id(397), Id(82), Id(398), Id(399), new() { ["TargetCommandId"] = "NULL" }));
        await Refused("CK_RobotCommands_CancelState", Cancel(Id(397), Id(82), Id(398), Id(399), Closed("ARRIVED")));

        // Valid closed rows are accepted, including a reconciled one with its resolution.
        foreach (var state in new[] { "ARRIVED", "FAILED", "CANCELLED" })
            await db.ExecuteAsync(Row(Closed(state)));
        await db.ExecuteAsync(Row(Closed("RECONCILED", extra: new()
            { ["ResolvedByUserId"] = $"'{Id(1)}'", ["ResolvedAt"] = "SYSDATETIMEOFFSET()", ["ResolutionNote"] = "N'Đã kiểm tra.'" })));
    }

    [SchemaV17Fact]
    public async Task RobotCommandOutcomeUpgrade_RejectsMissingOutcomes_PreservesHistory_AndReruns()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.14.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.14';");
        const string bootstrapHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        await db.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{bootstrapHash}';");
        await db.ExecuteAsync(Command(Id(501), Id(81), Id(502), Closed("ARRIVED")));
        var before = await db.ScalarAsync<byte[]>($"SELECT RowVersion FROM dbo.RobotCommands WHERE Id='{Id(501)}';");

        await db.ApplyFileAsync("upgrade-v1.14-to-v1.15-command-outcome.sql");
        var constraintId = await db.ScalarAsync<int>("SELECT OBJECT_ID(N'dbo.CK_RobotCommands_Outcome');");
        await db.ApplyFileAsync("upgrade-v1.14-to-v1.15-command-outcome.sql");

        Assert.Equal(constraintId, await db.ScalarAsync<int>("SELECT OBJECT_ID(N'dbo.CK_RobotCommands_Outcome');"));
        Assert.Equal(before, await db.ScalarAsync<byte[]>($"SELECT RowVersion FROM dbo.RobotCommands WHERE Id='{Id(501)}';"));
        Assert.Equal(bootstrapHash, await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';"));
        Assert.Equal("1.15", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        await using var snapshot = await TestDatabase.CreateAsync();
        const string check = "SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'CK_RobotCommands_Outcome' AND is_disabled=0 AND is_not_trusted=0;";
        Assert.Equal(await snapshot.ScalarAsync<string>(check), await db.ScalarAsync<string>(check));
        var n = 510;
        foreach (var state in new[] { "ARRIVED", "FAILED", "CANCELLED" })
        {
            var id = Id(++n); var leg = Id(++n);
            await db.ExpectErrorAsync(547, Command(id, Id(81), leg, Closed(state, outcome: "NULL")));
            await db.ExpectErrorAsync(547, Command(id, Id(81), leg, Closed(state, outcome: "'INVALID'")));
            await db.ExecuteAsync(Command(id, Id(81), leg, Closed(state)));
            await db.ExpectErrorAsync(547, $"UPDATE dbo.RobotCommands SET Outcome=NULL WHERE Id='{id}';");
        }
    }

    [SchemaV17Fact]
    public async Task ScheduleBlocksUpgrade_MatchesTheSnapshot_KeepsTheMarkers_AndReruns()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.15.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.15';");
        const string bootstrapHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        await db.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{bootstrapHash}';");

        await db.ApplyFileAsync("upgrade-v1.15-to-v1.16-schedule-blocks.sql");
        var tableId = await db.ScalarAsync<int>("SELECT OBJECT_ID(N'dbo.TourScheduleBlocks');");
        await db.ApplyFileAsync("upgrade-v1.15-to-v1.16-schedule-blocks.sql");

        Assert.Equal(tableId, await db.ScalarAsync<int>("SELECT OBJECT_ID(N'dbo.TourScheduleBlocks');"));
        Assert.Equal("1.16", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(bootstrapHash, await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';"));
        await using var snapshot = await TestDatabase.CreateAsync();
        foreach (var shape in new[]
        {
            "SELECT STRING_AGG(CONCAT(c.name,':',t.name,':',c.max_length,':',c.is_nullable), N',') WITHIN GROUP (ORDER BY c.column_id) FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.TourScheduleBlocks');",
            "SELECT STRING_AGG(CONCAT(name,':',definition), N',') WITHIN GROUP (ORDER BY name) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TourScheduleBlocks');",
            "SELECT STRING_AGG(CONCAT(name,':',is_unique,':',filter_definition), N',') WITHIN GROUP (ORDER BY name) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourScheduleBlocks') AND name IS NOT NULL;"
        })
            Assert.Equal(await snapshot.ScalarAsync<string>(shape), await db.ScalarAsync<string>(shape));
    }

    [SchemaV17Fact]
    public async Task ScheduleBlocksUpgrade_RefusesAnyOtherVersion()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.14.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.14';");
        var error = await Assert.ThrowsAsync<SqlException>(() => db.ApplyFileAsync("upgrade-v1.15-to-v1.16-schedule-blocks.sql"));
        Assert.Equal(51160, error.Number);
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name='TourScheduleBlocks';"));
    }

    [SchemaV17Fact]
    public async Task ReservationReleaseUpgrade_MatchesTheSnapshot_KeepsTheMarkers_AndReruns()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.16.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.16';");
        const string bootstrapHash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
        await db.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{bootstrapHash}';");

        await db.ApplyFileAsync("upgrade-v1.16-to-v1.17-system-reservation-release.sql");
        var checkId = await db.ScalarAsync<int>("SELECT OBJECT_ID(N'dbo.CK_TourRobotReservations_Release_Actor');");
        await db.ApplyFileAsync("upgrade-v1.16-to-v1.17-system-reservation-release.sql");

        Assert.Equal(checkId, await db.ScalarAsync<int>("SELECT OBJECT_ID(N'dbo.CK_TourRobotReservations_Release_Actor');"));
        Assert.Equal("1.17", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(bootstrapHash, await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';"));
        await using var snapshot = await TestDatabase.CreateAsync();
        const string shape = "SELECT STRING_AGG(CONCAT(name,':',definition,':',is_not_trusted), N',') WITHIN GROUP (ORDER BY name) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TourRobotReservations');";
        Assert.Equal(await snapshot.ScalarAsync<string>(shape), await db.ScalarAsync<string>(shape));
    }

    [SchemaV17Fact]
    public async Task ReservationReleaseUpgrade_RefusesAnyOtherVersion()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.15.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.15';");
        var error = await Assert.ThrowsAsync<SqlException>(() => db.ApplyFileAsync("upgrade-v1.16-to-v1.17-system-reservation-release.sql"));
        Assert.Equal(51170, error.Number);
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.check_constraints WHERE name=N'CK_TourRobotReservations_Release_Complete';"));
    }

    [SchemaV17Fact]
    public async Task CapacityAndExpiryUpgrade_MatchesTheSnapshot_GivesExistingToursTwenty_AndReruns()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.17.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.17';");
        const string bootstrapHash = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
        await db.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{bootstrapHash}';");

        await db.ApplyFileAsync("upgrade-v1.17-to-v1.18-capacity-and-expiry.sql");
        await db.ApplyFileAsync("upgrade-v1.17-to-v1.18-capacity-and-expiry.sql");

        Assert.Equal("1.18", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(bootstrapHash, await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';"));
        await using var snapshot = await TestDatabase.CreateAsync();
        foreach (var (table, column) in new[] { ("Tours", "Capacity"), ("RosterRows", "ParticipationState"), ("RosterEmailChangeRequests", "State") })
        {
            var shape = $"SELECT STRING_AGG(CONCAT(name,':',definition,':',is_not_trusted), N',') WITHIN GROUP (ORDER BY name) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.{table}') AND parent_column_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.{table}'),'{column}','ColumnId');";
            Assert.Equal(await snapshot.ScalarAsync<string>(shape), await db.ScalarAsync<string>(shape));
        }
        const string column_ = "SELECT CONCAT(c.is_nullable, ':', OBJECT_DEFINITION(c.default_object_id)) FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'dbo.Tours') AND c.name='Capacity';";
        Assert.Equal(await snapshot.ScalarAsync<string>(column_), await db.ScalarAsync<string>(column_));
    }

    [SchemaV17Fact]
    public async Task ShortNoticeUpgrade_MatchesTheSnapshot_LeavesExistingToursStandard_AndReruns()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.18.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.18';");

        await db.ApplyFileAsync("upgrade-v1.18-to-v1.19-short-notice-tour.sql");
        await db.ApplyFileAsync("upgrade-v1.18-to-v1.19-short-notice-tour.sql");

        Assert.Equal("1.19", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        await using var snapshot = await TestDatabase.CreateAsync();
        const string column = "SELECT CONCAT(TYPE_NAME(c.user_type_id), ':', c.is_nullable, ':', OBJECT_DEFINITION(c.default_object_id)) FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'dbo.Tours') AND c.name='IsShortNotice';";
        Assert.Equal(await snapshot.ScalarAsync<string>(column), await db.ScalarAsync<string>(column));
    }

    [SchemaV17Fact]
    public async Task PoiDiscardUpgrade_MatchesTheSnapshot_KeepsExistingProposalsVisible_AndReruns()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.19.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.19';");
        const string bootstrapHash = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
        await db.ExecuteAsync($"EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'{bootstrapHash}';");

        await db.ApplyFileAsync("upgrade-v1.19-to-v1.20-poi-discard.sql");
        await db.ApplyFileAsync("upgrade-v1.19-to-v1.20-poi-discard.sql");

        Assert.Equal("1.20", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(bootstrapHash, await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';"));
        await using var snapshot = await TestDatabase.CreateAsync();
        const string columns = "SELECT STRING_AGG(CONCAT(name,':',TYPE_NAME(system_type_id),':',scale,':',is_nullable), N',') WITHIN GROUP (ORDER BY name) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposals') AND name IN ('DiscardedAt','DiscardedByUserId');";
        const string check = "SELECT CONCAT(definition,':',is_not_trusted) FROM sys.check_constraints WHERE name=N'CK_PoiProposals_Discard_Complete';";
        const string foreignKey = "SELECT CONCAT(OBJECT_NAME(referenced_object_id),':',is_not_trusted) FROM sys.foreign_keys WHERE name=N'FK_PoiProposals_DiscardedByUserId';";
        foreach (var shape in new[] { columns, check, foreignKey })
            Assert.Equal(await snapshot.ScalarAsync<string>(shape), await db.ScalarAsync<string>(shape));
        Assert.Equal("Users:0", await db.ScalarAsync<string>(foreignKey));
    }

    [SchemaV17Fact]
    public async Task PoiDiscardUpgrade_RefusesAnyOtherVersion()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.18.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.18';");
        var error = await Assert.ThrowsAsync<SqlException>(() => db.ApplyFileAsync("upgrade-v1.19-to-v1.20-poi-discard.sql"));
        Assert.Equal(51200, error.Number);
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposals') AND name='DiscardedAt';"));
    }

    [SchemaV17Fact]
    public async Task ShortNoticeUpgrade_RefusesAnyOtherVersion()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.17.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.17';");
        var error = await Assert.ThrowsAsync<SqlException>(() => db.ApplyFileAsync("upgrade-v1.18-to-v1.19-short-notice-tour.sql"));
        Assert.Equal(51190, error.Number);
    }

    [SchemaV17Fact]
    public async Task CapacityAndExpiryUpgrade_RefusesAnyOtherVersion()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.16.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.16';");
        var error = await Assert.ThrowsAsync<SqlException>(() => db.ApplyFileAsync("upgrade-v1.17-to-v1.18-capacity-and-expiry.sql"));
        Assert.Equal(51180, error.Number);
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Tours') AND name='Capacity';"));
    }

    [SchemaV17Fact]
    public async Task ReservationRelease_AllowsASystemRelease_ButNeverAReleaserWithoutARelease()
    {
        await using var db = await TestDatabase.CreateAsync();
        // Constraint-only probe: the CHECK is evaluated before any foreign key is needed.
        await db.ExecuteAsync("ALTER TABLE dbo.TourRobotReservations NOCHECK CONSTRAINT ALL;");
        await db.ExecuteAsync("ALTER TABLE dbo.TourRobotReservations WITH CHECK CHECK CONSTRAINT CK_TourRobotReservations_Release_Actor;");
        const string insert = "INSERT dbo.TourRobotReservations(Id,TourId,RobotId,RouteTestRunId,MeasuredDurationSeconds,StartsAt,EndsAt,ReservedByUserId,ReservedAt,ReleasedAt,ReleasedByUserId) VALUES(NEWID(),NEWID(),NEWID(),NEWID(),60,'2026-11-07T08:00:00+07:00','2026-11-07T09:00:00+07:00',NEWID(),SYSDATETIMEOFFSET(),{0},{1});";
        await db.ExecuteAsync(string.Format(insert, "SYSDATETIMEOFFSET()", "NULL"));
        await db.ExecuteAsync(string.Format(insert, "SYSDATETIMEOFFSET()", "NEWID()"));
        await db.ExecuteAsync(string.Format(insert, "NULL", "NULL"));
        var error = await Assert.ThrowsAsync<SqlException>(() => db.ExecuteAsync(string.Format(insert, "NULL", "NEWID()")));
        Assert.Equal(547, error.Number);
    }

    [SchemaV17Fact]
    public async Task ScheduleBlocks_HoldOneActiveBlockPerDayOrShift_AndKeepRemovedRows()
    {
        await using var db = await TestDatabase.CreateAsync();
        string Block(int id, string? shift, string reason = "N'Nghỉ lễ'", string removal = "NULL,NULL") =>
            $"INSERT dbo.TourScheduleBlocks(Id,BlockDate,ShiftCode,Reason,CreatedByUserId,CreatedAt,RemovedByUserId,RemovedAt) VALUES('{Id(id)}','2099-01-05',{(shift is null ? "NULL" : $"'{shift}'")},{reason},'{Id(1)}',SYSDATETIMEOFFSET(),{removal});";
        await db.ExecuteAsync(Block(901, null));
        await db.ExpectErrorAsync(2601, Block(902, null));
        await db.ExecuteAsync(Block(903, "S1"));
        await db.ExpectErrorAsync(2601, Block(904, "S1"));
        await db.ExpectErrorAsync(547, Block(905, "S2", reason: "N'   '"));
        await db.ExpectErrorAsync(547, Block(906, "  "));
        await db.ExpectErrorAsync(547, Block(907, "S2", removal: $"'{Id(1)}',NULL"));
        await db.ExecuteAsync($"UPDATE dbo.TourScheduleBlocks SET RemovedByUserId='{Id(1)}', RemovedAt=SYSDATETIMEOFFSET() WHERE Id='{Id(903)}';");
        await db.ExecuteAsync(Block(908, "S1"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.TourScheduleBlocks;"));
    }

    [SchemaV17Fact]
    public async Task RobotCommandOutcomeUpgrade_ListsInvalidHistory_AndChangesNothing()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.14.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.14';");
        var n = 550;
        var invalidIds = new List<string>();
        foreach (var state in new[] { "ARRIVED", "FAILED", "CANCELLED" })
        {
            var id = Id(++n); var leg = Id(++n);
            invalidIds.Add(id);
            await db.ExecuteAsync(Command(id, Id(81), leg, Closed(state, outcome: "NULL")));
        }
        const string check = "SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'CK_RobotCommands_Outcome';";
        var original = await db.ScalarAsync<string>(check);

        var error = await Assert.ThrowsAsync<SqlException>(() => db.ApplyFileAsync("upgrade-v1.14-to-v1.15-command-outcome.sql"));

        Assert.Equal(51142, error.Number);
        foreach (var id in invalidIds) Assert.Contains(id, error.Message);
        Assert.Equal(original, await db.ScalarAsync<string>(check));
        Assert.Equal("1.14", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.RobotCommands WHERE Outcome IS NULL;"));
    }

    [SchemaV17Fact]
    public async Task Tours_KeepVersionedAndLegacyStopColumnsApart()
    {
        await using var db = await TestDatabase.CreateAsync();
        // FKs are disabled so only the stop-column rule can refuse the rows below.
        await db.ExecuteAsync("""
            ALTER TABLE dbo.Tours NOCHECK CONSTRAINT FK_Tours_CurrentRevisionStopId;
            ALTER TABLE dbo.Tours NOCHECK CONSTRAINT FK_Tours_RouteRevisionId;
            """);
        var legacy = await Assert.ThrowsAsync<SqlException>(() =>
            db.ExecuteAsync($"UPDATE dbo.Tours SET CurrentRevisionStopId = NEWID() WHERE Id = '{Id(41)}';"));
        Assert.Contains("CK_Tours_StopColumns_ByTarget", legacy.Message);
        var versioned = await Assert.ThrowsAsync<SqlException>(() => db.ExecuteAsync(
            $"UPDATE dbo.Tours SET RouteRevisionId = NEWID(), OperatorUserId = '{Id(1)}', CurrentRouteStopId = '{Id(21)}' WHERE Id = '{Id(41)}';"));
        Assert.Contains("CK_Tours_StopColumns_ByTarget", versioned.Message);
        await db.ExecuteAsync($"UPDATE dbo.Tours SET RouteRevisionId = NEWID(), OperatorUserId = '{Id(1)}', CurrentRevisionStopId = NEWID() WHERE Id = '{Id(41)}';");
    }

    /// <summary>A valid open GoTo to the end pose unless <paramref name="overrides"/> change its columns.</summary>
    private static string Command(string id, string robot, string leg, Dictionary<string, string>? overrides = null)
    {
        var columns = new Dictionary<string, string>
        {
            ["Id"] = $"'{id}'", ["RobotId"] = $"'{robot}'", ["TourId"] = $"'{Id(41)}'", ["LegId"] = $"'{leg}'",
            ["LegKind"] = "'TO_END'", ["Kind"] = "'GoTo'", ["TargetCommandId"] = "NULL", ["State"] = "'PENDING'", ["IsOpen"] = "1",
            ["Outcome"] = "NULL", ["RouteRevisionStopId"] = "NULL", ["MapKey"] = "N'pilot-v1'", ["FrameId"] = "N'map'",
            ["X"] = "1.5", ["Y"] = "2.5", ["Yaw"] = "0", ["IssuedAt"] = "SYSDATETIMEOFFSET()",
            ["AcceptBy"] = "DATEADD(SECOND,30,SYSDATETIMEOFFSET())", ["IssuedByUserId"] = $"'{Id(1)}'",
            ["DeliveredAt"] = "NULL", ["DeliveredStreamId"] = "NULL", ["AcceptedAt"] = "NULL", ["CompletedAt"] = "NULL",
            ["ReasonCode"] = "NULL", ["ResolvedByUserId"] = "NULL", ["ResolvedAt"] = "NULL", ["ResolutionNote"] = "NULL"
        };
        foreach (var (column, value) in overrides ?? []) columns[column] = value;
        return $"INSERT dbo.RobotCommands({string.Join(',', columns.Keys)}) VALUES({string.Join(',', columns.Values)});";
    }

    /// <summary>A Cancel of <paramref name="target"/>: no target pose, no AcceptBy.</summary>
    private static string Cancel(string id, string robot, string leg, string target, Dictionary<string, string>? overrides = null)
    {
        var columns = new Dictionary<string, string>
        {
            ["Kind"] = "'Cancel'", ["TargetCommandId"] = $"'{target}'", ["MapKey"] = "NULL", ["FrameId"] = "NULL",
            ["X"] = "NULL", ["Y"] = "NULL", ["Yaw"] = "NULL", ["AcceptBy"] = "NULL"
        };
        foreach (var (column, value) in overrides ?? []) columns[column] = value;
        return Command(id, robot, leg, columns);
    }

    /// <summary>Columns of a delivered command that left the running states as <paramref name="state"/>.</summary>
    private static Dictionary<string, string> Closed(string state, string? outcome = null, string completedAt = "SYSDATETIMEOFFSET()",
        Dictionary<string, string>? extra = null)
    {
        var columns = new Dictionary<string, string>
        {
            ["State"] = $"'{state}'", ["IsOpen"] = "0", ["DeliveredAt"] = "SYSDATETIMEOFFSET()", ["DeliveredStreamId"] = "NEWID()",
            ["CompletedAt"] = completedAt,
            ["Outcome"] = outcome ?? (state is "ARRIVED" or "FAILED" or "CANCELLED" ? $"'{state}'" : "NULL")
        };
        foreach (var (column, value) in extra ?? []) columns[column] = value;
        return columns;
    }

    /// <summary>Moves a delivered GoTo to <paramref name="state"/>.</summary>
    private static string Moved(string id, string state, int isOpen, string extra = "") =>
        $"UPDATE dbo.RobotCommands SET State='{state}', IsOpen={isOpen}, DeliveredAt=SYSDATETIMEOFFSET(), DeliveredStreamId=NEWID(), CompletedAt=SYSDATETIMEOFFSET(){extra} WHERE Id='{id}';";

    private static string MapVersionFixture(string id, int version, char sha) => $"""
        IF NOT EXISTS (SELECT 1 FROM dbo.MapAreas WHERE AreaKey=N'pilot')
            INSERT dbo.MapAreas(AreaKey,DisplayName,CreatedByUserId,CreatedAt) VALUES(N'pilot',N'Pilot','{Id(1)}',SYSDATETIMEOFFSET());
        {MapVersionInsert(id, version, sha)}
        """;

    private static string MapVersionInsert(string id, int version, char sha, string area = "pilot") => $"""
        INSERT dbo.MapVersions(Id,AreaKey,VersionNumber,MapKey,PackageFileName,PackageSha256,RequestHash,PackageBytes,ImageFileName,ImageWidth,ImageHeight,Resolution,OriginX,OriginY,OriginYaw,Negate,OccupiedThreshold,FreeThreshold,FrameId,ValidationStatus,UploadedByUserId,UploadRequestId,UploadedAt)
            VALUES('{id}',N'{area}',{version},N'{area}-v{version}',N'map.zip',0x{new string(sha, 64)},0x{new string(sha, 64)},0x01,N'map.pgm',1,1,1,0,0,0,0,0.65,0.196,N'map','VALID','{Id(1)}',NEWID(),SYSDATETIMEOFFSET());
        """;

    private static string RobotFixture(string marker) => $"""
        INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
            VALUES('{marker}',N'upgrade_a','PHYSICAL',0x01,0,0,SYSDATETIMEOFFSET()), ('{Id(95)}',N'upgrade_b','PHYSICAL',0x02,0,0,SYSDATETIMEOFFSET());
        INSERT dbo.MapAreas(AreaKey,DisplayName,CreatedByUserId,CreatedAt) VALUES(N'pilot',N'Pilot','{Id(1)}',SYSDATETIMEOFFSET());
        INSERT dbo.MapVersions(Id,AreaKey,VersionNumber,MapKey,PackageFileName,PackageSha256,RequestHash,PackageBytes,ImageFileName,ImageWidth,ImageHeight,Resolution,OriginX,OriginY,OriginYaw,Negate,OccupiedThreshold,FreeThreshold,FrameId,ValidationStatus,UploadedByUserId,UploadRequestId,UploadedAt)
            VALUES('{Id(94)}',N'pilot',1,N'pilot-v1',N'map.zip',0x{new string('A', 64)},0x{new string('A', 64)},0x01,N'map.pgm',1,1,1,0,0,0,0,0.65,0.196,N'map','VALID','{Id(1)}',NEWID(),SYSDATETIMEOFFSET());
        """;

    [SchemaV17Fact]
    public async Task PoiPoseImportUpgrade_KeepsExistingResultsAsManualChecks_AndEnforcesEvidencePerMethod()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.10.sql");
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.10';");
        var hash = "0x" + new string('A', 64);
        await db.ExecuteAsync($"""
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x01,0,0,SYSDATETIMEOFFSET());
            INSERT dbo.MapAreas(AreaKey,DisplayName,CreatedByUserId,CreatedAt) VALUES(N'pilot',N'Pilot','{Id(1)}',SYSDATETIMEOFFSET());
            INSERT dbo.MapVersions(Id,AreaKey,VersionNumber,MapKey,PackageFileName,PackageSha256,RequestHash,PackageBytes,ImageFileName,ImageWidth,ImageHeight,Resolution,OriginX,OriginY,OriginYaw,Negate,OccupiedThreshold,FreeThreshold,FrameId,ValidationStatus,UploadedByUserId,UploadRequestId,UploadedAt)
                VALUES('{Id(84)}',N'pilot',1,N'pilot-v1',N'map.zip',{hash},{hash},0x01,N'map.pgm',1,1,1,0,0,0,0,0.65,0.196,N'map','VALID','{Id(1)}',NEWID(),SYSDATETIMEOFFSET());
            INSERT dbo.PoiProposals(Id,CreatedByUserId,CreateRequestId,CreateRequestHash,CurrentRevision,CreatedAt) VALUES('{Id(85)}','{Id(2)}',NEWID(),{hash},2,SYSDATETIMEOFFSET());
            INSERT dbo.PoiProposalRevisions(Id,ProposalId,RevisionNumber,MapVersionId,Name,Purpose,X,Y,Yaw,CameraPreset,NavigationFingerprint,RequestId,RequestHash,CreatedByUserId,CreatedAt)
                VALUES('{Id(86)}','{Id(85)}',1,'{Id(84)}',N'A',N'B',1,1,0,N'FRONT',{hash},NEWID(),{hash},'{Id(2)}',SYSDATETIMEOFFSET()),
                      ('{Id(87)}','{Id(85)}',2,'{Id(84)}',N'A',N'B',1,1,0,N'FRONT',{hash},NEWID(),{hash},'{Id(2)}',SYSDATETIMEOFFSET());
            INSERT dbo.PoiVerificationRecords(Id,ProposalRevisionId,MapVersionId,RobotId,NavigationFingerprint,ResultCode,Reached,Stopped,LocalizationPassed,CameraPresetConfirmed,Reason,EvidenceNote,CheckedByUserId,RequestId,RequestHash,CheckedAt)
                VALUES('{Id(88)}','{Id(86)}','{Id(84)}','{Id(83)}',{hash},'PASS',1,1,1,1,NULL,N'manual','{Id(1)}',NEWID(),{hash},SYSDATETIMEOFFSET()),
                      ('{Id(89)}','{Id(87)}','{Id(84)}','{Id(83)}',{hash},'FAIL',0,1,1,1,N'off target',N'manual','{Id(1)}',NEWID(),{hash},SYSDATETIMEOFFSET());
            """);

        await db.ApplyFileAsync("upgrade-v1.10-to-v1.11-poi-pose-import.sql");
        await db.ApplyFileAsync("upgrade-v1.10-to-v1.11-poi-pose-import.sql");

        Assert.Equal("1.11", await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';"));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.PoiVerificationRecords WHERE VerificationMethod='MANUAL_CHECK' AND Reached IS NOT NULL AND SourceFileSha256 IS NULL AND SourceFileContent IS NULL;"));
        Assert.Equal(0, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND (is_disabled=1 OR is_not_trusted=1);"));

        await using var connection = await db.OpenAsync();
        string Insert(string result, string observations, string reason, string method, string file) => $"""
            INSERT dbo.PoiVerificationRecords(Id,ProposalRevisionId,MapVersionId,RobotId,NavigationFingerprint,ResultCode,Reached,Stopped,LocalizationPassed,CameraPresetConfirmed,Reason,EvidenceNote,CheckedByUserId,RequestId,RequestHash,CheckedAt,VerificationMethod,SourceFileSha256,SourceFileContent)
            VALUES(NEWID(),'{Id(90)}','{Id(84)}','{Id(83)}',{hash},'{result}',{observations},{reason},N'note','{Id(1)}','{Id(91)}',{hash},SYSDATETIMEOFFSET(),'{method}',{file});
            """;
        const string notObserved = "NULL,NULL,NULL,NULL";
        var sourceFile = $"{hash},0x01";
        await db.ExecuteAsync($"""
            INSERT dbo.PoiProposalRevisions(Id,ProposalId,RevisionNumber,MapVersionId,Name,Purpose,X,Y,Yaw,CameraPreset,NavigationFingerprint,RequestId,RequestHash,CreatedByUserId,CreatedAt)
                VALUES('{Id(90)}','{Id(85)}',3,'{Id(84)}',N'A',N'B',1,1,0,N'FRONT',{hash},NEWID(),{hash},'{Id(2)}',SYSDATETIMEOFFSET());
            """);
        // A manual result can never drop its observations or carry a file.
        await ExpectErrorAsync(connection, 547, Insert("PASS", notObserved, "NULL", "MANUAL_CHECK", "NULL,NULL"));
        await ExpectErrorAsync(connection, 547, Insert("PASS", "1,1,1,1", "NULL", "MANUAL_CHECK", sourceFile));
        await ExpectErrorAsync(connection, 547, Insert("PASS", "1,0,1,1", "NULL", "MANUAL_CHECK", "NULL,NULL"));
        // A pose capture cannot claim an observation, fail, or lack its file.
        await ExpectErrorAsync(connection, 547, Insert("PASS", "1,1,1,1", "NULL", "POSE_CAPTURE", sourceFile));
        await ExpectErrorAsync(connection, 547, Insert("FAIL", notObserved, "N'x'", "POSE_CAPTURE", sourceFile));
        await ExpectErrorAsync(connection, 547, Insert("PASS", notObserved, "NULL", "POSE_CAPTURE", "NULL,NULL"));
        await ExpectErrorAsync(connection, 547, Insert("PASS", notObserved, "NULL", "POSE_CAPTURE", $"{hash},CONVERT(varbinary(max),REPLICATE(CONVERT(varchar(max),'a'),65537))"));
        await ExpectErrorAsync(connection, 547, Insert("PASS", notObserved, "NULL", "OTHER", sourceFile));
        await ExecuteAsync(connection, Insert("PASS", notObserved, "NULL", "POSE_CAPTURE", sourceFile));

        await db.ExecuteAsync($"UPDATE dbo.PoiProposals SET SourceAreaKey=N'pilot', SourcePoiId=N'POI_01' WHERE Id='{Id(85)}';");
        await ExpectErrorAsync(connection, 547, $"UPDATE dbo.PoiProposals SET SourceAreaKey=NULL WHERE Id='{Id(85)}';");
        await ExpectErrorAsync(connection, 2601, $"INSERT dbo.PoiProposals(Id,CreatedByUserId,CreateRequestId,CreateRequestHash,CurrentRevision,CreatedAt,SourceAreaKey,SourcePoiId) VALUES(NEWID(),'{Id(2)}',NEWID(),{hash},1,SYSDATETIMEOFFSET(),N'pilot',N'POI_01');");
    }

    [SchemaV17Fact]
    public async Task VersionedMapAndPoiWorkflow_PersistsManualEvidenceAndExactRevisions()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,FirstAcceptedSyncAt,FirstAcceptedMapKey,FirstAcceptedFrameId,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,0,0,SYSDATETIMEOFFSET(),N'pilot-v1',N'map',SYSDATETIMEOFFSET());");
        await using var services = db.BuildFeatureServiceProvider();
        await using var scope = services.CreateAsyncScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();
        var package = CreateMapPackage();
        var map = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), package)));
        Assert.Equal("VALID", map.ValidationStatus);
        Assert.Null(await db.ScalarAsync<string>($"SELECT TOP(1) N'present' FROM dbo.MapDeploymentChecks WHERE MapVersionId='{map.Id}';"));

        var deployment = await sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), map.Id,
            new(Guid.NewGuid(), "physical_1", map.PackageSha256, true, true, "Manual localization and display check.")));
        Assert.True(deployment.Passed);
        var proposal = await sender.Send(new CreatePoiProposalCommand(Guid.Parse(Id(2)),
            new(Guid.NewGuid(), new(map.Id, "Library", "Entrance", null, 0.5m, 0.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        Assert.Equal("NOT_CHECKED", proposal.Revision.NavigationStatus);
        await db.ExecuteAsync($"UPDATE dbo.PoiProposalRevisions SET NarrationText=NULL WHERE Id='{proposal.Revision.Id}';");
        var missingNarration = await Assert.ThrowsAsync<ConflictException>(() => sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion))));
        Assert.Equal("POI_NARRATION_REQUIRED", missingNarration.Code);
        await db.ExecuteAsync($"UPDATE dbo.PoiProposalRevisions SET NarrationText=N'Nội dung thuyết minh' WHERE Id='{proposal.Revision.Id}';");
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion)));
        Assert.True(proposal.Revision.IsSubmitted);
        Assert.Equal("NOT_CHECKED", proposal.Revision.NavigationStatus);

        var failed = await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 1,
            new(Guid.NewGuid(), 1, proposal.RowVersion, "physical_1", "FAIL", false, false, true, true,
                "Could not reach target.", "Observed failed approach on robot.")));
        Assert.Equal("FAIL", failed.ResultCode);
        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion,
                new(map.Id, "Library", "Entrance", "Moved to clear aisle", 1.5m, 0.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        Assert.Equal("NOT_CHECKED", proposal.Revision.NavigationStatus);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 2, proposal.RowVersion)));
        Assert.Single(await sender.Send(new ListPoiVerificationQueueQuery(map.Id)));
        var passed = await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 2,
            new(Guid.NewGuid(), 2, proposal.RowVersion, "physical_1", "PASS", true, true, true, true,
                null, "Observed reach, stop, localization and camera preset on robot.")));
        Assert.Equal("PASS", passed.ResultCode);

        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 2, proposal.RowVersion,
                new(map.Id, "Library", "Entrance", null, 1.5m, 0.5m, 0m, "FRONT", "Nội dung thuyết minh đã biên tập.", null))));
        Assert.Equal("PASS", proposal.Revision.NavigationStatus);
        Assert.Equal(passed.ProposalRevisionId, proposal.Revision.VerificationSourceRevisionId);
        Assert.Equal(passed.NavigationFingerprint, proposal.Revision.NavigationFingerprint);
        Assert.Equal("Nội dung thuyết minh đã biên tập.", proposal.Revision.NarrationText);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 3, proposal.RowVersion)));
        Assert.Empty(await sender.Send(new ListPoiVerificationQueueQuery(map.Id)));

        // A content-only submitted revision inherits the exact prior navigation result and remains editable.
        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 3, proposal.RowVersion,
                new(map.Id, "Library entry", "Entrance", "Second content correction", 1.5m, 0.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        Assert.Equal("PASS", proposal.Revision.NavigationStatus);
        Assert.Equal(passed.ProposalRevisionId, proposal.Revision.VerificationSourceRevisionId);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 4, proposal.RowVersion)));
        Assert.Empty(await sender.Send(new ListPoiVerificationQueueQuery(map.Id)));
        Assert.Equal(2, (await sender.Send(new GetPoiHistoryQuery(proposal.Id))).VerificationRecords.Count);

        // A newer failure for this same fingerprint supersedes the inherited pass.
        var newerFailure = await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 4,
            new(Guid.NewGuid(), 4, proposal.RowVersion, "physical_1", "FAIL", false, true, true, true,
                "A later approach did not reach the POI.", "Repeat check observed a failed approach.")));
        Assert.Equal("FAIL", newerFailure.ResultCode);
        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 4, proposal.RowVersion,
                new(map.Id, "Library entrance", "Entrance", "Third content correction", 1.5m, 0.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        Assert.Equal("FAIL", proposal.Revision.NavigationStatus);
        Assert.Equal(newerFailure.ProposalRevisionId, proposal.Revision.VerificationSourceRevisionId);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 5, proposal.RowVersion)));
        var queueAfterFailure = await sender.Send(new ListPoiVerificationQueueQuery(map.Id));
        Assert.Single(queueAfterFailure);
        Assert.Equal("FAIL", queueAfterFailure[0].NavigationStatus);
        Assert.Equal(newerFailure.ProposalRevisionId, queueAfterFailure[0].VerificationSourceRevisionId);

        var queuedFailure = await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 5,
            new(Guid.NewGuid(), 5, proposal.RowVersion, "physical_1", "FAIL", false, true, true, true,
                "The repeated approach still failed.", "Second failed result for the current navigation fingerprint.")));
        Assert.Equal("FAIL", queuedFailure.ResultCode);

        // Changing the navigation tuple requires a new result and appears in the technical queue.
        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 5, proposal.RowVersion,
                new(map.Id, "Library entrance", "Entrance", "Move to another free cell", 0.5m, 1.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        Assert.Equal("NOT_CHECKED", proposal.Revision.NavigationStatus);
        Assert.NotEqual(newerFailure.NavigationFingerprint, proposal.Revision.NavigationFingerprint);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 6, proposal.RowVersion)));
        var queueAfterMovement = await sender.Send(new ListPoiVerificationQueueQuery(map.Id));
        Assert.Single(queueAfterMovement);
        Assert.Equal("NOT_CHECKED", queueAfterMovement[0].NavigationStatus);

        var history = await sender.Send(new GetPoiHistoryQuery(proposal.Id));
        Assert.Equal(6, history.Revisions.Count);
        Assert.Equal(new[] { "FAIL", "PASS", "FAIL", "FAIL" }, history.VerificationRecords.Select(item => item.ResultCode).ToArray());
    }

    [SchemaV17Fact]
    public async Task PoiVerification_RequiresCurrentMapDeployment_AndAllowsANewDeploymentOfPriorMap()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,FirstAcceptedSyncAt,FirstAcceptedMapKey,FirstAcceptedFrameId,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,0,0,SYSDATETIMEOFFSET(),N'pilot-v1',N'map',SYSDATETIMEOFFSET());");
        await using var services = db.BuildFeatureServiceProvider();
        await using var scope = services.CreateAsyncScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();
        var mapA = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), CreateMapPackage())));
        var mapB = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), CreateMapPackage(marker: "map B"))));
        await RecordDeploymentAsync(sender, mapA);

        var proposal = await sender.Send(new CreatePoiProposalCommand(Guid.Parse(Id(2)),
            new(Guid.NewGuid(), new(mapA.Id, "Library", "Entrance", null, 0.5m, 0.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion)));
        await RecordDeploymentAsync(sender, mapB);

        var rejected = await Assert.ThrowsAsync<ConflictException>(() => sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 1,
            new(Guid.NewGuid(), 1, proposal.RowVersion, "physical_1", "PASS", true, true, true, true, null, "Manual check."))));
        Assert.Equal("MAP_NOT_DEPLOYED", rejected.Code);
        Assert.Equal(0, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.PoiVerificationRecords WHERE ProposalRevisionId=(SELECT Id FROM dbo.PoiProposalRevisions WHERE ProposalId='{proposal.Id}' AND RevisionNumber=1);"));

        await RecordDeploymentAsync(sender, mapA);
        var verified = await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 1,
            new(Guid.NewGuid(), 1, proposal.RowVersion, "physical_1", "PASS", true, true, true, true, null, "Manual check after redeploying map A.")));
        Assert.Equal("PASS", verified.ResultCode);
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.MapDeploymentChecks;"));
        Assert.Equal(1, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.PoiVerificationRecords WHERE ProposalRevisionId=(SELECT Id FROM dbo.PoiProposalRevisions WHERE ProposalId='{proposal.Id}' AND RevisionNumber=1);"));
        var latestDeploymentMap = await db.ScalarAsync<Guid>($"SELECT TOP(1) MapVersionId FROM dbo.MapDeploymentChecks WHERE RobotId='{Id(83)}' ORDER BY CheckedAt DESC, Id DESC;");
        Assert.Equal(mapA.Id, latestDeploymentMap);
    }

    [SchemaV17Fact]
    public async Task ConcurrentMapChangeAndPoiVerification_CannotCommitPassAfterDifferentMapBecomesCurrent()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,FirstAcceptedSyncAt,FirstAcceptedMapKey,FirstAcceptedFrameId,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,0,0,SYSDATETIMEOFFSET(),N'pilot-v1',N'map',SYSDATETIMEOFFSET());");
        await using var services = db.BuildFeatureServiceProvider();
        var mapA = await SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), CreateMapPackage());
        var mapB = await SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), CreateMapPackage(marker: "map B"));
        await SendDeploymentAsync(services, mapA);
        var proposal = await SendCreateAndSubmitProposalAsync(services, mapA.Id);

        var verifyTask = SendVerificationOrConflictAsync(services, proposal);
        var deploymentTask = SendDeploymentAsync(services, mapB);
        await Task.WhenAll(verifyTask, deploymentTask);
        var verification = await verifyTask;
        var mapBDeployment = await deploymentTask;
        if (verification is not null)
            Assert.True(verification.CheckedAt < mapBDeployment.CheckedAt,
                "A verification that wins the lock must commit before the deployment that changes the robot to map B.");

        var rejectedAfterMapB = await Assert.ThrowsAsync<ConflictException>(() => SendVerificationAsync(services, proposal));
        Assert.Equal(verification is null ? "MAP_NOT_DEPLOYED" : "CONFLICT", rejectedAfterMapB.Code);
        Assert.Equal(0, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.PoiVerificationRecords v JOIN dbo.PoiProposalRevisions r ON r.Id=v.ProposalRevisionId WHERE r.ProposalId='{proposal.Id}' AND v.CheckedAt > '{mapBDeployment.CheckedAt:O}';"));
    }

    [SchemaV12Fact]
    public async Task ConcurrentMapUploads_SerializeAreaVersioningAndIdempotentRetries()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.2.sql");
        await using var services = db.BuildFeatureServiceProvider();
        var package = CreateMapPackage();
        var sameRequest = Guid.NewGuid();
        var first = await Task.WhenAll(
            SendMapUploadAsync(services, Guid.Parse(Id(1)), sameRequest, package),
            SendMapUploadAsync(services, Guid.Parse(Id(1)), sameRequest, package));
        Assert.Equal(first[0].Id, first[1].Id);
        Assert.Equal(1, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.MapVersions;"));

        var parallel = await Task.WhenAll(
            SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), CreateMapPackage(marker: "parallel one")),
            SendMapUploadAsync(services, Guid.Parse(Id(2)), Guid.NewGuid(), CreateMapPackage(marker: "parallel two")));
        Assert.Equal(new[] { 2, 3 }, parallel.Select(item => item.VersionNumber).Order().ToArray());
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.MapVersions WHERE AreaKey=N'pilot';"));
    }

    [SchemaV17Fact]
    public async Task ConcurrentUploads_OfTheSamePackageInOneArea_LeaveOneVersion()
    {
        await using var db = await TestDatabase.CreateAsync();
        await using var services = db.BuildFeatureServiceProvider();
        await SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), CreateMapPackage());
        var package = CreateMapPackage(marker: "raced");

        var uploads = new[]
        {
            SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), package),
            SendMapUploadAsync(services, Guid.Parse(Id(2)), Guid.NewGuid(), package)
        };
        await Task.WhenAll(uploads.Select(upload => upload.ContinueWith(_ => { }, TaskScheduler.Default)));

        var loser = Assert.IsType<ConflictException>(Assert.Single(uploads, upload => upload.IsFaulted).Exception!.InnerException);
        Assert.Equal("MAP_PACKAGE_DUPLICATE", loser.Code);
        Assert.Equal("Gói này đã được tải lên ở Pilot Area · v2.", loser.Message);
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.MapVersions WHERE AreaKey=N'pilot';"));
    }

    [SchemaV11Fact]
    public async Task BusinessKeys_RejectDuplicates_AllowDifferentRegistrationsAndRoutes()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot.sql");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Users SET NormalizedUsername=N'USER1' WHERE Id='{Id(2)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Robots SET RobotCode=N'robot_1' WHERE Id='{Id(82)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.RouteStops SET StopOrder=1 WHERE Id='{Id(24)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.TourAllowedBranches SET RouteVariantId='{Id(31)}' WHERE Id='{Id(52)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Invitations SET RosterRowId='{Id(61)}' WHERE Id='{Id(72)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Invitations SET AccessCodeHash=CONVERT(binary(32),1) WHERE Id='{Id(72)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.RefreshTokens SET TokenHash=CONVERT(binary(32),1) WHERE Id='{Id(92)}';");
        await db.ExecuteAsync(SessionInsert(101, 71, 1, closed: true));
        await db.ExpectErrorAsync(2627, SessionInsert(102, 72, 1));

        // The fixture deliberately has two registrations by the same representative for one Tour,
        // and StopOrder=1 in three different routes. No accidental global uniqueness is allowed.
        Assert.Equal(2, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.GroupRegistrations WHERE TourId='{Id(41)}' AND RepresentativeUserId='{Id(1)}';"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.RouteStops WHERE StopOrder=1;"));
        Assert.Equal(17, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0;"));
    }

    [SchemaV11Fact]
    public async Task Sessions_ConcurrentAdmissionHasOneWinner_ExpiredRowMustBeClosed()
    {
        await using var db = await TestDatabase.CreateAsync();
        // Independent connections race the actual SQL index, not an in-memory substitute.
        var outcomes = await Task.WhenAll(
            TryInsertAsync(db, SessionInsert(101, 71, 1)),
            TryInsertAsync(db, SessionInsert(102, 71, 2)));
        Assert.Single(outcomes, number => number == 0);
        Assert.Single(outcomes, number => number == 2601);
        await db.ExecuteAsync($"UPDATE dbo.BrowserSessions SET ExpiresAt=DATEADD(day,-1,SYSDATETIMEOFFSET()) WHERE InvitationId='{Id(71)}';");
        await db.ExpectErrorAsync(2601, SessionInsert(103, 71, 3));
        await db.ExecuteAsync($"""
            BEGIN TRANSACTION;
            UPDATE dbo.BrowserSessions SET EndedAt=SYSDATETIMEOFFSET(), EndReason='EXPIRED'
            WHERE InvitationId='{Id(71)}' AND EndedAt IS NULL;
            {SessionInsert(103, 71, 3)}
            COMMIT;
            """);
        await db.ExecuteAsync(SessionInsert(104, 72, 4));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.BrowserSessions WHERE EndedAt IS NULL;"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.BrowserSessions;"));
    }

    [SchemaV11Fact]
    public async Task Branches_OnlyOnePendingPerRequesterPoint_OneAcceptedIncludingStaffDirect()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExecuteAsync(BranchInsert(111, 51, 21, 1, 41, 44, "PENDING"));
        // A different registration and variant at the SAME branch point still conflicts.
        await db.ExpectErrorAsync(2601, BranchInsert(112, 52, 21, 1, 41, 45, "PENDING"));
        await db.ExecuteAsync(BranchInsert(113, 52, 21, 2, 41, null, "PENDING"));
        await db.ExecuteAsync($"UPDATE dbo.BranchRequests SET State='EXPIRED', ResolvedAt=SYSDATETIMEOFFSET() WHERE Id='{Id(111)}';");
        await db.ExecuteAsync(BranchInsert(112, 52, 21, 1, 41, 45, "PENDING"));
        await db.ExecuteAsync($"UPDATE dbo.BranchRequests SET State='ACCEPTED', ResolvedAt=SYSDATETIMEOFFSET() WHERE Id='{Id(112)}';");
        await db.ExpectErrorAsync(2601, $"UPDATE dbo.BranchRequests SET State='ACCEPTED' WHERE Id='{Id(113)}';");
        // A different Tour can accept its own branch, and STAFF_DIRECT participates in the same limit.
        await db.ExecuteAsync(BranchInsert(114, 53, 21, 2, 42, null, "ACCEPTED"));
        await db.ExpectErrorAsync(547, BranchInsert(115, 51, 999, 2, 41, null, "REJECTED"));
    }

    [SchemaV11Fact]
    public async Task StopReferencesAndRobotClaims_RejectMissingStops_KeepHistoryAfterRouteChange()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExpectErrorAsync(547, $"UPDATE dbo.Tours SET CurrentRouteStopId='{Id(999)}' WHERE Id='{Id(41)}';");
        await db.ExpectErrorAsync(547, $"UPDATE dbo.Tours SET LastArrivedRouteStopId='{Id(999)}' WHERE Id='{Id(41)}';");
        await db.ExecuteAsync($"""
            UPDATE dbo.Tours SET ActiveRouteId='{Id(12)}', CurrentRouteStopId='{Id(22)}',
                LastArrivedRouteStopId='{Id(21)}' WHERE Id='{Id(41)}';
            UPDATE dbo.Robots SET CurrentTourId='{Id(41)}' WHERE Id='{Id(81)}';
            """);
        Assert.Equal(Guid.Parse(Id(21)), await db.ScalarAsync<Guid>($"SELECT LastArrivedRouteStopId FROM dbo.Tours WHERE Id='{Id(41)}';"));
        await db.ExpectErrorAsync(2601, $"UPDATE dbo.Robots SET CurrentTourId='{Id(41)}' WHERE Id='{Id(82)}';");
        await db.ExecuteAsync($"UPDATE dbo.Robots SET CurrentTourId=NULL WHERE Id='{Id(81)}'; UPDATE dbo.Robots SET CurrentTourId='{Id(41)}' WHERE Id='{Id(82)}';");
        // AssignedRobotId is historical; it must not be globally unique.
        await db.ExecuteAsync($"UPDATE dbo.Tours SET AssignedRobotId='{Id(81)}', State='COMPLETED' WHERE Id IN ('{Id(41)}','{Id(42)}');");
    }

    [SchemaV11Fact]
    public async Task LogRole_AllowsAppendAndRead_RejectsUpdateDelete_AndPreservesEmailStages()
    {
        await using var db = await TestDatabase.CreateAsync();
        // Reapplying permissions must be safe and keep the role's restriction.
        await db.ApplyFileAsync("permissions.sql");
        await db.ApplyFileAsync("permissions.sql");
        await db.ExecuteAsync("CREATE USER schema_test_app WITHOUT LOGIN; ALTER ROLE campus_tour_app ADD MEMBER schema_test_app;");
        await using var connection = await db.OpenAsync();
        await ExecuteAsync(connection, "EXECUTE AS USER='schema_test_app';");
        try
        {
            await ExecuteAsync(connection, $"""
                INSERT dbo.TourEvents(TourId,EventType,OccurredAt) VALUES('{Id(41)}',N'TEST',SYSDATETIMEOFFSET());
                INSERT dbo.AuditLogs(CorrelationId,[Action],EntityType,EntityId,ResultCode,OccurredAt)
                VALUES('{Id(201)}',N'EMAIL_SEND_REQUESTED',N'Invitation','{Id(71)}','PENDING',SYSDATETIMEOFFSET()),
                      ('{Id(201)}',N'EMAIL_SEND_RESULT',N'Invitation','{Id(71)}','ACCEPTED',SYSDATETIMEOFFSET()),
                      ('{Id(202)}',N'EMAIL_SEND_REQUESTED',N'Invitation','{Id(71)}','PENDING',SYSDATETIMEOFFSET()),
                      ('{Id(202)}',N'EMAIL_SEND_RESULT',N'Invitation','{Id(71)}','FAILED',SYSDATETIMEOFFSET());
                """);
            foreach (var table in new[] { "TourEvents", "AuditLogs" })
            {
                await ExpectErrorAsync(connection, 229, $"UPDATE dbo.{table} SET OccurredAt=SYSDATETIMEOFFSET();");
                await ExpectErrorAsync(connection, 229, $"DELETE FROM dbo.{table};");
                await ExecuteAsync(connection, $"SELECT COUNT(*) FROM dbo.{table};");
            }
        }
        finally { await ExecuteAsync(connection, "REVERT;"); }
        Assert.Equal(4, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.AuditLogs;"));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(DISTINCT CorrelationId) FROM dbo.AuditLogs WHERE [Action]='EMAIL_SEND_RESULT' AND ResultCode IN ('ACCEPTED','FAILED');"));
    }

    private static string SessionInsert(int id, int invitation, int hash, bool closed = false) => $"""
        INSERT dbo.BrowserSessions(Id,InvitationId,SessionTokenHash,CreatedAt,ExpiresAt,EndedAt)
        VALUES('{Id(id)}','{Id(invitation)}',CONVERT(binary(32),{hash}),SYSDATETIMEOFFSET(),
            DATEADD(hour,1,SYSDATETIMEOFFSET()),{(closed ? "SYSDATETIMEOFFSET()" : "NULL")});
        """;

    private static string BranchInsert(int id, int allowed, int point, int user, int tour, int? registration, string state) => $"""
        INSERT dbo.BranchRequests(Id,TourId,TourAllowedBranchId,BranchPointRouteStopId,RegistrationId,
            RequestedByUserId,RequestSource,State,RequestedAt)
        VALUES('{Id(id)}','{Id(tour)}','{Id(allowed)}','{Id(point)}',
            {(registration is { } value ? $"'{Id(value)}'" : "NULL")},'{Id(user)}',
            '{(registration.HasValue ? "REPRESENTATIVE" : "STAFF_DIRECT")}','{state}',SYSDATETIMEOFFSET());
        """;

    private static async Task<int> TryInsertAsync(TestDatabase db, string sql)
    {
        try { await db.ExecuteAsync(sql); return 0; }
        catch (SqlException exception) when (exception.Number is 2601 or 2627) { return exception.Number; }
    }

    private static async Task ExecuteAsync(SqlConnection connection, string sql)
    {
        using var command = new SqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<T> ScalarAsync<T>(SqlConnection connection, string sql)
    {
        using var command = new SqlCommand(sql, connection);
        return (T)(await command.ExecuteScalarAsync())!;
    }

    private static async Task ExpectErrorAsync(SqlConnection connection, int number, string sql)
    {
        var exception = await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(connection, sql));
        Assert.Equal(number, exception.Number);
    }

    private sealed class TestDatabase : IAsyncDisposable
    {
        private readonly string name = "CampusTourSchemaTest_" + Guid.NewGuid().ToString("N");
        private readonly SqlConnectionStringBuilder settings = new(
            Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")!)
            { InitialCatalog = "master", Pooling = false };
        public string ConnectionString => settings.ConnectionString;
        private bool created;

        public static async Task<TestDatabase> CreateAsync(string snapshot = "snapshot-v1.20.sql")
        {
            var db = new TestDatabase();
            try
            {
                await using (var master = new SqlConnection(db.settings.ConnectionString))
                {
                    await master.OpenAsync();
                    await SchemaV11Tests.ExecuteAsync(master, $"CREATE DATABASE [{db.name}];");
                    db.created = true;
                }
                db.settings.InitialCatalog = db.name;
                await db.ApplyFileAsync(snapshot);
                await db.SeedAsync();
                return db;
            }
            catch { await db.DisposeAsync(); throw; }
        }

        public TestClock Clock { get; } = new();

        public ServiceProvider BuildFeatureServiceProvider()
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddApplication();
            services.AddDbContext<ApplicationDbContext>(options => options.UseSqlServer(settings.ConnectionString));
            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
            services.AddScoped<EfVersionedMapPoiRepository>();
            services.AddScoped<IMapPoiRequestLock>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
            services.AddScoped<IMapVersionRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
            services.AddScoped<IPoiProposalRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
            services.AddScoped<IPoiImportRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
            services.AddScoped<IPoiVerificationRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
            services.AddScoped<IPoiManagementTransaction, EfPoiManagementTransaction>();
            services.AddScoped<IRouteRevisionRepository, EfRouteRevisionRepository>();
            services.AddScoped<IRouteManagementTransaction, EfRouteManagementTransaction>();
            services.AddScoped<IRouteManagementRepository, EfRouteManagementRepository>();
            services.AddScoped<ITourManagementRepository, EfTourManagementRepository>();
            services.AddScoped<IScheduleBlockRepository, EfScheduleBlockRepository>();
            services.AddScoped<ITourManagementTransaction, EfTourManagementTransaction>();
            services.AddScoped<IRegistrationRepository, EfRegistrationRepository>();
            services.AddScoped<IInvitationRepository, EfInvitationRepository>();
            services.AddScoped<IStudentTourViewReader, EfStudentTourViewReader>();
            services.AddSingleton<TimeProvider>(Clock);
            services.AddSingleton<IFleetTelemetryStore, InMemoryFleetTelemetryStore>();
            services.AddSingleton<IOperatorConsolePresence, UnavailableOperatorConsolePresence>();
            services.AddSingleton(new FleetCommandSettings());
            services.AddSingleton(new SmartCampus.Application.Common.Abstractions.Invitations.InvitationSettings(false, 24));
            services.AddSingleton(Shifts);
            services.AddSingleton(new MapPoiSettings(null));
            services.AddSingleton(new RouteRuleSettings(null, null));
            return services.BuildServiceProvider(validateScopes: true);
        }

        public async Task<SqlConnection> OpenAsync()
        {
            var connection = new SqlConnection(settings.ConnectionString);
            try
            {
                await connection.OpenAsync();
                await SchemaV11Tests.ExecuteAsync(connection, "SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;");
                return connection;
            }
            catch { await connection.DisposeAsync(); throw; }
        }

        public async Task ExecuteAsync(string sql)
        {
            await using var connection = await OpenAsync();
            await SchemaV11Tests.ExecuteAsync(connection, sql);
        }

        public async Task<T> ScalarAsync<T>(string sql)
        {
            await using var connection = await OpenAsync();
            using var command = new SqlCommand(sql, connection);
            return (T)(await command.ExecuteScalarAsync())!;
        }

        public async Task ExpectErrorAsync(int number, string sql)
        {
            await using var connection = await OpenAsync();
            await SchemaV11Tests.ExpectErrorAsync(connection, number, sql);
        }

        public async Task ApplyFileAsync(string file)
        {
            var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Schema", file));
            await using var connection = await OpenAsync();
            foreach (var batch in Regex.Split(script, @"^\s*GO\s*\r?$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
                if (!string.IsNullOrWhiteSpace(batch)) await SchemaV11Tests.ExecuteAsync(connection, batch);
        }

        private async Task SeedAsync()
        {
            var hasParticipationState = await ScalarAsync<int>("SELECT CASE WHEN COL_LENGTH(N'dbo.RosterRows',N'ParticipationState') IS NULL THEN 0 ELSE 1 END;") == 1;
            var rowInsert = hasParticipationState
                ? "INSERT dbo.RosterRows(Id,RegistrationId,RowNumber,RowType,DisplayName,Email,ParticipationState,IsActive,CreatedAt) VALUES('{0}','{1}',1,'INDIVIDUAL',N'Test Student {2}',N'student{2}@example.invalid','ACCEPTED',1,SYSDATETIMEOFFSET());"
                : "INSERT dbo.RosterRows(Id,RegistrationId,RowNumber,RowType,DisplayName,Email,IsActive,CreatedAt) VALUES('{0}','{1}',1,'INDIVIDUAL',N'Test Student {2}',N'student{2}@example.invalid',1,SYSDATETIMEOFFSET());";
            for (var i = 1; i <= 2; i++)
                await ExecuteAsync($"""
                    INSERT dbo.Users(Id,Username,NormalizedUsername,PasswordHash,FullName,IsActive,CreatedAt)
                    VALUES('{Id(i)}',N'user{i}',N'USER{i}',N'test-only',N'Test User {i}',1,SYSDATETIMEOFFSET());
                    INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
                    VALUES('{Id(80+i)}',N'robot_{i}','EMULATOR',0x01,1,0,SYSDATETIMEOFFSET());
                    INSERT dbo.RefreshTokens(Id,UserId,TokenHash,ExpiresAt,CreatedAt)
                    VALUES('{Id(90+i)}','{Id(i)}',CONVERT(binary(32),{i}),DATEADD(day,1,SYSDATETIMEOFFSET()),SYSDATETIMEOFFSET());
                    """);
            await ExecuteAsync($"""
                INSERT dbo.Pois(Id,Name,MapKey,MapFrame,X,Y,Yaw,IsActive,CreatedAt)
                VALUES('{Id(10)}',N'Branch Point',N'test-map',N'map',0,0,0,1,SYSDATETIMEOFFSET());
                """);
            for (var i = 1; i <= 3; i++)
                await ExecuteAsync($"""
                    INSERT dbo.Routes(Id,Name,MapKey,MapFrame,StartX,StartY,StartYaw,EndMode,IsActive,CreatedAt)
                    VALUES('{Id(10+i)}',N'Route {i}',N'test-map',N'map',0,0,0,'LAST_POI',1,SYSDATETIMEOFFSET());
                    INSERT dbo.RouteStops(Id,RouteId,PoiId,StopOrder,DwellSeconds,HeadStepsJson)
                    VALUES('{Id(20+i)}','{Id(10+i)}','{Id(10)}',1,30,N'[]');
                    """);
            await ExecuteAsync($"""
                INSERT dbo.RouteStops(Id,RouteId,PoiId,StopOrder,DwellSeconds,HeadStepsJson)
                VALUES('{Id(24)}','{Id(11)}','{Id(10)}',2,30,N'[]');
                """);
            for (var i = 1; i <= 2; i++)
                await ExecuteAsync($"""
                    INSERT dbo.RouteVariants(Id,BaseRouteId,BranchPointRouteStopId,VariantRouteId,VariantBranchStopId,Name,IsActive,CreatedAt)
                    VALUES('{Id(30+i)}','{Id(11)}','{Id(21)}','{Id(11+i)}','{Id(21+i)}',N'Variant {i}',1,SYSDATETIMEOFFSET());
                    INSERT dbo.Tours(Id,Name,RouteId,ActiveRouteId,ScheduledStartAt,State,IsHeld,CreatedByUserId,CreatedAt)
                    VALUES('{Id(40+i)}',N'Tour {i}','{Id(11)}','{Id(11)}',SYSDATETIMEOFFSET(),'SCHEDULED',0,'{Id(1)}',SYSDATETIMEOFFSET());
                    INSERT dbo.GroupRegistrations(Id,TourId,RepresentativeUserId,SchoolName,GroupName,ContactName,ContactEmail,State,SubmittedAt,CreatedAt)
                    VALUES('{Id(43+i)}','{Id(41)}','{Id(1)}',N'Test School',N'Group {i}',N'Test Contact',N'contact{i}@example.invalid','APPROVED',SYSDATETIMEOFFSET(),SYSDATETIMEOFFSET());
                    {string.Format(rowInsert, Id(60+i), Id(43+i), i)}
                    INSERT dbo.Invitations(Id,RosterRowId,AccessCodeHash,AccessCodeProtected,AccessVersion,CodeIssuedAt,ExpiresAt,CreatedAt)
                    VALUES('{Id(70+i)}','{Id(60+i)}',CONVERT(binary(32),{i}),0x01,1,SYSDATETIMEOFFSET(),DATEADD(day,1,SYSDATETIMEOFFSET()),SYSDATETIMEOFFSET());
                    INSERT dbo.TourAllowedBranches(Id,TourId,RouteVariantId,IsEnabled,CreatedAt)
                    VALUES('{Id(50+i)}','{Id(41)}','{Id(30+i)}',1,SYSDATETIMEOFFSET());
                    """);
            await ExecuteAsync($"""
                INSERT dbo.TourAllowedBranches(Id,TourId,RouteVariantId,IsEnabled,CreatedAt)
                VALUES('{Id(53)}','{Id(42)}','{Id(31)}',1,SYSDATETIMEOFFSET());
                """);
        }

        public async ValueTask DisposeAsync()
        {
            if (!created) return;
            // The name is generated internally, never read from the supplied connection string.
            var masterSettings = new SqlConnectionStringBuilder(settings.ConnectionString) { InitialCatalog = "master" };
            await using var master = new SqlConnection(masterSettings.ConnectionString);
            await master.OpenAsync();
            await SchemaV11Tests.ExecuteAsync(master, $"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}];");
            created = false;
        }
    }

    private static byte[] CreateMapPackage(string origin = "0, 0, 0", string marker = "pilot map")
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var yaml = archive.CreateEntry("pilot.yaml");
            using (var yamlStream = yaml.Open())
                yamlStream.Write(Encoding.UTF8.GetBytes($"# {marker}\nimage: pilot.pgm\nmode: trinary\nresolution: 1\norigin: [{origin}]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n"));
            var pgm = archive.CreateEntry("pilot.pgm");
            using var output = pgm.Open();
            output.Write(Encoding.ASCII.GetBytes("P2\n2 2\n255\n255 255 255 255\n"));
        }
        return stream.ToArray();
    }

    private sealed class TestClock : TimeProvider
    {
        public DateTimeOffset? Fixed { get; set; }
        public override DateTimeOffset GetUtcNow() => Fixed ?? base.GetUtcNow();
    }

    /// <summary>The shifts of docs/lich-tour-theo-ca.md §7.</summary>
    private static readonly TourScheduleSettings Shifts = new([
        new() { Code = "S1", Name = "Ca sáng", Start = "08:00", End = "10:00" },
        new() { Code = "S2", Name = "Ca chiều 1", Start = "13:00", End = "15:00" },
        new() { Code = "S3", Name = "Ca chiều 2", Start = "16:00", End = "18:00" }], 60);

    /// <summary>The Tour start of a shift, the given number of campus days from today.</summary>
    private static DateTimeOffset TourSlot(int days, string shift) => TourSchedule.TourStart(
        DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime).AddDays(days), Shifts.Shifts.Single(item => item.Code == shift));

    private static async Task<MapVersionView> SendMapUploadAsync(IServiceProvider services, Guid actor,
        Guid requestId, byte[] package)
    {
        await using var scope = services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(new CreateMapVersionCommand(actor,
            new("pilot", "Pilot Area", requestId, package)));
    }

    private static async Task<MapDeploymentCheckView> SendDeploymentAsync(IServiceProvider services, MapVersionView map)
    {
        await using var scope = services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), map.Id,
            new(Guid.NewGuid(), "physical_1", map.PackageSha256, true, true, "Manually recorded localization and display check.")));
    }

    private static Task<MapDeploymentCheckView> RecordDeploymentAsync(ISender sender, MapVersionView map) =>
        sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), map.Id,
            new(Guid.NewGuid(), "physical_1", map.PackageSha256, true, true, "Manually recorded localization and display check.")));

    private static async Task<PoiProposalView> SendCreateAndSubmitProposalAsync(IServiceProvider services, Guid mapVersionId)
    {
        await using var scope = services.CreateAsyncScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();
        var proposal = await sender.Send(new CreatePoiProposalCommand(Guid.Parse(Id(2)),
            new(Guid.NewGuid(), new(mapVersionId, "Library", "Entrance", null, 0.5m, 0.5m, 0m, "FRONT", "Nội dung thuyết minh", null))));
        return await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), proposal.CurrentRevision, proposal.RowVersion)));
    }

    private static async Task<PoiVerificationView> SendVerificationAsync(IServiceProvider services, PoiProposalView proposal)
    {
        await using var scope = services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id,
            proposal.CurrentRevision, new(Guid.NewGuid(), proposal.CurrentRevision, proposal.RowVersion,
                "physical_1", "PASS", true, true, true, true, null, "Manual verification evidence.")));
    }

    private static async Task<PoiVerificationView?> SendVerificationOrConflictAsync(IServiceProvider services, PoiProposalView proposal)
    {
        try { return await SendVerificationAsync(services, proposal); }
        catch (ConflictException exception)
        {
            Assert.Equal("MAP_NOT_DEPLOYED", exception.Code);
            return null;
        }
    }
}
