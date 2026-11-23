using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0066: one rule for "robot ready on map version M". World: A is pilot v1, B is other v1; First holds A, reports on
/// it and passed its deployment check there (Harness.Create). Second is connected and holds nothing.
/// </summary>
public sealed partial class RobotIntegritySqlTests
{
    [SchemaV11Fact]
    public async Task Readiness_ADeploymentCheckOnAMapTheRobotDoesNotHold_IsRefusedForPassAndFail()
    {
        await using var h = await Harness.Create();

        foreach (var passed in new[] { true, false })
        {
            var error = await Assert.ThrowsAsync<ConflictException>(() => Deploy(h, h.OtherMap, First, passed));
            Assert.Equal("ROBOT_MAP_NOT_ASSIGNED", error.Code);
            Assert.Equal($"Robot {First} đang gán Pilot · pilot · phiên bản 1, không phải bản đồ này. " +
                "Đổi bản đồ cho robot ở trang Robot trước khi ghi kiểm tra.", error.Message);
        }

        Assert.Equal(h.PilotMap.Id, (await h.LatestDeployment(First)).MapVersionId);
        Assert.Equal("READY", (await RobotStatus(h, First)).Readiness.State);
    }

    [SchemaV11Fact]
    public async Task Readiness_PoiVerification_NeedsTheRobotOnThePoisMap()
    {
        await using var h = await Harness.Create();
        // Second makes B usable for POI work, so only First's own readiness decides.
        await h.RecordDeployment(h.OtherMap, Second, passed: true);
        var onB = await SubmittedPoi(h, h.OtherMap, "Cổng B");

        var refused = await Assert.ThrowsAsync<ConflictException>(() => VerifyPoi(h, onB, First));

        Assert.Equal("MAP_NOT_DEPLOYED", refused.Code);
        Assert.Equal($"Robot {First} đang gán Pilot · pilot · phiên bản 1, không phải bản đồ này.", refused.Message);
        var onA = await SubmittedPoi(h, h.PilotMap, "Cổng A");
        Assert.Equal("PASS", (await VerifyPoi(h, onA, First)).ResultCode);
    }

    [SchemaV11Fact]
    public async Task Readiness_MovingTheRobotToB_StopsDispatch_BlocksA_AndNeedsLiveDataBeforePassingB()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        var poiOnA = await SubmittedPoi(h, h.PilotMap, "Cổng A");
        await h.Database.ExecuteAsync($"UPDATE dbo.Robots SET IsDispatchEnabled = 1 WHERE RobotCode = N'{First}';");

        await h.Assign(First, h.OtherMap.Id);

        var robot = await h.Robot(First);
        Assert.False(robot.IsDispatchEnabled);
        await using (var db = h.Context())
        {
            var audit = await db.AuditLogs.AsNoTracking().SingleAsync(entry => entry.Action == "ROBOT_DISPATCH_CHANGED" && entry.RobotId == robot.Id);
            Assert.Equal((h.TechnicalId, "SUCCESS"), (audit.ActorUserId!.Value, audit.ResultCode));
            using var data = JsonDocument.Parse(audit.DataJson!);
            Assert.False(data.RootElement.GetProperty("enabled").GetBoolean());
            Assert.Equal("Tự tắt vì đổi bản đồ", data.RootElement.GetProperty("reason").GetString());
        }
        var status = await RobotStatus(h, First);
        Assert.Equal("NOT_READY", status.Readiness.State);
        Assert.False(status.Readiness.ReportingOnAssignedMap);
        Assert.Equal("MAP_NOT_DEPLOYED", (await Assert.ThrowsAsync<ConflictException>(() => VerifyPoi(h, poiOnA, First))).Code);
        Assert.Equal("ROBOT_NOT_READY_FOR_ROUTE", (await Assert.ThrowsAsync<ConflictException>(() => h.CreateTour(tested, First))).Code);

        // The only report so far predates the move.
        var silent = await Assert.ThrowsAsync<ConflictException>(() => Deploy(h, h.OtherMap, First, passed: true));
        Assert.Equal("ROBOT_NOT_REPORTING", silent.Code);
        Assert.Equal($"Robot {First} chưa gửi dữ liệu theo bản đồ Other · v1. Bật fleet_bridge với MapKey {h.OtherMap.MapKey}, " +
            $"FrameId {h.OtherMap.FrameId} rồi bấm Cập nhật trạng thái.", silent.Message);
        // A FAIL needs no live data.
        await Deploy(h, h.OtherMap, First, passed: false);

        await RobotReadinessTestSupport.ReportAsync(h.Services, First, h.OtherMap.MapKey, h.OtherMap.FrameId, DateTimeOffset.UtcNow);
        Assert.True((await RobotStatus(h, First)).Readiness.ReportingOnAssignedMap);
        await Deploy(h, h.OtherMap, First, passed: true);

        Assert.Equal("READY", (await RobotStatus(h, First)).Readiness.State);
        var onB = await SubmittedPoi(h, h.OtherMap, "Cổng B");
        Assert.Equal("PASS", (await VerifyPoi(h, onB, First)).ResultCode);
    }

    [SchemaV11Fact]
    public async Task Readiness_AssigningTheSameVersionAgain_ChangesNothing_AndClearingStopsDispatch()
    {
        await using var h = await Harness.Create();
        await h.Database.ExecuteAsync($"UPDATE dbo.Robots SET IsDispatchEnabled = 1 WHERE RobotCode = N'{First}';");
        var before = await h.Robot(First);

        await h.Assign(First, h.PilotMap.Id);

        var after = await h.Robot(First);
        Assert.True(after.IsDispatchEnabled);
        Assert.Equal(before.MapAssignedAt, after.MapAssignedAt);
        Assert.Equal("READY", (await RobotStatus(h, First)).Readiness.State);
        await h.Assign(First, null);
        Assert.False((await h.Robot(First)).IsDispatchEnabled);
        await using var db = h.Context();
        Assert.Single(await db.AuditLogs.AsNoTracking().Where(entry => entry.Action == "ROBOT_DISPATCH_CHANGED").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task Readiness_LegacyNewestCheckOnAnotherMap_BlocksEveryUse_UntilTheRobotIsCheckedAgain()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        // The amr_01 data of 23/11: the robot holds A, but its newest check is a PASS on B written before ADR-0066.
        await h.Database.ExecuteAsync(LegacyCheckSql(h.OtherMap.Id, First));
        var reason = $"Lần kiểm tra triển khai mới nhất của robot {First} là trên Other · other · phiên bản 1.";

        var status = await RobotStatus(h, First);
        Assert.Equal(("NOT_READY", "ROBOT_DEPLOYMENT_CHECK_REQUIRED", reason),
            (status.Readiness.State, status.Readiness.ReasonCode, status.Readiness.Reason));
        var run = await Assert.ThrowsAsync<ConflictException>(() => h.RecordRouteTest(tested, First));
        Assert.Equal(("ROBOT_DEPLOYMENT_CHECK_REQUIRED", reason), (run.Code, run.Message));
        await h.AssertBlocked(tested, First, reason);

        await h.RecordDeployment(h.PilotMap, First, passed: true);

        Assert.Equal("READY", (await RobotStatus(h, First)).Readiness.State);
        Assert.NotEqual(Guid.Empty, await h.CreateTour(tested, First));
    }

    [SchemaV11Fact]
    public async Task Readiness_ImportOnAMapTheRobotDoesNotHold_QueuesTheFilesForVerification()
    {
        await using var h = await Harness.Create();
        await h.RecordDeployment(h.OtherMap, Second, passed: true);
        var file = new PoiImportUpload("cong.yaml", Encoding.UTF8.GetBytes(
            "id: CONG_B\nname: Cổng B\nmap_yaml: map.yaml\nframe_id: map\npose: { x: 1.5, y: 1.5, yaw: 0.0 }\nverified: true\n"));

        var preview = await h.Send(new PreviewPoiImportQuery(new(h.OtherMap.Id, First, [file])));

        Assert.True(preview.CanImport);
        Assert.Equal(new PoiImportRobotReadiness(false, "ROBOT_MAP_NOT_ASSIGNED",
            $"Robot {First} đang gán Pilot · pilot · phiên bản 1, không phải bản đồ này."), preview.RobotReadiness);
        Assert.False(Assert.Single(preview.Files).Verified);

        var imported = Assert.Single((await h.Send(new ImportPoiFilesCommand(h.TechnicalId,
            new(Guid.NewGuid(), h.OtherMap.Id, First, "Nhập thử", [file])))).Files);
        Assert.Equal((PoiImportActions.Create, false), (imported.Action, imported.Verified));
        Assert.Contains(await h.Send(new ListPoiVerificationQueueQuery(h.OtherMap.Id)), item => item.ProposalId == imported.ProposalId);
        await using var db = h.Context();
        Assert.False(await db.PoiVerificationRecords.AnyAsync(record => record.ProposalRevisionId == imported.ProposalRevisionId));
    }

    [SchemaV11Fact]
    public async Task Readiness_ConcurrentMoveAndDeploymentCheck_NeverLeaveACheckOnTheOldMapAfterTheMove()
    {
        await using var h = await Harness.Create();
        for (var round = 0; round < 5; round++)
        {
            await h.RecordDeployment(h.PilotMap, First, passed: true);
            var robot = await h.Robot(First);

            var move = Capture(h.Send(new ChangePhysicalRobotMapAssignmentCommand(robot.Id, h.TechnicalId, Guid.NewGuid(),
                Convert.ToBase64String(robot.RowVersion), h.OtherMap.Id)));
            var check = Capture(Deploy(h, h.PilotMap, First, passed: true));
            await Task.WhenAll(move, check);

            Assert.Null(await move);
            if (await check is { } error) Assert.Equal("ROBOT_MAP_NOT_ASSIGNED", Assert.IsType<ConflictException>(error).Code);
            var moved = await h.Robot(First);
            var latest = await h.LatestDeployment(First);
            Assert.Equal(h.OtherMap.Id, moved.AssignedMapVersionId);
            Assert.True(latest.CheckedAt <= moved.MapAssignedAt, "A check on the old map must commit before the move, never after.");
        }
    }

    [SchemaV11Fact]
    public async Task Readiness_RobotAndMapLists_ShowTheThreeStates_AndTheRunningRobot()
    {
        await using var h = await Harness.Create();

        var ready = (await RobotStatus(h, First)).Readiness;
        Assert.Equal(("READY", "Pilot · v1", h.PilotMap.Id, true), (ready.State, ready.MapLabel, ready.MapVersionId, ready.ReportingOnAssignedMap));
        Assert.Equal((await h.LatestDeployment(First)).CheckedAt, ready.DeploymentCheckedAt);
        var notSetUp = (await RobotStatus(h, Second)).Readiness;
        Assert.Equal(new RobotReadinessView("NOT_SET_UP", "ROBOT_MAP_NOT_ASSIGNED", $"Robot {Second} chưa được gán bản đồ.", null, null, null, false), notSetUp);
        await h.Assign(Second, h.OtherMap.Id);
        var notReady = (await RobotStatus(h, Second)).Readiness;
        Assert.Equal(new RobotReadinessView("NOT_READY", "ROBOT_DEPLOYMENT_CHECK_REQUIRED",
            $"Robot {Second} chưa có kiểm tra triển khai đạt trên bản đồ đang gán.", h.OtherMap.Id, "Other · v1", null, false), notReady);

        var maps = await h.Send(new ListMapVersionsQuery(null, 50));
        RunningRobotView? Running(MapVersionView map) => Assert.Single(maps, item => item.Map.Id == map.Id).RunningRobot;
        Assert.Equal((First, "READY"), (Running(h.PilotMap)!.RobotCode, Running(h.PilotMap)!.Readiness.State));
        Assert.Equal((Second, "NOT_READY"), (Running(h.OtherMap)!.RobotCode, Running(h.OtherMap)!.Readiness.State));
        Assert.Null(Running(h.PilotMapV2));
        Assert.Equal(Second, (await h.Send(new GetMapVersionQuery(h.OtherMap.Id))).RunningRobot!.RobotCode);
    }

    [SchemaV11Fact]
    public async Task Readiness_ANewAreaCannotReuseAName_ButANewVersionOfTheAreaCan()
    {
        await using var h = await Harness.Create();

        var taken = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new CreateMapVersionCommand(h.TechnicalId,
            new("pilot-2", "  pILOT ", Guid.NewGuid(), MapPackage("trùng tên")))));

        Assert.Equal("MAP_AREA_NAME_TAKEN", taken.Code);
        Assert.Equal("Đã có khu vực tên Pilot (pilot). Chọn Khu vực đã có hoặc đặt tên khác.", taken.Message);
        await using (var db = h.Context())
            Assert.False(await db.MapAreas.AnyAsync(area => area.AreaKey == "pilot-2"));
        var next = await h.Send(new CreateMapVersionCommand(h.TechnicalId, new("pilot", "Pilot", Guid.NewGuid(), MapPackage("v3"))));
        Assert.Equal(3, next.VersionNumber);
    }

    private static Task<MapDeploymentCheckView> Deploy(Harness h, MapVersionView map, string robot, bool passed) =>
        h.Send(new RecordMapDeploymentCommand(h.TechnicalId, map.Id, new(Guid.NewGuid(), robot, map.PackageSha256, passed, true, "Kiểm tra triển khai.")));

    private static async Task<PhysicalRobotStatus> RobotStatus(Harness h, string code) =>
        Assert.Single(await h.Send(new ListPhysicalRobotsQuery()), robot => robot.RobotCode == code);

    private static async Task<PoiProposalView> SubmittedPoi(Harness h, MapVersionView map, string name)
    {
        var proposal = await h.Send(new CreatePoiProposalCommand(h.StaffId, new(Guid.NewGuid(), new(map.Id, name, "Tham quan", null, 1.5m, 1.5m, 0m, "FRONT"))));
        return await h.Send(new SubmitPoiProposalCommand(h.StaffId, proposal.Id, new(Guid.NewGuid(), 1, proposal.RowVersion)));
    }

    private static Task<PoiVerificationView> VerifyPoi(Harness h, PoiProposalView proposal, string robot) =>
        h.Send(new RecordPoiVerificationCommand(h.TechnicalId, proposal.Id, 1,
            new(Guid.NewGuid(), 1, proposal.RowVersion, robot, "PASS", true, true, true, true, null, "Kiểm tra tại chỗ.")));

    /// <summary>A PASS on another map, newer than every check, written straight to SQL as data from before ADR-0066.</summary>
    internal static string LegacyCheckSql(Guid mapVersionId, string robotCode) => $"""
        INSERT dbo.MapDeploymentChecks(Id, MapVersionId, RobotId, PackageSha256, LocalizationPassed, DisplayPassed, EvidenceNote,
            CheckedByUserId, RequestId, RequestHash, CheckedAt)
        SELECT NEWID(), map.Id, robot.Id, map.PackageSha256, 1, 1, N'Dữ liệu cũ.', previous.CheckedByUserId, NEWID(), previous.RequestHash,
            DATEADD(SECOND, 1, previous.CheckedAt)
        FROM dbo.MapVersions map CROSS JOIN dbo.Robots robot
        CROSS APPLY (SELECT TOP 1 CheckedByUserId, RequestHash, CheckedAt FROM dbo.MapDeploymentChecks ORDER BY CheckedAt DESC) previous
        WHERE map.Id = '{mapVersionId:D}' AND robot.RobotCode = N'{robotCode}';
        """;
}
