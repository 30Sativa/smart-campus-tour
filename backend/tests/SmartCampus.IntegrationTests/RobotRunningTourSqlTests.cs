using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.RobotCredentials;
using SmartCampus.Application.Features.Tours.Commands.SetRobotDispatch;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0066 round 5: while the robot runs a Tour, its map, activation and key stay; stopping dispatch, revoking the key and
/// recording a deployment check still work. The world is <see cref="RobotIntegritySqlTests"/>'s: First holds Pilot and is ready.
/// </summary>
public sealed partial class RobotIntegritySqlTests
{
    [SchemaV11Fact]
    public async Task RunningTour_BlocksChangingTheMap_Deactivating_AndRotatingTheKey()
    {
        await using var h = await Harness.Create();
        await HoldTour(h, "RUNNING");
        var before = await h.Robot(First);

        foreach (var (change, act) in new (string, Func<Task>)[]
        {
            ("đổi bản đồ", () => h.Assign(First, h.OtherMap.Id)),
            ("đổi bản đồ", () => h.Assign(First, null)),
            ("ngừng sử dụng", () => h.Deactivate(First)),
            ("đổi khóa", () => Credential(h, RobotCredentialOperation.Rotate))
        })
        {
            var refused = await Assert.ThrowsAsync<ConflictException>(act);
            Assert.Equal("ROBOT_IN_RUNNING_TOUR", refused.Code);
            Assert.Equal($"Robot {First} đang chạy Tour Tour robot. Kết thúc Tour (hoặc kết thúc sớm) rồi mới {change}.", refused.Message);
            Assert.Equal(new ConflictBlocker("TOUR", "Tour robot"), Assert.Single(refused.Blockers!));
        }

        var after = await h.Robot(First);
        Assert.Equal((h.PilotMap.Id, before.MapAssignedAt, (DateTimeOffset?)null), (after.AssignedMapVersionId, after.MapAssignedAt, after.DeactivatedAt));
        Assert.Equal(before.CredentialHash, after.CredentialHash);
        await using var db = h.Context();
        Assert.False(await db.AuditLogs.AnyAsync(audit => audit.RobotId == after.Id &&
            (audit.Action == "ROBOT_MAP_ASSIGNED" || audit.Action == "ROBOT_MAP_CLEARED" || audit.Action == "ROBOT_DEACTIVATED" ||
             audit.Action == "ROBOT_CREDENTIAL_ROTATED")));
    }

    [SchemaV11Fact]
    public async Task RunningTour_StillAllowsTheSaferChoices_AndSavingTheSameMap()
    {
        await using var h = await Harness.Create();
        await HoldTour(h, "RUNNING");
        await h.Database.ExecuteAsync($"UPDATE dbo.Robots SET IsDispatchEnabled = 1 WHERE RobotCode = N'{First}';");

        // Saving the version already held changes nothing, so it is not a map change.
        await h.Assign(First, h.PilotMap.Id);
        await h.RecordDeployment(h.PilotMap, First, passed: true);
        var robot = await h.Robot(First);
        var stopped = await h.Send(new SetRobotDispatchCommand(robot.Id, h.TechnicalId,
            new(Guid.NewGuid(), Convert.ToBase64String(robot.RowVersion), false, "Dừng khẩn cấp", null)));
        Assert.False(stopped.IsDispatchEnabled);
        var revoked = await Credential(h, RobotCredentialOperation.Revoke, "Lộ khóa");

        Assert.Equal("REVOKED", revoked.Status);
        Assert.Null((await h.Robot(First)).CredentialHash);
    }

    [SchemaV11Fact]
    public async Task EndedTour_HeldForInspection_DoesNotBlockTheChanges()
    {
        foreach (var state in new[] { "COMPLETED", "CANCELLED" })
        {
            await using var h = await Harness.Create();
            await HoldTour(h, state);
            await h.SetNeedsInspection(First);

            Assert.Equal("ACTIVE", (await Credential(h, RobotCredentialOperation.Rotate)).Status);
            Assert.Equal(h.OtherMap.Id, (await h.Assign(First, h.OtherMap.Id)).AssignedMapVersionId);
            await h.Assign(First, null);
            Assert.NotNull((await h.Deactivate(First)).DeactivatedAt);
        }
    }

    /// <summary>A Tour holding First in <paramref name="state"/>, as Start (and a later end) leaves it.</summary>
    private static async Task HoldTour(Harness h, string state)
    {
        var tour = await h.CreateTour(await h.TestedRoute(), First);
        var ended = state == "RUNNING" ? "NULL" : "SYSDATETIMEOFFSET()";
        var reason = state == "CANCELLED" ? "N'Staff huỷ'" : "NULL";
        await h.Database.ExecuteAsync($"""
            UPDATE dbo.Tours SET State = '{state}', StartedAt = SYSDATETIMEOFFSET(), EndedAt = {ended}, EndReason = {reason} WHERE Id = '{tour}';
            UPDATE dbo.Robots SET CurrentTourId = '{tour}' WHERE RobotCode = N'{First}';
            """);
    }

    private static async Task<RobotCredentialChangeResult> Credential(Harness h, RobotCredentialOperation operation, string? reason = null)
    {
        var robot = await h.Robot(First);
        return await h.Send(new ChangeRobotCredentialCommand(First, h.TechnicalId, Guid.NewGuid(),
            Convert.ToBase64String(robot.RowVersion), reason, operation));
    }
}
