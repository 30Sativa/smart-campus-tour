using System.Collections.Concurrent;
using SmartCampus.Application.Common.Abstractions.Tours;

namespace SmartCampus.Application.Features.Tours;

public sealed class InMemoryTourAutoAdvanceStore : ITourAutoAdvanceStore
{
    private readonly ConcurrentDictionary<Guid, bool> enabled = new();
    private readonly ConcurrentDictionary<Guid, byte> claimed = new();
    private readonly ConcurrentDictionary<Guid, (Guid Visit, string Reason)> blocked = new();

    public bool IsEnabled(Guid tourId) => enabled.TryGetValue(tourId, out var on) && on;

    public void Set(Guid tourId, bool on)
    {
        if (on) enabled[tourId] = true;
        else enabled.TryRemove(tourId, out _);
    }

    public IReadOnlyCollection<Guid> EnabledTours() => enabled.Keys.ToArray();

    public bool TryClaim(Guid visitId) => claimed.TryAdd(visitId, 0);

    public void SetBlocked(Guid tourId, Guid visitId, string reason) => blocked[tourId] = (visitId, reason);

    public string? BlockedReason(Guid tourId, Guid? visitId) =>
        visitId is { } visit && blocked.TryGetValue(tourId, out var entry) && entry.Visit == visit ? entry.Reason : null;
}
