using SmartCampus.Application.Common.Abstractions.FleetSync;

namespace SmartCampus.Application.Features.FleetSync;

/// <summary>CONNECTED in the robot list: the robot's newest accepted report is no older than SyncFreshness.</summary>
public static class FleetSyncFreshness
{
    public static bool IsFresh(FleetTelemetrySnapshot? snapshot, DateTimeOffset now, FleetSyncSettings settings) =>
        snapshot is not null && snapshot.ReceivedAt >= now - settings.SyncFreshness;
}
