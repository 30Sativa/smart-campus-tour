using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.RobotCredentials;
using static SmartCampus.IntegrationTests.TourStartPreflightSqlTests;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0066 round 6: "Cấp lại khóa" and "Ngừng sử dụng" take the robot locks before reading the robot row, in Start's
/// order, so a race with Start ends in one clear outcome and never in a deadlock victim (SQL error 1205).
/// </summary>
public sealed class RobotStartRaceSqlTests
{
    private const int Rounds = 3;

    [SchemaV11Fact]
    public async Task StartAndWebKeyRotation_OneWins_WithoutADeadlock()
    {
        for (var round = 0; round < Rounds; round++)
        {
            await using var w = await World.Create(enabled: true);
            var robot = await Robot(w);

            var start = Capture(TourHappyPathSqlTests.Start(w));
            var rotate = Capture(w.H.Send(new ChangeRobotCredentialCommand(TourReadySqlTests.Robot, w.H.TechnicalId, Guid.NewGuid(),
                Convert.ToBase64String(robot.RowVersion), null, RobotCredentialOperation.Rotate)));
            await Task.WhenAll(start, rotate);

            AssertNoDeadlock(await start, await rotate);
            if (await start is null)
                // Start claimed the robot first: the new key is refused for the running Tour, and the old key stays.
                Assert.Equal("ROBOT_IN_RUNNING_TOUR", Assert.IsType<ConflictException>(await rotate).Code);
            else
            {
                // The new key came first. It clears the connection confirmation, so Start is refused by its own checks
                // until the MiniPC connects with the new key.
                Assert.Null(await rotate);
                Assert.IsType<ConflictException>(await start);
                Assert.Null((await Robot(w)).CurrentTourId);
            }
        }
    }

    [SchemaV11Fact]
    public async Task StartAndDeactivation_OneWins_WithoutADeadlock()
    {
        for (var round = 0; round < Rounds; round++)
        {
            await using var w = await World.Create(enabled: true);
            var robot = await Robot(w);

            var start = Capture(TourHappyPathSqlTests.Start(w));
            var deactivate = Capture(w.H.Send(new DeactivatePhysicalRobotCommand(robot.Id, w.H.TechnicalId,
                new(Guid.NewGuid(), Convert.ToBase64String(robot.RowVersion), "Bảo trì"))));
            await Task.WhenAll(start, deactivate);

            AssertNoDeadlock(await start, await deactivate);
            var after = await Robot(w);
            if (await start is null)
            {
                Assert.Equal("ROBOT_IN_RUNNING_TOUR", Assert.IsType<ConflictException>(await deactivate).Code);
                Assert.Null(after.DeactivatedAt);
            }
            else
            {
                // Deactivated first: Start is refused as before, and the robot is not claimed.
                Assert.Null(await deactivate);
                Assert.IsType<ConflictException>(await start);
                Assert.NotNull(after.DeactivatedAt);
                Assert.Null(after.CurrentTourId);
            }
        }
    }

    private static void AssertNoDeadlock(params Exception?[] errors)
    {
        foreach (var error in errors)
            for (var inner = error; inner is not null; inner = inner.InnerException)
                Assert.False(inner is SqlException { Number: 1205 }, $"Deadlock victim: {error}");
        Assert.Contains(errors, error => error is null);
    }

    private static async Task<SmartCampus.Domain.Entities.Robot> Robot(World w)
    {
        await using var db = w.H.Context();
        return await db.Robots.AsNoTracking().SingleAsync(item => item.RobotCode == TourReadySqlTests.Robot);
    }

    private static async Task<Exception?> Capture(Task task)
    {
        try { await task; return null; }
        catch (Exception error) { return error; }
    }
}
