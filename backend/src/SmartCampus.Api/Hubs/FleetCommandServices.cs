using MediatR;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Tours.Commands.RecoverTourAfterRestart;
using SmartCampus.Application.Features.Tours.Commands.SweepRobotCommand;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Runs once before the host accepts requests (hosted services start before the server). A failure stops startup: serving
/// commands with RUNNING Tours in an unknown state is worse than not starting. Skipped while commands are disabled.
/// </summary>
public sealed class FleetCommandRestartRecovery(IServiceScopeFactory scopes, FleetCommandSettings settings,
    ILogger<FleetCommandRestartRecovery> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!settings.Enabled) return;
        IReadOnlyList<Guid> tours;
        await using (var scope = scopes.CreateAsyncScope())
            tours = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ListRunningToursQuery(), cancellationToken);
        foreach (var tour in tours)
        {
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ISender>().Send(new RecoverTourAfterRestartCommand(tour), cancellationToken);
        }
        if (tours.Count > 0) logger.LogWarning("Backend restart interrupted {TourCount} running Tours; each now needs its Operator.", tours.Count);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

/// <summary>Applies the timeout rules on a timer. Each transition is its own transaction, so one failure does not stop the others.</summary>
public sealed class FleetCommandSweeper(IServiceScopeFactory scopes, FleetCommandSettings settings, ILogger<FleetCommandSweeper> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!settings.Enabled) return;
        using var timer = new PeriodicTimer(settings.SweepInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning("Fleet command sweep failed ({ExceptionType}).", exception.GetType().FullName);
            }
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        IReadOnlyList<Guid> due;
        await using (var scope = scopes.CreateAsyncScope())
            due = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ListDueRobotCommandsQuery(), ct);
        foreach (var command in due)
        {
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ISender>().Send(new SweepRobotCommandCommand(command), ct);
        }
    }
}
