using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.EndTourEarly;

/// <summary>
/// Ends a running Tour (ADR-0043 D13, D14). The command is withdrawn if the robot never received it, otherwise a Cancel is
/// queued, also for an UNKNOWN GoTo (best effort); the leg's real result is still recorded when it arrives. Nothing here proves the robot stopped, so it needs
/// inspection and stays held. A Tour with no open GoTo (stopped at the start, a POI or after a paused leg) releases the robot
/// instead. FR-48 revocation and notices are a follow-up.
/// </summary>
public sealed class EndTourEarlyCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<EndTourEarlyCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(EndTourEarlyCommand command, CancellationToken ct)
    {
        var reason = command.Request.Reason.Trim();
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.EndedEarly, command.Id, reason: reason);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.EndedEarly, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới kết thúc sớm được.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        if (tour.State != TourRuntime.Running)
            throw new ConflictException("Chỉ kết thúc sớm được Tour đang chạy.", "TOUR_STATE_INVALID");

        var now = clock.GetUtcNow();
        var robotId = tour.AssignedRobotId!.Value;
        var goTo = await repository.LockOpenGoToAsync(tour.Id, ct);
        if (goTo is not null)
            StopLeg(tour, goTo, command.Actor, reason, now);
        tour.EndEarly(reason, now);
        // Only a leg that may still be running leaves the robot's position unknown. With no open GoTo the robot is stopped
        // where its last result said (the start, a POI, or a stopped leg), so it is released like a normal end.
        if (goTo is not null) await repository.MarkRobotNeedsInspectionAsync(robotId, ct);
        else await repository.ReleaseRobotAsync(robotId, tour.Id, ct);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.EndedEarly, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, ActorUserId = command.Actor, ReasonNote = reason
        });
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.EndedEarly, fingerprint, now, "state");
        return new(tour.Id);
    }

    private void StopLeg(Tour tour, RobotCommand goTo, Guid actor, string reason, DateTimeOffset now)
    {
        // An UNKNOWN GoTo may or may not be running. It stays UNKNOWN for Reconcile, but a Cancel is still queued as a best
        // effort for whichever stream polls next; delivering or acknowledging it does not prove the robot stopped.
        var withdrawn = goTo.State == RobotCommandStates.Pending;
        var cancel = withdrawn ? null : RobotCommand.CancelOf(goTo, now, actor);
        if (withdrawn) goTo.Expire(now, "WITHDRAWN");
        else repository.Add(cancel!);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = withdrawn ? TourLifecycleEvents.LegWithdrawn : TourLifecycleEvents.LegCancelRequested,
            OccurredAt = now, RobotId = goTo.RobotId, RouteId = tour.ActiveRouteId, LegId = goTo.LegId, LegKind = goTo.LegKind,
            CommandId = cancel?.Id ?? goTo.Id, ActorUserId = actor, ReasonNote = reason
        });
    }
}
