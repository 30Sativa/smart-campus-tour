using MediatR;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.EndTourEarly;

/// <summary>
/// Ends a running Tour (ADR-0043 D13, D14). The command is withdrawn if the robot never received it, otherwise a Cancel is
/// queued, also for an UNKNOWN GoTo (best effort); the leg's real result is still recorded when it arrives. Nothing here proves the robot stopped, so it needs
/// inspection and stays held. A Tour with no open GoTo (stopped at the start, a POI or after a paused leg) releases the robot
/// instead. The robot hold ends now in both cases. Notices are queued atomically and delivered after commit.
/// </summary>
public sealed class EndTourEarlyCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations, TimeProvider clock,
    IRouteRevisionRepository revisions, ITourVoteRepository votes, TourScheduleSettings settings,
    InvitationSettings invitations, ILogger<EndTourEarlyCommandHandler> logger)
    : IRequestHandler<EndTourEarlyCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(EndTourEarlyCommand command, CancellationToken ct)
    {
        var actor = await revisions.FindUserAsync(command.Actor, ct);
        if (actor is null || !ApplicationRoles.TryResolve(actor.UserRoles.Select(r => r.Role), out var role) || role != ApplicationRoles.Staff)
            throw new ForbiddenException("Chỉ nhân viên vận hành được kết thúc sớm Tour.");
        var reason = command.Request.Reason.Trim();
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.EndedEarly, command.Id, reason: reason);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.EndedEarly, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.State != TourRuntime.Running)
            throw new ConflictException("Chỉ kết thúc sớm được Tour đang chạy.", "TOUR_STATE_INVALID");
        var now = clock.GetUtcNow();
        var byBackupStaff = tour.OperatorUserId != command.Actor;
        // Read after locking the Tour: the heartbeat writer owns the same root before touching presence.
        var lastSeen = await repository.GetOperatorLastSeenAsync(tour.Id, ct);
        if (byBackupStaff) TourOperatorPresencePolicy.EnsureBackupAllowed(lastSeen, now, settings.OperatorDisconnectEndEarlyMinutes);
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);

        var robotId = tour.AssignedRobotId!.Value;
        var goTo = await repository.LockOpenGoToAsync(tour.Id, ct);
        if (goTo is not null)
            StopLeg(tour, goTo, command.Actor, reason, now);
        // ADR-0065 rule 4: an open ballot closes; nothing is chosen since the robot does not go on.
        await TourVoting.CloseOpenBallotAsync(repository, votes, revisions, tour, decide: false, command.Actor, now, ct);
        tour.EndEarly(reason, now);
        TourCancellation.QueueNotice(repository, invitations, logger, tour.Id, command.Actor,
            await repository.GetEndedEarlyNoticeRegistrationIdsAsync(tour.Id, ct), now, kind: TourCancelNoticeAudit.EndedEarly);
        var eventData = JsonNode.Parse(await TourLegDispatch.EndHoldAsync(repository, tour.Id, now, ct) ?? "{}")!.AsObject();
        if (byBackupStaff)
        {
            eventData["byBackupStaff"] = true;
            eventData["operatorUserId"] = tour.OperatorUserId;
            eventData["operatorLastSeenAt"] = lastSeen;
        }
        // Only a leg that may still be running leaves the robot's position unknown. With no open GoTo the robot is stopped
        // where its last result said (the start, a POI, or a stopped leg), so it is released like a normal end.
        if (goTo is not null) await repository.MarkRobotNeedsInspectionAsync(robotId, ct);
        else await repository.ReleaseRobotAsync(robotId, tour.Id, ct);
        // Either way the hold ends now; a robot left for inspection stays blocked by NeedsInspection, not by the hold.
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.EndedEarly, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, ActorUserId = command.Actor, ReasonNote = reason,
            DataJson = eventData.Count == 0 ? null : eventData.ToJsonString()
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
