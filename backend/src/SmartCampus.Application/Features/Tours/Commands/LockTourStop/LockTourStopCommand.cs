using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.LockTourStop;

public sealed record TourStopLockRequest(string Reason);

/// <summary>The Operator locks (<paramref name="Locked"/> true) or unlocks a POI of a running voting Tour (ADR-0065 rule 8).</summary>
public sealed record LockTourStopCommand(Guid Id, Guid StopId, Guid Actor, bool Locked, string Reason) : ITourMutationCommand<TourMutationResult>;

public sealed class LockTourStopCommandValidator : AbstractValidator<LockTourStopCommand>
{
    public const int MaxReasonLength = 500;

    public LockTourStopCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.StopId).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Reason).Must(reason => !string.IsNullOrWhiteSpace(reason) && reason.Trim().Length <= MaxReasonLength)
            .WithMessage($"Lý do phải có từ 1 đến {MaxReasonLength} ký tự.");
    }
}

/// <summary>
/// Locking takes the POI out of the open ballot and clears the votes for it (they stay stored with no stop). If it was the
/// decided POI and the robot has not left, the decision is taken again (<c>LOCKED_FALLBACK</c>). Unlocking only makes the
/// POI a candidate again; a decision already taken stays. The first POI is fixed. The target of the current leg can be
/// locked only once that leg has really stopped (when Retry is allowed); the visit the robot left then decides again and
/// Retry goes to its decision. Every Viewer sees the reason.
/// </summary>
public sealed class LockTourStopCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, ITourVoteRepository votes, TimeProvider clock)
    : IRequestHandler<LockTourStopCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(LockTourStopCommand command, CancellationToken ct)
    {
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới khóa hoặc mở khóa điểm tham quan được.");
        if (tour.State != TourRuntime.Running || tour.RouteRevisionId is not { } revisionId)
            throw Invalid("Chỉ khóa hoặc mở khóa điểm tham quan khi Tour đang chạy.");
        var revision = await revisions.FindRevisionAsync(revisionId, ct);
        if (revision is not { ViewerChoosesNextStop: true })
            throw Invalid("Tuyến của Tour không cho Viewer chọn điểm tiếp theo.");
        var stops = await revisions.GetStopsAsync(revision.Id, ct);
        var stop = stops.SingleOrDefault(item => item.Id == command.StopId)
            ?? throw new NotFoundException("Không tìm thấy điểm tham quan trên tuyến của Tour.");
        var state = await TourVoting.LoadAsync(votes, tour, revision, stops, ct);
        if (state.Visited.Contains(stop.Id)) throw Invalid("Điểm tham quan này đã đi qua hoặc đã bỏ qua.");

        var now = clock.GetUtcNow();
        var reason = command.Reason.Trim();
        var active = state.Records.ActiveLocks.SingleOrDefault(item => item.RouteRevisionStopId == stop.Id);
        if (command.Locked)
        {
            // The target of the current leg: refused while its GoTo still runs or is unknown (a pause asked but not yet
            // reported included); allowed once the leg has really stopped, which is exactly when Retry is allowed.
            var target = tour.CurrentStep == TourRuntime.Navigating && tour.CurrentRevisionStopId == stop.Id;
            var previous = target && tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
            if (target && !RetryTourLegCommandHandler.CanRetry(tour, previous)) throw Invalid("Robot đang đi tới điểm tham quan này.");
            Lock(state, stop, active, reason, command.Actor, now, stoppedTarget: target);
        }
        else
        {
            if (active is null) throw Invalid("Điểm tham quan này đang không bị khóa.");
            (active.UnlockedAt, active.UnlockedByUserId, active.UnlockReason) = (now, command.Actor, reason);
            state.Locked.Remove(stop.Id);
        }
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = command.Locked ? TourLifecycleEvents.StopLocked : TourLifecycleEvents.StopUnlocked,
            OccurredAt = now, RobotId = tour.AssignedRobotId, RouteId = tour.ActiveRouteId, StopVisitId = state.Current?.Id,
            TargetStopOrder = stop.StopOrder, ActorUserId = command.Actor, ReasonNote = reason,
            DataJson = System.Text.Json.JsonSerializer.Serialize(new { stopId = stop.Id })
        });
        return new(tour.Id);
    }

    private void Lock(TourVotingState state, RouteRevisionStop stop, TourStopLock? active, string reason, Guid actor, DateTimeOffset now,
        bool stoppedTarget)
    {
        var tour = state.Tour;
        if (active is not null) throw Invalid("Điểm tham quan này đã bị khóa.");
        if (stop.StopOrder == state.Stops.Min(item => item.StopOrder))
            throw Invalid("Điểm tham quan đầu tiên là cố định, không khóa được.");
        if (stoppedTarget)
        {
            // ADR-0065 rule 8: the robot stopped on its way here, so the visit it left decides again (LOCKED_FALLBACK)
            // and Retry goes there.
            votes.Add(NewLock(tour, stop, reason, actor, now));
            state.Locked.Add(stop.Id);
            TourVoting.Settle(repository, state, actor, now);
            return;
        }

        var visit = state.Current is { } current && TourVoting.AtVisit(tour, current) ? current : null;
        var open = visit is not null && TourVoting.IsOpen(tour, visit, now);
        // A ballot already closed by time keeps the decision it had before the lock, so a re-choice says LOCKED_FALLBACK.
        if (visit is not null && !open) TourVoting.Settle(repository, state, actor, now);

        votes.Add(NewLock(tour, stop, reason, actor, now));
        state.Locked.Add(stop.Id);
        if (visit is null) return;
        if (open)
            foreach (var vote in state.Records.Votes.Where(item => item.RouteRevisionStopId == stop.Id))
                (vote.RouteRevisionStopId, vote.UpdatedAt) = (null, now);
        if (visit.ChosenRevisionStopId == stop.Id) TourVoting.Settle(repository, state, actor, now);
    }

    private static TourStopLock NewLock(Tour tour, RouteRevisionStop stop, string reason, Guid actor, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(), TourId = tour.Id, RouteRevisionStopId = stop.Id, Reason = reason, LockedByUserId = actor, LockedAt = now
    };

    private static ConflictException Invalid(string message) => new(message, TourVoteCodes.StopLockInvalid);
}
