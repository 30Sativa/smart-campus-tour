using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>
/// The READY conditions table of architecture §3.2 (ADR-0042), one check per row, fail-closed: a condition
/// without data fails. Mark READY and the Tour detail read evaluate the same list.
/// </summary>
internal static class TourReadiness
{
    public const string FailedCode = "READY_PRECONDITION_FAILED";

    /// <summary>
    /// The caller holds the Tour root lock. With <paramref name="lockTarget"/>, the map preparation, robot
    /// deployment and robot reservation locks are taken in that order, the order Tour create and robot
    /// deactivation use (ADR-0034, ADR-0039), and held through commit.
    /// </summary>
    public static async Task<IReadOnlyList<ConflictBlocker>> EvaluateAsync(Tour tour, ITourManagementRepository repository,
        IRegistrationRepository registrations, IRouteRevisionRepository revisions, IMapVersionRepository maps,
        TimeProvider clock, bool lockTarget, CancellationToken ct)
    {
        var blockers = new List<ConflictBlocker>();
        void Fail(string code, string message)
        {
            if (blockers.All(blocker => blocker.Code != code)) blockers.Add(new(code, message));
        }

        if (tour.State != "SCHEDULED" || tour.HasExecutionState)
            Fail("TOUR_STATE_INVALID", "Chỉ Tour SCHEDULED chưa có dấu vết vận hành mới chuyển được sang READY.");

        const string versionMessage = "Tour phải chạy trên một phiên bản tuyến đã thử và có người vận hành.";
        if (tour.RouteRevisionId is null || tour.OperatorUserId is null) Fail("ROUTE_VERSION_REQUIRED", versionMessage);

        if (tour.OperatorUserId is not { } operatorId ||
            await Failure(() => TourTarget.RequireOperatorAsync(revisions, operatorId, ct)) is not null)
            Fail("OPERATOR_REQUIRED", "Người vận hành phải là tài khoản Staff đang hoạt động.");

        var revision = tour.RouteRevisionId is { } revisionId ? await revisions.FindRevisionAsync(revisionId, ct) : null;
        if (revision is null) Fail("ROUTE_VERSION_REQUIRED", versionMessage);
        else if (await Failure(() => TourTarget.RequireSchedulableRevisionAsync(revisions, maps, revision, lockTarget, ct)) is { } stale)
            Fail(stale.Code, stale.Message);

        // Reservations of this Tour change only under its root lock, so the robot is known before its locks.
        var reservation = await repository.FindActiveReservationAsync(tour.Id, ct);
        if (reservation is not null && lockTarget)
        {
            await revisions.LockRobotDeploymentStateAsync(reservation.RobotId, ct);
            await repository.LockRobotReservationsAsync(reservation.RobotId, ct);
        }
        if (reservation is null) Fail("RESERVATION_MISSING", "Tour chưa giữ robot cho khung giờ của mình.");

        var robotIssue = "Không xác định được robot hoặc bản đồ của Tour.";
        if (reservation is not null && revision is not null &&
            await revisions.GetRobotCodeAsync(reservation.RobotId, ct) is { } robotCode &&
            await revisions.FindPhysicalRobotAsync(robotCode, ct) is { } robot &&
            await revisions.GetMapAsync(revision.MapVersionId, ct) is { } map)
            robotIssue = TourTarget.RobotBlockReason(robot, await revisions.GetLatestDeploymentForRobotAsync(robot.Id, ct), map, revision);
        if (robotIssue is not null) Fail("ROBOT_NOT_READY_FOR_ROUTE", robotIssue);

        if (await registrations.HasPendingDecisionsAsync(tour.Id, ct))
            Fail("PENDING_DECISIONS", "Còn dòng đăng ký hoặc yêu cầu đổi email đang chờ Staff duyệt.");

        // Read after every lock, so a wait cannot carry the Tour past its start.
        if (tour.ScheduledStartAt <= clock.GetUtcNow())
            Fail("START_TIME_PASSED", "Đã qua giờ bắt đầu của Tour.");
        return blockers;
    }

    private static async Task<ConflictBlocker?> Failure(Func<Task> check)
    {
        try
        {
            await check();
            return null;
        }
        catch (ConflictException error)
        {
            return new(error.Code, error.Message);
        }
        catch (NotFoundException error)
        {
            return new("ROUTE_VERSION_REQUIRED", error.Message);
        }
    }
}
