using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0066: a deployment check needs the robot to hold the map, and a PASS needs a fresh Fleet Sync report on that map
/// since the assignment. Fixtures that only want a ready robot use this instead of the full Technical flow.
/// </summary>
internal static class RobotReadinessTestSupport
{
    /// <summary>
    /// Assigns the map in SQL (as of one second ago, on the harness clock) and, unless <paramref name="report"/> is false,
    /// reports on it now. A deactivated or unknown robot is left unchanged.
    /// </summary>
    public static async Task AssignAndReportAsync(IServiceProvider services, string connectionString, string robotCode,
        Guid mapVersionId, Guid actorUserId, bool report = true)
    {
        var now = services.GetRequiredService<TimeProvider>().GetUtcNow();
        string mapKey = "", frameId = "";
        await using (var connection = new SqlConnection(connectionString))
        {
            await connection.OpenAsync();
            // One robot per area (UX_Robots_AssignedArea): a fixture moving the area to this robot releases the old holder.
            // A deactivated robot is left alone so the writer under test refuses it.
            await using (var update = new SqlCommand("""
                UPDATE dbo.Robots SET AssignedMapVersionId = NULL, AssignedAreaKey = NULL, MapAssignedAt = NULL, MapAssignedByUserId = NULL
                WHERE AssignedAreaKey = (SELECT AreaKey FROM dbo.MapVersions WHERE Id = @map) AND RobotCode <> @code
                    AND EXISTS (SELECT 1 FROM dbo.Robots WHERE RobotCode = @code AND DeactivatedAt IS NULL);
                UPDATE dbo.Robots SET AssignedMapVersionId = @map,
                    AssignedAreaKey = (SELECT AreaKey FROM dbo.MapVersions WHERE Id = @map),
                    MapAssignedAt = @at, MapAssignedByUserId = @actor
                WHERE RobotCode = @code AND SourceType = N'PHYSICAL' AND DeactivatedAt IS NULL;
                SELECT @@ROWCOUNT;
                """, connection))
            {
                update.Parameters.AddWithValue("@map", mapVersionId);
                update.Parameters.AddWithValue("@at", now.AddSeconds(-1));
                update.Parameters.AddWithValue("@actor", actorUserId);
                update.Parameters.AddWithValue("@code", robotCode);
                if (Convert.ToInt32(await update.ExecuteScalarAsync()) != 1) return;
                if (!report) return;
            }
            await using var read = new SqlCommand("SELECT MapKey, FrameId FROM dbo.MapVersions WHERE Id = @map;", connection);
            read.Parameters.AddWithValue("@map", mapVersionId);
            await using var reader = await read.ExecuteReaderAsync();
            await reader.ReadAsync();
            mapKey = reader.GetString(0);
            frameId = reader.GetString(1);
        }
        await ReportAsync(services, robotCode, mapKey, frameId, now);
    }

    /// <summary>The same, on the database the provider's <see cref="ApplicationDbContext"/> uses.</summary>
    public static async Task AssignAndReportAsync(IServiceProvider services, string robotCode, Guid mapVersionId, Guid actorUserId)
    {
        string connectionString;
        await using (var scope = services.CreateAsyncScope())
            connectionString = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.GetConnectionString()!;
        await AssignAndReportAsync(services, connectionString, robotCode, mapVersionId, actorUserId);
    }

    /// <summary>
    /// A fresh Fleet Sync snapshot on a new stream, received at <paramref name="receivedAt"/>. Its robot-side timestamp
    /// repeats the current stream's (or the epoch), so neither this restart nor a harness's own later stream is refused
    /// by the stream ordering policy.
    /// </summary>
    public static Task ReportAsync(IServiceProvider services, string robotCode, string mapKey, string frameId, DateTimeOffset receivedAt)
    {
        var store = services.GetRequiredService<IFleetTelemetryStore>();
        var reportedAt = store.GetLatest().FirstOrDefault(item => item.Robot.RobotCode == robotCode)?.Report.ReportedAt ?? DateTimeOffset.UnixEpoch;
        return store.ApplyAsync(new(
            new(robotCode, "PHYSICAL", null, false, mapKey, frameId),
            new FleetTelemetryReport(robotCode, Guid.NewGuid(), 1, reportedAt, mapKey, frameId, null, "IDLE", null, true, true, null, 90),
            receivedAt), CancellationToken.None);
    }
}
