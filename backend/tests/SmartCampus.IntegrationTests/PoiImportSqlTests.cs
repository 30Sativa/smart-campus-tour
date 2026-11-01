using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class PoiImportSqlTests
{
    private const string Robot = "amr_import";

    [SchemaV11Fact]
    public async Task Preview_ReportsEachFile_AndWritesNothing()
    {
        await using var h = await Harness.Create();

        var preview = await h.Preview(File("a.yaml", "POI_A"), File("b.yaml", "POI_B", mapYaml: "other.yaml"));

        Assert.False(preview.CanImport);
        Assert.Equal(PoiImportActions.Create, preview.Files[0].Action);
        Assert.Equal(1.5m, preview.Files[0].X);
        Assert.True(preview.Files[0].Verified);
        Assert.Equal("MAP_YAML_MISMATCH", preview.Files[1].ErrorCode);
        Assert.Contains("other.yaml", preview.Files[1].ErrorMessage);
        await h.AssertNothingImported();
    }

    [SchemaV11Fact]
    public async Task Preview_ReturnsEveryValidationCode()
    {
        await using var h = await Harness.Create();

        var preview = await h.Preview(
            File("map.yaml", "A1", mapYaml: "other.yaml"),
            File("frame.yaml", "A2", frame: "odom"),
            File("yaw.yaml", "A3", quaternion: "{x: 0, y: 0, z: 0.7071, w: 0.7071}"),
            File("wall.yaml", "A4", x: 0.5m, y: 0.5m),
            File("outside.yaml", "A5", x: 90m),
            File("twin1.yaml", "A6"),
            File("twin2.yaml", "A6", x: 2.5m),
            new PoiImportUpload("note.txt", [1]),
            new PoiImportUpload("big.yaml", new byte[PoiCaptureFileParser.MaxFileBytes + 1]));

        Assert.Equal(
            ["MAP_YAML_MISMATCH", "FRAME_MISMATCH", "YAW_QUATERNION_MISMATCH", "POSE_NOT_FREE", "POSE_NOT_FREE",
             "DUPLICATE_SOURCE_ID", "DUPLICATE_SOURCE_ID", "INVALID_FILE_TYPE", "FILE_TOO_LARGE"],
            preview.Files.Select(file => file.ErrorCode));
        Assert.All(preview.Files, file => Assert.False(string.IsNullOrWhiteSpace(file.ErrorMessage)));
    }

    [SchemaV11Fact]
    public async Task VerifiedFile_CreatesAnHonestPoseCaptureRecord_WithRawEvidenceAndAudit()
    {
        await using var h = await Harness.Create();
        var file = File("poi_a.yaml", "POI_A", name: "POI tạm");

        var result = await h.Import([file]);

        var proposalId = Assert.Single(result.CreatedProposalIds);
        await using var db = h.Context();
        var proposal = await db.PoiProposals.AsNoTracking().SingleAsync();
        Assert.Equal(proposalId, proposal.Id);
        Assert.Equal("POI_A", proposal.SourcePoiId);
        Assert.Equal("pilot", proposal.SourceAreaKey);
        Assert.Equal(h.TechnicalId, proposal.CreatedByUserId);

        var revision = await db.PoiProposalRevisions.AsNoTracking().SingleAsync();
        Assert.Equal("POI tạm", revision.Name);
        Assert.Equal("FRONT", revision.CameraPreset);
        Assert.Null(revision.NarrationText);
        Assert.Equal(1.5m, revision.X);
        Assert.Equal(1, await db.PoiProposalSubmissions.CountAsync());

        var record = await db.PoiVerificationRecords.AsNoTracking().SingleAsync();
        Assert.Equal("PASS", record.ResultCode);
        Assert.Equal("POSE_CAPTURE", record.VerificationMethod);
        Assert.Null(record.Reached);
        Assert.Null(record.Stopped);
        Assert.Null(record.LocalizationPassed);
        Assert.Null(record.CameraPresetConfirmed);
        Assert.Equal(h.TechnicalId, record.CheckedByUserId);
        Assert.Equal(file.Content, record.SourceFileContent);
        Assert.Equal(SHA256.HashData(file.Content), record.SourceFileSha256);
        Assert.Contains(Harness.Note, record.EvidenceNote);
        Assert.Contains("poi_a.yaml", record.EvidenceNote);

        var actions = await db.AuditLogs.AsNoTracking().Where(audit => audit.ActorUserId == h.TechnicalId).Select(audit => audit.Action).ToArrayAsync();
        Assert.Contains("POI_POSE_IMPORT_COMPLETED", actions);
        Assert.Contains("POI_PROPOSAL_CREATED", actions);
        Assert.Contains("POI_POSE_CAPTURE_VERIFIED", actions);
    }

    [SchemaV11Fact]
    public async Task OneBadFile_ImportsNothing_AndNamesTheFile()
    {
        await using var h = await Harness.Create();

        var error = await Assert.ThrowsAsync<ConflictException>(() =>
            h.Import([File("good.yaml", "POI_A"), File("bad.yaml", "POI_B", frame: "odom")]));

        Assert.Equal("POI_IMPORT_INVALID", error.Code);
        Assert.Contains("FRAME_MISMATCH", Assert.Single(error.FieldErrors!["bad.yaml"]));
        await h.AssertNothingImported();
    }

    [SchemaV11Fact]
    public async Task ZipUpload_ImportsItsFiles()
    {
        await using var h = await Harness.Create();
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var file in new[] { File("a.yaml", "POI_A"), File("b.yaml", "POI_B", verified: false) })
            {
                using var entry = archive.CreateEntry(file.FileName).Open();
                entry.Write(file.Content);
            }

        var result = await h.Import([new PoiImportUpload("poi.zip", stream.ToArray())]);

        Assert.Equal(2, result.CreatedProposalIds.Count);
    }

    [SchemaV11Fact]
    public async Task Retry_ReturnsTheSameResult_AndAReusedRequestIdWithOtherContentConflicts()
    {
        await using var h = await Harness.Create();
        var request = Guid.NewGuid();
        var file = File("a.yaml", "POI_A");

        var first = await h.Import([file], request);
        var retry = await h.Import([file], request);

        Assert.Equal(first.CreatedProposalIds, retry.CreatedProposalIds);
        Assert.Equal(first.Files.Select(item => item.ProposalRevisionId), retry.Files.Select(item => item.ProposalRevisionId));
        await h.AssertCounts(proposals: 1, revisions: 1, verifications: 1);
        var conflict = await Assert.ThrowsAsync<ConflictException>(() => h.Import([File("a.yaml", "POI_B")], request));
        Assert.Equal("IDEMPOTENCY_CONFLICT", conflict.Code);
    }

    [SchemaV11Fact]
    public async Task SameFileOnTheSameMap_IsNoChange_EvenAfterTheRobotMovedOff()
    {
        await using var h = await Harness.Create();
        var file = File("a.yaml", "POI_A");
        var first = await h.Import([file]);
        await h.RecordDeployment(passed: false);

        Assert.Equal(PoiImportActions.NoChange, Assert.Single((await h.Preview(file)).Files).Action);
        var again = await h.Import([file]);

        var imported = Assert.Single(again.Files);
        Assert.Equal(PoiImportActions.NoChange, imported.Action);
        Assert.Equal(first.Files[0].ProposalRevisionId, imported.ProposalRevisionId);
        Assert.Empty(again.CreatedProposalIds);
        Assert.Empty(again.UpdatedProposalIds);
        await h.AssertCounts(proposals: 1, revisions: 1, verifications: 1);
    }

    [SchemaV11Fact]
    public async Task SameSourceId_AddsARevision_AndKeepsStaffContent()
    {
        await using var h = await Harness.Create();
        var created = await h.Import([File("a.yaml", "POI_A")]);
        var proposalId = created.CreatedProposalIds[0];
        await h.AddStaffContent(proposalId, "Thư viện", "Đây là thư viện.");

        var moved = File("a2.yaml", "poi_a", x: 2.5m, name: "Tên trong tệp");
        Assert.Equal(PoiImportActions.NewRevision, Assert.Single((await h.Preview(moved)).Files).Action);
        var updated = await h.Import([moved]);

        Assert.Equal([proposalId], updated.UpdatedProposalIds);
        await using var db = h.Context();
        Assert.Equal(1, await db.PoiProposals.CountAsync());
        var current = await db.PoiProposalRevisions.AsNoTracking().OrderByDescending(item => item.RevisionNumber).FirstAsync();
        Assert.Equal(3, current.RevisionNumber);
        Assert.Equal(2.5m, current.X);
        Assert.Equal("Thư viện", current.Name);
        Assert.Equal("Đây là thư viện.", current.NarrationText);
        var view = await h.Send(new GetPoiProposalQuery(proposalId));
        Assert.Equal("PASS", view.Revision.NavigationStatus);
        Assert.Equal(current.Id, view.Revision.VerificationSourceRevisionId);
    }

    [SchemaV11Fact]
    public async Task UnverifiedFile_GoesToTheManualQueue_WithoutAnyRecord()
    {
        await using var h = await Harness.Create();

        var result = await h.Import([File("a.yaml", "POI_A", verified: false)]);

        await h.AssertCounts(proposals: 1, revisions: 1, verifications: 0);
        var queued = Assert.Single(await h.Send(new ListPoiVerificationQueueQuery(h.MapId)));
        Assert.Equal(result.CreatedProposalIds[0], queued.ProposalId);
        Assert.Equal("POI_A", queued.SourcePoiId);

        var manual = await h.Send(new RecordPoiVerificationCommand(h.TechnicalId, queued.ProposalId, 1, new(Guid.NewGuid(), 1, queued.RowVersion, Robot,
            "PASS", true, true, true, true, null, "Kiểm tra tại chỗ.")));
        Assert.Equal("MANUAL_CHECK", manual.VerificationMethod);
        Assert.True(manual.Reached);
        Assert.Null(manual.SourceFileSha256);
    }

    [SchemaV11Fact]
    public async Task UnverifiedFile_DoesNotNeedTheRobotOnThisMap()
    {
        await using var h = await Harness.Create();
        await h.RecordDeployment(passed: false, robot: "amr_backup");
        await h.RecordDeployment(passed: true, robot: "amr_backup");
        await h.RecordDeployment(passed: false);

        var preview = await h.Preview(File("a.yaml", "POI_A", verified: false), File("b.yaml", "POI_B"));

        Assert.Equal(PoiImportActions.Create, preview.Files[0].Action);
        Assert.Equal("MAP_NOT_DEPLOYED", preview.Files[1].ErrorCode);
    }

    [SchemaV11Fact]
    public async Task IneligibleMap_BlocksEveryFile()
    {
        await using var h = await Harness.Create(deployed: false);

        var preview = await h.Preview(File("a.yaml", "POI_A", verified: false));

        Assert.Equal("TECHNICAL_CHECK_PENDING", Assert.Single(preview.Files).ErrorCode);
    }

    [SchemaV11Fact]
    public async Task ContentOnlyRevision_KeepsThePoseCapturePass_AndARouteCanUseIt()
    {
        await using var h = await Harness.Create();
        var proposalId = (await h.Import([File("a.yaml", "POI_A")])).CreatedProposalIds[0];

        var noNarration = await h.Send(new GetPoiProposalQuery(proposalId));
        Assert.Equal("PASS", noNarration.Revision.NavigationStatus);
        Assert.Equal("POSE_CAPTURE", noNarration.Revision.VerificationMethod);
        Assert.Equal("POI_A", noNarration.SourcePoiId);
        var rejected = await Assert.ThrowsAsync<ConflictException>(() => h.SaveRoute(noNarration.Revision.Id));
        Assert.Equal("POI_NARRATION_REQUIRED", rejected.Code);

        var content = await h.AddStaffContent(proposalId, "Thư viện", "Đây là thư viện.");

        Assert.Equal("PASS", content.Revision.NavigationStatus);
        Assert.Equal("POSE_CAPTURE", content.Revision.VerificationMethod);
        Assert.Equal(noNarration.Revision.NavigationFingerprint, content.Revision.NavigationFingerprint);
        var route = await h.SaveRoute(content.Revision.Id);
        Assert.Equal("Đây là thư viện.", Assert.Single(route.Stops).NarrationText);
    }

    [SchemaV11Fact]
    public async Task NewerFail_SupersedesThePoseCapturePass_AndMovingRequiresANewCheck()
    {
        await using var h = await Harness.Create();
        var proposalId = (await h.Import([File("a.yaml", "POI_A")])).CreatedProposalIds[0];
        var content = await h.AddStaffContent(proposalId, "Thư viện", "Đây là thư viện.");
        var submitted = await h.Send(new SubmitPoiProposalCommand(h.StaffId, proposalId, new(Guid.NewGuid(), 2, content.RowVersion)));

        await h.Send(new RecordPoiVerificationCommand(h.TechnicalId, proposalId, 2, new(Guid.NewGuid(), 2, submitted.RowVersion, Robot,
            "FAIL", false, true, true, true, "Robot không tới được điểm này.", "Kiểm tra tại chỗ.")));

        var failed = await h.Send(new GetPoiProposalQuery(proposalId));
        Assert.Equal("FAIL", failed.Revision.NavigationStatus);
        Assert.Equal("MANUAL_CHECK", failed.Revision.VerificationMethod);
        var stale = await Assert.ThrowsAsync<ConflictException>(() => h.SaveRoute(failed.Revision.Id));
        Assert.Equal("POI_VERIFICATION_REQUIRED", stale.Code);

        var moved = await h.Send(new CreatePoiRevisionCommand(h.StaffId, proposalId, new(Guid.NewGuid(), 2, failed.RowVersion,
            new(h.MapId, "Thư viện", "Nhập từ tệp", null, 2.5m, 1.5m, 0m, "FRONT", "Đây là thư viện."))));
        Assert.Equal("NOT_CHECKED", moved.Revision.NavigationStatus);
    }

    [SchemaV11Fact]
    public async Task ClearanceFailure_IsShownPerFileInPreview_AndImportRefusesTheWholeSet()
    {
        await using var h = await Harness.Create();
        var nearWall = File("near.yaml", "POI_NEAR", x: 1.1m, y: 0.5m);
        var open = File("open.yaml", "POI_OPEN");

        var preview = await h.Preview(nearWall, open);

        Assert.False(preview.CanImport);
        Assert.Equal(MapPoiErrorCodes.PoseClearanceInsufficient, preview.Files[0].ErrorCode);
        Assert.Equal(ClearanceMessage, preview.Files[0].ErrorMessage);
        Assert.Null(preview.Files[1].ErrorCode);
        var refused = await Assert.ThrowsAsync<ConflictException>(() => h.Import([nearWall, open]));
        Assert.Equal("POI_IMPORT_INVALID", refused.Code);
        Assert.Contains(ClearanceMessage, Assert.Single(refused.FieldErrors!["near.yaml"]));
        await h.AssertNothingImported();
    }

    [SchemaV11Fact]
    public async Task NewCapture_OfAPoiWithAnOlderCameraValue_IsRefusedUntilStaffPicksAValidOne()
    {
        await using var h = await Harness.Create();
        var proposalId = (await h.Import([File("a.yaml", "POI_A")])).CreatedProposalIds[0];
        await h.Database.ExecuteAsync($"UPDATE dbo.PoiProposalRevisions SET CameraPreset=N'HEAD_LEFT' WHERE ProposalId='{proposalId}';");
        var recapture = File("a2.yaml", "POI_A", x: 2.5m);

        var preview = await h.Preview(recapture);

        var file = Assert.Single(preview.Files);
        Assert.Equal(MapPoiErrorCodes.CameraPresetInvalid, file.ErrorCode);
        Assert.Contains(PoiCameraPresets.InvalidMessage, file.ErrorMessage);
        var refused = await Assert.ThrowsAsync<ConflictException>(() => h.Import([recapture]));
        Assert.Equal("POI_IMPORT_INVALID", refused.Code);
        await h.AssertCounts(1, 1, 1);

        var staffStillBlocked = await Assert.ThrowsAsync<ValidationException>(() => h.ReviseCamera(proposalId, "HEAD_LEFT"));
        Assert.Equal(MapPoiErrorCodes.CameraPresetInvalid, Assert.Single(staffStillBlocked.Errors).ErrorCode);
        var fixedCamera = await h.ReviseCamera(proposalId, "right");
        Assert.Equal("RIGHT", fixedCamera.Revision.CameraPreset);
        Assert.Equal(PoiImportActions.NewRevision, (await h.Import([recapture])).Files.Single().Action);
    }

    [SchemaV11Fact]
    public async Task HistoryIsNotRewritten_WhenARevisionHoldsAnOlderCameraValue()
    {
        await using var h = await Harness.Create();
        var proposalId = (await h.Import([File("a.yaml", "POI_A")])).CreatedProposalIds[0];
        await h.Database.ExecuteAsync($"UPDATE dbo.PoiProposalRevisions SET CameraPreset=N'HEAD_LEFT' WHERE ProposalId='{proposalId}';");

        var read = await h.Send(new GetPoiProposalQuery(proposalId));

        Assert.Equal("HEAD_LEFT", read.Revision.CameraPreset);
    }

    [SchemaV11Fact]
    public async Task StaffPose_TooCloseToAWall_IsRefusedOnCreateAndOnAMove()
    {
        await using var h = await Harness.Create();

        var created = await Assert.ThrowsAsync<ValidationException>(() => h.Send(new CreatePoiProposalCommand(h.StaffId, new(Guid.NewGuid(),
            new(h.MapId, "Sát tường", "Giới thiệu", null, 1.1m, 0.5m, 0m, "FRONT", "Nội dung.")))));
        AssertClearanceFailure(created);

        var proposal = await h.Send(new CreatePoiProposalCommand(h.StaffId, new(Guid.NewGuid(),
            new(h.MapId, "Thoáng", "Giới thiệu", null, 2.5m, 2.5m, 0m, "front", "Nội dung."))));
        Assert.Equal("FRONT", proposal.Revision.CameraPreset);
        var moved = await Assert.ThrowsAsync<ValidationException>(() => h.Send(new CreatePoiRevisionCommand(h.StaffId, proposal.Id,
            new(Guid.NewGuid(), 1, proposal.RowVersion, new(h.MapId, "Thoáng", "Giới thiệu", null, 1.1m, 0.5m, 0m, "FRONT", "Nội dung.")))));
        AssertClearanceFailure(moved);
    }

    [SchemaV11Fact]
    public async Task RoutePose_TooCloseToAWall_IsRefusedForStartAndEnd()
    {
        await using var h = await Harness.Create();
        var poi = await h.ContentPoi("POI_A");

        AssertClearanceFailure(await Assert.ThrowsAsync<ValidationException>(() => h.SaveRoute(poi, startX: 1.1m, startY: 0.5m)));
        AssertClearanceFailure(await Assert.ThrowsAsync<ValidationException>(() => h.SaveRoute(poi, endX: 1.1m, endY: 0.5m)));

        var route = await h.SaveRoute(poi, endX: 3.5m, endY: 3.5m);
        Assert.Equal(3.5m, route.EndX);
    }

    [SchemaV11Fact]
    public async Task PosesThatPredateTheRule_KeepTheirPass_AndContentEditsStayPossible()
    {
        await using var h = await Harness.Create(clearanceMeters: 0.01m);
        var proposalId = (await h.Import([File("a.yaml", "POI_A", x: 1.1m, y: 0.5m)])).CreatedProposalIds[0];
        var earlierPoi = await h.AddStaffContent(proposalId, "Thư viện", "Đây là thư viện.");
        var route = await h.SaveRoute(earlierPoi.Revision.Id, startX: 1.1m, startY: 1.5m);

        h.UseClearance(0.30m);

        Assert.Equal("PASS", (await h.Send(new GetPoiProposalQuery(proposalId))).Revision.NavigationStatus);
        var edited = await h.AddStaffContent(proposalId, "Thư viện", "Nội dung mới.");
        Assert.Equal("PASS", edited.Revision.NavigationStatus);
        var nextRoute = await h.SaveRoute(edited.Revision.Id, startX: 1.1m, startY: 1.5m, routeId: route.RouteId, expectedRevision: 1);
        Assert.Equal(1.1m, nextRoute.StartX);

        AssertClearanceFailure(await Assert.ThrowsAsync<ValidationException>(() => h.Send(new CreatePoiRevisionCommand(h.StaffId, proposalId,
            new(Guid.NewGuid(), edited.CurrentRevision, edited.RowVersion, new(h.MapId, "Thư viện", "Giới thiệu", null, 1.15m, 0.5m, 0m, "FRONT", "Nội dung mới."))))));
        AssertClearanceFailure(await Assert.ThrowsAsync<ValidationException>(() => h.SaveRoute(edited.Revision.Id, startX: 1.15m, startY: 0.5m,
            routeId: route.RouteId, expectedRevision: 2)));
    }

    [SchemaV11Fact]
    public async Task AVerificationOfASubmittedRevision_IsNotAPoseWrite()
    {
        await using var h = await Harness.Create(clearanceMeters: 0.01m);
        var proposalId = (await h.Import([File("a.yaml", "POI_A", x: 1.1m, y: 0.5m, verified: false)])).CreatedProposalIds[0];
        h.UseClearance(0.30m);
        var submitted = await h.Send(new GetPoiProposalQuery(proposalId));

        var result = await h.Send(new RecordPoiVerificationCommand(h.TechnicalId, proposalId, 1, new(Guid.NewGuid(), 1, submitted.RowVersion, Robot,
            "PASS", true, true, true, true, null, "Kiểm tra tại chỗ.")));

        Assert.Equal("PASS", result.ResultCode);
    }

    [SchemaV11Fact]
    public async Task MapPackage_IsRefusedTwiceInOneArea_AllowedInAnother_AndReplayReturnsTheOriginal()
    {
        await using var h = await Harness.Create();
        var requestId = Guid.NewGuid();
        var second = await h.UploadMap("pilot", "Pilot", Marked("v2"), requestId);
        Assert.Equal(2, second.VersionNumber);

        var duplicate = await Assert.ThrowsAsync<ConflictException>(() => h.UploadMap("pilot", "Pilot", Marked("v2"), Guid.NewGuid()));
        Assert.Equal("MAP_PACKAGE_DUPLICATE", duplicate.Code);
        Assert.Equal("Gói này đã được tải lên ở Pilot · v2.", duplicate.Message);
        var first = await Assert.ThrowsAsync<ConflictException>(() => h.UploadMap("pilot", "Pilot", MapPackage(), Guid.NewGuid()));
        Assert.Equal("Gói này đã được tải lên ở Pilot · v1.", first.Message);

        var replay = await h.UploadMap("pilot", "Pilot", Marked("v2"), requestId);
        Assert.Equal(second.Id, replay.Id);
        Assert.Equal(2, replay.VersionNumber);

        var elsewhere = await h.UploadMap("khac", "Khu khác", Marked("v2"), Guid.NewGuid());
        Assert.Equal(1, elsewhere.VersionNumber);
        Assert.Equal(second.PackageSha256, elsewhere.PackageSha256);
        await using var db = h.Context();
        Assert.Equal(3, await db.MapVersions.CountAsync());
    }

    private const string ClearanceMessage = "Điểm quá sát vật cản (cần trống bán kính 0,30 m).";

    private static void AssertClearanceFailure(ValidationException error)
    {
        var failure = Assert.Single(error.Errors);
        Assert.Equal(MapPoiErrorCodes.PoseClearanceInsufficient, failure.ErrorCode);
        Assert.Equal(ClearanceMessage, failure.ErrorMessage);
    }

    private static PoiImportUpload File(string fileName, string id, string name = "POI nhập", string mapYaml = "map.yaml", string frame = "map",
        decimal x = 1.5m, decimal y = 1.5m, string? quaternion = null, bool verified = true) =>
        new(fileName, Encoding.UTF8.GetBytes(
            $"# recorded on the robot\nid: {id}\nname: {name}\nmap_yaml: {mapYaml}\nframe_id: {frame}\n" +
            $"pose: {{ x: {x}, y: {y}, yaw: 0.0{(quaternion is null ? "" : $", quaternion: {quaternion}")} }}\nverified: {(verified ? "true" : "false")}\n"));

    private static byte[] MapPackage(string? marker = null)
    {
        // A 4x4 metre map: the bottom-left cell is occupied, the rest are free.
        var pgm = "P2\n4 4\n255\n254 254 254 254\n254 254 254 254\n254 254 254 254\n0 254 254 254\n";
        var yaml = $"{(marker is null ? "" : $"# {marker}\n")}image: map.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n";
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var (name, text) in new[] { ("map.yaml", yaml), ("map.pgm", pgm) })
            {
                using var entry = archive.CreateEntry(name).Open();
                entry.Write(Encoding.ASCII.GetBytes(text));
            }
        return stream.ToArray();
    }

    private static byte[] Marked(string marker) => MapPackage(marker);

    private sealed class Harness(InitialAdminSeederTests.EmptySchemaDatabase database, ServiceProvider provider, Guid technicalId, Guid staffId, MapVersionView map)
        : IAsyncDisposable
    {
        public const string Note = "Ghi tại hiện trường.";
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public Guid TechnicalId => technicalId;
        public Guid StaffId => staffId;
        public Guid MapId => map.Id;
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);

        public static async Task<Harness> Create(bool deployed = true, decimal? clearanceMeters = null)
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            var technical = await database.InsertUserAsync(true, username: "import.technical", roles: ["TECHNICAL_STAFF"]);
            var staff = await database.InsertUserAsync(true, username: "import.staff", roles: ["STAFF"]);
            var provider = BuildProvider(database, clearanceMeters);

            MapVersionView map;
            await using (var scope = provider.CreateAsyncScope())
                map = await scope.ServiceProvider.GetRequiredService<ISender>().Send(
                    new CreateMapVersionCommand(technical.Id, new("pilot", "Pilot", Guid.NewGuid(), MapPackage())));
            var harness = new Harness(database, provider, technical.Id, staff.Id, map);
            await harness.AddRobot(Robot);
            await harness.AddRobot("amr_backup");
            if (deployed) await harness.RecordDeployment(passed: true);
            return harness;
        }

        private static ServiceProvider BuildProvider(InitialAdminSeederTests.EmptySchemaDatabase database, decimal? clearanceMeters)
        {
            var settings = InvitationPrimitiveTests.ConfigurationValues().ToDictionary(pair => pair.Key, pair => (string?)pair.Value);
            settings["ConnectionStrings:DefaultConnection"] = database.ConnectionString;
            settings["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey;
            if (clearanceMeters is { } clearance) settings["Maps:PoiClearanceMeters"] = clearance.ToString(CultureInfo.InvariantCulture);
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddApplication();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddInfrastructure(configuration);
            return services.BuildServiceProvider();
        }

        /// <summary>Stands in for the clearance rule arriving after these rows were written.</summary>
        public void UseClearance(decimal clearanceMeters) => provider = BuildProvider(database, clearanceMeters);

        public Task<MapVersionView> UploadMap(string area, string areaName, byte[] package, Guid requestId) =>
            Send(new CreateMapVersionCommand(technicalId, new(area, areaName, requestId, package)));

        public async Task<PoiProposalView> ReviseCamera(Guid proposalId, string camera)
        {
            var current = await Send(new GetPoiProposalQuery(proposalId));
            var revision = current.Revision;
            return await Send(new CreatePoiRevisionCommand(staffId, proposalId, new(Guid.NewGuid(), current.CurrentRevision, current.RowVersion,
                new(MapId, revision.Name, revision.Purpose, null, revision.X, revision.Y, revision.Yaw, camera, "Nội dung thuyết minh."))));
        }

        public async Task<Guid> ContentPoi(string sourceId)
        {
            var proposalId = (await Import([File($"{sourceId}.yaml", sourceId)])).CreatedProposalIds[0];
            return (await AddStaffContent(proposalId, "Thư viện", "Đây là thư viện.")).Revision.Id;
        }

        public async Task<TResponse> Send<TResponse>(IRequest<TResponse> request)
        {
            await using var scope = provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
        }

        public Task<PoiImportPreview> Preview(params PoiImportUpload[] files) =>
            Send(new PreviewPoiImportQuery(new(MapId, Robot, files)));

        public Task<PoiImportResult> Import(IReadOnlyList<PoiImportUpload> files, Guid? requestId = null) =>
            Send(new ImportPoiFilesCommand(technicalId, new(requestId ?? Guid.NewGuid(), MapId, Robot, Note, files)));

        public Task RecordDeployment(bool passed, string robot = Robot) =>
            Send(new RecordMapDeploymentCommand(technicalId, MapId, new(Guid.NewGuid(), robot, map.PackageSha256, passed, true, "Kiểm tra triển khai.")));

        public async Task<PoiProposalView> AddStaffContent(Guid proposalId, string name, string narration)
        {
            var current = await Send(new GetPoiProposalQuery(proposalId));
            var revision = current.Revision;
            return await Send(new CreatePoiRevisionCommand(staffId, proposalId, new(Guid.NewGuid(), current.CurrentRevision, current.RowVersion,
                new(MapId, name, "Giới thiệu điểm tham quan", null, revision.X, revision.Y, revision.Yaw, revision.CameraPreset, narration))));
        }

        public Task<RouteRevisionView> SaveRoute(Guid poiRevisionId, decimal startX = 2.5m, decimal startY = 2.5m,
            decimal? endX = null, decimal? endY = null, Guid? routeId = null, int expectedRevision = 0) =>
            Send(new SaveRouteRevisionCommand(staffId, routeId, new(Guid.NewGuid(), expectedRevision, "Tuyến nhập", null, MapId,
                startX, startY, 0m, endX is null ? "LAST_POI" : "POSE", endX, endY, endX is null ? null : 0m,
                [new(poiRevisionId, 30, [new("FRONT", 10)])])));

        public async Task AssertNothingImported() => await AssertCounts(0, 0, 0);

        public async Task AssertCounts(int proposals, int revisions, int verifications)
        {
            await using var db = Context();
            Assert.Equal(proposals, await db.PoiProposals.CountAsync());
            Assert.Equal(revisions, await db.PoiProposalRevisions.CountAsync());
            Assert.Equal(verifications, await db.PoiVerificationRecords.CountAsync());
            if (proposals == 0)
            {
                Assert.Equal(0, await db.PoiImportReceipts.CountAsync());
                Assert.Equal(0, await db.AuditLogs.CountAsync(audit => audit.Action.StartsWith("POI_")));
            }
        }

        private async Task AddRobot(string code)
        {
            await using var db = Context();
            var now = DateTimeOffset.UtcNow;
            db.Robots.Add(new Robot { Id = Guid.NewGuid(), RobotCode = code, SourceType = "PHYSICAL", IsDispatchEnabled = false, CreatedAt = now,
                FirstAcceptedSyncAt = now, FirstAcceptedMapKey = "pilot", FirstAcceptedFrameId = "map", CredentialHash = new byte[32] });
            await db.SaveChangesAsync();
        }

        public async ValueTask DisposeAsync()
        {
            await provider.DisposeAsync();
            await database.DisposeAsync();
        }
    }
}
