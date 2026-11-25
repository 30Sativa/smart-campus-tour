using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Features.StaffNotifications;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Sends <c>StaffNotificationsUpdated</c> (no payload) on <c>/hubs/operations</c> after a Technical Staff outcome
/// committed, so the Staff bell re-reads <c>GET /api/staff/notifications</c> at once instead of at its next poll.
/// Coalesced like <see cref="TourChangeBroadcaster"/>: at most one send per <see cref="MinimumGap"/>; a lost signal
/// costs one poll interval.
/// </summary>
public sealed class StaffNoticeBroadcaster(IHubContext<FleetOperationsHub> hub, ILogger<StaffNoticeBroadcaster> logger)
    : BackgroundService, IStaffNoticeNotifier
{
    public const string EventName = "StaffNotificationsUpdated";
    public static readonly TimeSpan MinimumGap = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(2);

    // One pending signal is enough: everything after it is covered by the same send.
    private readonly Channel<bool> pending = Channel.CreateBounded<bool>(new BoundedChannelOptions(1)
    {
        FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true,
    });

    public void StaffNoticesChanged() => pending.Writer.TryWrite(true);

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
