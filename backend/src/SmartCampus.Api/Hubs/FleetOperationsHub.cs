using System.Globalization;
using System.Threading.Channels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;

namespace SmartCampus.Api.Hubs;

public static class FleetOperationsAuthorization
{
    public const string StaffPolicy = "FleetOperationsStaff";
}

[Authorize(Policy = FleetOperationsAuthorization.StaffPolicy)]
public sealed class FleetOperationsHub(FleetOperationsBroadcaster broadcaster) : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("FleetUpdated", broadcaster.GetCurrentProjection(), Context.ConnectionAborted);
        await base.OnConnectedAsync();
    }
}

public sealed record FleetOperationsRobot(
    string Id,
    string Name,
    string OperationalState,
    string ConnectionState,
    double? BatteryPercent,
    DateTimeOffset LastSeenAt,
    double TelemetryAgeSeconds,
    string SensorHealth,
    string Source,
    string ExecutionState,
    FleetPose? Pose,
    double? PoseAgeSeconds,
    bool? Localized,
    bool? MotionReady,
    bool SyncFresh,
    bool PoseFresh,
    string ExecutionStatus,
    Guid StreamId,
    long Seq,
    DateTimeOffset ReportedAt,
    string MapKey,
    string FrameId,
    Guid? LegId,
    string? FaultCode,
    bool NeedsCheck,
    bool? Assignable);

public sealed class FleetOperationsBroadcaster(
    IHubContext<FleetOperationsHub> hub,
    IFleetTelemetryStore store,
    FleetSyncSettings settings,
    TimeProvider clock,
    ILogger<FleetOperationsBroadcaster> logger)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly Channel<byte> telemetryChanges = Channel.CreateBounded<byte>(new BoundedChannelOptions(1)
    {
        FullMode = BoundedChannelFullMode.DropWrite,
        SingleReader = true,
        SingleWriter = false
    });
    private string? lastFreshnessSignature;

    public FleetOperationsRobot[] GetCurrentProjection() => CreateProjection(clock.GetUtcNow());

    public void NotifyTelemetryUpdated() => telemetryChanges.Writer.TryWrite(0);

    public ValueTask<bool> WaitForTelemetryUpdateAsync(CancellationToken cancellationToken) =>
        telemetryChanges.Reader.WaitToReadAsync(cancellationToken);

    public void DrainTelemetryUpdates()
    {
        while (telemetryChanges.Reader.TryRead(out _)) { }
    }

    public Task<bool> PublishCurrentAsync(CancellationToken cancellationToken) =>
        PublishAsync(onlyWhenFreshnessChanges: false, cancellationToken);

    public Task<bool> PublishFreshnessChangesAsync(CancellationToken cancellationToken) =>
        PublishAsync(onlyWhenFreshnessChanges: true, cancellationToken);

    private async Task<bool> PublishAsync(bool onlyWhenFreshnessChanges, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var now = clock.GetUtcNow();
            var projections = CreateProjection(now);
            var intervalSeconds = settings.FreshnessBroadcastInterval.TotalSeconds;
            var signature = string.Join('|', projections.Select(robot => string.Join(':',
                robot.Id,
                robot.SyncFresh,
                robot.PoseFresh,
                Math.Floor(robot.TelemetryAgeSeconds / intervalSeconds).ToString(CultureInfo.InvariantCulture),
                robot.PoseAgeSeconds is { } poseAge
                    ? Math.Floor(poseAge / intervalSeconds).ToString(CultureInfo.InvariantCulture)
                    : "-")));
            if (onlyWhenFreshnessChanges && string.Equals(signature, lastFreshnessSignature, StringComparison.Ordinal))
                return true;

            try
            {
                using var timeout = new CancellationTokenSource(settings.OperationsBroadcastTimeout);
                using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
                await hub.Clients.All.SendAsync("FleetUpdated", projections, linked.Token);
                lastFreshnessSignature = signature;
                return true;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (OperationCanceledException exception)
            {
                logger.LogWarning("Fleet projection broadcast timed out ({ExceptionType}).", exception.GetType().FullName);
                return false;
            }
            catch (Exception exception)
            {
                logger.LogWarning("Could not publish fleet projection ({ExceptionType}).", exception.GetType().FullName);
                return false;
            }
        }
        finally
        {
            gate.Release();
        }
    }

    private FleetOperationsRobot[] CreateProjection(DateTimeOffset now) => store.GetLatest()
        .Select(snapshot => FleetOperationsProjection.Create(snapshot, now, settings))
        .OrderBy(robot => robot.Id, StringComparer.Ordinal)
        .ToArray();
}

public static class FleetOperationsProjection
{
    public static FleetOperationsRobot Create(
        FleetTelemetrySnapshot snapshot,
        DateTimeOffset now,
        FleetSyncSettings settings)
    {
        var report = snapshot.Report;
        var syncAge = AgeSeconds(now, snapshot.ReceivedAt);
        var poseAge = report.Pose is null ? (double?)null : AgeSeconds(now, report.Pose.CapturedAt);
        var syncFresh = syncAge <= settings.SyncFreshness.TotalSeconds;
        var poseFresh = poseAge is { } age && age <= settings.PoseFreshness.TotalSeconds;
        return new FleetOperationsRobot(
            snapshot.Robot.RobotCode,
            string.IsNullOrWhiteSpace(snapshot.Robot.DisplayName) ? snapshot.Robot.RobotCode : snapshot.Robot.DisplayName,
            "Unknown",
            syncFresh ? "Live" : "Stale",
            report.BatteryPercent,
            snapshot.ReceivedAt,
            syncAge,
            "Unknown",
            SourceName(snapshot.Robot.SourceType),
            report.Status switch { "IDLE" => "Idle", "NAVIGATING" => "Navigating", _ => "Unknown" },
            report.Pose,
            poseAge,
            report.Localized,
            report.MotionReady,
            syncFresh,
            poseFresh,
            report.Status,
            report.StreamId,
            report.Seq,
            report.ReportedAt,
            report.MapKey,
            report.FrameId,
            report.LegId,
            report.FaultCode,
            snapshot.Robot.NeedsInspection,
            null);
    }

    private static double AgeSeconds(DateTimeOffset now, DateTimeOffset time) =>
        Math.Max(0, (now - time).TotalSeconds);

    private static string SourceName(string sourceType) => sourceType switch
    {
        "PHYSICAL" => "Physical",
        "GAZEBO" => "Gazebo",
        "EMULATOR" => "Emulator",
        _ => "Unknown"
    };
}

public sealed class FleetFreshnessMonitor(
    FleetOperationsBroadcaster broadcaster,
    FleetSyncSettings settings,
    ILogger<FleetFreshnessMonitor> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(settings.FreshnessBroadcastInterval);
        var telemetryUpdate = broadcaster.WaitForTelemetryUpdateAsync(stoppingToken).AsTask();
        var freshnessTick = timer.WaitForNextTickAsync(stoppingToken).AsTask();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var completed = await Task.WhenAny(telemetryUpdate, freshnessTick);
                if (completed == telemetryUpdate)
                {
                    if (!await telemetryUpdate)
                        return;

                    broadcaster.DrainTelemetryUpdates();
                    telemetryUpdate = broadcaster.WaitForTelemetryUpdateAsync(stoppingToken).AsTask();
                    if (!await broadcaster.PublishCurrentAsync(stoppingToken))
                    {
                        await Task.Delay(settings.OperationsBroadcastRetryDelay, stoppingToken);
                        broadcaster.NotifyTelemetryUpdated();
                    }
                }
                else
                {
                    if (!await freshnessTick)
                        return;

                    freshnessTick = timer.WaitForNextTickAsync(stoppingToken).AsTask();
                    await broadcaster.PublishFreshnessChangesAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning("Fleet freshness monitor failed ({ExceptionType}).", exception.GetType().FullName);
            }
        }
    }
}
