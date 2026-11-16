using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>Resolves what a new Tour runs on and reserves (ADR-0034, ADR-0035).</summary>
internal static class TourTarget
{
    public static async Task<(RouteRevision Revision, RouteTestRunView Run)> RequireTestedRevisionAsync(
        IRouteRevisionRepository revisions, IMapVersionRepository maps, Guid revisionId, bool lockTarget, CancellationToken ct)
    {
        var revision = await revisions.FindRevisionAsync(revisionId, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
        // Create holds the Route lock through commit, so a deactivation cannot slip between this check and the new Tour.
        var route = await (lockTarget ? revisions.LockRouteAsync(revision.RouteId, ct) : revisions.FindRouteAsync(revision.RouteId, ct));
        if (route is not { IsOpenForNewTours: true })
            throw new ConflictException("Tuyến đã ngừng sử dụng nên không dùng được cho Tour mới.", "ROUTE_UNAVAILABLE");
        if (lockTarget) await EnsureNoRetiredPoiAsync(revisions, revision.Id, ct);
        var run = await RequireSchedulableRevisionAsync(revisions, maps, revision, lockTarget, ct);
        // Only new Tours: READY repeats the schedulable check, and retiring is refused while SCHEDULED or READY Tours use the
        // version (ADR-0041). Create holds the map lock taken above, so a retirement cannot slip in before commit.
        await MapRetirement.EnsureActiveAsync(maps, revision.MapVersionId, ct);
        return (revision, run);
    }

    public const string RouteHasRetiredPoiCode = "ROUTE_HAS_RETIRED_POI";

    /// <summary>
    /// ADR-0062: a new Tour (regular or quick) never starts on a route revision with a retired or discarded POI. The
    /// stop POIs are row-locked as retire and discard lock them, after the Route lock and before the map lock (the order
    /// SaveRouteRevision uses), and read again under that lock. READY and Start do not ask: a Tour already created keeps
    /// its route, and its page warns instead.
    /// </summary>
    private static async Task EnsureNoRetiredPoiAsync(IRouteRevisionRepository revisions, Guid revisionId, CancellationToken ct)
    {
        var stops = await revisions.GetStopsAsync(revisionId, ct);
        var pois = await revisions.FindPoiRevisionsAsync(stops.Select(stop => stop.PoiProposalRevisionId).Distinct().ToArray(), ct);
        var proposalByRevision = pois.ToDictionary(poi => poi.Id, poi => poi.ProposalId);
        var locked = await revisions.LockPoiProposalsAsync(proposalByRevision.Values.Distinct().ToArray(), ct);
        var names = stops.OrderBy(stop => stop.StopOrder)
            .Where(stop => proposalByRevision.TryGetValue(stop.PoiProposalRevisionId, out var id) && locked.TryGetValue(id, out var proposal) &&
                           (proposal.RetiredAt is not null || proposal.DiscardedAt is not null))
            .Select(stop => stop.Name).Distinct().ToArray();
        if (names.Length > 0)
            throw new ConflictException(
                $"Tuyến có POI đã ngưng dùng: {string.Join(", ", names)}. Lưu phiên bản tuyến mới không có POI này, hoặc dùng lại POI.",
                RouteHasRetiredPoiCode);
    }

    /// <summary>
    /// The part of the create check that READY repeats (ADR-0034). Route availability is left out: a deactivated
    /// route keeps the Tours already scheduled on it (ADR-0037).
    /// </summary>
    public static async Task<RouteTestRunView> RequireSchedulableRevisionAsync(IRouteRevisionRepository revisions,
        IMapVersionRepository maps, RouteRevision revision, bool lockTarget, CancellationToken ct)
    {
        if (await revisions.GetSubmissionsAsync(revision.Id, ct) is not { Count: > 0 })
            throw new ConflictException("Phiên bản tuyến chưa được gửi kiểm chứng.", "ROUTE_NOT_SUBMITTED");
        var view = await RouteRevisionMapper.Load(revisions, revision.RouteId, revision.Id, false, ct);
        var run = view.VerificationStatus == "PASS" ? view.TestRuns.SingleOrDefault(item => item.Id == view.EffectiveTestRunId) : null;
        if (run is null)
            throw new ConflictException("Phiên bản tuyến chưa có kết quả chạy thử đạt.", "ROUTE_TEST_PASS_REQUIRED");
        if (view.EligibilityIssues.Count > 0)
            throw new ConflictException("Có POI trong tuyến không còn kết quả đạt.", "POI_VERIFICATION_STALE");
        var map = await maps.FindMapVersionAsync(revision.MapVersionId, includePackage: false, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        if (lockTarget) await maps.LockMapPreparationStateAsync(map.Id, ct);
        (await MapPreparationEligibility.LoadAsync(maps, map, ct)).EnsureCanUse();
        return run;
    }

    /// <summary>Null when this robot can run the revision. Create, slots and the robot list all ask here.</summary>
    public static string? RobotBlockReason(Robot robot, MapDeploymentCheck? latestDeployment, MapVersion map, RouteRevision revision) =>
        robot.IsDeactivated ? "Robot đã ngừng sử dụng."
        : robot.FirstAcceptedSyncAt is null ? "Robot chưa xác nhận kết nối."
        : RouteRobotDeployment.IsCurrent(latestDeployment, map, revision) ? null
        : "Robot chưa triển khai đúng bản đồ của tuyến.";

    /// <summary>The physical robot a reservation holds; null when it cannot be found.</summary>
    public static async Task<Robot?> FindReservedRobotAsync(IRouteRevisionRepository revisions, Guid robotId, CancellationToken ct) =>
        await revisions.GetRobotCodeAsync(robotId, ct) is { } robotCode ? await revisions.FindPhysicalRobotAsync(robotCode, ct) : null;

    /// <summary>Null when the reserved robot can run the revision. READY and the Start preflight both ask here.</summary>
    public static async Task<string?> ReservedRobotIssueAsync(IRouteRevisionRepository revisions, Robot? robot, RouteRevision revision,
        CancellationToken ct) =>
        robot is not null && await revisions.GetMapAsync(revision.MapVersionId, ct) is { } map
            ? RobotBlockReason(robot, await revisions.GetLatestDeploymentForRobotAsync(robot.Id, ct), map, revision)
            : "Không xác định được robot hoặc bản đồ của Tour.";

    public static async Task RequireUsableRobotAsync(IRouteRevisionRepository revisions, Robot robot, RouteRevision revision, CancellationToken ct)
    {
        var map = await revisions.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        var deployment = await revisions.GetLatestDeploymentForRobotAsync(robot.Id, ct);
        if (RobotBlockReason(robot, deployment, map, revision) is { } reason)
            throw new ConflictException(reason, "ROBOT_NOT_READY_FOR_ROUTE");
    }

    /// <summary>
    /// The reservation length, estimated from the revision's own dwell and stop positions; the test run only proves the
    /// route can be driven, it no longer sizes the hold.
    /// </summary>
    public static async Task<TourReservationPlan> PlanReservationAsync(IRouteRevisionRepository revisions, RouteRevision revision,
        TourScheduleSettings settings, CancellationToken ct)
    {
        var estimate = TourSchedule.EstimatedDurationSeconds(revision, await revisions.GetStopsAsync(revision.Id, ct),
            settings.EstimatedSpeedMetersPerSecond);
        return new(TourSchedule.StoredDurationSeconds(estimate), estimate);
    }

    public static async Task RequireOperatorAsync(IRouteRevisionRepository revisions, Guid userId, CancellationToken ct)
    {
        var user = await revisions.FindUserAsync(userId, ct);
        if (user is null || !user.IsActive || !ApplicationRoles.TryResolve(user.UserRoles.Select(role => role.Role), out var role) ||
            role != ApplicationRoles.Staff)
            throw new ConflictException("Người vận hành phải là tài khoản Staff đang hoạt động.", "OPERATOR_REQUIRED");
    }
}
