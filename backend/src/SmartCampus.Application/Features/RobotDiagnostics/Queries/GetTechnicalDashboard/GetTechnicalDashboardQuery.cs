using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.RobotDiagnostics.Queries.GetTechnicalDashboard;

public sealed record GetTechnicalDashboardQuery : IQuery<TechnicalDashboardDto>;

public sealed record TechnicalDashboardDto(
    DateTimeOffset CollectedAt,
    TechnicalKpiSummary Kpis,
    IReadOnlyList<TechnicalActionItem> ActionItems,
    IReadOnlyList<TechnicalRobotSummaryDto> Robots);

public sealed record TechnicalKpiSummary(
    int TotalRobots,
    int ConnectedRobots,
    int AwaitingDataRobots,
    int DisconnectedRobots,
    int UnconfirmedRobots,
    int HeldForInspectionCount,
    int PendingPoiVerificationsCount,
    int PendingRouteTestsCount,
    int ActiveMapVersionsCount,
    int RouteRerunsCount = 0);

public sealed record TechnicalActionItem(
    string Type, // "HELD_ROBOT", "MAP_MISMATCH", "POI_QUEUE", "ROUTE_QUEUE", "ROUTE_RERUN"
    string Severity, // "DANGER", "WARNING", "INFO"
    string Title,
    string Description,
    string? TargetId,
    string? LinkUrl);

public sealed record TechnicalRobotSummaryDto(
    Guid Id,
    string RobotCode,
    string? DisplayName,
    string ConnectionStatus,
    bool SyncFresh,
    DateTimeOffset? LastSeenAt,
    double? BatteryPercent,
    string? AssignedMapKey,
    string? AssignedFrameId,
    string? LatestDeployedMapKey,
    string? LatestDeployedFrameId,
    bool? LatestDeploymentPassed,
    bool ContextMismatch,
    bool? Localized,
    bool? MotionReady,
    bool NeedsInspection,
    Guid? CurrentTourId,
    string? CurrentTourName,
    string? CurrentTourState,
    string RowVersion,
    bool HasDiagnostics,
    bool DiagnosticsFresh,
    double? CpuPercent,
    double? CpuTemperatureCelsius,
    string? LidarStatus,
    string? ImuStatus,
    bool IsDispatchEnabled);

public sealed class GetTechnicalDashboardQueryHandler(
    IPhysicalRobotRepository robotRepository,
    IMapVersionRepository mapVersionRepository,
    IFleetTelemetryStore telemetryStore,
    IRobotDiagnosticsStore diagnosticsStore,
    ISender sender,
    FleetSyncSettings fleetSyncSettings,
    TimeProvider clock) : IRequestHandler<GetTechnicalDashboardQuery, TechnicalDashboardDto>
{
    public async Task<TechnicalDashboardDto> Handle(
        GetTechnicalDashboardQuery request,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var robots = await robotRepository.ListPhysicalRobotsAsync(cancellationToken);
        var deploymentChecks = (await robotRepository.ListLatestDeploymentChecksAsync(cancellationToken))
            .ToDictionary(check => check.RobotId);
        var activeMaps = await mapVersionRepository.ListMapVersionsAsync(null, 100, cancellationToken);

        var latestTelemetryByRobot = telemetryStore.GetLatest()
            .ToDictionary(s => s.Robot.RobotCode, StringComparer.OrdinalIgnoreCase);

        // Fetch pending queues
        var poiQueue = await sender.Send(new ListPoiVerificationQueueQuery(null), cancellationToken);
        var routeQueue = await sender.Send(new ListRouteRevisionQueueQuery(), cancellationToken);
        var routeReruns = await sender.Send(new ListRouteRerunQueueQuery(), cancellationToken);

        var actionItems = new List<TechnicalActionItem>();

        var robotSummaries = new List<TechnicalRobotSummaryDto>();

        int connectedCount = 0;
        int awaitingCount = 0;
        int disconnectedCount = 0;
        int unconfirmedCount = 0;
        int heldCount = 0;

        foreach (var robot in robots.Where(r => !r.IsDeactivated))
        {
            latestTelemetryByRobot.TryGetValue(robot.RobotCode, out var telemetry);
            var diagnostics = diagnosticsStore.GetLatest(robot.RobotCode);
            deploymentChecks.TryGetValue(robot.Id, out var deployment);

            var connectionStatus = robot.FirstAcceptedSyncAt is null
                ? "UNCONFIRMED"
                : telemetry is null
                    ? "AWAITING_DATA"
                    : telemetry.ReceivedAt >= now - fleetSyncSettings.SyncFreshness
                        ? "CONNECTED"
                        : "DISCONNECTED";

            switch (connectionStatus)
            {
                case "CONNECTED":
                    connectedCount++;
                    break;
                case "AWAITING_DATA":
                    awaitingCount++;
                    break;
                case "DISCONNECTED":
                    disconnectedCount++;
                    break;
                case "UNCONFIRMED":
                    unconfirmedCount++;
                    break;
            }

            var holdingTourEnded = string.IsNullOrEmpty(robot.CurrentTour?.State) ||
                robot.CurrentTour.State == "COMPLETED" ||
                robot.CurrentTour.State == "CANCELLED";

            var isHeld = robot.NeedsInspection || (robot.CurrentTourId.HasValue && holdingTourEnded);
            if (isHeld) heldCount++;

            var assignedMapKey = robot.AssignedMapVersion?.MapKey;
            var assignedFrameId = robot.AssignedMapVersion?.FrameId;
            var deployedMapKey = deployment?.MapVersion.MapKey;
            var deployedFrameId = deployment?.MapVersion.FrameId;

            var contextMismatch = !string.IsNullOrEmpty(assignedMapKey) &&
                !string.IsNullOrEmpty(assignedFrameId) &&
                !string.IsNullOrEmpty(deployedMapKey) &&
                !string.IsNullOrEmpty(deployedFrameId) &&
                (!string.Equals(assignedMapKey, deployedMapKey, StringComparison.Ordinal) ||
                 !string.Equals(assignedFrameId, deployedFrameId, StringComparison.Ordinal));

            if (isHeld)
            {
                actionItems.Add(new TechnicalActionItem(
                    "HELD_ROBOT",
                    "WARNING",
                    $"Robot {robot.RobotCode} đang chờ kiểm tra tại chỗ",
                    $"Robot bị giữ {(robot.CurrentTour != null ? $"sau Tour {robot.CurrentTour.Name}" : "cần kiểm tra")}. Cần kiểm tra tại chỗ và giải phóng.",
                    robot.Id.ToString(),
                    $"/technical/robots?robot={robot.Id}"));
            }

            if (contextMismatch)
            {
                actionItems.Add(new TechnicalActionItem(
                    "MAP_MISMATCH",
                    "WARNING",
                    $"Lệch cấu hình bản đồ robot {robot.RobotCode}",
                    $"Bản đồ được gán ({assignedMapKey}) khác với bản đồ kiểm tra gần nhất ({deployedMapKey}).",
                    robot.Id.ToString(),
                    $"/technical/robots?robot={robot.Id}"));
            }

            var syncFresh = telemetry is not null && telemetry.ReceivedAt >= now - fleetSyncSettings.SyncFreshness;
            var diagFresh = diagnostics is not null && diagnostics.ReceivedAt >= now - TimeSpan.FromSeconds(60);

            robotSummaries.Add(new TechnicalRobotSummaryDto(
                robot.Id,
                robot.RobotCode,
                robot.DisplayName,
                connectionStatus,
                syncFresh,
                telemetry?.ReceivedAt,
                telemetry?.Report.BatteryPercent,
                assignedMapKey,
                assignedFrameId,
                deployedMapKey,
                deployedFrameId,
                deployment is null ? null : deployment.LocalizationPassed && deployment.DisplayPassed,
                contextMismatch,
                telemetry?.Report.Localized,
                telemetry?.Report.MotionReady,
                robot.NeedsInspection,
                robot.CurrentTourId,
                robot.CurrentTour?.Name,
                robot.CurrentTour?.State,
                Convert.ToBase64String(robot.RowVersion),
                diagnostics is not null,
                diagFresh,
                diagnostics?.MiniPc?.CpuPercent,
                diagnostics?.MiniPc?.CpuTemperatureCelsius,
                diagnostics?.Sensors?.Lidar?.Status,
                diagnostics?.Sensors?.Imu?.Status,
                robot.IsDispatchEnabled));
        }

        if (poiQueue.Count > 0)
        {
            actionItems.Add(new TechnicalActionItem(
                "POI_QUEUE",
                "INFO",
                $"{poiQueue.Count} POI đang chờ kiểm chứng kỹ thuật",
                "Có đề xuất POI mới từ nhân viên vận hành đang chờ đo đạc và kiểm tra.",
                null,
                "/technical/poi-import"));
        }

        if (routeQueue.Count > 0)
        {
            actionItems.Add(new TechnicalActionItem(
                "ROUTE_QUEUE",
                "INFO",
                $"{routeQueue.Count} tuyến đang chờ chạy thử",
                "Có bản sửa đổi tuyến đang chờ xác nhận kỹ thuật và chạy thử trên thực tế.",
                null,
                "/technical/confirmations"));
        }

        if (routeReruns.Count > 0)
        {
            actionItems.Add(new TechnicalActionItem(
                "ROUTE_RERUN",
                "WARNING",
                $"{routeReruns.Count} tuyến cần chạy lại",
                "Lần chạy đạt của các tuyến này đo theo cách cũ nên chưa xếp lịch được. Cần ghi một lần chạy mới.",
                null,
                "/technical/confirmations"));
        }

        var kpis = new TechnicalKpiSummary(
            TotalRobots: robotSummaries.Count,
            ConnectedRobots: connectedCount,
            AwaitingDataRobots: awaitingCount,
            DisconnectedRobots: disconnectedCount,
            UnconfirmedRobots: unconfirmedCount,
            HeldForInspectionCount: heldCount,
            PendingPoiVerificationsCount: poiQueue.Count,
            PendingRouteTestsCount: routeQueue.Count,
            ActiveMapVersionsCount: activeMaps.Count(m => m.ValidationStatus == "VALID"),
            RouteRerunsCount: routeReruns.Count);

        return new TechnicalDashboardDto(now, kpis, actionItems, robotSummaries);
    }
}
