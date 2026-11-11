using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>
/// The READY conditions table of architecture §3.2 (ADR-0042), one check per row. Any blocker refuses READY
/// (fail-closed). Only root causes are reported: a check that needs another check's input runs only when that
/// check passed. Mark READY and the Tour detail read evaluate the same list.
/// </summary>
internal static class TourReadiness
{
    public const string FailedCode = "READY_PRECONDITION_FAILED";
    public const string NoAcceptedRowsCode = "NO_ACCEPTED_ROWS";
    public const string NoAcceptedRowsMessage = "Tour chưa có dòng đăng ký nào được duyệt. Duyệt ít nhất một dòng, hoặc hủy Tour nếu không có trường nào tham gia.";

    /// <summary>
    /// The caller holds the Tour root lock. With <paramref name="lockTarget"/>, the map preparation, robot
    /// deployment and robot reservation locks are taken in that order, the order Tour create and robot
    /// deactivation use (ADR-0034, ADR-0039), and held through commit.
    /// </summary>
    public static async Task<IReadOnlyList<ConflictBlocker>> EvaluateAsync(Tour tour, TourUsage usage,
        ITourManagementRepository repository, IRegistrationRepository registrations, IRouteRevisionRepository revisions,
        IMapVersionRepository maps, TimeProvider clock, bool lockTarget, CancellationToken ct)
    {
        var blockers = new List<ConflictBlocker>();
        void Fail(string code, string message) => blockers.Add(new(code, message));

        // The same pre-Start test Cancel and Edit use: no execution state, robot ownership or operational history.
        if (tour.State != "SCHEDULED" || tour.HasExecutionState || usage.HasOperationalHistory || usage.HasRobotOwnership)
            Fail("TOUR_STATE_INVALID", "Chỉ Tour SCHEDULED chưa có dấu vết vận hành mới chuyển được sang READY.");

        // CK_Tours_VersionedTarget_Complete keeps RouteRevisionId and OperatorUserId null together.
        var revision = tour.RouteRevisionId is { } revisionId && tour.OperatorUserId is not null
            ? await revisions.FindRevisionAsync(revisionId, ct) : null;
        if (revision is null)
            Fail("ROUTE_VERSION_REQUIRED", "Tour phải chạy trên một phiên bản tuyến đã thử và có người vận hành.");
        else
            await EvaluateTargetAsync(tour, revision, repository, revisions, maps, lockTarget, Fail, ct);

        if (await registrations.HasPendingDecisionsAsync(tour.Id, ct))
            Fail("PENDING_DECISIONS", "Còn dòng đăng ký hoặc yêu cầu đổi email đang chờ Staff duyệt.");
        // Undecided rows are the root cause while they wait: once decided, they may be the accepted ones.
        else if (!await registrations.HasAcceptedRowsAsync(tour.Id, ct))
            Fail(NoAcceptedRowsCode, NoAcceptedRowsMessage);

        // Read after every lock, so a wait cannot carry the Tour past its start.
        if (tour.ScheduledStartAt <= clock.GetUtcNow())
            Fail("START_TIME_PASSED", "Đã qua giờ bắt đầu của Tour.");
        return blockers;
    }

    /// <summary>Operator, revision, reservation and robot rows; they all need the Tour's exact revision.</summary>
    private static async Task EvaluateTargetAsync(Tour tour, RouteRevision revision, ITourManagementRepository repository,
        IRouteRevisionRepository revisions, IMapVersionRepository maps, bool lockTarget, Action<string, string> fail, CancellationToken ct)
    {
        if (await Failure(() => TourTarget.RequireOperatorAsync(revisions, tour.OperatorUserId!.Value, ct)) is not null)
            fail("OPERATOR_REQUIRED", "Người vận hành phải là tài khoản Staff đang hoạt động.");
        if (await Failure(() => TourTarget.RequireSchedulableRevisionAsync(revisions, maps, revision, lockTarget, ct)) is { } stale)
            fail(stale.Code, stale.Message);

        // Reservations of this Tour change only under its root lock, so the robot is known before its locks.
        var reservation = await repository.FindActiveReservationAsync(tour.Id, ct);
        if (reservation is null)
        {
            // The robot rule needs the reserved robot; without it only the root cause is reported.
            fail("RESERVATION_MISSING", "Tour chưa giữ robot cho khung giờ của mình.");
            return;
        }
        if (lockTarget)
        {
            await revisions.LockRobotDeploymentStateAsync(reservation.RobotId, ct);
            await repository.LockRobotReservationsAsync(reservation.RobotId, ct);
        }
        var robot = await TourTarget.FindReservedRobotAsync(revisions, reservation.RobotId, ct);
        if (await TourTarget.ReservedRobotIssueAsync(revisions, robot, revision, ct) is { } robotIssue)
            fail("ROBOT_NOT_READY_FOR_ROUTE", robotIssue);
    }

    /// <summary>The conflict a requirement check throws, as a blocker; null when it passed.</summary>
    internal static async Task<ConflictBlocker?> Failure(Func<Task> check)
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
