using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Common.Abstractions.Tours;
using SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;
using SmartCampus.Application.Features.Tours.Commands.SkipTourStop;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Queries.GetTour;

public sealed class GetTourQueryHandler(ITourManagementRepository repository, IRouteManagementRepository routes,
    IRouteRevisionRepository revisions, IRegistrationRepository registrations, IMapVersionRepository maps, TourStartPreflight preflight,
    TourScheduleSettings settings, ITourAutoAdvanceStore autoAdvance, TimeProvider clock) : IRequestHandler<GetTourQuery, TourDetails>
{
    public async Task<TourDetails> Handle(GetTourQuery query, CancellationToken ct)
    {
        await using var snapshot = await repository.BeginReadAsync(query.Id, ct);
        var tour = await repository.FindAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var summary = await repository.GetSummaryAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var usage = await repository.GetUsageAsync(query.Id, ct);
        // The same checks Mark READY runs, without its locks; the write rechecks them all.
        var blockers = await TourReadiness.EvaluateAsync(tour, usage, repository, registrations, revisions, maps, clock, lockTarget: false, ct);
        var permissions = TourPreparation.Permissions(tour, usage) with
        {
            CanMarkReady = blockers.Count == 0, CanReopen = tour.CanReopenBeforeStart, ReadyBlockers = blockers, MaxCapacity = settings.MaxCapacity
        };
        var execution = await ExecutionAsync(tour, ct);
        var actions = new TourAllowedActions(await StartAsync(tour, query.Viewer, ct), await NextAsync(tour, query.Viewer, ct),
            EndEarly(tour, query.Viewer), await RetryAsync(tour, query.Viewer, ct), await ReconcileAsync(tour, query.Viewer, ct),
            await StartAsync(tour, query.Viewer, ct, holdAtStart: true), await PauseAsync(tour, query.Viewer, ct),
            await SkipAsync(tour, query.Viewer, ct));
        if (tour.RouteRevisionId is { } revisionId)
        {
            var revision = await RouteRevisionMapper.Load(revisions, tour.RouteId, revisionId, false, ct);
            var target = await repository.GetTargetAsync(tour.Id, ct);
            return new(summary, null, null, tour.FallbackVideoUrl, tour.StartedAt, tour.EndedAt, tour.EndReason,
                usage, permissions, revision, target.Operator, target.Reservation, execution, actions);
        }
        var route = await ReadRoute(tour.RouteId, ct);
        var active = tour.ActiveRouteId == tour.RouteId ? route : await ReadRoute(tour.ActiveRouteId, ct);
        return new(summary, route, active, tour.FallbackVideoUrl, tour.StartedAt, tour.EndedAt, tour.EndReason,
            usage, permissions, null, null, null, execution, actions);
    }

    private async Task<TourExecutionView> ExecutionAsync(Tour tour, CancellationToken ct)
    {
        var command = tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
        var cancelRequested = command is { Kind: RobotCommandKinds.GoTo, IsOpen: true } && await repository.HasOpenCancelAsync(command.Id, ct);
        return new(tour.State, tour.OperationalStatus, tour.AssistanceReason, tour.CurrentStep, tour.CurrentLegId, tour.CurrentLegKind,
            tour.CurrentRevisionStopId, tour.LastArrivedRevisionStopId, tour.DwellDeadlineAt,
            command is null ? null : new(command.Id, command.Kind, command.State, command.Outcome, command.ReasonCode, cancelRequested),
            new(autoAdvance.IsEnabled(tour.Id), autoAdvance.BlockedReason(tour.Id, tour.CurrentStopVisitId)));
    }

    private async Task<TourActionAvailability> StartAsync(Tour tour, Guid? viewer, CancellationToken ct, bool holdAtStart = false)
    {
        if (tour.State != "READY" || viewer is null)
            return Refused("Chỉ Start được Tour READY.", "tourReady");
        var checks = await preflight.EvaluateAsync(tour, viewer, null, includeConfirmation: false, lockTarget: false, ct, holdAtStart);
        return checks.CanStart ? new(true, null, []) : new(false, "Chưa đạt điều kiện Start.", checks.BlockedBy);
    }

    private async Task<TourActionAvailability> NextAsync(Tour tour, Guid? viewer, CancellationToken ct)
    {
        if (!tour.CanAdvance)
            return Refused("Chỉ đi tiếp khi Tour đang chạy bình thường và đang quan sát tại POI.", "TOUR_STATE_INVALID");
        if (tour.OperatorUserId != viewer)
            return Refused("Chỉ người vận hành được giao cho Tour mới đi tiếp được.", "callerIsOperator");
        var robotId = tour.AssignedRobotId!.Value;
        if (await repository.HasOpenCommandAsync(robotId, ct))
            return Refused("Robot còn lệnh đang mở.", "noUnresolvedCommand");
        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct);
        var robot = await TourTarget.FindReservedRobotAsync(revisions, robotId, ct);
        var map = revision is null ? null : await revisions.GetMapAsync(revision.MapVersionId, ct);
        if (revision is null || robot is null || map is null)
            return Refused("Không đọc được tuyến hoặc robot của Tour.", "TOUR_STATE_INVALID");
        // Ending at the last POI creates no command, so no movement check applies.
        if (TourLegDispatch.NextTarget(tour, revision, await revisions.GetStopsAsync(revision.Id, ct)) is null)
            return new(true, null, []);
        var checks = await preflight.EvaluateMovementAsync(tour, robot, map, ct);
        return checks.CanStart ? new(true, null, []) : new(false, "Chưa đủ điều kiện để robot di chuyển.", checks.BlockedBy);
    }

    private async Task<TourActionAvailability> PauseAsync(Tour tour, Guid? viewer, CancellationToken ct)
    {
        if (!tour.IsOnALeg) return Refused("Chỉ tạm dừng được khi robot đang đi một chặng.", "TOUR_STATE_INVALID");
        if (tour.OperatorUserId != viewer) return Refused("Chỉ người vận hành được giao cho Tour mới tạm dừng được.", "callerIsOperator");
        var goTo = tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
        if (goTo is not { IsOpen: true } || goTo.State == RobotCommandStates.Unknown)
            return Refused("Chặng hiện tại không có lệnh di chuyển để dừng.", "COMMAND_STATE_INVALID");
        return await repository.HasOpenCancelAsync(goTo.Id, ct)
            ? Refused("Đã yêu cầu dừng; chờ robot báo đã dừng.", "TOUR_PAUSE_PENDING") : new(true, null, []);
    }

    private async Task<TourActionAvailability> SkipAsync(Tour tour, Guid? viewer, CancellationToken ct)
    {
        var previous = tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
        if (!SkipTourStopCommandHandler.CanSkip(tour, previous))
            return Refused("Chỉ bỏ qua điểm dừng khi robot đang đứng yên.", "TOUR_STATE_INVALID");
        if (tour.OperatorUserId != viewer) return Refused("Chỉ người vận hành được giao cho Tour mới bỏ qua điểm dừng được.", "callerIsOperator");
        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct);
        var robot = await TourTarget.FindReservedRobotAsync(revisions, tour.AssignedRobotId!.Value, ct);
        var map = revision is null ? null : await revisions.GetMapAsync(revision.MapVersionId, ct);
        if (revision is null || robot is null || map is null) return Refused("Không đọc được tuyến hoặc robot của Tour.", "TOUR_STATE_INVALID");
        var stops = await revisions.GetStopsAsync(revision.Id, ct);
        if (SkipTourStopCommandHandler.SkippedStop(tour, revision, stops) is not { } skipped)
            return Refused("Không còn điểm dừng nào phía trước để bỏ qua.", "NOTHING_TO_SKIP");
        if (TourLegDispatch.After(skipped.StopOrder, revision, stops) is null) return new(true, null, []);
        var checks = await preflight.EvaluateMovementAsync(tour, robot, map, ct);
        return checks.CanStart ? new(true, null, []) : new(false, "Chưa đủ điều kiện để robot di chuyển.", checks.BlockedBy);
    }

    private static TourActionAvailability EndEarly(Tour tour, Guid? viewer) =>
        tour.State != TourRuntime.Running ? Refused("Chỉ kết thúc sớm được Tour đang chạy.", "TOUR_STATE_INVALID")
        : tour.OperatorUserId != viewer ? Refused("Chỉ người vận hành được giao cho Tour mới kết thúc sớm được.", "callerIsOperator")
        : new(true, null, []);

    private async Task<TourActionAvailability> RetryAsync(Tour tour, Guid? viewer, CancellationToken ct)
    {
        var previous = tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
        if (!RetryTourLegCommandHandler.CanRetry(tour, previous))
            return Refused("Chỉ thử lại được chặng đã kết thúc thật sự với FAILED, bị từ chối, hoặc hết hạn khi robot chưa nhận.", "TOUR_RETRY_NOT_ALLOWED");
        if (tour.OperatorUserId != viewer)
            return Refused("Chỉ người vận hành được giao cho Tour mới thử lại chặng được.", "callerIsOperator");
        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct);
        var robot = await TourTarget.FindReservedRobotAsync(revisions, tour.AssignedRobotId!.Value, ct);
        var map = revision is null ? null : await revisions.GetMapAsync(revision.MapVersionId, ct);
        if (robot is null || map is null) return Refused("Không đọc được tuyến hoặc robot của Tour.", "TOUR_STATE_INVALID");
        var checks = await preflight.EvaluateMovementAsync(tour, robot, map, ct);
        return checks.CanStart ? new(true, null, []) : new(false, "Chưa đủ điều kiện để robot di chuyển.", checks.BlockedBy);
    }

    private async Task<TourActionAvailability> ReconcileAsync(Tour tour, Guid? viewer, CancellationToken ct)
    {
        var current = tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
        return current?.State != RobotCommandStates.Unknown ? Refused("Chặng hiện tại không có lệnh UNKNOWN.", "COMMAND_STATE_INVALID")
            : tour.OperatorUserId != viewer ? Refused("Chỉ người vận hành được giao cho Tour mới đối soát được lệnh.", "callerIsOperator")
            : new(true, null, []);
    }

    private static TourActionAvailability Refused(string reason, string blockedBy) => new(false, reason, [blockedBy]);

    private async Task<RouteDetails> ReadRoute(Guid id, CancellationToken ct)
    {
        var route = await routes.FindAsync(id, false, ct) ?? throw new NotFoundException("Không tìm thấy Route của Tour.");
        return RouteConfiguration.Details(route, await routes.GetUsageAsync(id, ct));
    }
}
