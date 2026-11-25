using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.Application.Features.TourEngagement;

/// <summary>
/// Turns the raw facts of <see cref="ITourEngagementReader"/> into the Staff engagement report (ADR-0071). Pure: the same
/// data and time give the same report, so the unit tests cover every rule here.
/// </summary>
public static class TourEngagementCalculator
{
    /// <summary>A viewer who comes back within the reconnect window has not left; the same window ends a heartbeat.</summary>
    public static readonly TimeSpan ReconnectWindow = TimeSpan.FromMinutes(2);

    public static readonly IReadOnlyList<string> RowTypes = ["INDIVIDUAL", "SHARED_VIEWING"];

    private sealed record Visit(Guid Id, Guid StopId, DateTimeOffset ArrivedAt, DateTimeOffset? LeftAt, bool Measured);

    public static TourEngagementView Build(EngagementTourData tour, DateTimeOffset now)
    {
        var visits = Visits(tour);
        var skipped = Skipped(tour);
        var questions = tour.Events.Where(e => e.Type == TourEngagementEvents.QuestionAsked).ToList();
        var left = LeftAt(tour, now);
        var visitOfLeave = left.Select(at => visits.FirstOrDefault(v => at >= v.ArrivedAt && (v.LeftAt is null || at < v.LeftAt))?.Id)
            .Where(id => id is not null).Select(id => id!.Value).ToList();
        var joined = tour.Rows.Count(row => row.Joined);

        var stops = tour.Stops.OrderBy(stop => stop.StopOrder).Select(stop =>
        {
            var visit = visits.FirstOrDefault(v => v.StopId == stop.StopId);
            var visitIndex = visit is null ? -1 : visits.IndexOf(visit);
            int? dwell = visit is { Measured: true, LeftAt: { } leftAt } ? (int)Math.Round((leftAt - visit.ArrivedAt).TotalSeconds) : null;
            return new StopEngagementView(stop.StopId, stop.PoiId, stop.Name, stop.StopOrder,
                visitIndex < 0 ? null : visitIndex + 1,
                visit is not null ? EngagementStopOutcomes.Visited : skipped.Contains(stop.StopId) ? EngagementStopOutcomes.Skipped
                    : EngagementStopOutcomes.NotReached,
                visit?.ArrivedAt, dwell, stop.PlannedDwellSeconds,
                visit is null ? 0 : questions.Count(q => q.StopVisitId == visit.Id),
                visit is null ? 0 : tour.Votes.Where(v => v.StopVisitId == visit.Id && v.ChosenStopId is not null).Select(v => v.RowId).Distinct().Count(),
                tour.Votes.Count(v => v.ChosenStopId == stop.StopId),
                visit is null ? 0 : visitOfLeave.Count(id => id == visit.Id), []);
        }).ToList();

        stops = WithSignals(stops, joined);
        return new TourEngagementView(tour.Id, tour.Name, tour.State, tour.ScheduledStartAt, tour.StartedAt, tour.EndedAt, tour.RouteName,
            Audience([tour]), Totals(questions), left.Count, stops);
    }

    public static EngagementOverviewView Overview(IReadOnlyList<EngagementTourData> tours, DateTimeOffset from, DateTimeOffset to,
        bool truncated, DateTimeOffset now)
    {
        var built = tours.Select(tour => Build(tour, now)).ToList();
        var accepted = tours.Sum(tour => tour.Rows.Count);
        var joined = tours.Sum(tour => tour.Rows.Count(row => row.Joined));
        var questions = tours.SelectMany(tour => tour.Events).Where(e => e.Type == TourEngagementEvents.QuestionAsked).ToList();

        var pois = built.SelectMany(view => view.Stops.Select(stop => (view.TourId, Stop: stop)))
            .GroupBy(item => item.Stop.PoiId)
            .Select(group =>
            {
                var items = group.Select(item => item.Stop).ToList();
                var visits = items.Count(stop => stop.Outcome == EngagementStopOutcomes.Visited);
                var dwells = items.Where(stop => stop.ActualDwellSeconds is not null).Select(stop => stop.ActualDwellSeconds!.Value).ToList();
                var asked = items.Sum(stop => stop.Questions);
                return new PoiEngagementView(group.Key,
                    // The name of the newest Tour's revision: the list is newest first.
                    items[0].Name,
                    group.Select(item => item.TourId).Distinct().Count(), visits,
                    items.Count(stop => stop.Outcome == EngagementStopOutcomes.Skipped), asked,
                    visits == 0 ? 0 : Math.Round((double)asked / visits, 2),
                    dwells.Count == 0 ? null : (int)Math.Round(dwells.Average()),
                    (int)Math.Round(items.Average(stop => stop.PlannedDwellSeconds)),
                    items.Sum(stop => stop.VotesReceived), items.Sum(stop => stop.ViewersLeft), []);
            }).ToList();
        pois = WithSignals(pois)
            .OrderByDescending(poi => poi.QuestionsPerVisit).ThenByDescending(poi => poi.Visits).ThenBy(poi => poi.Name, StringComparer.Ordinal)
            .ToList();

        var rows = built.Select(view => new EngagementTourRowView(view.TourId, view.Name, view.State, view.StartedAt, view.RouteName,
            view.Audience.Sum(a => a.AcceptedRows), view.Audience.Sum(a => a.JoinedRows), view.Questions.Total, view.ViewersLeftDuringTour)).ToList();
        return new EngagementOverviewView(from, to, tours.Count, accepted == 0 ? null : Math.Round((double)joined / accepted, 3),
            tours.Count == 0 ? null : Math.Round((double)questions.Count / tours.Count, 2), Audience(tours), Totals(questions), pois, rows,
            truncated);
    }

    /// <summary>
    /// Reached stops in arrival order. STOP_ARRIVED events come first; a voting Tour recorded before them still has its
    /// TourStopVisits rows. A visit ends at VISIT_CLOSED, else at the next arrival or the end of the Tour.
    /// </summary>
    private static List<Visit> Visits(EngagementTourData tour)
    {
        var arrivals = tour.Events.Where(e => e.Type == TourLifecycleEvents.StopArrived && e.StopVisitId is not null && e.StopId is not null)
            .Select(e => (Id: e.StopVisitId!.Value, StopId: e.StopId!.Value, e.At)).ToList();
        arrivals.AddRange(tour.Visits
            .Where(v => v.Outcome == TourStopVisitOutcomes.Arrived && arrivals.All(a => a.Id != v.StopVisitId))
            .Select(v => (Id: v.StopVisitId, v.StopId, v.At)));
        // One visit per stop: the first arrival counts (ADR-0065 gives each POI one visit).
        arrivals = arrivals.OrderBy(a => a.At).GroupBy(a => a.StopId).Select(g => g.First()).OrderBy(a => a.At).ToList();
        var closes = tour.Events.Where(e => e.Type == TourLifecycleEvents.VisitClosed && e.StopVisitId is not null)
            .GroupBy(e => e.StopVisitId!.Value).ToDictionary(g => g.Key, g => g.Min(e => e.At));
        return arrivals.Select((a, i) =>
        {
            if (closes.TryGetValue(a.Id, out var closed)) return new Visit(a.Id, a.StopId, a.At, closed, true);
            DateTimeOffset? next = i + 1 < arrivals.Count ? arrivals[i + 1].At : tour.EndedAt;
            return new Visit(a.Id, a.StopId, a.At, next, next is not null);
        }).ToList();
    }

    private static HashSet<Guid> Skipped(EngagementTourData tour)
    {
        var byOrder = tour.Stops.ToDictionary(stop => stop.StopOrder, stop => stop.StopId);
        var skipped = tour.Events.Where(e => e.Type == TourLifecycleEvents.StopSkipped && e.StopOrder is not null && byOrder.ContainsKey(e.StopOrder.Value))
            .Select(e => byOrder[e.StopOrder!.Value]).ToHashSet();
        skipped.UnionWith(tour.Visits.Where(v => v.Outcome == TourStopVisitOutcomes.Skipped).Select(v => v.StopId));
        return skipped;
    }

    /// <summary>
    /// When each viewer left the running Tour: a LOGOUT ends at its close, a session that stopped its heartbeat at its last
    /// sign of life. A revoked invitation is not a choice to leave. Leaving after the end, before the start, or coming back
    /// within <see cref="ReconnectWindow"/> is not counted; neither is a session still alive now.
    /// </summary>
    private static List<DateTimeOffset> LeftAt(EngagementTourData tour, DateTimeOffset now)
    {
        if (tour.StartedAt is not { } started) return [];
        var stillOpenAfter = tour.EndedAt is { } ended ? ended - ReconnectWindow : now - ReconnectWindow;
        var result = new List<DateTimeOffset>();
        foreach (var session in tour.Sessions)
        {
            DateTimeOffset? at = session.EndReason switch
            {
                "LOGOUT" => session.EndedAt,
                "INVITATION_REVOKED" => null,
                _ => session.LastSeenAt ?? session.CreatedAt,
            };
            if (at is not { } leftAt || leftAt < started || leftAt >= stillOpenAfter) continue;
            if (tour.Sessions.Any(other => other.CreatedAt > leftAt && other.CreatedAt <= leftAt + ReconnectWindow)) continue;
            result.Add(leftAt);
        }
        return result;
    }

    private static List<AudienceSegmentView> Audience(IReadOnlyList<EngagementTourData> tours)
    {
        var rows = tours.SelectMany(tour => tour.Rows).ToList();
        var voters = tours.SelectMany(tour => tour.Votes.Where(v => v.ChosenStopId is not null).Select(v => v.RowId)).ToHashSet();
        var questions = tours.SelectMany(tour => tour.Events).Where(e => e.Type == TourEngagementEvents.QuestionAsked).ToList();
        return RowTypes.Concat(rows.Select(row => row.RowType)).Distinct()
            .Select(type => new AudienceSegmentView(type,
                rows.Count(row => row.RowType == type), rows.Count(row => row.RowType == type && row.Joined),
                rows.Count(row => row.RowType == type && voters.Contains(row.RowId)),
                questions.Count(q => q.RowType == type)))
            .ToList();
    }

    private static QuestionTotalsView Totals(IReadOnlyList<EngagementEventData> questions) => new(questions.Count,
        questions.Count(q => q.Phase == TourEngagementEvents.PhaseWaitingRoom),
        questions.Count(q => q.Phase != TourEngagementEvents.PhaseWaitingRoom),
        questions.Count(q => q.StopVisitId is not null), questions.Count(q => q.OutOfScope));

    private static bool OverDwell(int? actual, int? planned) => actual is { } a && planned is { } p && a >= p * 1.5 && a >= p + 60;
    private static bool ShortDwell(int? actual, int? planned) => actual is { } a && planned is { } p && p > 0 && a < p * 0.5;

    private static List<StopEngagementView> WithSignals(List<StopEngagementView> stops, int joined)
    {
        var mostQuestions = stops.Max(stop => (int?)stop.Questions) ?? 0;
        var mostLeft = stops.Max(stop => (int?)stop.ViewersLeft) ?? 0;
        var mostVoted = stops.Max(stop => (int?)stop.VotesReceived) ?? 0;
        return stops.Select(stop =>
        {
            var signals = new List<string>();
            if (mostQuestions >= 2 && stop.Questions == mostQuestions) signals.Add(EngagementSignals.MostQuestions);
            if (mostLeft >= 2 && stop.ViewersLeft == mostLeft && stop.ViewersLeft * 5 >= joined) signals.Add(EngagementSignals.MostLeft);
            if (mostVoted >= 2 && stop.VotesReceived == mostVoted) signals.Add(EngagementSignals.MostVoted);
            if (OverDwell(stop.ActualDwellSeconds, stop.PlannedDwellSeconds)) signals.Add(EngagementSignals.OverDwell);
            if (ShortDwell(stop.ActualDwellSeconds, stop.PlannedDwellSeconds)) signals.Add(EngagementSignals.ShortDwell);
            if (stop.Outcome == EngagementStopOutcomes.Skipped) signals.Add(EngagementSignals.Skipped);
            return stop with { Signals = signals };
        }).ToList();
    }

    private static List<PoiEngagementView> WithSignals(List<PoiEngagementView> pois)
    {
        var asked = pois.Where(poi => poi.Questions >= 2).ToList();
        var mostPerVisit = asked.Count == 0 ? -1 : asked.Max(poi => poi.QuestionsPerVisit);
        var mostLeft = pois.Max(poi => (int?)poi.ViewersLeft) ?? 0;
        var mostVoted = pois.Max(poi => (int?)poi.VotesReceived) ?? 0;
        return pois.Select(poi =>
        {
            var signals = new List<string>();
            if (poi.Questions >= 2 && poi.QuestionsPerVisit == mostPerVisit) signals.Add(EngagementSignals.MostQuestions);
            if (mostLeft >= 2 && poi.ViewersLeft == mostLeft) signals.Add(EngagementSignals.MostLeft);
            if (mostVoted >= 2 && poi.VotesReceived == mostVoted) signals.Add(EngagementSignals.MostVoted);
            if (OverDwell(poi.AverageDwellSeconds, poi.AveragePlannedDwellSeconds)) signals.Add(EngagementSignals.OverDwell);
            if (ShortDwell(poi.AverageDwellSeconds, poi.AveragePlannedDwellSeconds)) signals.Add(EngagementSignals.ShortDwell);
            if (poi.Skips > 0 && poi.Skips * 2 >= poi.Tours) signals.Add(EngagementSignals.Skipped);
            if (poi.Visits >= 2 && poi.Questions == 0) signals.Add(EngagementSignals.NoQuestions);
            return poi with { Signals = signals };
        }).ToList();
    }
}
