using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record PhysicalRobotOption(Guid Id, string RobotCode, string? DisplayName);

public sealed record PhysicalRobotStatus(
    Guid Id,
    string RobotCode,
    string? DisplayName,
    DateTimeOffset? FirstAcceptedSyncAt,
    string? FirstAcceptedMapKey,
    string? FirstAcceptedFrameId,
    string ConnectionStatus,
    DateTimeOffset? LastSyncReceivedAt,
    bool CredentialProvisioned,
    string RowVersion,
    bool MapContextConfigured,
    string? ConfiguredMapKey,
    string? ConfiguredFrameId);

public sealed record ListPhysicalRobotsQuery : IRequest<IReadOnlyList<PhysicalRobotStatus>>;

public sealed class ListPhysicalRobotsQueryHandler(
    IPhysicalRobotRepository repository,
    IFleetTelemetryStore telemetryStore,
    FleetSyncSettings fleetSyncSettings,
    TimeProvider timeProvider)
    : IRequestHandler<ListPhysicalRobotsQuery, IReadOnlyList<PhysicalRobotStatus>>
{
    public async Task<IReadOnlyList<PhysicalRobotStatus>> Handle(ListPhysicalRobotsQuery query, CancellationToken ct)
    {
        var robots = await repository.ListPhysicalRobotsAsync(ct);
        var latestByRobot = telemetryStore.GetLatest()
            .ToDictionary(snapshot => snapshot.Robot.RobotCode, StringComparer.Ordinal);
        var now = timeProvider.GetUtcNow();
        return robots.Select(robot =>
        {
            latestByRobot.TryGetValue(robot.RobotCode, out var latest);
            var connectionStatus = robot.FirstAcceptedSyncAt is null
                ? "UNCONFIRMED"
                : latest is null
                    ? "AWAITING_DATA"
                    : latest.ReceivedAt >= now - fleetSyncSettings.SyncFreshness
                        ? "CONNECTED"
                        : "DISCONNECTED";
            var mapContextConfigured = fleetSyncSettings.TryGetRobotContext(robot.RobotCode, out var context);
            return new PhysicalRobotStatus(robot.Id, robot.RobotCode, robot.DisplayName,
                robot.FirstAcceptedSyncAt, robot.FirstAcceptedMapKey, robot.FirstAcceptedFrameId,
                connectionStatus, latest?.ReceivedAt, robot.CredentialHash.Length == 32,
                Convert.ToBase64String(robot.RowVersion),
                mapContextConfigured, mapContextConfigured ? context.MapKey : null,
                mapContextConfigured ? context.FrameId : null);
        }).ToArray();
    }
}
