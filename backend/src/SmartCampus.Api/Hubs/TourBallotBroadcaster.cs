using System.Collections.Concurrent;
using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Sends <c>BallotUpdated</c> with the ballot on <c>/hubs/operations</c> as soon as a vote has committed (ADR-0065
/// addendum), so the Operator sees each vote at once. No delay is added: the first change of a Tour goes out
/// immediately; votes arriving while a send is in flight are folded into one send of the newest ballot of that Tour,
/// so a burst of votes never queues up stale counts.
/// </summary>
public sealed class TourBallotBroadcaster(IHubContext<FleetOperationsHub> hub, ILogger<TourBallotBroadcaster> logger)
    : BackgroundService, ITourBallotNotifier
{
    public const string EventName = "BallotUpdated";
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(2);

    private readonly ConcurrentDictionary<Guid, TourBallotSignal> latest = new();
    private readonly Channel<Guid> pending = Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions { SingleReader = true });

    public void BallotChanged(TourBallotSignal signal)
    {
        // A newer ballot replaces one not sent yet; only the first change of a Tour needs a wake-up.
        var queued = true;
        latest.AddOrUpdate(signal.TourId, _ => { queued = false; return signal; },
            (_, old) => old.At > signal.At ? old : signal);
        if (!queued) pending.Writer.TryWrite(signal.TourId);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (await pending.Reader.WaitToReadAsync(stoppingToken))
            {
                while (pending.Reader.TryRead(out var tourId))
                {
                    if (!latest.TryRemove(tourId, out var signal)) continue;
                    try
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                        timeout.CancelAfter(SendTimeout);
                        await hub.Clients.All.SendAsync(EventName, signal, timeout.Token);
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException || !stoppingToken.IsCancellationRequested)
                    {
                        logger.LogWarning("Could not publish {Event} ({ExceptionType}).", EventName, exception.GetType().FullName);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
