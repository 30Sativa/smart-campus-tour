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
    Guid? AssignedMapVersionId,
    string? AssignedAreaName,
    int? AssignedVersionNumber,
    string? AssignedMapKey,
    string? AssignedFrameId,
    DateTimeOffset? MapAssignedAt,
    string? MapAssignedByName,
    string? LatestDeployedMapKey,
    string? LatestDeployedFrameId,
    bool? LatestDeploymentPassed,
    DateTimeOffset? DeactivatedAt,
    string? DeactivationReason,
    bool NeedsInspection,
    Guid? CurrentTourId,
    string? CurrentTourName,
    string? CurrentTourState,
    bool IsDispatchEnabled);

/// <summary>Pickers never see a deactivated robot; only the robot page asks for them.</summary>
public sealed record ListPhysicalRobotsQuery(bool IncludeDeactivated = false) : IRequest<IReadOnlyList<PhysicalRobotStatus>>;

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
        return robots.Where(robot => query.IncludeDeactivated || !robot.IsDeactivated).Select(robot =>
        {
            latestByRobot.TryGetValue(robot.RobotCode, out var latest);
            var connectionStatus = robot.FirstAcceptedSyncAt is null
                ? "UNCONFIRMED"
                : latest is null
                    ? "AWAITING_DATA"
                    : latest.ReceivedAt >= now - fleetSyncSettings.SyncFreshness
                        ? "CONNECTED"
                        : "DISCONNECTED";
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
                Convert.ToBase64String(robot.RowVersion), robot.AssignedMapVersionId,
                robot.AssignedMapVersion?.AreaKeyNavigation.DisplayName,
                robot.AssignedMapVersion?.VersionNumber, robot.AssignedMapVersion?.MapKey,
                robot.AssignedMapVersion?.FrameId, robot.MapAssignedAt, robot.MapAssignedByUser?.FullName,
                latestDeployment?.MapVersion.MapKey, latestDeployment?.MapVersion.FrameId,
                latestDeployment is null ? null : latestDeployment.LocalizationPassed && latestDeployment.DisplayPassed,
                robot.DeactivatedAt, robot.DeactivationReason,
                robot.NeedsInspection, robot.CurrentTourId, robot.CurrentTour?.Name, robot.CurrentTour?.State,
                robot.IsDispatchEnabled);
        }).ToArray();
    }
}
