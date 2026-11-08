using MediatR;
using SmartCampus.Application.Features.Tours.Commands.ExpirePendingDecisions;

namespace SmartCampus.Api.Tours;

/// <summary>ADR-0048: every 60 seconds, closes what Staff has not decided by T-24h. Each Tour is its own command and transaction.</summary>
public sealed class RosterExpiryWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<RosterExpiryWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, clock);
        do
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogWarning("Roster expiry run failed ({ErrorType}).", error.GetType().Name); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        IReadOnlyList<Guid> due;
        await using (var scope = scopes.CreateAsyncScope())
            due = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ListToursWithExpirableDecisionsQuery(), ct);
        var expired = 0;
        foreach (var tourId in due)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                expired += await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ExpirePendingDecisionsCommand(tourId), ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception error) { logger.LogWarning("Roster expiry of Tour {TourId} failed ({ErrorType}); it is retried next run.", tourId, error.GetType().Name); }
        }
        if (expired > 0) logger.LogInformation("Roster expiry closed {Expired} undecided items at T-24h.", expired);
    }
}
