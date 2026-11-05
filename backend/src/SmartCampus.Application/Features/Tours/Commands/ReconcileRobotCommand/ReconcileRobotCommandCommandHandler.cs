using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.ReconcileRobotCommand;

/// <summary>
/// The Operator closes an UNKNOWN GoTo without an outcome (ADR-0042 §3). The robot's real state stays unknown, so the robot
/// needs inspection and a running Tour stays NEEDS_ASSISTANCE: only End Early remains. Works on an ended Tour too, because
/// its UNKNOWN command blocks the robot's release.
/// </summary>
public sealed class ReconcileRobotCommandCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<ReconcileRobotCommandCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(ReconcileRobotCommandCommand command, CancellationToken ct)
    {
        var reason = command.Request.Reason.Trim();
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.CommandReconciled, command.TourId, command.CommandId, reason: reason);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.CommandReconciled, command.TourId, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới đối soát được lệnh.");
        var target = await repository.LockCommandAsync(command.CommandId, ct);
        if (target is null || target.TourId != tour.Id)
            throw new NotFoundException("Không tìm thấy lệnh của Tour này.");
        if (target.Kind != RobotCommandKinds.GoTo || target.State != RobotCommandStates.Unknown)
            throw new ConflictException("Chỉ đối soát được lệnh di chuyển đang UNKNOWN.", "COMMAND_STATE_INVALID");

        var now = clock.GetUtcNow();
        target.Reconcile(command.Actor, reason, now);
        if (await repository.LockOpenCancelAsync(target.Id, ct) is { } cancel) cancel.CloseCancel(now);
        await repository.MarkRobotNeedsInspectionAsync(target.RobotId, ct);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.CommandReconciled, OccurredAt = now, RobotId = target.RobotId,
            RouteId = tour.ActiveRouteId, LegId = target.LegId, LegKind = target.LegKind, CommandId = target.Id,
            ActorUserId = command.Actor, ReasonNote = reason
        });
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.CommandReconciled, fingerprint, now, "command");
        return new(tour.Id);
    }
}
