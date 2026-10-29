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
    string CredentialStatus,
    DateTimeOffset? CredentialIssuedAt,
    Guid? CredentialIssuedByUserId,
    string? CredentialIssuedByName,
    string? CredentialHint,
    DateTimeOffset? CredentialRevokedAt,
    Guid? CredentialRevokedByUserId,
    string? CredentialRevokedByName,
    string RowVersion,
    bool MapContextConfigured,
    string? ConfiguredMapKey,
    string? ConfiguredFrameId,
    string? LatestDeployedMapKey,
    string? LatestDeployedFrameId);

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
        var latestDeploymentByRobot = (await repository.ListLatestDeploymentChecksAsync(ct))
            .ToDictionary(check => check.RobotId);
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
            latestDeploymentByRobot.TryGetValue(robot.Id, out var latestDeployment);
            var credentialStatus = robot.CredentialHash is not null ? "ACTIVE"
                : robot.CredentialRevokedAt is not null ? "REVOKED" : "NOT_ISSUED";
            return new PhysicalRobotStatus(robot.Id, robot.RobotCode, robot.DisplayName,
                robot.FirstAcceptedSyncAt, robot.FirstAcceptedMapKey, robot.FirstAcceptedFrameId,
                connectionStatus, latest?.ReceivedAt, credentialStatus,
                robot.CredentialIssuedAt, robot.CredentialIssuedByUserId,
                robot.CredentialIssuedByUser?.FullName, robot.CredentialHint,
                robot.CredentialRevokedAt, robot.CredentialRevokedByUserId,
                robot.CredentialRevokedByUser?.FullName,
                Convert.ToBase64String(robot.RowVersion),
                mapContextConfigured, mapContextConfigured ? context.MapKey : null,
                mapContextConfigured ? context.FrameId : null,
                latestDeployment?.MapVersion.MapKey, latestDeployment?.MapVersion.FrameId);
        }).ToArray();
    }
}
