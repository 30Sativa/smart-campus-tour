namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// Raw facts of one Tour for the Staff engagement report (ADR-0071), read without locks. Nothing here names a person:
/// roster rows appear only as an id with their row type, sessions only as times, and questions only as counted events.
/// </summary>
public sealed record EngagementTourData(Guid Id, string Name, string State, DateTimeOffset ScheduledStartAt,
    DateTimeOffset? StartedAt, DateTimeOffset? EndedAt, string? RouteName,
    IReadOnlyList<EngagementStopData> Stops, IReadOnlyList<EngagementRowData> Rows, IReadOnlyList<EngagementEventData> Events,
    IReadOnlyList<EngagementVisitData> Visits, IReadOnlyList<EngagementVoteData> Votes, IReadOnlyList<EngagementSessionData> Sessions);

/// <summary>A stop of the Tour's route revision; <see cref="PoiId"/> is the POI proposal, stable across revisions.</summary>
public sealed record EngagementStopData(Guid StopId, Guid PoiId, string Name, int StopOrder, int PlannedDwellSeconds);

/// <summary>An active ACCEPTED roster row; <see cref="Joined"/> is true once any browser session was opened for it.</summary>
public sealed record EngagementRowData(Guid RowId, string RowType, bool Joined);

/// <summary>
/// A Tour event the report reads: <c>STOP_ARRIVED</c>, <c>VISIT_CLOSED</c>, <c>STOP_SKIPPED</c> or <c>STUDENT_QUESTION_ASKED</c>.
/// <see cref="StopId"/> comes from the event data (arrival) and <see cref="StopOrder"/> from TargetStopOrder (skip).
/// </summary>
public sealed record EngagementEventData(string Type, DateTimeOffset At, Guid? StopVisitId, Guid? StopId, int? StopOrder,
    string? Phase, string? RowType, bool OutOfScope);

/// <summary>A TourStopVisits row of a voting Tour (ADR-0065); older Tours have these but no STOP_ARRIVED event.</summary>
public sealed record EngagementVisitData(Guid StopVisitId, Guid StopId, DateTimeOffset At, string Outcome);

public sealed record EngagementVoteData(Guid StopVisitId, Guid RowId, Guid? ChosenStopId);

/// <summary>One browser session of the Tour: when it was last seen and how it ended, if it did.</summary>
public sealed record EngagementSessionData(DateTimeOffset CreatedAt, DateTimeOffset? LastSeenAt, DateTimeOffset? EndedAt, string? EndReason);

public interface ITourEngagementReader
{
    /// <summary>Null when the Tour does not exist.</summary>
    Task<EngagementTourData?> LoadAsync(Guid tourId, CancellationToken ct);

    /// <summary>
    /// Tours that started in [<paramref name="from"/>, <paramref name="to"/>) and have ended, newest first, at most
    /// <paramref name="max"/>.
    /// </summary>
    Task<IReadOnlyList<EngagementTourData>> ListEndedAsync(DateTimeOffset from, DateTimeOffset to, int max, CancellationToken ct);
}

/// <summary>
/// Counts one answered Student question (ADR-0071). No question or answer text, session, row or person is stored: only the
/// Tour, the visit the robot was at, the phase, the asking row's type (individual or shared room) and whether the
/// assistant judged it out of scope.
/// </summary>
public interface IStudentQuestionEventRecorder
{
    Task RecordAsync(Guid tourId, string phase, string rowType, bool outOfScope, CancellationToken ct);
}
