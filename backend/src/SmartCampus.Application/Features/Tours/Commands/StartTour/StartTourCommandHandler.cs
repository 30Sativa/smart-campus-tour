using MediatR;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.StartTour;

/// <summary>
/// The Start sequence of ADR-0042 §5 in one transaction: every preflight check under the locks, claim the robot, READY to
/// RUNNING, the first GoTo as PENDING, events and the receipt. Nothing is sent; the robot pulls the command. With
/// FleetCommands:Enabled = false it refuses without writing, and a refused command throws so nothing commits.
/// </summary>
public sealed class StartTourCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, TourStartPreflight preflight, FleetCommandSettings settings, TimeProvider clock,
    ILogger<StartTourCommandHandler> logger) : IRequestHandler<StartTourCommand, TourMutationResult>
{
    public const string EarlyStartReason = "EARLY_START";

    public async Task<TourMutationResult> Handle(StartTourCommand command, CancellationToken ct)
    {
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.Started, command.Id, command.Request.Confirmation);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Started, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới Start được.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        var result = await preflight.EvaluateAsync(tour, null, command.Request.Confirmation,
            includeConfirmation: true, lockTarget: true, ct);
        if (result.BlockedBy.Count > 0) throw Refused(tour, command.Actor, result);

        // Every check passed, so the Tour has its revision, map and reservation.
        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
        var map = await revisions.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        var reservation = await repository.FindActiveReservationAsync(tour.Id, ct)
            ?? throw new ConflictException("Tour chưa giữ robot cho khung giờ của mình.", "RESERVATION_MISSING");
        var first = (await revisions.GetStopsAsync(revision.Id, ct)).MinBy(stop => stop.StopOrder)
            ?? throw new ConflictException("Phiên bản tuyến không có điểm dừng.", "ROUTE_VERSION_REQUIRED");

        var now = clock.GetUtcNow();
        if (!await repository.TryClaimRobotAsync(reservation.RobotId, tour.Id, now, ct))
            throw new ConflictException("Robot vừa đổi trạng thái nên không nhận được Tour. Tải lại và thử lại.", "ROBOT_CLAIM_FAILED");
        // ADR-0050: an early Start is recorded with how early it was; the preflight required every viewer to be in the waiting room.
        var early = tour.ScheduledStartAt - now;
        tour.Start(reservation.RobotId, now);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.Started, OccurredAt = now, RobotId = reservation.RobotId,
            RouteId = tour.ActiveRouteId, ActorUserId = command.Actor,
            ReasonCode = early > TimeSpan.Zero ? EarlyStartReason : null,
            ReasonNote = early > TimeSpan.Zero
                ? $"Start sớm {(int)Math.Ceiling(early.TotalSeconds)} giây trước giờ bắt đầu; mọi điểm xem đã vào phòng chờ." : null
        });
        TourLegDispatch.Begin(repository, settings, tour, reservation.RobotId, map, TourLegTarget.To(first), command.Actor, now);
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Started, fingerprint, now, "state");
        return new(tour.Id);
    }

    private ConflictException Refused(Tour tour, Guid actor, TourStartChecks result)
    {
        var preconditionFailed = result.BlockedBy.Any(id => id != TourStartPreflight.TransportCheck);
        var code = preconditionFailed ? TourStartPreflight.FailedCode : TourStartPreflight.TransportDisabledCode;
        logger.LogInformation("Tour {TourId} Start refused for operator {ActorUserId}: {Code}; blocked by {BlockedBy}.",
            tour.Id, actor, code, string.Join(',', result.BlockedBy));
        return new ConflictException(
            preconditionFailed ? "Tour chưa đủ điều kiện Start." : "Command transport chưa bật nên chưa Start được Tour.",
            code, checks: result.Checks, blockedBy: result.BlockedBy);
    }
}
