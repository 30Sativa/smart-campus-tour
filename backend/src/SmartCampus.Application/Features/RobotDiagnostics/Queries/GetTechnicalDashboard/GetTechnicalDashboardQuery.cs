using System.Globalization;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

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
    int RouteRerunsCount = 0,
    int WrongMapRobots = 0);

public sealed record TechnicalActionItem(
    string Type, // "HELD_ROBOT", "MAP_MISMATCH", "TOUR_ROBOT_NOT_READY", "ROBOT_NOT_READY", "MAP_WITHOUT_ROBOT", "POI_QUEUE", "ROUTE_QUEUE", "ROUTE_RERUN"
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
    bool IsDispatchEnabled,
    FleetRejectedReportView? LastRejectedReport = null);

public sealed class GetTechnicalDashboardQueryHandler(
    IPhysicalRobotRepository robotRepository,
    IMapVersionRepository mapVersionRepository,
    IFleetTelemetryStore telemetryStore,
    IRobotDiagnosticsStore diagnosticsStore,
    ISender sender,
    FleetSyncSettings fleetSyncSettings,
    TimeProvider clock) : IRequestHandler<GetTechnicalDashboardQuery, TechnicalDashboardDto>
{
    /// <summary>How far ahead a Tour whose robot is not ready is reported (TOUR_ROBOT_NOT_READY, ADR-0066).</summary>
    public static readonly TimeSpan UpcomingTourWindow = TimeSpan.FromDays(7);

    public async Task<TechnicalDashboardDto> Handle(
        GetTechnicalDashboardQuery request,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var robots = await robotRepository.ListPhysicalRobotsAsync(cancellationToken);
        var deploymentChecks = (await robotRepository.ListLatestDeploymentChecksAsync(cancellationToken))
            .ToDictionary(check => check.RobotId);
        var activeMaps = await mapVersionRepository.ListMapVersionsAsync(null, 100, includeRetired: false, cancellationToken);

        var latestTelemetryByRobot = telemetryStore.GetLatest()
            .ToDictionary(s => s.Robot.RobotCode, StringComparer.OrdinalIgnoreCase);

        // Fetch pending queues
        var poiQueue = await sender.Send(new ListPoiVerificationQueueQuery(null), cancellationToken);
        var routeQueue = await sender.Send(new ListRouteRevisionQueueQuery(), cancellationToken);
        var routeReruns = await sender.Send(new ListRouteRerunQueueQuery(), cancellationToken);

        var actionItems = new List<TechnicalActionItem>();
        // A robot that already has a Tour item is not told again that it is not ready (ROBOT_NOT_READY).
        var tourItems = (await UpcomingToursNotReadyAsync(robots, deploymentChecks, now, cancellationToken)).ToArray();
        var robotsWithTourItem = tourItems.Select(item => item.TargetId).ToHashSet(StringComparer.Ordinal);
        var robotNotReadyItems = new List<TechnicalActionItem>();

        var robotSummaries = new List<TechnicalRobotSummaryDto>();

        int connectedCount = 0;
        int awaitingCount = 0;
        int disconnectedCount = 0;
        int unconfirmedCount = 0;
        int wrongMapCount = 0;
        int heldCount = 0;

        foreach (var robot in robots.Where(r => !r.IsDeactivated))
        {
            latestTelemetryByRobot.TryGetValue(robot.RobotCode, out var telemetry);
            var diagnostics = diagnosticsStore.GetLatest(robot.RobotCode);
            deploymentChecks.TryGetValue(robot.Id, out var deployment);

            // The robot list's rule, so a robot refused for the wrong map reads WRONG_MAP here too.
            var lastRejected = FleetConnectionStatus.LastRejected(robot, telemetry,
                telemetryStore.GetLatestRejected(robot.RobotCode), now, fleetSyncSettings);
            var connectionStatus = FleetConnectionStatus.Of(robot, telemetry, lastRejected, now, fleetSyncSettings);

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
                case "WRONG_MAP":
                    wrongMapCount++;
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
                    $"Robot bị giữ {(robot.CurrentTour != null ? $"sau Tour {robot.CurrentTour.Name}" : "cần kiểm tra")}. Cần kiểm tra tại chỗ rồi trả robot.",
                    robot.Id.ToString(),
                    $"/technical/robots?robot={robot.Id}"));
            }

            if (contextMismatch)
            {
                actionItems.Add(new TechnicalActionItem(
                    "MAP_MISMATCH",
                    "WARNING",
                    $"Lệch cấu hình bản đồ robot {robot.RobotCode}",
                    // The robot list's readiness sentence (ADR-0066), so every screen says the same thing.
                    RobotMapReadiness.EvaluateOnAssignedMap(robot, deployment).Message ??
                        $"Bản đồ được gán ({assignedMapKey}) khác với bản đồ kiểm tra gần nhất ({deployedMapKey}).",
                    robot.Id.ToString(),
                    $"/technical/robots?robot={robot.Id}"));
            }

            // Setup left half-done: the robot holds a map but cannot run on it. MAP_MISMATCH already says the same sentence.
            if (robot.AssignedMapVersionId is not null && !contextMismatch && !robotsWithTourItem.Contains(robot.Id.ToString()) &&
                RobotMapReadiness.EvaluateOnAssignedMap(robot, deployment) is { IsReady: false, Message: { } notReady })
            {
                robotNotReadyItems.Add(new TechnicalActionItem(
                    "ROBOT_NOT_READY",
                    "WARNING",
                    $"Robot {robot.RobotCode} chưa sẵn sàng trên bản đồ được gán",
                    notReady,
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
                robot.IsDispatchEnabled,
                lastRejected));
        }

        actionItems.AddRange(tourItems);
        actionItems.AddRange(robotNotReadyItems);
        var mapsWithoutRobot = MapsWithoutRobot(activeMaps, robots, poiQueue, routeQueue).ToArray();
        actionItems.AddRange(mapsWithoutRobot);

        // An item on a map that already has its MAP_WITHOUT_ROBOT entry is said there, not again as a queue entry, so one
        // POI never reads as two jobs. The KPI counts below keep the whole queue.
        var waitingForRobot = mapsWithoutRobot.Select(item => Guid.Parse(item.TargetId!)).ToHashSet();
        var poiNow = poiQueue.Count(item => !waitingForRobot.Contains(item.Revision.MapVersionId));
        var poiWaiting = poiQueue.Count - poiNow;
        var routeNow = routeQueue.Count(item => !waitingForRobot.Contains(item.MapVersionId));
        var routeWaiting = routeQueue.Count - routeNow;

        if (poiNow > 0)
        {
            actionItems.Add(new TechnicalActionItem(
                "POI_QUEUE",
                "INFO",
                $"{poiNow} POI đang chờ kiểm chứng kỹ thuật",
                poiWaiting > 0
                    ? $"{poiNow} POI có thể kiểm ngay; {poiWaiting} POI khác đang chờ robot (xem mục bản đồ chưa có robot)."
                    : "Có đề xuất POI mới từ nhân viên vận hành đang chờ đo đạc và kiểm tra.",
                null,
                "/technical/pois"));
        }

        if (routeNow > 0)
        {
            actionItems.Add(new TechnicalActionItem(
                "ROUTE_QUEUE",
                "INFO",
                $"{routeNow} tuyến đang chờ chạy thử",
                routeWaiting > 0
                    ? $"{routeNow} tuyến có thể chạy thử ngay; {routeWaiting} tuyến khác đang chờ robot (xem mục bản đồ chưa có robot)."
                    : "Có bản sửa đổi tuyến đang chờ xác nhận kỹ thuật và chạy thử trên thực tế.",
                null,
                "/technical/route-tests"));
        }

        if (routeReruns.Count > 0)
        {
            actionItems.Add(new TechnicalActionItem(
                "ROUTE_RERUN",
                "WARNING",
                $"{routeReruns.Count} tuyến cần chạy lại",
                "Lần chạy đạt của các tuyến này đo theo cách cũ nên chưa xếp lịch được. Cần ghi một lần chạy mới.",
                null,
                "/technical/route-tests"));
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
            RouteRerunsCount: routeReruns.Count,
            WrongMapRobots: wrongMapCount);

        return new TechnicalDashboardDto(now, kpis, actionItems, robotSummaries);
    }

    /// <summary>
    /// One TOUR_ROBOT_NOT_READY item per robot whose SCHEDULED or READY Tours in the next seven days it cannot run, judged by
    /// the rule READY and Start use (<see cref="TourTarget.RobotBlockReason"/>), so Technical Staff hear of it before Staff do.
    /// </summary>
    private async Task<IEnumerable<TechnicalActionItem>> UpcomingToursNotReadyAsync(IReadOnlyList<Robot> robots,
        IReadOnlyDictionary<Guid, MapDeploymentCheck> deploymentChecks, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var robotsById = robots.ToDictionary(robot => robot.Id);
        var blocked = new List<(UpcomingTourTarget Tour, Robot Robot, string Reason)>();
        foreach (var tour in await robotRepository.ListUpcomingTourTargetsAsync(now, now + UpcomingTourWindow, cancellationToken))
        {
            if (!robotsById.TryGetValue(tour.RobotId, out var robot)) continue;
            if (TourTarget.RobotBlockReason(robot, deploymentChecks.GetValueOrDefault(robot.Id), tour.Map, tour.Revision) is { } reason)
                blocked.Add((tour, robot, reason));
        }
        return blocked.GroupBy(item => item.Robot.Id)
            .Select(group => group.OrderBy(item => item.Tour.ScheduledStartAt).ToArray())
            .OrderBy(group => group[0].Tour.ScheduledStartAt)
            .Select(group =>
            {
                var (first, robot, reason) = group[0];
                var firstTour = $"Tour {first.TourName} {LocalTime(first.ScheduledStartAt)}";
                return new TechnicalActionItem(
                    "TOUR_ROBOT_NOT_READY",
                    "WARNING",
                    group.Length == 1
                        ? $"{firstTour} chưa chạy được"
                        : $"{group.Length} Tour sắp tới của robot {robot.RobotCode} chưa chạy được",
                    group.Length == 1 ? reason : $"{reason} Sớm nhất: {firstTour}.",
                    robot.Id.ToString(),
                    $"/technical/robots?robot={robot.Id}");
            });
    }

    /// <summary>
    /// One MAP_WITHOUT_ROBOT item per active map version with POIs or routes waiting for Technical Staff (verification queue,
    /// route-test queue) that no active robot holds, since nothing on it can be checked until a robot is assigned.
    /// </summary>
    private static IEnumerable<TechnicalActionItem> MapsWithoutRobot(IReadOnlyList<MapVersion> activeMaps, IReadOnlyList<Robot> robots,
        IReadOnlyList<PoiVerificationQueueItem> poiQueue, IReadOnlyList<RouteRevisionView> routeQueue)
    {
        var held = robots.Where(robot => !robot.IsDeactivated && robot.AssignedMapVersionId is not null)
            .Select(robot => robot.AssignedMapVersionId!.Value).ToHashSet();
        var waiting = poiQueue.Select(item => item.Revision.MapVersionId).Concat(routeQueue.Select(item => item.MapVersionId))
            .GroupBy(id => id).ToDictionary(group => group.Key, group => group.Count());
        return activeMaps.Where(map => waiting.ContainsKey(map.Id) && !held.Contains(map.Id))
            .OrderBy(map => map.AreaKey, StringComparer.Ordinal).ThenBy(map => map.VersionNumber)
            .Select(map => new TechnicalActionItem(
                "MAP_WITHOUT_ROBOT",
                "INFO",
                $"Bản đồ {RobotMapReadiness.Label(map, map.Id)} chưa có robot",
                $"{RobotMapReadiness.Label(map, map.Id)}: {waiting[map.Id]} POI/tuyến đang chờ nhưng chưa robot nào gán bản đồ này.",
                map.Id.ToString(),
                $"/technical/maps?map={map.Id}"));
    }

    private static string LocalTime(DateTimeOffset at) =>
        at.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM HH:mm", CultureInfo.InvariantCulture);
}
