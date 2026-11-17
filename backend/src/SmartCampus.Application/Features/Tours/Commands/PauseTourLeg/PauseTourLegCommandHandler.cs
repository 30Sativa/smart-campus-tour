using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.PauseTourLeg;

/// <summary>
/// The Operator stops the current leg and keeps the Tour. A GoTo the robot never received is withdrawn and the Tour is
/// paused at once. A delivered one gets a real Cancel, and the Tour stays NORMAL until the robot reports how the leg
/// ended: CANCELLED (or FAILED, e.g. a local stop on link loss) pauses it, ARRIVED wins and opens the POI as usual.
/// Resuming is Retry: a new leg with a new legId to the same target, so a paused goal is never resumed. Not an E-stop.
/// </summary>
public sealed class PauseTourLegCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<PauseTourLegCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(PauseTourLegCommand command, CancellationToken ct)
    {
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.Pause, command.Id);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Pause, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới tạm dừng được.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        if (!tour.IsOnALeg)
            throw new ConflictException("Chỉ tạm dừng được khi robot đang đi một chặng.", "TOUR_STATE_INVALID");
        var goTo = await repository.LockOpenGoToAsync(tour.Id, ct);
        if (goTo is null || goTo.LegId != tour.CurrentLegId)
            throw new ConflictException("Chặng hiện tại không còn lệnh di chuyển đang mở.", "TOUR_STATE_INVALID");
        if (goTo.State == RobotCommandStates.Unknown)
            throw new ConflictException("Chưa rõ robot đang làm gì với lệnh này; xác nhận tại chỗ trước.", "COMMAND_STATE_INVALID");
        if (await repository.LockOpenCancelAsync(goTo.Id, ct) is not null)
            throw new ConflictException("Đã yêu cầu dừng chặng này; chờ robot báo đã dừng.", "TOUR_PAUSE_PENDING");

        var now = clock.GetUtcNow();
        var withdrawn = goTo.State == RobotCommandStates.Pending;
        var cancel = withdrawn ? null : RobotCommand.CancelOf(goTo, now, command.Actor);
        if (withdrawn)
        {
            goTo.Expire(now, "WITHDRAWN");
            tour.Pause(now);
        }
        else repository.Add(cancel!);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = withdrawn ? TourLifecycleEvents.LegWithdrawn : TourLifecycleEvents.PauseRequested,
            OccurredAt = now, RobotId = goTo.RobotId, RouteId = tour.ActiveRouteId, LegId = goTo.LegId, LegKind = goTo.LegKind,
            CommandId = cancel?.Id ?? goTo.Id, ActorUserId = command.Actor
        });
        if (withdrawn)
            repository.AddEvent(new TourEvent
            {
                TourId = tour.Id, EventType = TourLifecycleEvents.Paused, OccurredAt = now, RobotId = goTo.RobotId,
                RouteId = tour.ActiveRouteId, LegId = goTo.LegId, LegKind = goTo.LegKind, CommandId = goTo.Id, ActorUserId = command.Actor
            });
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Pause, fingerprint, now, "state");
        return new(tour.Id);
    }
}
