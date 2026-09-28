using System.Collections.Concurrent;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.RobotTelemetry;

/// <summary>
/// Thread-safe latest-state store. Ordering rule, same as the Gazebo preview:
/// within a stream <c>seq</c> must grow; a new stream (bridge restart) must
/// carry a newer <c>capturedAt</c>; nothing older than the current sample wins.
/// </summary>
public sealed class RobotTelemetryStore : IRobotTelemetryStore
{
    private readonly ConcurrentDictionary<string, RobotPoseState> latest = new(StringComparer.Ordinal);
    private readonly object gate = new();
    private long version;

    public long Version => Interlocked.Read(ref version);

    public RobotPoseState Accept(RobotPoseSample sample, DateTimeOffset receivedAt)
    {
        lock (gate)
        {
            if (latest.TryGetValue(sample.RobotCode, out var current))
            {
                var previous = current.Sample;
                var stale = sample.CapturedAt < previous.CapturedAt ||
                    (sample.StreamId == previous.StreamId && sample.Seq <= previous.Seq) ||
                    (sample.StreamId != previous.StreamId && sample.CapturedAt <= previous.CapturedAt);
                if (stale) throw new ConflictException("Duplicate or out-of-order robot pose.");
            }

            var state = new RobotPoseState(sample, receivedAt, Interlocked.Increment(ref version));
            latest[sample.RobotCode] = state;
            return state;
        }
    }

    public RobotPoseState? Get(string robotCode) => latest.TryGetValue(robotCode, out var state) ? state : null;

    public IReadOnlyList<RobotPoseState> All() => latest.Values.OrderBy(state => state.Sample.RobotCode, StringComparer.Ordinal).ToList();

    public IReadOnlyList<RobotPoseState> ChangedSince(long since) =>
        latest.Values.Where(state => state.Version > since).OrderBy(state => state.Sample.RobotCode, StringComparer.Ordinal).ToList();
}
