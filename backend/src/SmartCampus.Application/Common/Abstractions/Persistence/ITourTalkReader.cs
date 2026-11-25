namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>The Tour facts the Staff side of Tour talk checks (ADR-0070), read without locks.</summary>
public sealed record TourTalkTour(Guid TourId, string State, DateTimeOffset ScheduledStartAt, Guid? OperatorUserId, string? OperatorName);

/// <summary>
/// The invited row behind a Student session, for Tour talk (ADR-0070): an open, unexpired session of an unrevoked,
/// unexpired invitation on an active ACCEPTED row of this Tour, the same rules as Q&amp;A.
/// </summary>
public sealed record TourTalkViewer(Guid RosterRowId, string DisplayName, string? ClassName, string RowType, string TourState,
    DateTimeOffset ScheduledStartAt);

public interface ITourTalkReader
{
    Task<TourTalkTour?> GetTourAsync(Guid tourId, CancellationToken ct);

    /// <summary>Null when the session does not admit the browser to this Tour.</summary>
    Task<TourTalkViewer?> FindViewerAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now, CancellationToken ct);
}
