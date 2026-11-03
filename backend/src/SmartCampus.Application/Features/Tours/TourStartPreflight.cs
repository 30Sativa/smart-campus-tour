using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>The four on-site confirmations of the Start request body; a missing value is not a confirmation.</summary>
public sealed record TourStartConfirmation(bool? RobotPlaced, bool? AreaClear, bool? AttendantPresent, bool? PreviewChecked);

/// <summary><see cref="CanStart"/> is true only when every returned check passed.</summary>
public sealed record TourStartChecks(IReadOnlyList<ConflictCheck> Checks, bool CanStart, IReadOnlyList<string> BlockedBy);

/// <summary>
/// The Start conditions table of architecture §3.2 (ADR-0042), one check per row, read from real data: DB, the
/// in-memory Fleet Sync store, configuration and console presence. Fail-closed: a value that is missing or has no
/// source fails. Only root causes reach <see cref="TourStartChecks.BlockedBy"/>: a check that needs another check's
/// input runs only when that check passed, otherwise it is listed as not passed with the reason and left out.
/// The start-checks read and the Start request evaluate the same list.
/// </summary>
public sealed class TourStartPreflight(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, IMapVersionRepository maps, IFleetTelemetryStore telemetry,
    IOperatorConsolePresence consoles, FleetCommandSettings settings, TimeProvider clock)
{
    public const string FailedCode = "START_PRECONDITION_FAILED";
    public const string TransportDisabledCode = "COMMAND_TRANSPORT_DISABLED";
    public const string TransportCheck = "commandTransportEnabled";

    /// <summary>
    /// <paramref name="viewer"/> adds <c>callerIsOperator</c> (the read only; Start answers 403 instead).
    /// <paramref name="confirmation"/> adds the four on-site checks (Start only). With <paramref name="lockTarget"/> the
    /// caller holds the Tour root lock, and the map preparation, robot deployment and robot reservation locks are
    /// taken in the order READY and Tour create use, held through the end of the transaction.
    /// </summary>
    public async Task<TourStartChecks> EvaluateAsync(Tour tour, Guid? viewer, TourStartConfirmation? confirmation,
        bool includeConfirmation, bool lockTarget, CancellationToken ct)
    {
        // CK_Tours_VersionedTarget_Complete keeps RouteRevisionId and OperatorUserId null together.
        var revision = tour.RouteRevisionId is { } revisionId && tour.OperatorUserId is not null
            ? await revisions.FindRevisionAsync(revisionId, ct) : null;
        var stale = revision is null ? null : await TourReadiness.Failure(() =>
            TourTarget.RequireSchedulableRevisionAsync(revisions, maps, revision, lockTarget, ct));
        var map = revision is null ? null : await revisions.GetMapAsync(revision.MapVersionId, ct);

        // Reservations of this Tour change only under its root lock, so the robot is known before its locks.
        var reservation = await repository.FindActiveReservationAsync(tour.Id, ct);
        if (reservation is not null && lockTarget)
        {
            await revisions.LockRobotDeploymentStateAsync(reservation.RobotId, ct);
            await repository.LockRobotReservationsAsync(reservation.RobotId, ct);
        }
        var robot = reservation is null ? null : await TourTarget.FindReservedRobotAsync(revisions, reservation.RobotId, ct);
        var robotIssue = robot is null || revision is null ? null : await TourTarget.ReservedRobotIssueAsync(revisions, robot, revision, ct);
        var holder = robot?.CurrentTourId is { } holderId ? await repository.FindAsync(holderId, ct) : null;
        var pending = await registrations.HasPendingDecisionsAsync(tour.Id, ct);
        var snapshot = robot is null ? null
            : telemetry.GetLatest().FirstOrDefault(item => string.Equals(item.Robot.RobotCode, robot.RobotCode, StringComparison.Ordinal));
        // Read after every lock, so a wait cannot carry the Tour out of its window unnoticed.
        var now = clock.GetUtcNow();

        var list = new Checklist();
        list.Add("tourReady", "DB", tour.State == "READY" && !tour.HasExecutionState,
            tour.State == "READY" && !tour.HasExecutionState ? "Tour đang READY." : $"Tour đang {tour.State}; chỉ Tour READY chưa Start mới Start được.");
        if (viewer is { } caller)
            list.Add("callerIsOperator", "DB", tour.OperatorUserId == caller,
                tour.OperatorUserId == caller ? "Bạn là người vận hành của Tour." : "Chỉ người vận hành được giao cho Tour mới Start được.");
        list.Add("withinStartWindow", "DB", Window(tour.ScheduledStartAt, now, out var windowDetail), windowDetail);

        list.Add("reservationActive", "DB", robot is not null,
            robot is not null ? $"Tour đang giữ robot {robot.RobotCode}."
            : reservation is null ? "Tour chưa giữ robot cho khung giờ của mình." : "Không xác định được robot Tour đang giữ.");
        if (revision is null)
            list.Add("revisionStillSchedulable", "DB", false, "Tour không chạy trên một phiên bản tuyến đã thử.");
        else
            list.Add("revisionStillSchedulable", "DB", stale is null,
                stale is null ? "Phiên bản tuyến vẫn có lần chạy thử đạt, POI và bản đồ hợp lệ." : $"{stale.Code}: {stale.Message}");

        if (robot is null)
            list.Skip("reservationActive", "DB", ["robotEligibleForRoute", "robotMapMatchesRoute", "robotNotNeedsInspection",
                "robotNotHeldByOtherTour", "robotDispatchEnabled"]);
        else
        {
            if (revision is null)
                list.Skip("revisionStillSchedulable", "DB", ["robotEligibleForRoute", "robotMapMatchesRoute"]);
            else
            {
                list.Add("robotEligibleForRoute", "DB", robotIssue is null, robotIssue ?? "Robot dùng được cho phiên bản tuyến.");
                list.Add("robotMapMatchesRoute", "DB", robot.AssignedMapVersionId == revision.MapVersionId,
                    robot.AssignedMapVersionId == revision.MapVersionId ? "Robot được gán đúng bản đồ của tuyến."
                    : robot.AssignedMapVersionId is null ? "Robot chưa được gán bản đồ." : "Robot được gán bản đồ khác bản đồ của tuyến.");
            }
            list.Add("robotNotNeedsInspection", "DB", !robot.NeedsInspection,
                robot.NeedsInspection ? "Robot đang chờ kiểm tra tại chỗ." : "Robot không chờ kiểm tra.");
            list.Add("robotNotHeldByOtherTour", "DB", robot.CurrentTourId is null,
                robot.CurrentTourId is null ? "Robot không bị Tour nào giữ." : "Robot đang bị một Tour khác giữ.");
            list.Add("robotDispatchEnabled", "DB", robot.IsDispatchEnabled,
                robot.IsDispatchEnabled ? "Robot được phép điều phối." : "Robot chưa được bật điều phối (IsDispatchEnabled = 0).");
        }

        list.Add("noPendingDecisions", "DB", !pending,
            pending ? "Còn dòng đăng ký hoặc yêu cầu đổi email đang chờ Staff duyệt." : "Không còn quyết định đang chờ.");

        if (robot is null)
        {
            list.Skip("reservationActive", "DB", ["noOpenIncident", "noUnresolvedCommand"]);
            list.Skip("reservationActive", "TELEMETRY", ["telemetryFresh", "mapContextMatches", "executionIdle", "robotLocalized", "motionReady"]);
        }
        else
        {
            // ADR-0042 open decision 3: no incident table, so NeedsInspection and the holding Tour stand in for it.
            var holderKnown = robot.CurrentTourId is null || holder is not null;
            var incident = robot.NeedsInspection || holder?.OperationalStatus == "NEEDS_ASSISTANCE";
            list.Add("noOpenIncident", "DB", holderKnown && !incident,
                !holderKnown ? "Không đọc được Tour đang giữ robot."
                : robot.NeedsInspection ? "Robot đang chờ kiểm tra tại chỗ."
                : incident ? "Tour đang giữ robot cần hỗ trợ (NEEDS_ASSISTANCE)." : "Không có sự cố đang mở.");
            list.Add("noUnresolvedCommand", "DB", true, "Chưa có command store (M2.2); chưa lệnh nào được ghi cho robot.");
            EvaluateTelemetry(list, snapshot, map, now);
        }

        var consoleConnected = tour.OperatorUserId is { } operatorId ? consoles.IsConnected(operatorId) : null;
        list.Add("operatorConsoleConnected", "CONSOLE", consoleConnected == true,
            tour.OperatorUserId is null ? "Tour chưa có người vận hành."
            : consoleConnected is null ? "Chưa có nguồn theo dõi console của người vận hành."
            : consoleConnected.Value ? "Console của người vận hành đang kết nối." : "Console của người vận hành chưa kết nối.");

        if (includeConfirmation)
        {
            Confirm(list, "robotPlaced", confirmation?.RobotPlaced);
            Confirm(list, "areaClear", confirmation?.AreaClear);
            Confirm(list, "attendantPresent", confirmation?.AttendantPresent);
            Confirm(list, "previewChecked", confirmation?.PreviewChecked);
        }

        list.Add(TransportCheck, "CONFIG", settings.Enabled,
            settings.Enabled ? "Command transport đang bật." : "FleetCommands:Enabled = false; M2.1 chưa có command transport.");
        // D3: battery is shown, never blocks.
        list.Info("batteryInfo", "TELEMETRY", snapshot?.Report.BatteryPercent is { } battery
            ? $"Pin {battery:0.#}% (chỉ hiển thị, không chặn Start)." : "Robot chưa báo pin (chỉ hiển thị, không chặn Start).");
        return list.Result();
    }

    private bool Window(DateTimeOffset start, DateTimeOffset now, out string detail)
    {
        var latest = start + settings.StartLateLimit;
        detail = now < start ? "Chưa tới giờ bắt đầu của Tour."
            : now > latest ? $"Đã quá {settings.StartLateLimit.TotalMinutes:0} phút sau giờ bắt đầu của Tour."
            : "Đang trong khung giờ được Start.";
        return now >= start && now <= latest;
    }

    private void EvaluateTelemetry(Checklist list, FleetTelemetrySnapshot? snapshot, MapVersion? map, DateTimeOffset now)
    {
        var age = snapshot is null ? (TimeSpan?)null : now - snapshot.ReceivedAt;
        var fresh = age is { } value && value <= settings.MaxTelemetryAge;
        list.Add("telemetryFresh", "TELEMETRY", fresh,
            age is null ? "Robot chưa báo telemetry."
            : fresh ? "Telemetry còn mới."
            : $"Telemetry nhận cách đây {age.Value.TotalSeconds:0.#} giây, quá {settings.MaxTelemetryAge.TotalSeconds:0} giây.");
        if (!fresh)
        {
            list.Skip("telemetryFresh", "TELEMETRY", ["mapContextMatches", "executionIdle", "robotLocalized", "motionReady"]);
            return;
        }
        var report = snapshot!.Report;
        if (map is null)
            list.Skip("revisionStillSchedulable", "TELEMETRY", ["mapContextMatches"]);
        else
        {
            var matches = report.MapKey == map.MapKey && report.FrameId == map.FrameId;
            list.Add("mapContextMatches", "TELEMETRY", matches,
                matches ? "Robot báo đúng bản đồ của tuyến." : "Robot báo bản đồ hoặc frame khác bản đồ của tuyến.");
        }
        list.Add("executionIdle", "TELEMETRY", report.Status == "IDLE",
            report.Status == "IDLE" ? "Robot đang rảnh." : $"Robot đang {report.Status}, chưa rảnh.");
        Reported(list, "robotLocalized", report.Localized, "Robot đã định vị.", "Robot báo chưa định vị.");
        Reported(list, "motionReady", report.MotionReady, "Robot sẵn sàng di chuyển.", "Robot báo chưa sẵn sàng di chuyển.");
    }

    private static void Reported(Checklist list, string id, bool? value, string yes, string no) =>
        list.Add(id, "TELEMETRY", value == true, value is null ? "Robot chưa báo." : value.Value ? yes : no);

    private static void Confirm(Checklist list, string id, bool? value) =>
        list.Add(id, "OPERATOR_CONFIRMATION", value == true,
            value == true ? "Người vận hành đã xác nhận." : "Người vận hành chưa xác nhận.");

    private sealed class Checklist
    {
        private readonly List<ConflictCheck> checks = [];
        private readonly List<string> blockedBy = [];

        public void Add(string id, string source, bool passed, string detail)
        {
            checks.Add(new(id, passed, source, detail));
            if (!passed) blockedBy.Add(id);
        }

        /// <summary>Not evaluated: listed as not passed, kept out of the root causes.</summary>
        public void Skip(string prerequisite, string source, IEnumerable<string> ids)
        {
            foreach (var id in ids)
                checks.Add(new(id, false, source, $"Chưa kiểm tra vì {prerequisite} chưa đạt."));
        }

        public void Info(string id, string source, string detail) => checks.Add(new(id, true, source, detail));

        public TourStartChecks Result() => new(checks, checks.All(check => check.Passed), blockedBy);
    }
}
