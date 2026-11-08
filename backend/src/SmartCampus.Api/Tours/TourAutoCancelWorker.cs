using MediatR;
using SmartCampus.Application.Features.Tours.Commands.AutoCancelOverdueTour;

namespace SmartCampus.Api.Tours;

/// <summary>
/// ADR-0047: every 60 seconds, cancels SCHEDULED/READY Tours whose robot hold ended without a Start. Each Tour is its own
/// command and transaction; nothing is ever sent to a robot.
/// </summary>
public sealed class TourAutoCancelWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<TourAutoCancelWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, clock);
        do
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogWarning("Tour auto-cancel run failed ({ErrorType}).", error.GetType().Name); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        IReadOnlyList<Guid> due;
        await using (var scope = scopes.CreateAsyncScope())
            due = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ListOverdueUnstartedToursQuery(), ct);
        int cancelled = 0, backlog = 0;
        foreach (var tourId in due)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var outcome = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new AutoCancelOverdueTourCommand(tourId), ct);
                if (outcome == AutoCancelOutcome.Cancelled) cancelled++;
                else if (outcome == AutoCancelOutcome.CancelledWithoutNotice) backlog++;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception error) { logger.LogWarning("Auto-cancel of Tour {TourId} failed ({ErrorType}); it is retried next run.", tourId, error.GetType().Name); }
        }
        if (cancelled + backlog > 0)
            logger.LogInformation("Tour auto-cancel cancelled {Cancelled} Tours with notice and {Backlog} backlog Tours without email.", cancelled, backlog);
    }
}
