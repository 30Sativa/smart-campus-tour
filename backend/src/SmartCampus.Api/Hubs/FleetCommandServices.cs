using MediatR;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Tours.Commands.RecoverTourAfterRestart;
using SmartCampus.Application.Features.Tours.Commands.SweepRobotCommand;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Runs once before the host accepts requests (hosted services start before the server), whatever
/// <c>FleetCommands:Enabled</c> says: a Tour started before the flag was turned off still needs its Operator. While the flag
/// is on a failure stops startup: serving commands with RUNNING Tours in an unknown state is worse than not starting. While
/// it is off no GoTo can be created or delivered, so a failure (for example SQL not reachable yet) is logged and startup
/// goes on; the next start with the flag on runs recovery again and must succeed.
/// </summary>
public sealed class FleetCommandRestartRecovery(IServiceScopeFactory scopes, FleetCommandSettings settings,
    ILogger<FleetCommandRestartRecovery> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await RecoverAsync(cancellationToken);
        }
        catch (Exception exception) when (!settings.Enabled && exception is not OperationCanceledException)
        {
            logger.LogWarning("Fleet command restart recovery failed while commands are off ({ExceptionType}); no GoTo can be delivered.",
                exception.GetType().FullName);
        }
    }

    private async Task RecoverAsync(CancellationToken cancellationToken)
    {
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

/// <summary>
/// Applies the timeout rules on a timer, whatever <c>FleetCommands:Enabled</c> says. Each transition is its own transaction,
/// so one failure does not stop the others.
/// </summary>
public sealed class FleetCommandSweeper(IServiceScopeFactory scopes, FleetCommandSettings settings, ILogger<FleetCommandSweeper> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
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
