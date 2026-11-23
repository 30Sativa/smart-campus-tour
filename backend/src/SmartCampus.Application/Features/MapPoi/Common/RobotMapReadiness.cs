using System.Globalization;
using System.Security.Cryptography;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// Ready, or the first condition that failed with its code and Vietnamese sentence. <see cref="Detail"/> is a smaller second
/// sentence about the history behind it (the newest check was on another map or failed); writers' 409s use only
/// <see cref="Message"/>.
/// </summary>
public sealed record RobotMapReadinessResult(string? Code, string? Message, string? Detail = null)
{
    public static readonly RobotMapReadinessResult Ready = new(null, null);

    public bool IsReady => Code is null;
}

/// <summary>
/// What a robot list row and a map's running robot show (ADR-0066). <see cref="NextStep"/> is the setup step to do next,
/// for display only: it never changes <see cref="State"/>.
/// </summary>
public sealed record RobotReadinessView(
    string State, string? ReasonCode, string? Reason, Guid? MapVersionId, string? MapLabel,
    DateTimeOffset? DeploymentCheckedAt, bool ReportingOnAssignedMap, string? NextStep = null, string? Detail = null);

public sealed record RunningRobotView(Guid Id, string RobotCode, string? DisplayName, RobotReadinessView Readiness);

/// <summary>
/// ADR-0066: the one rule for "this robot can be used on map version M". Every writer and reader that needs it asks here:
/// POI verification and import, route test runs, Tour create, slots, the robot list, READY, Start and dispatch.
/// The labels come from <see cref="Robot.AssignedMapVersion"/> and <see cref="MapDeploymentCheck.MapVersion"/> with their
/// area when loaded; without them the sentence falls back to the area key.
/// </summary>
public static class RobotMapReadiness
{
    public const string ConnectionUnconfirmedCode = "ROBOT_CONNECTION_UNCONFIRMED";
    public const string MapNotAssignedCode = "ROBOT_MAP_NOT_ASSIGNED";
    public const string DeploymentCheckRequiredCode = "ROBOT_DEPLOYMENT_CHECK_REQUIRED";
    public const string NotReportingCode = "ROBOT_NOT_REPORTING";

    public const string Ready = "READY";
    public const string NotReady = "NOT_READY";
    public const string NotSetUp = "NOT_SET_UP";

    public const string AssignMapStep = "ASSIGN_MAP";
    public const string ConfirmConnectionStep = "CONFIRM_CONNECTION";
    public const string ConfigureMiniPcStep = "CONFIGURE_MINIPC";
    public const string DeploymentCheckStep = "DEPLOYMENT_CHECK";

    /// <summary>
    /// In this order: not deactivated, connection confirmed, assigned exactly to M, and the robot's newest deployment check
    /// across every map is a pass on M with M's package checksum.
    /// </summary>
    public static RobotMapReadinessResult Evaluate(Robot robot, MapDeploymentCheck? latestDeployment, MapVersion map)
    {
        if (robot.IsDeactivated)
            return new(RobotLifecycleRules.DeactivatedCode, $"Robot {robot.RobotCode} đã ngừng sử dụng.");
        if (robot.FirstAcceptedSyncAt is null)
            return new(ConnectionUnconfirmedCode, $"Robot {robot.RobotCode} chưa xác nhận kết nối.");
        if (robot.AssignedMapVersionId != map.Id)
            return new(MapNotAssignedCode, NotAssignedMessage(robot));
        // The sentence says what to do on the map the robot holds; the history behind it is the smaller detail.
        if (latestDeployment is null)
            return new(DeploymentCheckRequiredCode, NoPassMessage(robot, map));
        if (latestDeployment.MapVersionId != map.Id)
            return new(DeploymentCheckRequiredCode, NoPassMessage(robot, map),
                $"Lần kiểm tra triển khai mới nhất của robot {robot.RobotCode} là trên {Label(latestDeployment.MapVersion, latestDeployment.MapVersionId)}.");
        if (!latestDeployment.LocalizationPassed || !latestDeployment.DisplayPassed)
            return new(DeploymentCheckRequiredCode, NoPassMessage(robot, map),
                $"Lần kiểm tra triển khai mới nhất của robot {robot.RobotCode} không đạt ({Time(latestDeployment.CheckedAt)}).");
        if (!CryptographicOperations.FixedTimeEquals(latestDeployment.PackageSha256, map.PackageSha256))
            return new(DeploymentCheckRequiredCode, NoPassMessage(robot, map));
        return RobotMapReadinessResult.Ready;
    }

    /// <summary>
    /// A route test run and a Tour also need the revision to name the map's exact package; otherwise the same rule.
    /// </summary>
    public static RobotMapReadinessResult EvaluateForRoute(Robot robot, MapDeploymentCheck? latestDeployment, MapVersion map,
        RouteRevision revision)
    {
        var result = Evaluate(robot, latestDeployment, map);
        if (!result.IsReady || CryptographicOperations.FixedTimeEquals(map.PackageSha256, revision.MapPackageSha256))
            return result;
        return new(DeploymentCheckRequiredCode,
            $"Robot {robot.RobotCode} chưa có kiểm tra triển khai đạt trên đúng gói bản đồ của phiên bản tuyến.");
    }

    /// <summary>The rule on the robot's own assigned map; <see cref="Robot.AssignedMapVersion"/> must be loaded when set.</summary>
    public static RobotMapReadinessResult EvaluateOnAssignedMap(Robot robot, MapDeploymentCheck? latestDeployment)
    {
        if (robot.AssignedMapVersion is { } assigned) return Evaluate(robot, latestDeployment, assigned);
        if (robot.AssignedMapVersionId is not null)
            throw new InvalidOperationException("The robot's assigned map version must be loaded to evaluate its readiness.");
        // No map: the same order still reports deactivation and connection first, then "chưa được gán bản đồ".
        return Evaluate(robot, latestDeployment, NoMap);
    }

    private static readonly MapVersion NoMap = new() { Id = Guid.Empty, PackageSha256 = [] };

    /// <summary>
    /// ADR-0066 decision 3: the robot's newest Fleet Sync report is fresh (the robot list's CONNECTED), arrived after the
    /// current assignment, and names that map. Fleet Sync accepts only the assigned map's key, so this proves the bridge
    /// runs the assigned map.
    /// </summary>
    public static bool IsReportingOnAssignedMap(Robot robot, FleetTelemetrySnapshot? snapshot, DateTimeOffset now,
        FleetSyncSettings settings) =>
        FleetSyncFreshness.IsFresh(snapshot, now, settings) && robot.MapAssignedAt is { } assignedAt &&
        snapshot!.ReceivedAt >= assignedAt &&
        (robot.AssignedMapVersion is null || string.Equals(snapshot.Report.MapKey, robot.AssignedMapVersion.MapKey, StringComparison.Ordinal));

    /// <summary>The robot list's chip: not set up (no map or no confirmed connection), ready, or not ready.</summary>
    public static RobotReadinessView ToView(Robot robot, MapDeploymentCheck? latestDeployment, bool reportingOnAssignedMap)
    {
        var result = EvaluateOnAssignedMap(robot, latestDeployment);
        var state = result.IsReady ? Ready
            : !robot.IsDeactivated && (robot.AssignedMapVersionId is null || robot.FirstAcceptedSyncAt is null) ? NotSetUp
            : NotReady;
        var assigned = robot.AssignedMapVersion;
        return new(state, result.Code, result.Message, robot.AssignedMapVersionId,
            assigned is null ? null : ShortLabel(assigned),
            latestDeployment is not null && latestDeployment.MapVersionId == robot.AssignedMapVersionId ? latestDeployment.CheckedAt : null,
            reportingOnAssignedMap, NextStep(robot, result, reportingOnAssignedMap), result.Detail);
    }

    /// <summary>
    /// The setup step to do next, for display only. A map comes first even before the connection is confirmed, because Fleet
    /// Sync accepts nothing from a robot without one; then the connection; then the MiniPC must report on the assigned map
    /// (a PASS needs it, decision 3); then the deployment check. Null when ready or deactivated.
    /// </summary>
    private static string? NextStep(Robot robot, RobotMapReadinessResult result, bool reportingOnAssignedMap) =>
        result.IsReady || robot.IsDeactivated ? null
        : robot.AssignedMapVersionId is null ? AssignMapStep
        : robot.FirstAcceptedSyncAt is null ? ConfirmConnectionStep
        : !reportingOnAssignedMap ? ConfigureMiniPcStep
        : DeploymentCheckStep;

    public static string NotAssignedMessage(Robot robot) => robot.AssignedMapVersionId is null
        ? $"Robot {robot.RobotCode} chưa được gán bản đồ."
        : $"Robot {robot.RobotCode} đang gán {Label(robot.AssignedMapVersion, robot.AssignedMapVersionId.Value, robot.AssignedAreaKey)}, không phải bản đồ này.";

    /// <summary>"{area} · {area key} · phiên bản {n}", the form the readiness sentences use.</summary>
    public static string Label(MapVersion? map, Guid mapVersionId, string? areaKey = null) => map is null
        ? areaKey is null ? $"phiên bản bản đồ {mapVersionId:D}" : $"khu vực {areaKey}"
        : map.AreaKeyNavigation is { } area
            ? $"{area.DisplayName} · {map.AreaKey} · phiên bản {map.VersionNumber}"
            : $"{map.AreaKey} · phiên bản {map.VersionNumber}";

    /// <summary>"{area} · v{n}", the robot list's chip.</summary>
    public static string ShortLabel(MapVersion map) =>
        $"{map.AreaKeyNavigation?.DisplayName ?? map.AreaKey} · v{map.VersionNumber}";

    /// <summary>"Robot {code} chưa kiểm tra triển khai trên {M} (gán lúc {dd/MM HH:mm})."; M is the map the robot holds.</summary>
    private static string NoPassMessage(Robot robot, MapVersion map) => robot.MapAssignedAt is { } assignedAt
        ? $"Robot {robot.RobotCode} chưa kiểm tra triển khai trên {Label(map, map.Id)} (gán lúc {Time(assignedAt)})."
        : $"Robot {robot.RobotCode} chưa kiểm tra triển khai trên {Label(map, map.Id)}.";

    private static string Time(DateTimeOffset at) =>
        at.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM HH:mm", CultureInfo.InvariantCulture);
}

/// <summary>The robot assigned to a map version, with its readiness; one area holds at most one robot.</summary>
public static class MapRunningRobot
{
    public static RunningRobotView? ForMap(MapVersion map, IReadOnlyCollection<Robot> assignedRobots,
        IReadOnlyCollection<MapDeploymentCheck> latestChecks, IReadOnlyList<FleetTelemetrySnapshot> telemetry,
        DateTimeOffset now, FleetSyncSettings settings)
    {
        var robot = assignedRobots.Where(item => item.AssignedMapVersionId == map.Id)
            .OrderBy(item => item.RobotCode, StringComparer.Ordinal).FirstOrDefault();
        if (robot is null) return null;
        var latest = latestChecks.Where(check => check.RobotId == robot.Id)
            .OrderByDescending(check => check.CheckedAt).ThenByDescending(check => check.Id).FirstOrDefault();
        var snapshot = telemetry.FirstOrDefault(item => string.Equals(item.Robot.RobotCode, robot.RobotCode, StringComparison.Ordinal));
        return new(robot.Id, robot.RobotCode, robot.DisplayName, RobotMapReadiness.ToView(robot, latest,
            RobotMapReadiness.IsReportingOnAssignedMap(robot, snapshot, now, settings)));
    }
}
