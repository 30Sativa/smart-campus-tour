namespace SmartCampus.Application.Features.TourEngagement;

/// <summary>Tour event types the engagement report reads or writes (ADR-0071).</summary>
public static class TourEngagementEvents
{
    /// <summary>One answered Student question. DataJson: <c>{"phase","rowType","outOfScope"}</c>; never question text.</summary>
    public const string QuestionAsked = "STUDENT_QUESTION_ASKED";

    public const string PhaseWaitingRoom = "WAITING_ROOM";
    public const string PhaseTour = "TOUR";
}

/// <summary>What the report can say about a stop, translated by the web.</summary>
public static class EngagementSignals
{
    /// <summary>The stop with the most questions (at least two).</summary>
    public const string MostQuestions = "MOST_QUESTIONS";
    /// <summary>The stop where most viewers left (at least two, and at least a fifth of those who joined).</summary>
    public const string MostLeft = "MOST_LEFT";
    /// <summary>The stop viewers voted for most (at least two votes).</summary>
    public const string MostVoted = "MOST_VOTED";
    /// <summary>The robot stayed at least half again its planned dwell and a minute longer.</summary>
    public const string OverDwell = "OVER_DWELL";
    /// <summary>The robot left before half of its planned dwell.</summary>
    public const string ShortDwell = "SHORT_DWELL";
    /// <summary>The Operator skipped the stop (in the overview: in at least half of its Tours).</summary>
    public const string Skipped = "SKIPPED";
    /// <summary>Visited at least twice in the period and never asked about.</summary>
    public const string NoQuestions = "NO_QUESTIONS";
}

public static class EngagementStopOutcomes
{
    public const string Visited = "VISITED";
    public const string Skipped = "SKIPPED";
    public const string NotReached = "NOT_REACHED";
}

/// <summary>
/// Participation of one invitation type: <see cref="AcceptedRows"/> invited, <see cref="JoinedRows"/> opened the Tour at least
/// once, <see cref="VotedRows"/> voted at least once, <see cref="Questions"/> questions from that type.
/// </summary>
public sealed record AudienceSegmentView(string RowType, int AcceptedRows, int JoinedRows, int VotedRows, int Questions);

public sealed record QuestionTotalsView(int Total, int WaitingRoom, int DuringTour, int AtStops, int OutOfScope);

/// <summary>
/// One stop of the Tour in planned order. <see cref="VisitOrder"/> is the order it was reached; <see cref="ActualDwellSeconds"/>
/// runs from arrival to departure. <see cref="BallotVoters"/> voted in the ballot held at this stop, <see cref="VotesReceived"/>
/// chose this stop in any ballot, and <see cref="ViewersLeft"/> left the Tour while the robot was here.
/// </summary>
public sealed record StopEngagementView(Guid StopId, Guid PoiId, string Name, int PlannedOrder, int? VisitOrder, string Outcome,
    DateTimeOffset? ArrivedAt, int? ActualDwellSeconds, int PlannedDwellSeconds, int Questions, int BallotVoters, int VotesReceived,
    int ViewersLeft, IReadOnlyList<string> Signals);

public sealed record TourEngagementView(Guid TourId, string Name, string State, DateTimeOffset ScheduledStartAt,
    DateTimeOffset? StartedAt, DateTimeOffset? EndedAt, string? RouteName, IReadOnlyList<AudienceSegmentView> Audience,
    QuestionTotalsView Questions, int ViewersLeftDuringTour, IReadOnlyList<StopEngagementView> Stops);

/// <summary>One POI over every ended Tour of the period; averages are null when nothing was measured.</summary>
public sealed record PoiEngagementView(Guid PoiId, string Name, int Tours, int Visits, int Skips, int Questions,
    double QuestionsPerVisit, int? AverageDwellSeconds, int? AveragePlannedDwellSeconds, int VotesReceived, int ViewersLeft,
    IReadOnlyList<string> Signals);

public sealed record EngagementTourRowView(Guid TourId, string Name, string State, DateTimeOffset? StartedAt, string? RouteName,
    int AcceptedRows, int JoinedRows, int Questions, int ViewersLeft);

/// <summary>
/// The period report. <see cref="JoinRate"/> is joined rows / accepted rows over every Tour; <see cref="Truncated"/> says the
/// period held more ended Tours than were read.
/// </summary>
public sealed record EngagementOverviewView(DateTimeOffset From, DateTimeOffset To, int TourCount, double? JoinRate,
    double? QuestionsPerTour, IReadOnlyList<AudienceSegmentView> Audience, QuestionTotalsView Questions,
    IReadOnlyList<PoiEngagementView> Pois, IReadOnlyList<EngagementTourRowView> Tours, bool Truncated);
