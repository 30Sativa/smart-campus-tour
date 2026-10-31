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
        return (revision, run);
    }

    /// <summary>Null when the effective run predates the measurement definition, so it cannot size a reservation.</summary>
    public static async Task<TourReservationPlan?> PlanReservationAsync(IRouteRevisionRepository revisions, Guid revisionId,
        RouteTestRunView run, CancellationToken ct)
    {
        if (run.MeasurementBasis != RouteMeasurementBasis.TotalWithDwell) return null;
        // The run may belong to an earlier revision with the same navigation and different dwell.
        var tested = await revisions.GetStopsAsync(run.RouteRevisionId, ct);
        var target = await revisions.GetStopsAsync(revisionId, ct);
        return new(run.MeasuredDurationSeconds, TourSchedule.ExpectedDurationSeconds(run.MeasuredDurationSeconds,
            tested.Select(stop => (stop.StopOrder, stop.DwellSeconds)), target.Select(stop => (stop.StopOrder, stop.DwellSeconds))));
    }

    public static async Task RequireOperatorAsync(IRouteRevisionRepository revisions, Guid userId, CancellationToken ct)
    {
        var user = await revisions.FindUserAsync(userId, ct);
        if (user is null || !user.IsActive || !ApplicationRoles.TryResolve(user.UserRoles.Select(role => role.Role), out var role) ||
            role != ApplicationRoles.Staff)
            throw new ConflictException("Người vận hành phải là tài khoản Staff đang hoạt động.", "OPERATOR_REQUIRED");
    }
}
