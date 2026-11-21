using System.Text.Json;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>One candidate of the ballot at the current POI; <see cref="PoiId"/> is the id the Student stop list uses.</summary>
public sealed record TourBallotCandidate(Guid StopId, Guid PoiId, string Name, int Votes);
public sealed record TourBallotLock(Guid StopId, string Name, string Reason);
public sealed record TourBallotDecision(Guid StopId, string Name, string Reason, int Votes);

/// <summary>
/// The ballot of the POI the robot is at (ADR-0065). <see cref="Decision"/> is null while the ballot is open;
/// <see cref="MyVote"/> is the caller's roster row's choice, always null for Staff.
/// </summary>
public sealed record TourBallotView(Guid StopVisitId, bool Open, DateTimeOffset? ClosesAt, IReadOnlyList<TourBallotCandidate> Candidates,
    Guid? MyVote, IReadOnlyList<TourBallotLock> Locked, TourBallotDecision? Decision);

/// <summary>Where Next would go: <c>POI</c> with its stop, or <c>END</c> (the end pose, or completion at the last POI).</summary>
public sealed record TourNextTargetView(string Kind, Guid? StopId, string? Name);

/// <summary>
/// One stop of a voting route for the Operator and the twin: <see cref="Progress"/> as on the Student page, <see cref="Order"/>
/// the 1-based order in which it was reached or skipped (null until then).
/// </summary>
public sealed record TourStopProgressView(Guid StopId, string Progress, int? Order, string? LockReason);

public static class TourVoteCodes
{
    public const string VoteClosed = "VOTE_CLOSED";
    public const string CandidateInvalid = "VOTE_CANDIDATE_INVALID";
    public const string AllRemainingLocked = "ALL_REMAINING_STOPS_LOCKED";
    public const string SkipNotAllowed = "SKIP_NOT_ALLOWED";
    public const string StopLockInvalid = "STOP_LOCK_INVALID";
}

public static class TourStopVisitOutcomes
{
    public const string Arrived = "ARRIVED";
    public const string Skipped = "SKIPPED";
}

/// <summary>What a voting Tour has stored about its POIs, with the locked set the caller may extend before deciding.</summary>
internal sealed class TourVotingState(Tour tour, RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops, TourVotingRecords records)
{
    public Tour Tour => tour;
    public RouteRevision Revision => revision;
    public IReadOnlyList<RouteRevisionStop> Stops => stops;
    public TourVotingRecords Records => records;
    public List<TourStopVisit> Visits { get; } = records.Visits.ToList();
    public HashSet<Guid> Locked { get; } = records.ActiveLocks.Select(item => item.RouteRevisionStopId).ToHashSet();
    public TourStopVisit? Current => Visits.SingleOrDefault(visit => visit.Id == tour.CurrentStopVisitId);

    /// <summary>Read from TourStopVisits, never inferred from StopOrder, so it holds after a restart.</summary>
    public HashSet<Guid> Visited => Visits.Select(visit => visit.RouteRevisionStopId).ToHashSet();

    public IReadOnlyList<NextStopOption> Options => stops.Select(stop => new NextStopOption(stop.Id, stop.StopOrder)).ToList();

    /// <summary>The stop each counted roster row chose in the current ballot; cleared votes and revoked rows are left out.</summary>
    public IEnumerable<Guid> CountedVotes => records.Votes
        .Where(vote => vote.RouteRevisionStopId is not null && records.CountedRowIds.Contains(vote.RosterRowId))
        .Select(vote => vote.RouteRevisionStopId!.Value);

    public bool IsCandidate(Guid stopId) => stops.Any(stop => stop.Id == stopId) && !Visited.Contains(stopId) && !Locked.Contains(stopId);
    public RouteRevisionStop Stop(Guid stopId) => stops.Single(stop => stop.Id == stopId);
}

/// <summary>
/// The runtime of ADR-0065 for a route revision with <c>ViewerChoosesNextStop</c>: a visit row per POI, a ballot while
/// at least two candidates remain, the decision by <see cref="NextStopChooser"/>, and the target of the next leg. Every
/// writer holds the Tour root lock, so closing a ballot and choosing the target share one transaction. A route without
/// the flag never reaches here.
/// </summary>
internal static class TourVoting
{
    public static async Task<TourVotingState> LoadAsync(ITourVoteRepository votes, Tour tour, RouteRevision revision,
        IReadOnlyList<RouteRevisionStop> stops, CancellationToken ct) =>
        new(tour, revision, stops, await votes.LoadAsync(tour.Id, tour.CurrentStopVisitId, ct));

    /// <summary>The robot is still at this visit: nothing has left it yet.</summary>
    public static bool AtVisit(Tour tour, TourStopVisit visit) =>
        tour.State == TourRuntime.Running && tour.CurrentStep == TourRuntime.Observing && tour.CurrentStopVisitId == visit.Id &&
        tour.StopVisitClosedAt is null;

    /// <summary>Open by server time: opened at arrival, not closed, and before both its own close and the dwell deadline.</summary>
    public static bool IsOpen(Tour tour, TourStopVisit visit, DateTimeOffset now) =>
        AtVisit(tour, visit) && visit.BallotClosesAt is { } closes && visit.BallotClosedAt is null && now < closes &&
        tour.DwellDeadlineAt is { } deadline && now < deadline;

    /// <summary>
    /// Arrival at a POI of a voting Tour: its visit row, with a ballot until the dwell deadline only when at least two
    /// candidates remain (rule 3). With exactly one, that POI is decided now (<c>SINGLE_CANDIDATE</c>). Call after
    /// <see cref="Tour.ArriveAtStop"/>.
    /// </summary>
    public static async Task ArriveAsync(ITourManagementRepository repository, ITourVoteRepository votes, Tour tour, RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops,
        Guid stopId, DateTimeOffset now, CancellationToken ct)
    {
        var state = await LoadAsync(votes, tour, revision, stops, ct);
        if (state.Visited.Contains(stopId)) return; // Each POI has one visit; a second arrival opens nothing.
        var visited = state.Visited;
        visited.Add(stopId);
        var candidates = NextStopChooser.CandidateCount(state.Options, visited, state.Locked);
        var visit = new TourStopVisit
        {
            Id = tour.CurrentStopVisitId!.Value, TourId = tour.Id, RouteRevisionStopId = stopId, Outcome = TourStopVisitOutcomes.Arrived,
            OccurredAt = now, BallotClosesAt = candidates >= 2 ? tour.DwellDeadlineAt : null
        };
        votes.Add(visit);
        state.Visits.Add(visit);
        if (candidates == 1) Settle(repository, state, null, now);
    }

    /// <summary>
    /// What Next would choose now, writing nothing: the stored decision while it is still a candidate, otherwise rule 6
    /// over the current candidates (<c>LOCKED_FALLBACK</c> when the stored one was locked since).
    /// </summary>
    public static NextStopChoice Preview(TourVotingState state)
    {
        var stored = state.Current?.ChosenRevisionStopId;
        var fresh = NextStopChooser.Choose(state.Options, state.Visited, state.Locked, state.CountedVotes,
            lockedFallback: stored is { } lost && !state.IsCandidate(lost));
        // Without a ballot nobody voted, so a choice among several (after an unlock) is the fallback, never a vote result.
        if (state.Current is { BallotClosesAt: null } && fresh.Reason is NextStopReasons.Vote or NextStopReasons.TieDefault or NextStopReasons.NoVotes)
            fresh = fresh with { Reason = NextStopReasons.LockedFallback };
        if (stored is not { } chosen || !state.IsCandidate(chosen)) return fresh;
        var visit = state.Current!;
        return new(NextStopOutcome.Chosen, chosen, visit.ChosenReason, visit.ChosenVoteCount ?? 0, fresh.Counts);
    }

    /// <summary>
    /// Closes the current ballot (at its deadline if that has passed) and stores the decision with a
    /// <c>NEXT_STOP_CHOSEN</c> event when it changed. With every remaining POI locked the stored decision is cleared, so an
    /// unlock decides again.
    /// </summary>
    public static NextStopChoice Settle(ITourManagementRepository repository, TourVotingState state, Guid? actor, DateTimeOffset now)
    {
        var choice = Preview(state);
        if (state.Current is not { } visit) return choice;
        CloseBallot(visit, now);
        if (choice.Outcome != NextStopOutcome.Chosen)
        {
            (visit.ChosenRevisionStopId, visit.ChosenReason, visit.ChosenVoteCount) = (null, null, null);
            return choice;
        }
        if (visit.ChosenRevisionStopId == choice.WinnerStopId && visit.ChosenReason == choice.Reason) return choice;
        (visit.ChosenRevisionStopId, visit.ChosenReason, visit.ChosenVoteCount) = (choice.WinnerStopId, choice.Reason, choice.WinnerVotes);
        var tour = state.Tour;
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.NextStopChosen, OccurredAt = now, RobotId = tour.AssignedRobotId,
            RouteId = tour.ActiveRouteId, StopVisitId = visit.Id, TargetStopOrder = state.Stop(choice.WinnerStopId!.Value).StopOrder,
            ReasonCode = choice.Reason, ActorUserId = actor,
            DataJson = JsonSerializer.Serialize(new
            {
                stopVisitId = visit.Id, winnerStopId = choice.WinnerStopId, reason = choice.Reason, votes = choice.WinnerVotes,
                counts = choice.Counts.Select(count => new { stopId = count.StopId, votes = count.Votes })
            })
        });
        return choice;
    }

    /// <summary>Records the close time once: the ballot's own deadline when it already passed, else now.</summary>
    public static void CloseBallot(TourStopVisit visit, DateTimeOffset now)
    {
        if (visit.BallotClosesAt is { } closes && visit.BallotClosedAt is null) visit.BallotClosedAt = closes <= now ? closes : now;
    }

    /// <summary>The leg target of a choice: the POI, else the end pose, else null (the route ends at its last POI).</summary>
    public static TourLegTarget? Target(TourVotingState state, NextStopChoice choice) => choice.Outcome switch
    {
        NextStopOutcome.Chosen => TourLegTarget.To(state.Stop(choice.WinnerStopId!.Value)),
        _ => state.Revision.EndMode == "POSE" ? TourLegTarget.End(state.Revision) : null
    };

    /// <summary>
    /// The target of Next and the automatic Next. A route without the flag, and the departure from the start (always the
    /// first POI), use <see cref="TourLegDispatch.NextTarget"/>. On a voting route this closes the ballot and stores the
    /// decision; <c>Blocked</c> is true when only locked POIs remain.
    /// </summary>
    public static async Task<(TourLegTarget? Target, bool Blocked)> NextAsync(ITourManagementRepository repository, ITourVoteRepository votes,
        Tour tour, RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops, Guid? actor, DateTimeOffset now, CancellationToken ct)
    {
        if (!revision.ViewerChoosesNextStop || tour.CurrentStep == TourRuntime.Initializing)
            return (TourLegDispatch.NextTarget(tour, revision, stops), false);
        var state = await LoadAsync(votes, tour, revision, stops, ct);
        var choice = Settle(repository, state, actor, now);
        return choice.Outcome == NextStopOutcome.AllRemainingLocked ? (null, true) : (Target(state, choice), false);
    }

    /// <summary>The same target as <see cref="NextAsync"/>, writing nothing, for the Tour detail.</summary>
    public static async Task<(TourLegTarget? Target, bool Blocked, TourVotingState? State)> PreviewNextAsync(ITourVoteRepository votes,
        Tour tour, RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops, CancellationToken ct)
    {
        if (!revision.ViewerChoosesNextStop || tour.CurrentStep == TourRuntime.Initializing)
            return (TourLegDispatch.NextTarget(tour, revision, stops), false, null);
        var state = await LoadAsync(votes, tour, revision, stops, ct);
        var choice = Preview(state);
        return choice.Outcome == NextStopOutcome.AllRemainingLocked ? (null, true, state) : (Target(state, choice), false, state);
    }

    /// <summary>
    /// The target of Retry/Resume (ADR-0065 rule 8). A route without the flag, a leg to the end and the first leg (no visit
    /// yet) keep the old leg's target. On a voting route a leg to a POI goes to the decision of the visit the robot left:
    /// normally the old target; the re-chosen POI once the old target was locked while the leg was stopped, even if it was
    /// unlocked again since. <c>Blocked</c> when only locked POIs remain. With a <paramref name="repository"/> the decision
    /// is stored (<see cref="Settle"/>); without one this only reads, for the Tour detail.
    /// </summary>
    public static async Task<(TourLegTarget Target, bool Blocked)> RetryAsync(ITourManagementRepository? repository, ITourVoteRepository votes,
        Tour tour, RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops, Guid? actor, DateTimeOffset now, CancellationToken ct)
    {
        var old = tour.CurrentRevisionStopId is { } stopId ? TourLegTarget.To(stops.Single(stop => stop.Id == stopId)) : TourLegTarget.End(revision);
        if (!revision.ViewerChoosesNextStop || tour.CurrentLegKind != RobotLegKinds.ToPoi) return (old, false);
        var state = await LoadAsync(votes, tour, revision, stops, ct);
        if (state.Current is null) return (old, false);
        var choice = repository is null ? Preview(state) : Settle(repository, state, actor, now);
        return choice.Outcome switch
        {
            NextStopOutcome.AllRemainingLocked => (old, true),
            NextStopOutcome.Chosen => (TourLegTarget.To(state.Stop(choice.WinnerStopId!.Value)), false),
            _ => (old, false)
        };
    }

    /// <summary>
    /// The POI a leg to a POI leads to now: its target, unless the target was locked while the leg was stopped or the
    /// visit's decision moved elsewhere since; then the visit's decision (null when only locked POIs remain).
    /// </summary>
    private static Guid? LegNext(TourVotingState state, Guid target)
    {
        if (state.Current is not { } visit || state.Tour.CurrentLegKind != RobotLegKinds.ToPoi) return target;
        if (!state.Locked.Contains(target) && (visit.ChosenRevisionStopId is null || visit.ChosenRevisionStopId == target)) return target;
        return Preview(state) is { Outcome: NextStopOutcome.Chosen } choice ? choice.WinnerStopId : null;
    }

    /// <summary>
    /// Closes an open ballot when the robot cannot leave by vote any more (restart, End Early). Pause needs nothing: it
    /// exists only on a leg, after Next or the automatic Next already closed the ballot. With
    /// <paramref name="decide"/> the decision is also stored from the votes already cast, so a later Next uses it.
    /// </summary>
    public static async Task CloseOpenBallotAsync(ITourManagementRepository repository, ITourVoteRepository votes,
        IRouteRevisionRepository revisions, Tour tour, bool decide, Guid? actor, DateTimeOffset now, CancellationToken ct)
    {
        if (tour.CurrentStopVisitId is null || tour.RouteRevisionId is not { } revisionId) return;
        var revision = await revisions.FindRevisionAsync(revisionId, ct);
        if (revision is not { ViewerChoosesNextStop: true }) return;
        var state = await LoadAsync(votes, tour, revision, await revisions.GetStopsAsync(revision.Id, ct), ct);
        if (state.Current is not { } visit || visit.BallotClosedAt is not null || !AtVisit(tour, visit)) return;
        if (decide) Settle(repository, state, actor, now);
        else CloseBallot(visit, now);
    }

    public static ConflictException AllLocked() =>
        new("Mọi điểm tham quan còn lại đều đang bị khóa. Mở khóa một điểm hoặc bỏ qua để về điểm kết thúc.",
            TourVoteCodes.AllRemainingLocked);

    /// <summary>The ballot of the POI the robot is at; null when no POI is current.</summary>
    public static TourBallotView? Ballot(TourVotingState state, DateTimeOffset now, Guid? rosterRowId)
    {
        if (state.Current is not { } visit || !AtVisit(state.Tour, visit)) return null;
        var open = IsOpen(state.Tour, visit, now);
        var fresh = NextStopChooser.Choose(state.Options, state.Visited, state.Locked, state.CountedVotes);
        var candidates = fresh.Counts.Select(count =>
        {
            var stop = state.Stop(count.StopId);
            return new TourBallotCandidate(stop.Id, stop.PoiProposalRevisionId, stop.Name, count.Votes);
        }).ToList();
        var myVote = rosterRowId is { } row ? state.Records.Votes.FirstOrDefault(vote => vote.RosterRowId == row)?.RouteRevisionStopId : null;
        var decision = open ? null : Preview(state) is { Outcome: NextStopOutcome.Chosen } chosen
            ? new TourBallotDecision(chosen.WinnerStopId!.Value, state.Stop(chosen.WinnerStopId.Value).Name, chosen.Reason!, chosen.WinnerVotes)
            : null;
        return new(visit.Id, open, visit.BallotClosesAt, candidates, myVote, Locks(state), decision);
    }

    /// <summary>Unvisited locked POIs with the reason every Viewer sees.</summary>
    public static IReadOnlyList<TourBallotLock> Locks(TourVotingState state) => state.Records.ActiveLocks
        .Where(item => !state.Visited.Contains(item.RouteRevisionStopId))
        .Select(item => (Lock: item, Stop: state.Stop(item.RouteRevisionStopId)))
        .OrderBy(pair => pair.Stop.StopOrder)
        .Select(pair => new TourBallotLock(pair.Stop.Id, pair.Stop.Name, pair.Lock.Reason)).ToList();

    /// <summary>The leader of an open ballot, else the decided POI.</summary>
    public static Guid? LeadingStopId(TourVotingState state, DateTimeOffset now) =>
        state.Current is { } visit && AtVisit(state.Tour, visit)
            ? (IsOpen(state.Tour, visit, now)
                ? NextStopChooser.Choose(state.Options, state.Visited, state.Locked, state.CountedVotes)
                : Preview(state)).WinnerStopId
            : null;

    /// <summary>Every stop in StopOrder with its progress, visit order and lock reason.</summary>
    public static IReadOnlyList<TourStopProgressView> StopProgress(TourVotingState state, DateTimeOffset now)
    {
        var order = state.Visits.OrderBy(visit => visit.OccurredAt).ThenBy(visit => state.Stop(visit.RouteRevisionStopId).StopOrder)
            .Select((visit, index) => (visit.RouteRevisionStopId, Order: index + 1)).ToDictionary(pair => pair.RouteRevisionStopId, pair => pair.Order);
        var locks = Locks(state).ToDictionary(item => item.StopId, item => item.Reason);
        return state.Stops.OrderBy(stop => stop.StopOrder).Select(stop => new TourStopProgressView(stop.Id, Progress(state, stop.Id, now),
            order.TryGetValue(stop.Id, out var position) ? position : null, locks.GetValueOrDefault(stop.Id))).ToList();
    }

    /// <summary><c>VISITED</c>, <c>SKIPPED</c>, <c>CURRENT</c>, <c>NEXT</c> or <c>REMAINING</c> for one stop of a voting route.</summary>
    public static string Progress(TourVotingState state, Guid stopId, DateTimeOffset now)
    {
        var tour = state.Tour;
        var visit = state.Visits.FirstOrDefault(item => item.RouteRevisionStopId == stopId);
        if (visit is not null)
            return visit.Outcome == TourStopVisitOutcomes.Skipped ? "SKIPPED" : AtVisit(tour, visit) ? "CURRENT" : "VISITED";
        if (tour.State != TourRuntime.Running) return "REMAINING";
        if (tour.CurrentStep == TourRuntime.Navigating && tour.CurrentRevisionStopId is { } target)
            return LegNext(state, target) == stopId ? "NEXT" : "REMAINING";
        if (state.Current is { } current && AtVisit(tour, current) && !IsOpen(tour, current, now) &&
            Preview(state) is { Outcome: NextStopOutcome.Chosen } choice && choice.WinnerStopId == stopId) return "NEXT";
        return "REMAINING";
    }
}
