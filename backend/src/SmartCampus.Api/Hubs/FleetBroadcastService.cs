using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Features.RobotTelemetry;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Pushes the latest poses on a fixed beat instead of per sample, so the
/// browser rate does not follow the robot rate: operators at most 5 Hz
/// (only robots that changed), Tour viewers at most 2 Hz. Every 5 s it checks
/// the watched Tours are still RUNNING and tells their viewers when not.
/// </summary>
public sealed class FleetBroadcastService(
    IHubContext<FleetHub> hub,
    IRobotTelemetryStore store,
    TourWatchRegistry watches,
    IServiceScopeFactory scopes,
    TimeProvider clock,
    ILogger<FleetBroadcastService> logger) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMilliseconds(200);
    private const int StudentEveryTicks = 3;   // 600 ms, under 2 Hz
    private const int RecheckEveryTicks = 25;  // 5 s

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Tick, clock);
        long operatorsVersion = 0;
        var tick = 0;
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            tick++;
            try
            {
                var changed = store.ChangedSince(operatorsVersion);
                if (changed.Count > 0)
                {
                    operatorsVersion = changed.Max(state => state.Version);
                    await hub.Clients.Group(FleetHub.Operators)
                        .SendAsync(FleetMessages.RobotPoses, FleetMessages.Operators(changed, clock.GetUtcNow()), stoppingToken);
                }

                if (tick % RecheckEveryTicks == 0) await RecheckToursAsync(stoppingToken);
                if (tick % StudentEveryTicks == 0) await SendTourPosesAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // One failed push must not stop the beat for everyone else.
                logger.LogWarning(exception, "Fleet broadcast tick failed.");
            }
        }
    }

    private async Task SendTourPosesAsync(CancellationToken cancellationToken)
    {
        foreach (var (tourId, entry) in watches.Snapshot())
        {
            var state = store.Get(entry.RobotCode);
            if (state is null || state.Version <= entry.LastSentVersion) continue;
            entry.LastSentVersion = state.Version;
            await hub.Clients.Group(FleetHub.TourGroup(tourId))
                .SendAsync(FleetMessages.TourRobotPose, FleetMessages.Student(tourId, state, clock.GetUtcNow()), cancellationToken);
        }
    }

    private async Task RecheckToursAsync(CancellationToken cancellationToken)
    {
        var watched = watches.Snapshot();
        if (watched.Count == 0) return;
        using var scope = scopes.CreateScope();
        var resolver = scope.ServiceProvider.GetRequiredService<ITourRobotResolver>();
        foreach (var (tourId, entry) in watched)
        {
            var robotCode = await resolver.RunningRobotCodeAsync(tourId, cancellationToken);
            if (robotCode is null)
            {
                watches.Forget(tourId);
                await hub.Clients.Group(FleetHub.TourGroup(tourId)).SendAsync(FleetMessages.TourRobotEnded, new { tourId }, cancellationToken);
            }
            else if (robotCode != entry.RobotCode)
            {
                entry.RobotCode = robotCode;
                entry.LastSentVersion = 0;
            }
        }
    }
}
