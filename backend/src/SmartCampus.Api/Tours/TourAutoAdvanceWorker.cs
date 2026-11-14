using MediatR;
using SmartCampus.Application.Features.Tours.Commands.AutoAdvanceTour;

namespace SmartCampus.Api.Tours;

/// <summary>
/// Every 2 seconds, gives each Tour whose Operator turned on the automatic departure and whose dwell has ended its one
/// attempt to leave the POI. Each Tour is its own command and transaction; the attempt runs every movement check.
/// </summary>
public sealed class TourAutoAdvanceWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<TourAutoAdvanceWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogWarning("Tour auto-advance run failed ({ErrorType}).", error.GetType().Name); }
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        IReadOnlyList<Guid> due;
        await using (var scope = scopes.CreateAsyncScope())
            due = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ListAutoAdvanceDueQuery(), ct);
        foreach (var tourId in due)
        {
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ISender>().Send(new AutoAdvanceTourCommand(tourId), ct);
        }
    }
}
