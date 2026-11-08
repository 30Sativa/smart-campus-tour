using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;

namespace SmartCampus.Application.Features.RobotDiagnostics.Queries.GetRobotDiagnostics;

public sealed record GetRobotDiagnosticsQuery(string RobotCode) : IQuery<RobotDiagnosticsDetailDto>;

public sealed record RobotDiagnosticsDetailDto(
    string RobotCode,
    string? DisplayName,
    string ConnectionStatus,
    string? AssignedMapKey,
    string? AssignedFrameId,
    string? AssignedAreaName,
    int? AssignedVersionNumber,
    string? LatestDeployedMapKey,
    string? LatestDeployedFrameId,
    bool? LatestDeploymentPassed,
    bool NeedsInspection,
    string? CurrentTourName,
    string? CurrentTourState,
    DateTimeOffset? LastSeenAt,
    bool TelemetryFresh,
    FleetPose? Pose,
    double? BatteryPercent,
    string? OperationalStatus,
    bool? Localized,
    bool? MotionReady,
    string? FaultCode,
    DateTimeOffset? LastDiagnosticsReceivedAt,
    bool DiagnosticsFresh,
    MiniPcResourcesReport? MiniPc,
    Ros2SystemReport? Ros2,
    SensorHealthReport? Sensors,
    bool IsDispatchEnabled);

public sealed class GetRobotDiagnosticsQueryHandler(
    IPhysicalRobotRepository robotRepository,
    IFleetTelemetryStore telemetryStore,
    IRobotDiagnosticsStore diagnosticsStore,
    FleetSyncSettings fleetSyncSettings,
    TimeProvider clock) : IRequestHandler<GetRobotDiagnosticsQuery, RobotDiagnosticsDetailDto>
{
    public async Task<RobotDiagnosticsDetailDto> Handle(
        GetRobotDiagnosticsQuery request,
        CancellationToken cancellationToken)
    {
        var robots = await robotRepository.ListPhysicalRobotsAsync(cancellationToken);
        var robot = robots.FirstOrDefault(r => string.Equals(r.RobotCode, request.RobotCode, StringComparison.OrdinalIgnoreCase))
            ?? throw new NotFoundException($"Robot with code '{request.RobotCode}' was not found.");

        var deploymentChecks = await robotRepository.ListLatestDeploymentChecksAsync(cancellationToken);
        var latestDeployment = deploymentChecks.FirstOrDefault(d => d.RobotId == robot.Id);

        var telemetrySnapshot = telemetryStore.GetLatest()
            .FirstOrDefault(s => string.Equals(s.Robot.RobotCode, robot.RobotCode, StringComparison.OrdinalIgnoreCase));

        var diagnosticsSnapshot = diagnosticsStore.GetLatest(robot.RobotCode);

        var now = clock.GetUtcNow();

        var connectionStatus = robot.FirstAcceptedSyncAt is null
            ? "UNCONFIRMED"
            : telemetrySnapshot is null
                ? "AWAITING_DATA"
                : telemetrySnapshot.ReceivedAt >= now - fleetSyncSettings.SyncFreshness
                    ? "CONNECTED"
                    : "DISCONNECTED";

        var telemetryFresh = telemetrySnapshot is not null &&
            telemetrySnapshot.ReceivedAt >= now - fleetSyncSettings.SyncFreshness;

        var diagnosticsFresh = diagnosticsSnapshot is not null &&
            diagnosticsSnapshot.ReceivedAt >= now - TimeSpan.FromSeconds(60);

        return new RobotDiagnosticsDetailDto(
            robot.RobotCode,
            robot.DisplayName,
            connectionStatus,
            robot.AssignedMapVersion?.MapKey,
            robot.AssignedMapVersion?.FrameId,
            robot.AssignedMapVersion?.AreaKeyNavigation.DisplayName,
            robot.AssignedMapVersion?.VersionNumber,
            latestDeployment?.MapVersion.MapKey,
            latestDeployment?.MapVersion.FrameId,
            latestDeployment is null ? null : latestDeployment.LocalizationPassed && latestDeployment.DisplayPassed,
            robot.NeedsInspection,
            robot.CurrentTour?.Name,
            robot.CurrentTour?.State,
            telemetrySnapshot?.ReceivedAt,
            telemetryFresh,
            telemetrySnapshot?.Report.Pose,
            telemetrySnapshot?.Report.BatteryPercent,
            telemetrySnapshot?.Report.Status,
            telemetrySnapshot?.Report.Localized,
            telemetrySnapshot?.Report.MotionReady,
            telemetrySnapshot?.Report.FaultCode,
            diagnosticsSnapshot?.ReceivedAt,
            diagnosticsFresh,
            diagnosticsSnapshot?.MiniPc,
            diagnosticsSnapshot?.Ros2,
            diagnosticsSnapshot?.Sensors,
            robot.IsDispatchEnabled);
    }
}
