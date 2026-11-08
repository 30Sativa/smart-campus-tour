using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.PollRobotCommand;
using SmartCampus.Application.Features.Tours.Commands.SetRobotDispatch;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.TourHappyPathSqlTests;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0049 step 3.3: who may allow dispatch, and the telemetry recheck before a GoTo leaves the backend.</summary>
public sealed class RobotDispatchSqlTests
{
    private const string Evidence = "robot/docs/m2-3-gate-a-evidence-2026-11-20.md";

    [Fact]
    public void Validator_RequiresEvidenceOnlyToTurnOn_AndAnExplicitChoice()
    {
        var validator = new SetRobotDispatchCommandValidator();
        var version = Convert.ToBase64String(new byte[8]);
        SetRobotDispatchCommand Command(bool? enabled, string? evidence, string reason = "Biên bản GATE A") =>
            new(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), version, enabled, reason, evidence));

        Assert.True(validator.Validate(Command(true, Evidence)).IsValid);
        Assert.True(validator.Validate(Command(false, null)).IsValid);
        Assert.False(validator.Validate(Command(true, null)).IsValid);
        Assert.False(validator.Validate(Command(true, "   ")).IsValid);
        Assert.False(validator.Validate(Command(null, Evidence)).IsValid);
        Assert.False(validator.Validate(Command(false, null, " ")).IsValid);
        Assert.False(validator.Validate(Command(true, new string('x', 501))).IsValid);
    }

    [SchemaV11Fact]
    public async Task TurningOn_SetsTheFlag_WithAnAuditOfWhoAndWhy()
    {
        await using var w = await Disabled();
        var result = await Set(w, enabled: true);

        Assert.True(result.IsDispatchEnabled);
        await using var db = w.H.Context();
        Assert.True((await db.Robots.AsNoTracking().SingleAsync()).IsDispatchEnabled);
        var audit = await db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == "ROBOT_DISPATCH_CHANGED");
        Assert.Equal((w.H.TechnicalId, "SUCCESS"), (audit.ActorUserId!.Value, audit.ResultCode));
        using var data = JsonDocument.Parse(audit.DataJson!);
        Assert.True(data.RootElement.GetProperty("enabled").GetBoolean());
        Assert.Equal(Evidence, data.RootElement.GetProperty("evidenceRef").GetString());
        Assert.Equal("Biên bản GATE A", data.RootElement.GetProperty("reason").GetString());
        Assert.True(Assert.Single(await w.H.Send(new ListPhysicalRobotsQuery())).IsDispatchEnabled);
    }

    [SchemaV11Fact]
    public async Task TurningOn_RefusesEachMissingPrecondition_AndChangesNothing()
    {
        await using var w = await Disabled();
        var technical = w.H.TechnicalId;

        await Refused(w, "ROBOT_NEEDS_INSPECTION", "UPDATE dbo.Robots SET NeedsInspection = 1;", "UPDATE dbo.Robots SET NeedsInspection = 0;");
        await Refused(w, "ROBOT_MAP_REQUIRED",
            "UPDATE dbo.Robots SET AssignedMapVersionId = NULL, AssignedAreaKey = NULL, MapAssignedAt = NULL, MapAssignedByUserId = NULL;", w.AssignMapSql);
        await Refused(w, "ROBOT_DEPLOYMENT_CHECK_REQUIRED", Check(passed: false), Check(passed: true));
        await Refused(w, "ROBOT_CREDENTIAL_REQUIRED",
            $"UPDATE dbo.Robots SET CredentialHash = NULL, CredentialRevokedAt = SYSDATETIMEOFFSET(), CredentialRevokedByUserId = '{technical}';", null);
        await Refused(w, "ROBOT_DEACTIVATED",
            $"UPDATE dbo.Robots SET DeactivatedAt = SYSDATETIMEOFFSET(), DeactivatedByUserId = '{technical}', DeactivationReason = N'Hỏng';", null);

        await using var db = w.H.Context();
        Assert.False((await db.Robots.AsNoTracking().SingleAsync()).IsDispatchEnabled);
        Assert.Empty(await db.AuditLogs.AsNoTracking().Where(a => a.Action == "ROBOT_DISPATCH_CHANGED").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task TurningOn_RefusesADeploymentCheckOnAnotherMap()
    {
        await using var w = await Disabled();
        var other = await w.H.Send(new CreateMapVersionCommand(w.H.TechnicalId, new("pilot", "Pilot", Guid.NewGuid(), TourReadySqlTests.MapPackage("other"))));
        await w.H.Database.ExecuteAsync($"UPDATE dbo.Robots SET AssignedMapVersionId = '{other.Id}';");

        Assert.Equal("ROBOT_DEPLOYMENT_CHECK_REQUIRED", (await Assert.ThrowsAsync<ConflictException>(() => Set(w, enabled: true))).Code);
    }

    [SchemaV11Fact]
    public async Task TurningOn_FromAStalePage_IsRefused()
    {
        await using var w = await Disabled();
        var conflict = await Assert.ThrowsAsync<ConflictException>(() => Set(w, enabled: true, version: Convert.ToBase64String(new byte[8])));
        Assert.Equal("STALE_VERSION", conflict.Code);
    }

    [SchemaV11Fact]
    public async Task TurningOff_AlwaysWorks_EvenStaleAndWithEveryPreconditionFailing()
    {
        await using var w = await World.Create(enabled: true);
        await w.H.Database.ExecuteAsync($"""
            UPDATE dbo.Robots SET NeedsInspection = 1, AssignedMapVersionId = NULL, AssignedAreaKey = NULL, MapAssignedAt = NULL, MapAssignedByUserId = NULL,
                CredentialHash = NULL, CredentialRevokedAt = SYSDATETIMEOFFSET(), CredentialRevokedByUserId = '{w.H.TechnicalId}',
                DeactivatedAt = SYSDATETIMEOFFSET(), DeactivatedByUserId = '{w.H.TechnicalId}', DeactivationReason = N'Hỏng';
            """);

        var result = await Set(w, enabled: false, version: Convert.ToBase64String(new byte[8]), evidence: null);

        Assert.False(result.IsDispatchEnabled);
        await using var db = w.H.Context();
        Assert.False((await db.Robots.AsNoTracking().SingleAsync()).IsDispatchEnabled);
    }

    [SchemaV11Fact]
    public async Task TheSameRequest_Replays_AndAnotherContentIsRefused()
    {
        await using var w = await Disabled();
        var requestId = Guid.NewGuid();
        var version = await Version(w);
        Assert.True((await Set(w, enabled: true, version: version, requestId: requestId)).IsDispatchEnabled);
        Assert.True((await Set(w, enabled: true, version: version, requestId: requestId)).IsDispatchEnabled);
        await using (var db = w.H.Context())
            Assert.Single(await db.AuditLogs.AsNoTracking().Where(a => a.Action == "ROBOT_DISPATCH_CHANGED").ToArrayAsync());

        var conflict = await Assert.ThrowsAsync<ConflictException>(() => Set(w, enabled: false, version: version, evidence: null, requestId: requestId));
        Assert.Equal("IDEMPOTENCY_CONFLICT", conflict.Code);
    }

    [SchemaV11Fact]
    public async Task UnknownRobot_IsNotFound()
    {
        await using var w = await Disabled();
        await Assert.ThrowsAsync<NotFoundException>(() => w.H.Send(new SetRobotDispatchCommand(Guid.NewGuid(), w.H.TechnicalId,
            new(Guid.NewGuid(), Convert.ToBase64String(new byte[8]), false, "Dừng", null))));
    }

    [SchemaV11Fact]
    public async Task Poll_DoesNotDeliverAPendingGoTo_WhenTheLatestReportIsNotReady_UntilItIs()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);

        await NotDelivered(w, () => w.Report(motionReady: false));
        await NotDelivered(w, () => w.Report(motionReady: null));
        await NotDelivered(w, () => w.Report(localized: false));
        await NotDelivered(w, () => w.Report(localized: null));
        await NotDelivered(w, () => w.Report(status: "UNKNOWN"));
        await NotDelivered(w, () => w.Report(status: "NAVIGATING"));
        await NotDelivered(w, () => w.Report(mapKey: "another-map"));
        await NotDelivered(w, () => w.Report(frameId: "another-frame"));

        await w.Report();
        var delivered = await Poll(w);
        Assert.Equal(("GoTo", "DELIVERED"), (delivered!.Kind, delivered.State));
    }

    [SchemaV11Fact]
    public async Task Poll_StillRepeatsADeliveredGoTo_WhenTheRobotReportsItIsMoving()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var first = await Poll(w);

        await w.Report(motionReady: false, status: "NAVIGATING");

        Assert.Equal(first!.Id, (await Poll(w))!.Id);
    }

    [SchemaV11Fact]
    public async Task Poll_StillDeliversACancel_WhenTheRobotIsNotReady()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Poll(w);
        await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version(), "Mưa lớn")));

        await w.Report(localized: false, motionReady: false, status: "NAVIGATING");

        var cancel = await Poll(w);
        Assert.Equal(("Cancel", goTo!.LegId), (cancel!.Kind, cancel.LegId));
    }

    private static async Task<World> Disabled()
    {
        var w = await World.Create(enabled: true);
        await w.H.Database.ExecuteAsync("UPDATE dbo.Robots SET IsDispatchEnabled = 0;");
        return w;
    }

    private static async Task<string> Version(World w)
    {
        await using var db = w.H.Context();
        return Convert.ToBase64String((await db.Robots.AsNoTracking().SingleAsync()).RowVersion);
    }

    private static async Task<SetRobotDispatchResult> Set(World w, bool enabled, string? version = null, string? evidence = Evidence, Guid? requestId = null)
    {
        Guid robotId;
        await using (var db = w.H.Context())
            robotId = await db.Robots.AsNoTracking().Select(r => r.Id).SingleAsync();
        return await w.H.Send(new SetRobotDispatchCommand(robotId, w.H.TechnicalId,
            new(requestId ?? Guid.NewGuid(), version ?? await Version(w), enabled, "Biên bản GATE A", evidence)));
    }

    private static async Task Refused(World w, string code, string arrange, string? restore)
    {
        await w.H.Database.ExecuteAsync(arrange);
        Assert.Equal(code, (await Assert.ThrowsAsync<ConflictException>(() => Set(w, enabled: true))).Code);
        if (restore is not null) await w.H.Database.ExecuteAsync(restore);
    }

    /// <summary>A newer deployment check of the robot's map, so it becomes the latest one.</summary>
    private static string Check(bool passed) => $"""
        INSERT dbo.MapDeploymentChecks(Id, MapVersionId, RobotId, PackageSha256, LocalizationPassed, DisplayPassed, EvidenceNote, CheckedByUserId, RequestId, RequestHash, CheckedAt)
        SELECT TOP 1 NEWID(), MapVersionId, RobotId, PackageSha256, {(passed ? 1 : 0)}, 1, N'Kiểm tra lại.', CheckedByUserId, NEWID(), RequestHash,
            DATEADD(DAY, 1, (SELECT MAX(CheckedAt) FROM dbo.MapDeploymentChecks))
        FROM dbo.MapDeploymentChecks ORDER BY CheckedAt DESC;
        """;

    private static async Task<RobotCommand?> Poll(World w) =>
        (await w.H.Send(new PollRobotCommandCommand(TourReadySqlTests.Robot, w.Stream))).Command;

    private static async Task NotDelivered(World w, Func<Task> report)
    {
        await report();
        Assert.Null(await Poll(w));
        await using var db = w.H.Context();
        Assert.Equal("PENDING", (await db.RobotCommands.AsNoTracking().SingleAsync()).State);
    }
}
