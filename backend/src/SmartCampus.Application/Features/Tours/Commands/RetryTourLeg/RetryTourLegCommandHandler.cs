using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;

/// <summary>
/// A new leg to the same target after a leg that is known to have ended or never reached the robot (EXPIRED) (ADR-0043). Never from an UNKNOWN or RECONCILED
/// command: the old goal may still run. The movement checks include executionIdle and mapContextMatches, so a BUSY or
/// MAP_MISMATCH rejection cannot retry in a loop.
/// </summary>
public sealed class RetryTourLegCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, TourStartPreflight preflight, FleetCommandSettings settings, TimeProvider clock)
    : IRequestHandler<RetryTourLegCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(RetryTourLegCommand command, CancellationToken ct)
    {
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.LegRetried, command.Id);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.LegRetried, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới thử lại chặng được.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        var previous = tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
        if (!CanRetry(tour, previous))
            throw new ConflictException("Chỉ thử lại được chặng đã kết thúc thật sự với FAILED, bị từ chối, hoặc hết hạn khi robot chưa nhận.", "TOUR_RETRY_NOT_ALLOWED");

        var robotId = tour.AssignedRobotId!.Value;
        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
        var map = await revisions.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        var robot = await TourTarget.FindReservedRobotAsync(revisions, robotId, ct) ?? throw new NotFoundException("Không tìm thấy robot của Tour.");
        var checks = await preflight.EvaluateMovementAsync(tour, robot, map, ct);
        if (checks.BlockedBy.Count > 0)
            throw new ConflictException("Chưa đủ điều kiện để robot di chuyển.", TourStartPreflight.MovementFailedCode,
                checks: checks.Checks, blockedBy: checks.BlockedBy);

        var stop = tour.CurrentRevisionStopId is { } stopId
            ? (await revisions.GetStopsAsync(revision.Id, ct)).Single(item => item.Id == stopId) : null;
        var now = clock.GetUtcNow();
        tour.ClearAssistance(now);
        TourLegDispatch.Begin(repository, settings, tour, robotId, map, stop is null ? TourLegTarget.End(revision) : TourLegTarget.To(stop), command.Actor, now);
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.LegRetried, fingerprint, now, "state");
        return new(tour.Id);
    }

    /// <summary>
    /// The reason must match how the leg really ended; shared with the Tour detail. An EXPIRED GoTo was never delivered, so
    /// the robot provably never received it: it expired with fresh telemetry (<c>CommandExpired</c>) or stale telemetry
    /// (<c>RobotDisconnected</c>, where <c>telemetryFresh</c> blocks the retry until the robot is heard again).
    /// </summary>
    internal static bool CanRetry(Tour tour, RobotCommand? previous) =>
        tour.State == TourRuntime.Running && tour.OperationalStatus == TourRuntime.NeedsAssistance && previous is not null &&
        ((tour.AssistanceReason == TourRuntime.NavigationFailed && previous.State == RobotCommandStates.Failed) ||
         (tour.AssistanceReason == TourRuntime.CommandRejected && previous.State == RobotCommandStates.Rejected) ||
         (tour.AssistanceReason is TourRuntime.CommandExpired or TourRuntime.RobotDisconnected &&
          previous.State == RobotCommandStates.Expired && previous.DeliveredStreamId is null));
}
