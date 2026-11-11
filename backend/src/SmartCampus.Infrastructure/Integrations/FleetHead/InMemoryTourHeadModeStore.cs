using System.Collections.Concurrent;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Features.FleetHead;

namespace SmartCampus.Infrastructure.Integrations.FleetHead;

/// <summary>Per-Tour head mode in memory; a Tour never set reads <see cref="FleetHeadSettings.DefaultMode"/>.</summary>
public sealed class InMemoryTourHeadModeStore(FleetHeadSettings settings) : ITourHeadModeStore
{
    private readonly ConcurrentDictionary<Guid, string> modes = new();

    public string GetMode(Guid tourId) => modes.TryGetValue(tourId, out var mode) ? mode : settings.DefaultMode;

    public void SetMode(Guid tourId, string mode)
    {
        if (!HeadModes.All.Contains(mode))
            throw new ArgumentOutOfRangeException(nameof(mode), mode, "Head mode must be AUTO or MANUAL.");
        modes[tourId] = mode;
    }
}
