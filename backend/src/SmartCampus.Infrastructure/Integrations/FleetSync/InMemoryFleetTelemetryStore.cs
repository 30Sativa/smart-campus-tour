using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

public sealed class InMemoryFleetTelemetryStore : IFleetTelemetryStore
{
    private const int RetiredStreamHistoryLimit = 16;
    private readonly ConcurrentDictionary<string, RobotState> robots = new(StringComparer.Ordinal);

    public InMemoryFleetTelemetryStore(ILogger<InMemoryFleetTelemetryStore>? logger = null) => Logger = logger;

    private ILogger<InMemoryFleetTelemetryStore>? Logger { get; }

    public Task<FleetTelemetryApplyResult> ApplyAsync(
        FleetTelemetrySnapshot snapshot,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var robotCode = snapshot.Robot.RobotCode;
        var state = robots.GetOrAdd(robotCode, static _ => new RobotState());

        lock (state.Gate)
        {
            var current = state.Latest;
            var transition = FleetTelemetryOrderingPolicy.Decide(current, snapshot, state.RetiredStreamIds);
            if (transition == FleetTelemetryTransition.Duplicate)
                return Task.FromResult(new FleetTelemetryApplyResult(false, current!));

            if (transition == FleetTelemetryTransition.NewStream)
            {
                state.Retire(current!.Report.StreamId);
                Logger?.LogWarning(
                    "Fleet telemetry stream ownership changed for robot {RobotCode}; old stream {OldStreamId} was retired in this process.",
                    robotCode,
                    current.Report.StreamId);
            }

            state.Latest = snapshot;
            return Task.FromResult(new FleetTelemetryApplyResult(true, snapshot));
        }
    }

    public IReadOnlyList<FleetTelemetrySnapshot> GetLatest() => robots.Values
        .Select(state => state.Latest)
        .Where(snapshot => snapshot is not null)
        .Select(snapshot => snapshot!)
        .OrderBy(snapshot => snapshot.Robot.RobotCode, StringComparer.Ordinal)
        .ToArray();

    private sealed class RobotState
    {
        private readonly Queue<Guid> retiredOrder = new();
        private readonly HashSet<Guid> retired = [];

        public object Gate { get; } = new();
        public FleetTelemetrySnapshot? Latest { get; set; }
        public IReadOnlySet<Guid> RetiredStreamIds => retired;

        public void Retire(Guid streamId)
        {
            if (!retired.Add(streamId))
                return;

            retiredOrder.Enqueue(streamId);
            while (retiredOrder.Count > RetiredStreamHistoryLimit)
                retired.Remove(retiredOrder.Dequeue());
        }
    }
}
