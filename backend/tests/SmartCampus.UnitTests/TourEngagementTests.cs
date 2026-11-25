using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.TourEngagement;
using SmartCampus.Application.Features.TourEngagement.Queries;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0071: the engagement report is computed from raw Tour facts with no person in them.</summary>
public sealed class TourEngagementTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 20, 2, 0, 0, TimeSpan.Zero);
    private static readonly Guid Library = Guid.NewGuid(), Lab = Guid.NewGuid(), Hall = Guid.NewGuid();
    private static readonly Guid LibraryPoi = Guid.NewGuid(), LabPoi = Guid.NewGuid(), HallPoi = Guid.NewGuid();
    private static readonly Guid VisitLibrary = Guid.NewGuid(), VisitLab = Guid.NewGuid();
    private static readonly Guid RowA = Guid.NewGuid(), RowB = Guid.NewGuid(), RowC = Guid.NewGuid(), Room = Guid.NewGuid();

    private static readonly EngagementStopData[] Stops =
    [
        new(Library, LibraryPoi, "Thư viện", 1, 120),
        new(Lab, LabPoi, "Phòng Lab", 2, 120),
        new(Hall, HallPoi, "Hội trường", 3, 60),
    ];

    private static EngagementEventData Arrived(Guid visit, Guid stop, int minute) =>
        new("STOP_ARRIVED", Start.AddMinutes(minute), visit, stop, null, null, null, false);

    private static EngagementEventData Closed(Guid visit, int minute) =>
        new("VISIT_CLOSED", Start.AddMinutes(minute), visit, null, null, null, null, false);

    private static EngagementEventData Asked(Guid? visit, int minute, string phase = "TOUR", bool outOfScope = false,
        string rowType = "INDIVIDUAL") =>
        new("STUDENT_QUESTION_ASKED", Start.AddMinutes(minute), visit, null, null, phase, rowType, outOfScope);

    /// <summary>
    /// Library 0'-2' (planned 2'), Lab 5'-10' (planned 2': over), Hall skipped, Tour ends at 15'. Three questions at the Lab,
    /// one at the Library, one in the waiting room. Two viewers leave at the Lab, one leaves and comes back.
    /// </summary>
    private static EngagementTourData Tour(DateTimeOffset? ended = null) => new(Guid.NewGuid(), "Tour sáng", "COMPLETED",
        Start, Start, ended ?? Start.AddMinutes(15), "Tuyến A", Stops,
        [new(RowA, "INDIVIDUAL", true), new(RowB, "INDIVIDUAL", true), new(RowC, "INDIVIDUAL", false), new(Room, "SHARED_VIEWING", true)],
        [
            Asked(null, -5, "WAITING_ROOM"),
            Arrived(VisitLibrary, Library, 0), Asked(VisitLibrary, 1), Closed(VisitLibrary, 2),
            Arrived(VisitLab, Lab, 5), Asked(VisitLab, 6), Asked(VisitLab, 7, outOfScope: true), Asked(VisitLab, 8, rowType: "SHARED_VIEWING"),
            Closed(VisitLab, 10),
            new("STOP_SKIPPED", Start.AddMinutes(11), null, null, 3, null, null, false),
        ],
        [],
        [new(VisitLibrary, RowA, Lab), new(VisitLibrary, RowB, Lab), new(VisitLibrary, Room, Hall), new(VisitLibrary, RowC, null)],
        [
            new(Start.AddMinutes(-10), Start.AddMinutes(6), Start.AddMinutes(6), "LOGOUT"),          // left at the Lab
            new(Start.AddMinutes(-10), Start.AddMinutes(7), Start.AddMinutes(12), "IDLE_TIMEOUT"),   // stopped at the Lab
            new(Start.AddMinutes(-10), Start.AddMinutes(1), Start.AddMinutes(1), "LOGOUT"),          // left the Library ...
            new(Start.AddMinutes(1).AddSeconds(30), Start.AddMinutes(15), null, null),             // ... and came back
            new(Start.AddMinutes(-10), Start.AddMinutes(3), Start.AddMinutes(3), "INVITATION_REVOKED"),
            new(Start.AddMinutes(-10), Start.AddMinutes(15), Start.AddMinutes(15), "LOGOUT"),        // the end of the Tour
        ]);

    [Fact]
    public void Tour_PlacesQuestionsVotesAndDeparturesAtTheirStops()
    {
        var view = TourEngagementCalculator.Build(Tour(), Start.AddHours(1));

        Assert.Equal(new[] { "VISITED", "VISITED", "SKIPPED" }, view.Stops.Select(stop => stop.Outcome));
        var library = view.Stops[0];
        var lab = view.Stops[1];
        Assert.Equal((1, 120, 1, 3, 0, 0), (library.VisitOrder!.Value, library.ActualDwellSeconds!.Value, library.Questions,
            library.BallotVoters, library.VotesReceived, library.ViewersLeft));
        Assert.Equal((2, 300, 3, 0, 2, 2), (lab.VisitOrder!.Value, lab.ActualDwellSeconds!.Value, lab.Questions, lab.BallotVoters,
            lab.VotesReceived, lab.ViewersLeft));
        Assert.Equal(1, view.Stops[2].VotesReceived);
        Assert.Equal(2, view.ViewersLeftDuringTour);

        Assert.Contains(EngagementSignals.MostQuestions, lab.Signals);
        Assert.Contains(EngagementSignals.MostLeft, lab.Signals);
        Assert.Contains(EngagementSignals.MostVoted, lab.Signals);
        Assert.Contains(EngagementSignals.OverDwell, lab.Signals);
        Assert.Empty(library.Signals);
        Assert.Equal(new[] { EngagementSignals.Skipped }, view.Stops[2].Signals);
    }

    [Fact]
    public void Tour_SplitsParticipationByInvitationType_AndQuestionsByPhase()
    {
        var view = TourEngagementCalculator.Build(Tour(), Start.AddHours(1));

        var individual = view.Audience.Single(a => a.RowType == "INDIVIDUAL");
        var shared = view.Audience.Single(a => a.RowType == "SHARED_VIEWING");
        Assert.Equal((3, 2, 2, 4), (individual.AcceptedRows, individual.JoinedRows, individual.VotedRows, individual.Questions));
        Assert.Equal((1, 1, 1, 1), (shared.AcceptedRows, shared.JoinedRows, shared.VotedRows, shared.Questions));
        Assert.Equal(new QuestionTotalsView(5, 1, 4, 4, 1), view.Questions);
    }

    [Fact]
    public void RunningTour_DoesNotCountViewersStillWatching_AndLeavesTheOpenVisitUnmeasured()
    {
        var data = Tour() with
        {
            State = "RUNNING", EndedAt = null,
            Events = [Arrived(VisitLibrary, Library, 0), Asked(VisitLibrary, 1)],
            Sessions = [new(Start.AddMinutes(-10), Start.AddMinutes(4), null, null)],
        };
        var view = TourEngagementCalculator.Build(data, Start.AddMinutes(5));

        Assert.Equal(0, view.ViewersLeftDuringTour);
        Assert.Null(view.Stops[0].ActualDwellSeconds);
        Assert.Equal("NOT_REACHED", view.Stops[1].Outcome);
    }

    [Fact]
    public void VotingTourWithoutArrivalEvents_FallsBackToItsVisitRows()
    {
        var data = Tour() with
        {
            Events = [Closed(VisitLibrary, 3)],
            Visits = [new(VisitLibrary, Library, Start, "ARRIVED"), new(Guid.NewGuid(), Hall, Start.AddMinutes(4), "SKIPPED")],
        };
        var view = TourEngagementCalculator.Build(data, Start.AddHours(1));

        Assert.Equal(180, view.Stops[0].ActualDwellSeconds);
        Assert.Equal("SKIPPED", view.Stops[2].Outcome);
    }

    [Fact]
    public void Overview_AggregatesEachPoiOverItsTours()
    {
        var newer = Tour();
        var older = Tour() with
        {
            Id = Guid.NewGuid(), StartedAt = Start.AddDays(-1),
            Stops = [Stops[0] with { Name = "Thư viện cũ" }, Stops[1], Stops[2]],
            Events = [Arrived(VisitLibrary, Library, 0), Closed(VisitLibrary, 2), Arrived(VisitLab, Lab, 3), Asked(VisitLab, 4), Closed(VisitLab, 5)],
            Votes = [], Sessions = [],
        };
        var view = TourEngagementCalculator.Overview([newer, older], Start.AddDays(-7), Start.AddDays(1), false, Start.AddHours(1));

        Assert.Equal(2, view.TourCount);
        Assert.Equal(0.75, view.JoinRate);
        Assert.Equal(3.0, view.QuestionsPerTour);
        Assert.Equal(new[] { LabPoi, LibraryPoi, HallPoi }, view.Pois.Select(poi => poi.PoiId));
        var lab = view.Pois[0];
        Assert.Equal((2, 2, 4, 2.0, 210), (lab.Tours, lab.Visits, lab.Questions, lab.QuestionsPerVisit, lab.AverageDwellSeconds!.Value));
        Assert.Contains(EngagementSignals.MostQuestions, lab.Signals);
        var library = view.Pois[1];
        Assert.Equal("Thư viện", library.Name); // the newest Tour's name
        var hall = view.Pois[2];
        Assert.Equal((0, 1), (hall.Visits, hall.Skips));
        Assert.Contains(EngagementSignals.Skipped, hall.Signals);
        Assert.Equal(new[] { newer.Id, older.Id }, view.Tours.Select(row => row.TourId));
    }

    [Fact]
    public void Overview_FlagsAPoiNobodyAsksAbout()
    {
        var quiet = Tour() with { Events = [Arrived(VisitLibrary, Library, 0), Closed(VisitLibrary, 2)], Votes = [], Sessions = [] };
        var view = TourEngagementCalculator.Overview([quiet, quiet with { Id = Guid.NewGuid() }], Start.AddDays(-1), Start.AddDays(1), false,
            Start.AddHours(1));
        Assert.Contains(EngagementSignals.NoQuestions, view.Pois.Single(poi => poi.PoiId == LibraryPoi).Signals);
        Assert.Null(TourEngagementCalculator.Overview([], Start, Start.AddDays(1), false, Start).JoinRate);
    }

    [Fact]
    public async Task OverviewHandler_ReadsOneMoreThanItReports_ToSayItIsTruncated()
    {
        var reader = new FakeReader { Tours = Enumerable.Range(0, GetEngagementOverviewQueryHandler.MaxTours + 1).Select(_ => Tour()).ToList() };
        var handler = new GetEngagementOverviewQueryHandler(reader, TimeProvider.System);

        var view = await handler.Handle(new GetEngagementOverviewQuery(Start.AddDays(-1), Start.AddDays(1)), CancellationToken.None);

        Assert.True(view.Truncated);
        Assert.Equal(GetEngagementOverviewQueryHandler.MaxTours, view.TourCount);
        Assert.Equal(GetEngagementOverviewQueryHandler.MaxTours + 1, reader.AskedFor);
    }

    [Fact]
    public async Task TourHandler_UnknownTour_IsNotFound()
    {
        var handler = new GetTourEngagementQueryHandler(new FakeReader(), TimeProvider.System);
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new GetTourEngagementQuery(Guid.NewGuid()), CancellationToken.None));
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(-1, false)]
    [InlineData(366, true)]
    [InlineData(367, false)]
    public void OverviewValidator_NeedsAnOrderedRangeOfAtMostAYear(int days, bool valid)
    {
        var result = new GetEngagementOverviewQueryValidator().Validate(new GetEngagementOverviewQuery(Start, Start.AddDays(days)));
        Assert.Equal(valid, result.IsValid);
    }

    private sealed class FakeReader : ITourEngagementReader
    {
        public List<EngagementTourData> Tours { get; init; } = [];
        public int AskedFor { get; private set; }

        public Task<EngagementTourData?> LoadAsync(Guid tourId, CancellationToken ct) =>
            Task.FromResult(Tours.FirstOrDefault(tour => tour.Id == tourId));

        public Task<IReadOnlyList<EngagementTourData>> ListEndedAsync(DateTimeOffset from, DateTimeOffset to, int max, CancellationToken ct)
        {
            AskedFor = max;
            return Task.FromResult<IReadOnlyList<EngagementTourData>>(Tours.Take(max).ToList());
        }
    }
}
