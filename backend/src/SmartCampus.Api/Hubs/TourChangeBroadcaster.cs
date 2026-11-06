using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Common.Abstractions.Tours;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Sends <c>TourUpdated</c> (no payload) on <c>/hubs/operations</c> after a Tour command commits. Signals are coalesced:
/// at most one send per <see cref="MinimumGap"/>, so a robot polling its command every second does not flood the
/// consoles. Clients re-read Tours on it and keep polling as the fallback; a lost signal costs one poll interval.
/// </summary>
public sealed class TourChangeBroadcaster(IHubContext<FleetOperationsHub> hub, ILogger<TourChangeBroadcaster> logger)
    : BackgroundService, ITourChangeNotifier
{
    public const string EventName = "TourUpdated";
    public static readonly TimeSpan MinimumGap = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(2);

    // One pending signal is enough: everything after it is covered by the same send.
    private readonly Channel<bool> pending = Channel.CreateBounded<bool>(new BoundedChannelOptions(1)
    {
        FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true,
    });

    public void TourChanged() => pending.Writer.TryWrite(true);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (await pending.Reader.WaitToReadAsync(stoppingToken))
            {
                pending.Reader.TryRead(out _);
                try
                {
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                    timeout.CancelAfter(SendTimeout);
                    await hub.Clients.All.SendAsync(EventName, timeout.Token);
                }
                catch (Exception exception) when (exception is not OperationCanceledException || !stoppingToken.IsCancellationRequested)
                {
                    logger.LogWarning("Could not publish {Event} ({ExceptionType}).", EventName, exception.GetType().FullName);
                }
                await Task.Delay(MinimumGap, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
