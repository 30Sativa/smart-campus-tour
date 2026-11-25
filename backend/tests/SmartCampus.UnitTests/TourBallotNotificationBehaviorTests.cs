using SmartCampus.Application.Common.Behaviors;
using SmartCampus.Application.Features.StudentTour;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0065 addendum: a vote reaches the Staff consoles only after it committed, never from a failed request.</summary>
public sealed class TourBallotNotificationBehaviorTests
{
    private readonly RecordingNotifier notifier = new();
    private readonly TourBallotSignalQueue queue = new();

    private static TourBallotSignal Signal(Guid tour, int votes) => new(tour,
        new TourBallotView(Guid.NewGuid(), true, null, [new TourBallotCandidate(Guid.NewGuid(), Guid.NewGuid(), "Thư viện", votes)],
            null, [], null), null, votes, new TourViewerPresence(10, 7), DateTimeOffset.UnixEpoch);

    private static CastStudentVoteCommand Vote() => new(Guid.NewGuid(), "session", Guid.NewGuid(), Guid.NewGuid());

    [Fact]
    public async Task AQueuedBallot_IsToldOnlyAfterTheRequestReturned()
    {
        var behavior = new TourBallotNotificationBehavior<CastStudentVoteCommand, TourBallotView>(queue, notifier);
        var signal = Signal(Guid.NewGuid(), 3);
        var toldInside = -1;
        await behavior.Handle(Vote(), _ =>
        {
            queue.Add(signal);
            toldInside = notifier.Told.Count; // The commit runs inside the pipeline, so nothing is told yet.
            return Task.FromResult(signal.Ballot);
        }, CancellationToken.None);

        Assert.Equal(0, toldInside);
        Assert.Equal(new[] { signal }, notifier.Told);
        Assert.Empty(queue.Drain());
    }

    [Fact]
    public async Task AFailedRequest_DropsWhatItQueued()
    {
        var behavior = new TourBallotNotificationBehavior<CastStudentVoteCommand, TourBallotView>(queue, notifier);
        await Assert.ThrowsAsync<InvalidOperationException>(() => behavior.Handle(Vote(), _ =>
        {
            queue.Add(Signal(Guid.NewGuid(), 1));
            throw new InvalidOperationException();
        }, CancellationToken.None));

        Assert.Empty(notifier.Told);
        Assert.Empty(queue.Drain());
    }

    [Fact]
    public async Task ARequestThatQueuedNothing_TellsNothing()
    {
        var behavior = new TourBallotNotificationBehavior<CastStudentVoteCommand, TourBallotView>(queue, notifier);
        await behavior.Handle(Vote(), _ => Task.FromResult(Signal(Guid.NewGuid(), 0).Ballot), CancellationToken.None);
        Assert.Empty(notifier.Told);
    }

    private sealed class RecordingNotifier : ITourBallotNotifier
    {
        public List<TourBallotSignal> Told { get; } = [];
        public void BallotChanged(TourBallotSignal signal) => Told.Add(signal);
    }
}
