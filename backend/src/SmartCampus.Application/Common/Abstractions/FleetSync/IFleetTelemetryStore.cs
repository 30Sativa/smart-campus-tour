namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public interface IFleetTelemetryStore
{
    Task<FleetTelemetryApplyResult> ApplyAsync(
        FleetTelemetrySnapshot snapshot,
        CancellationToken cancellationToken);

    IReadOnlyList<FleetTelemetrySnapshot> GetLatest();
}

public sealed record FleetTelemetryApplyResult(
    bool Applied,
    FleetTelemetrySnapshot Current);
