using System.Text.RegularExpressions;
using System.IO.Compression;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MediatR;
using Microsoft.Data.SqlClient;
using SmartCampus.Application;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Repositories;
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

    [SchemaV13Fact]
    public async Task FixedRouteLifecycle_FailThenNewRevisionPass_KeepsEveryVersionAndRun()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.3.sql");
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,1,0,SYSDATETIMEOFFSET()); INSERT dbo.UserRoles(UserId,Role) VALUES('{Id(1)}',N'TechnicalStaff'),('{Id(2)}',N'Staff');");
        await using var services = db.BuildFeatureServiceProvider();
        await using var scope = services.CreateAsyncScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();
        var map = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), CreateMapPackage())));
        await sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), map.Id,
            new(Guid.NewGuid(), "physical_1", map.PackageSha256, true, true, "Manual localization and display check.")));
        var proposal = await sender.Send(new CreatePoiProposalCommand(Guid.Parse(Id(2)),
            new(Guid.NewGuid(), new(map.Id, "Library", "Entrance", null, 0.5m, 0.5m, 0m, "FRONT"))));
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion)));
        await sender.Send(new RecordPoiVerificationCommand(Guid.Parse(Id(1)), proposal.Id, 1,
            new(Guid.NewGuid(), 1, proposal.RowVersion, "physical_1", "PASS", true, true, true, true, null, "Manual POI PASS.")));
        var verifiedPoiNavigationFingerprint = proposal.Revision.NavigationFingerprint;

        var draft1 = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), null,
            new(Guid.NewGuid(), 0, "Pilot", null, map.Id, 0.5m, 0.5m, 0m, "LAST_POI", null, null, null,
                [new(proposal.Revision.Id, 30, [new("FRONT", 30)])])));
        Assert.Equal("NOT_TESTED", draft1.VerificationStatus);
        Assert.Equal(map.PackageSha256, draft1.MapPackageSha256);
        await sender.Send(new SubmitRouteRevisionCommand(Guid.Parse(Id(2)), draft1.RouteId, draft1.RevisionId,
            new(Guid.NewGuid(), 1)));

        // A later deployment of map B must block a route test for map A until A is deployed again.
        var mapB = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), CreateMapPackage())));
        await sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), mapB.Id,
            new(Guid.NewGuid(), "physical_1", mapB.PackageSha256, true, true, "Manual check after deploying map B.")));
        var mapMismatch = await Assert.ThrowsAsync<ConflictException>(() => sender.Send(new RecordRouteTestRunCommand(Guid.Parse(Id(1)), draft1.RouteId, draft1.RevisionId,
            new(Guid.NewGuid(), "physical_1", Guid.Parse(Id(2)), "FAIL", false, true, true, 240,
                "Map A was not deployed.", "Expected rejection while map B is current."))));
        Assert.Equal("MAP_NOT_CURRENTLY_DEPLOYED", mapMismatch.Code);
        await sender.Send(new RecordMapDeploymentCommand(Guid.Parse(Id(1)), map.Id,
            new(Guid.NewGuid(), "physical_1", map.PackageSha256, true, true, "Manual check after restoring map A.")));

        var failed = await sender.Send(new RecordRouteTestRunCommand(Guid.Parse(Id(1)), draft1.RouteId, draft1.RevisionId,
            new(Guid.NewGuid(), "physical_1", Guid.Parse(Id(2)), "FAIL", false, true, true, 240,
                "Did not arrive at the stop.", "Human-observed failed whole-route run.")));
        Assert.Equal("FAIL", failed.VerificationStatus);

        var draft2 = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), draft1.RouteId,
            new(Guid.NewGuid(), 1, "Pilot", "Corrected start pose", map.Id, 1m, 0.5m, 0m, "LAST_POI", null, null, null,
                [new(proposal.Revision.Id, 30, [new("FRONT", 30)])])));
        Assert.Equal(2, draft2.RevisionNumber);
        Assert.Equal("NOT_TESTED", draft2.VerificationStatus);
        await sender.Send(new SubmitRouteRevisionCommand(Guid.Parse(Id(2)), draft2.RouteId, draft2.RevisionId,
            new(Guid.NewGuid(), 2)));
        var passed = await sender.Send(new RecordRouteTestRunCommand(Guid.Parse(Id(1)), draft2.RouteId, draft2.RevisionId,
            new(Guid.NewGuid(), "physical_1", Guid.Parse(Id(2)), "PASS", true, true, true, 260,
                null, "Human-observed successful whole-route run.")));
        Assert.Equal("PASS", passed.VerificationStatus);
        Assert.Equal("INCOMPLETE_CONTENT_AUDIO_DATA", passed.DurationStatus);
        Assert.Equal(30, passed.DwellDurationSeconds);

        // Content-only POI revisions keep the navigation fingerprint and may reuse the route PASS.
        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion,
                new(map.Id, "Library entrance", "Entrance", "Narration wording corrected", 0.5m, 0.5m, 0m, "FRONT"))));
        Assert.Equal(verifiedPoiNavigationFingerprint, proposal.Revision.NavigationFingerprint);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 2, proposal.RowVersion)));
        var contentOnlyDraft = await sender.Send(new SaveRouteRevisionCommand(Guid.Parse(Id(2)), draft1.RouteId,
            new(Guid.NewGuid(), 2, "Pilot", "Content wording update", map.Id, 1m, 0.5m, 0m, "LAST_POI", null, null, null,
                [new(proposal.Revision.Id, 30, [new("FRONT", 30)])])));
        Assert.Equal(3, contentOnlyDraft.RevisionNumber);
        Assert.Equal("PASS", contentOnlyDraft.VerificationStatus);
        Assert.Equal(passed.EffectiveTestRunId, contentOnlyDraft.EffectiveTestRunId);
        await sender.Send(new SubmitRouteRevisionCommand(Guid.Parse(Id(2)), contentOnlyDraft.RouteId, contentOnlyDraft.RevisionId,
            new(Guid.NewGuid(), 3)));

        var history = await sender.Send(new GetRouteRevisionQuery(contentOnlyDraft.RouteId, null, true));
        Assert.Equal(3, history.RevisionHistory.Count);
        Assert.Equal(2, history.TestRuns.Count);
        Assert.Equal("FAIL", history.TestRuns[0].ResultCode);
        Assert.Equal("PASS", history.TestRuns[1].ResultCode);
        Assert.Equal("FAIL", (await sender.Send(new GetRouteRevisionQuery(draft1.RouteId, draft1.RevisionId, false))).VerificationStatus);
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
        await using var db = await TestDatabase.CreateAsync();
        await db.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68';");
        await db.ApplyFileAsync("upgrade-v1.1-to-v1.2-map-poi.sql");
        await db.ApplyFileAsync("upgrade-v1.1-to-v1.2-map-poi.sql");
        Assert.Equal(24, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0;"));
        Assert.Equal("b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43",
            await db.ScalarAsync<string>("SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties WHERE name=N'CampusTourBootstrapHash';"));
        Assert.Equal("USER1", await db.ScalarAsync<string>($"SELECT NormalizedUsername FROM dbo.Users WHERE Id='{Id(1)}';"));
    }

    [SchemaV12Fact]
    public async Task VersionedMapAndPoiWorkflow_PersistsManualEvidenceAndExactRevisions()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.2.sql");
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,1,0,SYSDATETIMEOFFSET());");
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
            new(Guid.NewGuid(), new(map.Id, "Library", "Entrance", null, 0.5m, 0.5m, 0m, "FRONT"))));
        Assert.Equal("NOT_CHECKED", proposal.Revision.NavigationStatus);
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
                new(map.Id, "Library", "Entrance", "Moved to clear aisle", 1.5m, 0.5m, 0m, "FRONT"))));
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
                new(map.Id, "Library entrance", "Entrance", "Content-only correction", 1.5m, 0.5m, 0m, "FRONT"))));
        Assert.Equal("PASS", proposal.Revision.NavigationStatus);
        Assert.Equal(passed.ProposalRevisionId, proposal.Revision.VerificationSourceRevisionId);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 3, proposal.RowVersion)));
        Assert.Empty(await sender.Send(new ListPoiVerificationQueueQuery(map.Id)));

        // A content-only submitted revision inherits the exact prior navigation result and remains editable.
        proposal = await sender.Send(new CreatePoiRevisionCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 3, proposal.RowVersion,
                new(map.Id, "Library entry", "Entrance", "Second content correction", 1.5m, 0.5m, 0m, "FRONT"))));
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
                new(map.Id, "Library entrance", "Entrance", "Third content correction", 1.5m, 0.5m, 0m, "FRONT"))));
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
                new(map.Id, "Library entrance", "Entrance", "Move to another free cell", 0.5m, 1.5m, 0m, "FRONT"))));
        Assert.Equal("NOT_CHECKED", proposal.Revision.NavigationStatus);
        proposal = await sender.Send(new SubmitPoiProposalCommand(Guid.Parse(Id(2)), proposal.Id,
            new(Guid.NewGuid(), 6, proposal.RowVersion)));
        var queueAfterMovement = await sender.Send(new ListPoiVerificationQueueQuery(map.Id));
        Assert.Single(queueAfterMovement);
        Assert.Equal("NOT_CHECKED", queueAfterMovement[0].NavigationStatus);

        var history = await sender.Send(new GetPoiHistoryQuery(proposal.Id));
        Assert.Equal(6, history.Revisions.Count);
        Assert.Equal(new[] { "FAIL", "PASS", "FAIL", "FAIL" }, history.VerificationRecords.Select(item => item.ResultCode).ToArray());
    }

    [SchemaV12Fact]
    public async Task PoiVerification_RequiresCurrentMapDeployment_AndAllowsANewDeploymentOfPriorMap()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.2.sql");
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,1,0,SYSDATETIMEOFFSET());");
        await using var services = db.BuildFeatureServiceProvider();
        await using var scope = services.CreateAsyncScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();
        var package = CreateMapPackage();
        var mapA = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), package)));
        var mapB = await sender.Send(new CreateMapVersionCommand(Guid.Parse(Id(1)),
            new("pilot", "Pilot Area", Guid.NewGuid(), package)));
        await RecordDeploymentAsync(sender, mapA);

        var proposal = await sender.Send(new CreatePoiProposalCommand(Guid.Parse(Id(2)),
            new(Guid.NewGuid(), new(mapA.Id, "Library", "Entrance", null, 0.5m, 0.5m, 0m, "FRONT"))));
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

    [SchemaV12Fact]
    public async Task ConcurrentMapChangeAndPoiVerification_CannotCommitPassAfterDifferentMapBecomesCurrent()
    {
        await using var db = await TestDatabase.CreateAsync("snapshot-v1.2.sql");
        await db.ExecuteAsync($"INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt) VALUES('{Id(83)}',N'physical_1','PHYSICAL',0x02,1,0,SYSDATETIMEOFFSET());");
        await using var services = db.BuildFeatureServiceProvider();
        var package = CreateMapPackage();
        var mapA = await SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), package);
        var mapB = await SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), package);
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
        Assert.Equal("MAP_NOT_DEPLOYED", rejectedAfterMapB.Code);
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
            SendMapUploadAsync(services, Guid.Parse(Id(1)), Guid.NewGuid(), package),
            SendMapUploadAsync(services, Guid.Parse(Id(2)), Guid.NewGuid(), package));
        Assert.Equal(new[] { 2, 3 }, parallel.Select(item => item.VersionNumber).Order().ToArray());
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.MapVersions WHERE AreaKey=N'pilot';"));
    }

    [SchemaV11Fact]
    public async Task BusinessKeys_RejectDuplicates_AllowDifferentRegistrationsAndRoutes()
    {
        await using var db = await TestDatabase.CreateAsync();
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
        private bool created;

        public static async Task<TestDatabase> CreateAsync(string snapshot = "snapshot.sql")
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
            services.AddScoped<IPoiVerificationRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
            services.AddScoped<IPoiManagementTransaction, EfPoiManagementTransaction>();
            services.AddScoped<IRouteRevisionRepository, EfRouteRevisionRepository>();
            services.AddScoped<IRouteManagementTransaction, EfRouteManagementTransaction>();
            services.AddSingleton(TimeProvider.System);
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
                    INSERT dbo.RosterRows(Id,RegistrationId,RowNumber,RowType,DisplayName,Email,IsActive,CreatedAt)
                    VALUES('{Id(60+i)}','{Id(43+i)}',1,'INDIVIDUAL',N'Test Student {i}',N'student{i}@example.invalid',1,SYSDATETIMEOFFSET());
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
            new(Guid.NewGuid(), new(mapVersionId, "Library", "Entrance", null, 0.5m, 0.5m, 0m, "FRONT"))));
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
