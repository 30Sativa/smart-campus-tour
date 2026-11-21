using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// Visits, ballots, votes and POI locks of a voting Tour (ADR-0065). Rows are tracked so the caller's transaction commits
/// what it changes; writers hold the Tour root lock. Runtime never deletes a vote or a lock.
/// </summary>
public interface ITourVoteRepository
{
    /// <summary>The Tour with its route revision and stops, only when that revision lets Viewers choose the next stop.</summary>
    Task<TourVotingRoute?> FindVotingRouteAsync(Guid tourId, CancellationToken ct);

    /// <summary>Every visit and active lock of the Tour, and the votes of <paramref name="stopVisitId"/>'s ballot.</summary>
    Task<TourVotingRecords> LoadAsync(Guid tourId, Guid? stopVisitId, CancellationToken ct);

    /// <summary>
    /// The roster row of an open, unexpired session of an unrevoked, unexpired invitation on an active ACCEPTED row of an
    /// APPROVED registration of this Tour: the same rules as Q&amp;A. Null when any condition fails.
    /// </summary>
    Task<Guid?> FindVoterRowAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now, CancellationToken ct);

    void Add(TourStopVisit visit);
    void Add(TourStopVote vote);
    void Add(TourStopLock stopLock);
}

public sealed record TourVotingRoute(Tour Tour, RouteRevision Revision, IReadOnlyList<RouteRevisionStop> Stops);

/// <summary><see cref="CountedRowIds"/>: the roster rows among <see cref="Votes"/> still active, accepted and unrevoked.</summary>
public sealed record TourVotingRecords(IReadOnlyList<TourStopVisit> Visits, IReadOnlyList<TourStopLock> ActiveLocks,
    IReadOnlyList<TourStopVote> Votes, IReadOnlySet<Guid> CountedRowIds);
