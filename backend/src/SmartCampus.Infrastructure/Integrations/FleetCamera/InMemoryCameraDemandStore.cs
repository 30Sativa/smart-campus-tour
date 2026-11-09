using System.Collections.Concurrent;
using SmartCampus.Application.Common.Abstractions.FleetCamera;

namespace SmartCampus.Infrastructure.Integrations.FleetCamera;

/// <summary>ADR-0052 camera demand, per API instance (ADR-0019 single instance), like the head command channel.</summary>
public sealed class InMemoryCameraDemandStore : ICameraDemandStore
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> polls = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, DateTimeOffset> leases = new(StringComparer.OrdinalIgnoreCase);

    public void RecordPoll(string robotCode, DateTimeOffset at)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(robotCode);
        polls.AddOrUpdate(robotCode, at, (_, previous) => at > previous ? at : previous);
    }

    public DateTimeOffset? GetLastPoll(string robotCode) =>
        polls.TryGetValue(robotCode, out var at) ? at : null;

    public DateTimeOffset ExtendLease(string robotCode, DateTimeOffset until)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(robotCode);
        return leases.AddOrUpdate(robotCode, until, (_, previous) => until > previous ? until : previous);
    }

    public DateTimeOffset? GetLease(string robotCode) =>
        leases.TryGetValue(robotCode, out var until) ? until : null;
}
