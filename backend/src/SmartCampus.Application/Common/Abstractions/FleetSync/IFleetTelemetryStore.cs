namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public interface IFleetTelemetryStore
{
    Task<FleetTelemetryApplyResult> ApplyAsync(
        FleetTelemetrySnapshot snapshot,
        CancellationToken cancellationToken);

    IReadOnlyList<FleetTelemetrySnapshot> GetLatest();

    /// <summary>Remembers, in memory only, the robot's newest report refused with MAP_CONTEXT_MISMATCH.</summary>
    void RecordRejected(string robotCode, FleetRejectedReport report);

    FleetRejectedReport? GetLatestRejected(string robotCode);
}

/// <summary>A report Fleet Sync refused because its map/frame is not the robot's assigned map; <c>At</c> is when it arrived.</summary>
public sealed record FleetRejectedReport(string MapKey, string FrameId, DateTimeOffset At);

public sealed record FleetTelemetryApplyResult(
    bool Applied,
    FleetTelemetrySnapshot Current);
