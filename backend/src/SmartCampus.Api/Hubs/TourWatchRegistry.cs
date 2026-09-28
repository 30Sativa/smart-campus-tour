using System.Collections.Concurrent;

namespace SmartCampus.Api.Hubs;

/// <summary>Tours someone is watching, the robot each one shows, and how many connections watch it.</summary>
public sealed class TourWatchRegistry
{
    private readonly ConcurrentDictionary<Guid, Entry> tours = new();

    public sealed class Entry(string robotCode)
    {
        public string RobotCode { get; set; } = robotCode;
        public int Viewers;
        public long LastSentVersion;
    }

    public void Join(Guid tourId, string robotCode)
    {
        var entry = tours.GetOrAdd(tourId, _ => new Entry(robotCode));
        entry.RobotCode = robotCode;
        Interlocked.Increment(ref entry.Viewers);
    }

    public void Leave(Guid tourId)
    {
        if (tours.TryGetValue(tourId, out var entry) && Interlocked.Decrement(ref entry.Viewers) <= 0)
            tours.TryRemove(tourId, out _);
    }

    public void Forget(Guid tourId) => tours.TryRemove(tourId, out _);

    public IReadOnlyList<KeyValuePair<Guid, Entry>> Snapshot() => tours.ToList();
}
