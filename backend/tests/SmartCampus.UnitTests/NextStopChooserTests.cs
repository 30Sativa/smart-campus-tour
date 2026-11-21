using SmartCampus.Application.Features.Tours;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0065 rules 2, 3, 6 and 8: the pure choice of the next POI on a voting route.</summary>
public sealed class NextStopChooserTests
{
    private static readonly Guid First = Guid.NewGuid();
    private static readonly Guid Library = Guid.NewGuid();
    private static readonly Guid Lab = Guid.NewGuid();
    private static readonly Guid Hall = Guid.NewGuid();
    private static readonly NextStopOption[] Stops = [new(First, 1), new(Library, 2), new(Lab, 3), new(Hall, 4)];

    private static NextStopChoice Choose(Guid[] votes, Guid[]? locked = null, Guid[]? visited = null, bool lockedFallback = false) =>
        NextStopChooser.Choose(Stops, (visited ?? [First]).ToHashSet(), (locked ?? []).ToHashSet(), votes, lockedFallback);

    [Fact]
    public void MostVotes_Wins_WithCountsForEveryCandidateInStopOrder()
    {
        var choice = Choose([Lab, Lab, Library, Hall, Lab]);

        Assert.Equal((NextStopOutcome.Chosen, (Guid?)Lab, NextStopReasons.Vote, 3), (choice.Outcome, choice.WinnerStopId, choice.Reason, choice.WinnerVotes));
        Assert.Equal([new(Library, 1), new(Lab, 3), new(Hall, 1)], choice.Counts);
    }

    [Fact]
    public void Tie_GoesToTheSmallestStopOrderAmongTheTied()
    {
        var choice = Choose([Hall, Lab, Hall, Lab, Library]);

        Assert.Equal(((Guid?)Lab, NextStopReasons.TieDefault, 2), (choice.WinnerStopId, choice.Reason, choice.WinnerVotes));
    }

    [Fact]
    public void NoVotes_GoesToTheSmallestStopOrder()
    {
        var choice = Choose([]);

        Assert.Equal(((Guid?)Library, NextStopReasons.NoVotes, 0), (choice.WinnerStopId, choice.Reason, choice.WinnerVotes));
        Assert.All(choice.Counts, count => Assert.Equal(0, count.Votes));
    }

    [Fact]
    public void LockedWinner_IsNoCandidate_ItsVotesAreIgnored_AndTheFallbackSaysSo()
    {
        var choice = Choose([Lab, Lab, Lab, Hall], locked: [Lab], lockedFallback: true);

        Assert.Equal(((Guid?)Hall, NextStopReasons.LockedFallback, 1), (choice.WinnerStopId, choice.Reason, choice.WinnerVotes));
        Assert.DoesNotContain(choice.Counts, count => count.StopId == Lab);
        // Without the fallback flag the same rules decide by vote.
        Assert.Equal(NextStopReasons.Vote, Choose([Lab, Hall], locked: [Lab]).Reason);
    }

    [Fact]
    public void OnlyLockedPoisLeft_IsADistinctResult_NotTheEnd()
    {
        var choice = Choose([Lab], locked: [Lab, Hall], visited: [First, Library]);

        Assert.Equal((NextStopOutcome.AllRemainingLocked, (Guid?)null), (choice.Outcome, choice.WinnerStopId));
        Assert.Empty(choice.Counts);
    }

    [Fact]
    public void SingleCandidate_WinsWithoutABallot()
    {
        var choice = Choose([], locked: [Hall], visited: [First, Library]);

        Assert.Equal(((Guid?)Lab, NextStopReasons.SingleCandidate), (choice.WinnerStopId, choice.Reason));
        Assert.Equal(1, NextStopChooser.CandidateCount(Stops, new HashSet<Guid> { First, Library }, new HashSet<Guid> { Hall }));
    }

    [Fact]
    public void EveryPoiVisitedOrSkipped_GoesToTheEnd()
    {
        var choice = Choose([Lab], visited: [First, Library, Lab, Hall]);

        Assert.Equal((NextStopOutcome.End, (Guid?)null), (choice.Outcome, choice.WinnerStopId));
    }

    [Fact]
    public void VisitedPois_AreNeverChosen_EvenWithVotes()
    {
        var choice = Choose([Library, Library, Hall], visited: [First, Library]);

        Assert.Equal(((Guid?)Hall, NextStopReasons.Vote), (choice.WinnerStopId, choice.Reason));
    }
}
