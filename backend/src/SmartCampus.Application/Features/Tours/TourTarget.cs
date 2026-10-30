using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>Resolves what a new Tour runs on and reserves (ADR-0034).</summary>
internal static class TourTarget
{
    public static readonly TimeSpan ReservationBuffer = TimeSpan.FromMinutes(15);

    public static async Task<(RouteRevision Revision, RouteTestRunView Run)> RequireTestedRevisionAsync(
        IRouteRevisionRepository revisions, IMapVersionRepository maps, Guid revisionId, CancellationToken ct)
    {
        var revision = await revisions.FindRevisionAsync(revisionId, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
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
        await maps.LockMapPreparationStateAsync(map.Id, ct);
        (await MapPreparationEligibility.LoadAsync(maps, map, ct)).EnsureCanUse();
        return (revision, run);
    }

    public static async Task RequireOperatorAsync(IRouteRevisionRepository revisions, Guid userId, CancellationToken ct)
    {
        var user = await revisions.FindUserAsync(userId, ct);
        if (user is null || !user.IsActive || !ApplicationRoles.TryResolve(user.UserRoles.Select(role => role.Role), out var role) ||
            role != ApplicationRoles.Staff)
            throw new ConflictException("Người vận hành phải là tài khoản Staff đang hoạt động.", "OPERATOR_REQUIRED");
    }
}
