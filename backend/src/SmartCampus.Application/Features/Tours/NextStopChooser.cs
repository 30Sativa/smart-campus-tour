namespace SmartCampus.Application.Features.Tours;

/// <summary>Why a POI was chosen as the next stop of a voting route (ADR-0065 rule 6).</summary>
public static class NextStopReasons
{
    public const string Vote = "VOTE";
    public const string TieDefault = "TIE_DEFAULT";
    public const string NoVotes = "NO_VOTES";
    public const string LockedFallback = "LOCKED_FALLBACK";
    public const string SingleCandidate = "SINGLE_CANDIDATE";
}

public enum NextStopOutcome
{
    /// <summary><see cref="NextStopChoice.WinnerStopId"/> is the next POI.</summary>
    Chosen,
    /// <summary>POIs remain but every one is locked: the robot waits (ADR-0065 rule 8).</summary>
    AllRemainingLocked,
    /// <summary>Every POI was visited or skipped: the next target is the end.</summary>
    End
}

/// <summary>A route stop as the chooser sees it.</summary>
public sealed record NextStopOption(Guid StopId, int StopOrder);

/// <summary>Votes for one candidate.</summary>
public sealed record NextStopCount(Guid StopId, int Votes);

/// <summary><see cref="Counts"/> lists every candidate in StopOrder, with zero for those nobody voted for.</summary>
public sealed record NextStopChoice(NextStopOutcome Outcome, Guid? WinnerStopId, string? Reason, int WinnerVotes,
    IReadOnlyList<NextStopCount> Counts);

/// <summary>
/// The fixed server rules of ADR-0065 (rules 2, 3, 6 and 8), with no I/O. Candidates are the stops neither visited
/// (arrived or skipped) nor locked. One candidate wins outright; otherwise the most votes win, and a tie, including no
/// votes at all, goes to the smallest StopOrder among the tied. A vote for anything that is not a candidate is ignored.
/// </summary>
public static class NextStopChooser
{
    /// <param name="votes">One entry per counted vote: the stop that roster row chose.</param>
    /// <param name="lockedFallback">The POI decided earlier was locked before the robot left; the reason says so.</param>
    public static NextStopChoice Choose(IReadOnlyList<NextStopOption> stops, IReadOnlySet<Guid> visited, IReadOnlySet<Guid> locked,
        IEnumerable<Guid> votes, bool lockedFallback = false)
    {
        var remaining = stops.Where(stop => !visited.Contains(stop.StopId)).OrderBy(stop => stop.StopOrder).ToList();
        if (remaining.Count == 0) return new(NextStopOutcome.End, null, null, 0, []);
        var candidates = remaining.Where(stop => !locked.Contains(stop.StopId)).ToList();
        if (candidates.Count == 0) return new(NextStopOutcome.AllRemainingLocked, null, null, 0, []);

        var tally = votes.GroupBy(stop => stop).ToDictionary(group => group.Key, group => group.Count());
        var counts = candidates.Select(stop => new NextStopCount(stop.StopId, tally.GetValueOrDefault(stop.StopId))).ToList();
        var most = counts.Max(count => count.Votes);
        // Candidates are in StopOrder, so the first with the most votes is the tie default.
        var winner = counts.First(count => count.Votes == most);
        var reason = lockedFallback ? NextStopReasons.LockedFallback
            : candidates.Count == 1 ? NextStopReasons.SingleCandidate
            : most == 0 ? NextStopReasons.NoVotes
            : counts.Count(count => count.Votes == most) > 1 ? NextStopReasons.TieDefault
            : NextStopReasons.Vote;
        return new(NextStopOutcome.Chosen, winner.StopId, reason, winner.Votes, counts);
    }

    /// <summary>The POIs a voting Tour may still go to; at least two open a ballot at arrival (rule 3).</summary>
    public static int CandidateCount(IReadOnlyList<NextStopOption> stops, IReadOnlySet<Guid> visited, IReadOnlySet<Guid> locked) =>
        stops.Count(stop => !visited.Contains(stop.StopId) && !locked.Contains(stop.StopId));
}
