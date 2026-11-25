using Microsoft.Extensions.Logging.Abstractions;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.FleetSync.Commands.SyncFleetTelemetry;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Integrations.FleetSync;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// Round 3 F2: a robot whose reports Fleet Sync refuses for the wrong map shows WRONG_MAP with the key it sent, instead of
/// DISCONNECTED; the real in-memory store, sync handler and robot list, no SQL.
/// </summary>
public sealed class FleetWrongMapConnectionTests
{
    private static readonly FleetSyncSettings Settings = new(TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));

    private readonly MapVersion oldMap = Map("test123", "Tầng 6");
    private readonly MapVersion newMap = Map("tang-6", "Tầng 6");
    private readonly Clock clock = new(new DateTimeOffset(2026, 11, 23, 9, 5, 0, TimeSpan.Zero));
    private readonly InMemoryFleetTelemetryStore store = new();
    private readonly Guid stream = Guid.NewGuid();
    private readonly Robot robot;
    private long seq;

    public FleetWrongMapConnectionTests()
    {
        robot = new Robot
        {
            Id = Guid.NewGuid(), RobotCode = "amr_01", SourceType = "PHYSICAL", RowVersion = new byte[8],
            FirstAcceptedSyncAt = clock.GetUtcNow().AddDays(-1)
        };
        Assign(oldMap);
    }

    [Fact]
    public async Task Reports_on_the_old_map_after_a_reassignment_show_wrong_map_with_the_key_sent()
    {
        await SendAsync(oldMap);
        Assert.Equal("CONNECTED", (await ListAsync()).ConnectionStatus);

        clock.Advance(TimeSpan.FromMinutes(1));
        Assign(newMap);
        clock.Advance(TimeSpan.FromSeconds(1));
        await Assert.ThrowsAsync<ConflictException>(() => SendAsync(oldMap));

        var row = await ListAsync();
        Assert.Equal("WRONG_MAP", row.ConnectionStatus);
        Assert.Equal(new FleetRejectedReportView("test123-v1", "map", clock.GetUtcNow(),
            "Robot đang gửi dữ liệu theo test123-v1, bị từ chối vì đang gán tang-6-v1. Đổi MapKey/FrameId trên MiniPC."),
            row.LastRejectedReport);
        Assert.Equal("CONFIGURE_MINIPC", row.Readiness.NextStep);
    }

    [Fact]
    public async Task Reporting_on_the_assigned_map_again_is_connected()
    {
        Assign(newMap);
        clock.Advance(TimeSpan.FromSeconds(1));
        await Assert.ThrowsAsync<ConflictException>(() => SendAsync(oldMap));
        Assert.Equal("WRONG_MAP", (await ListAsync()).ConnectionStatus);

        clock.Advance(TimeSpan.FromSeconds(1));
        await SendAsync(newMap);

        var row = await ListAsync();
        Assert.Equal("CONNECTED", row.ConnectionStatus);
        Assert.Null(row.LastRejectedReport);
        Assert.True(row.Readiness.ReportingOnAssignedMap);
        Assert.Equal("DEPLOYMENT_CHECK", row.Readiness.NextStep);
    }

    [Fact]
    public async Task A_refusal_older_than_sync_freshness_is_disconnected_again()
    {
        await SendAsync(oldMap);
        clock.Advance(TimeSpan.FromSeconds(1));
        Assign(newMap);
        await Assert.ThrowsAsync<ConflictException>(() => SendAsync(oldMap));
        // The accepted report a second earlier is still fresh, but the newer refusal wins: not CONNECTED.
        Assert.Equal("WRONG_MAP", (await ListAsync()).ConnectionStatus);

        clock.Advance(Settings.SyncFreshness + TimeSpan.FromSeconds(1));

        var row = await ListAsync();
        Assert.Equal("DISCONNECTED", row.ConnectionStatus);
        Assert.Null(row.LastRejectedReport);
    }

    [Fact]
    public async Task After_a_backend_restart_a_refused_robot_is_wrong_map_not_awaiting_data()
    {
        Assign(newMap);
        await Assert.ThrowsAsync<ConflictException>(() => SendAsync(oldMap));

        Assert.Equal("WRONG_MAP", (await ListAsync()).ConnectionStatus);
    }

    [Fact]
    public async Task A_refusal_from_before_the_current_assignment_is_not_shown()
    {
        Assign(newMap);
        await Assert.ThrowsAsync<ConflictException>(() => SendAsync(oldMap));
        clock.Advance(TimeSpan.FromSeconds(1));
        // Technical gives the robot the map its bridge is sending; that refusal no longer applies.
        Assign(oldMap);

        var row = await ListAsync();
        Assert.Equal("AWAITING_DATA", row.ConnectionStatus);
        Assert.Null(row.LastRejectedReport);
    }

    [Fact]
    public async Task Only_a_frame_id_mismatch_names_the_frame()
    {
        Assign(newMap);
        await Assert.ThrowsAsync<ConflictException>(() => SendAsync(newMap, frameId: "odom"));

        Assert.Equal("Robot đang gửi dữ liệu theo FrameId odom, bị từ chối vì đang gán tang-6-v1 với FrameId map. Đổi MapKey/FrameId trên MiniPC.",
            (await ListAsync()).LastRejectedReport?.Message);
    }

    private void Assign(MapVersion map)
    {
        robot.AssignedMapVersionId = map.Id;
        robot.AssignedMapVersion = map;
        robot.AssignedAreaKey = map.AreaKey;
        robot.MapAssignedAt = clock.GetUtcNow();
    }

    private Task<SyncFleetTelemetryResult> SendAsync(MapVersion sent, string? frameId = null)
    {
        var identity = new FleetRobotIdentity(robot.RobotCode, "PHYSICAL", null, false,
            robot.AssignedMapVersion?.MapKey, robot.AssignedMapVersion?.FrameId);
        var report = new FleetTelemetryReport(robot.RobotCode, stream, ++seq, clock.GetUtcNow(), sent.MapKey, frameId ?? sent.FrameId,
            null, "IDLE", null, true, true, null, 80);
        var handler = new SyncFleetTelemetryHandler(store, new NoConfirmation(), clock, NullLogger<SyncFleetTelemetryHandler>.Instance);
        return handler.Handle(new SyncFleetTelemetry(identity, report, new byte[32], IsConnectionConfirmedForCredential: true),
            CancellationToken.None);
    }

    private async Task<PhysicalRobotStatus> ListAsync() => Assert.Single(
        await new ListPhysicalRobotsQueryHandler(new Robots(robot), store, Settings, clock).Handle(new ListPhysicalRobotsQuery(), default));

    private static MapVersion Map(string areaKey, string areaName) => new()
    {
        Id = Guid.NewGuid(), AreaKey = areaKey, VersionNumber = 1, MapKey = $"{areaKey}-v1", FrameId = "map",
        PackageSha256 = new byte[32], AreaKeyNavigation = new MapArea { AreaKey = areaKey, DisplayName = areaName }
    };

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset current = now;
        public override DateTimeOffset GetUtcNow() => current;
        public void Advance(TimeSpan by) => current += by;
    }

    private sealed class NoConfirmation : IFleetRobotConnectionConfirmationStore
    {
        public Task<bool> TryRecordFirstAcceptedAsync(string robotCode, byte[] verifiedCredentialHash, string mapKey, string frameId,
            DateTimeOffset acceptedAt, CancellationToken cancellationToken) => Task.FromResult(false);
    }

    private sealed class Robots(Robot robot) : IPhysicalRobotRepository
    {
        public Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Robot>>([robot]);
        public Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<MapDeploymentCheck>>([]);
        public Task<IReadOnlyList<UpcomingTourTarget>> ListUpcomingTourTargetsAsync(DateTimeOffset from, DateTimeOffset to,
            CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<UpcomingTourTarget>>([]);
        public Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken) => Task.FromResult(false);
        public void Add(Robot robot) => throw new NotSupportedException();
        public void AddAuditLog(AuditLog auditLog) => throw new NotSupportedException();
    }
}
