namespace SmartCampus.Application.Features.FleetSync;

public sealed record FleetRobotMapContext(string MapKey, string FrameId);

public sealed class FleetSyncSettings
{
    public const long MaximumBrowserSafeSequence = 9_007_199_254_740_991L;

    public FleetSyncSettings(
        IReadOnlyDictionary<string, FleetRobotMapContext> robotContexts,
        TimeSpan maximumReportAge,
        TimeSpan maximumFutureSkew,
        TimeSpan syncFreshness,
        TimeSpan poseFreshness,
        TimeSpan freshnessBroadcastInterval,
        TimeSpan? operationsBroadcastTimeout = null,
        TimeSpan? operationsBroadcastRetryDelay = null)
    {
        var broadcastTimeout = operationsBroadcastTimeout ?? TimeSpan.FromSeconds(2);
        var broadcastRetryDelay = operationsBroadcastRetryDelay ?? TimeSpan.FromSeconds(1);
        if (maximumReportAge <= TimeSpan.Zero || maximumFutureSkew < TimeSpan.Zero ||
            syncFreshness <= TimeSpan.Zero || poseFreshness <= TimeSpan.Zero ||
            freshnessBroadcastInterval <= TimeSpan.Zero || broadcastTimeout <= TimeSpan.Zero ||
            broadcastRetryDelay <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(maximumReportAge), "Fleet sync durations must be positive (future skew may be zero).");

        RobotContexts = new Dictionary<string, FleetRobotMapContext>(robotContexts, StringComparer.Ordinal);
        MaximumReportAge = maximumReportAge;
        MaximumFutureSkew = maximumFutureSkew;
        SyncFreshness = syncFreshness;
        PoseFreshness = poseFreshness;
        FreshnessBroadcastInterval = freshnessBroadcastInterval;
        OperationsBroadcastTimeout = broadcastTimeout;
        OperationsBroadcastRetryDelay = broadcastRetryDelay;
    }

    public IReadOnlyDictionary<string, FleetRobotMapContext> RobotContexts { get; }
    public TimeSpan MaximumReportAge { get; }
    public TimeSpan MaximumFutureSkew { get; }
    public TimeSpan SyncFreshness { get; }
    public TimeSpan PoseFreshness { get; }
    public TimeSpan FreshnessBroadcastInterval { get; }
    public TimeSpan OperationsBroadcastTimeout { get; }
    public TimeSpan OperationsBroadcastRetryDelay { get; }

    public bool TryGetRobotContext(string robotCode, out FleetRobotMapContext context) =>
        RobotContexts.TryGetValue(robotCode, out context!);
}
