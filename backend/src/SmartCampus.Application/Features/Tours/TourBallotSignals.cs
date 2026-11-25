namespace SmartCampus.Application.Features.Tours;

/// <summary>
/// A ballot as Staff see it right after a vote committed: the counts without anyone's own vote, the leader by the
/// decision rule (ADR-0065 rule 6), how many votes were cast and how many Viewers are in the room. Pushed to the Staff
/// consoles on <c>/hubs/operations</c> as <c>BallotUpdated</c> so the vote panel moves at once instead of at the next
/// poll. A hint like <c>TourUpdated</c>: may be coalesced or lost; the Tour API stays the source of truth.
/// </summary>
public sealed record TourBallotSignal(Guid TourId, TourBallotView Ballot, Guid? LeadingStopId, int VotesCast,
    TourViewerPresence? Viewers, DateTimeOffset At);

/// <summary>Told after a ballot change has committed.</summary>
public interface ITourBallotNotifier
{
    void BallotChanged(TourBallotSignal signal);
}

/// <summary>The default when no realtime channel is hosted (tests, tools): nothing is told, screens keep polling.</summary>
public sealed class NoTourBallotNotifier : ITourBallotNotifier
{
    public void BallotChanged(TourBallotSignal signal) { }
}

/// <summary>
/// Per request: a handler queues the ballot it changed, and <see cref="SmartCampus.Application.Common.Behaviors.TourBallotNotificationBehavior{TRequest, TResponse}"/>
/// hands it on only once the whole request, its commit included, has succeeded. A failed request tells nothing.
/// </summary>
public sealed class TourBallotSignalQueue
{
    private readonly List<TourBallotSignal> pending = [];

    public void Add(TourBallotSignal signal) => pending.Add(signal);

    public IReadOnlyList<TourBallotSignal> Drain()
    {
        var items = pending.ToArray();
        pending.Clear();
        return items;
    }

    public void Clear() => pending.Clear();
}
