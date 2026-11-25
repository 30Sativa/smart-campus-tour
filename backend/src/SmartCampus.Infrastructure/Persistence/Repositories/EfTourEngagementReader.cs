using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.TourEngagement;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>
/// Unlocked reads behind the Staff engagement report (ADR-0071). Every query is batched over the Tour ids, and nothing
/// that names a person (display name, email, class, token) is selected.
/// </summary>
public sealed class EfTourEngagementReader(ApplicationDbContext db) : ITourEngagementReader
{
    private static readonly string[] EventTypes =
    [
        TourLifecycleEvents.StopArrived, TourLifecycleEvents.VisitClosed, TourLifecycleEvents.StopSkipped, TourEngagementEvents.QuestionAsked
    ];

    public async Task<EngagementTourData?> LoadAsync(Guid tourId, CancellationToken ct) =>
        (await LoadManyAsync(db.Tours.AsNoTracking().Where(tour => tour.Id == tourId), ct)).SingleOrDefault();

    public async Task<IReadOnlyList<EngagementTourData>> ListEndedAsync(DateTimeOffset from, DateTimeOffset to, int max, CancellationToken ct) =>
        await LoadManyAsync(db.Tours.AsNoTracking()
            .Where(tour => tour.StartedAt != null && tour.StartedAt >= from && tour.StartedAt < to && tour.EndedAt != null)
            .OrderByDescending(tour => tour.StartedAt).ThenBy(tour => tour.Id)
            .Take(max), ct);

    private sealed record TourRow(Guid Id, string Name, string State, DateTimeOffset ScheduledStartAt, DateTimeOffset? StartedAt,
        DateTimeOffset? EndedAt, Guid? RouteRevisionId, string? RouteName);

    private async Task<IReadOnlyList<EngagementTourData>> LoadManyAsync(IQueryable<Tour> selected, CancellationToken ct)
    {
        var tours = await selected
            .Select(tour => new TourRow(tour.Id, tour.Name, tour.State, tour.ScheduledStartAt, tour.StartedAt, tour.EndedAt,
                tour.RouteRevisionId, tour.RouteRevision != null ? tour.RouteRevision.Name : tour.Route.Name))
            .ToListAsync(ct);
        if (tours.Count == 0) return [];
        var ids = tours.Select(tour => tour.Id).ToArray();
        var revisionIds = tours.Where(tour => tour.RouteRevisionId != null).Select(tour => tour.RouteRevisionId!.Value).Distinct().ToArray();

        var stops = (await db.RouteRevisionStops.AsNoTracking()
                .Where(stop => revisionIds.Contains(stop.RouteRevisionId))
                .Select(stop => new { stop.RouteRevisionId, Data = new EngagementStopData(stop.Id, stop.PoiProposalRevision.ProposalId, stop.Name,
                    stop.StopOrder, stop.DwellSeconds) })
                .ToListAsync(ct))
            .ToLookup(item => item.RouteRevisionId, item => item.Data);
        var rows = (await db.RosterRows.AsNoTracking()
                .Where(row => ids.Contains(row.Registration.TourId) && row.IsActive && row.ParticipationState == "ACCEPTED")
                .Select(row => new
                {
                    row.Registration.TourId,
                    Data = new EngagementRowData(row.Id, row.RowType,
                        db.BrowserSessions.Any(session => session.Invitation.RosterRowId == row.Id))
                })
                .ToListAsync(ct))
            .ToLookup(item => item.TourId, item => item.Data);
        var events = (await db.TourEvents.AsNoTracking()
                .Where(e => ids.Contains(e.TourId) && EventTypes.Contains(e.EventType))
                .OrderBy(e => e.Id)
                .Select(e => new { e.TourId, e.EventType, e.OccurredAt, e.StopVisitId, e.TargetStopOrder, e.DataJson })
                .ToListAsync(ct))
            .ToLookup(e => e.TourId, e => ToEvent(e.EventType, e.OccurredAt, e.StopVisitId, e.TargetStopOrder, e.DataJson));
        var visits = (await db.TourStopVisits.AsNoTracking()
                .Where(visit => ids.Contains(visit.TourId))
                .Select(visit => new { visit.TourId, Data = new EngagementVisitData(visit.Id, visit.RouteRevisionStopId, visit.OccurredAt, visit.Outcome) })
                .ToListAsync(ct))
            .ToLookup(item => item.TourId, item => item.Data);
        var votes = (await db.TourStopVotes.AsNoTracking()
                .Where(vote => ids.Contains(vote.TourId))
                .Select(vote => new { vote.TourId, Data = new EngagementVoteData(vote.StopVisitId, vote.RosterRowId, vote.RouteRevisionStopId) })
                .ToListAsync(ct))
            .ToLookup(item => item.TourId, item => item.Data);
        var sessions = (await db.BrowserSessions.AsNoTracking()
                .Where(session => ids.Contains(session.Invitation.RosterRow.Registration.TourId))
                .Select(session => new
                {
                    session.Invitation.RosterRow.Registration.TourId,
                    Data = new EngagementSessionData(session.CreatedAt, session.LastSeenAt, session.EndedAt, session.EndReason)
                })
                .ToListAsync(ct))
            .ToLookup(item => item.TourId, item => item.Data);

        return tours.Select(tour => new EngagementTourData(tour.Id, tour.Name, tour.State, tour.ScheduledStartAt, tour.StartedAt,
            tour.EndedAt, tour.RouteName,
            tour.RouteRevisionId is { } revision ? stops[revision].ToList() : [],
            rows[tour.Id].ToList(), events[tour.Id].ToList(), visits[tour.Id].ToList(), votes[tour.Id].ToList(),
            sessions[tour.Id].ToList())).ToList();
    }

    /// <summary>Reads only the known keys of the event data; a malformed or older payload leaves them null.</summary>
    internal static EngagementEventData ToEvent(string type, DateTimeOffset at, Guid? stopVisitId, int? stopOrder, string? dataJson)
    {
        Guid? stopId = null;
        string? phase = null, rowType = null;
        var outOfScope = false;
        if (!string.IsNullOrWhiteSpace(dataJson))
        {
            try
            {
                using var json = JsonDocument.Parse(dataJson);
                var root = json.RootElement;
                if (root.ValueKind == JsonValueKind.Object)
                {
                    if (root.TryGetProperty("stopId", out var stop) && stop.ValueKind == JsonValueKind.String && stop.TryGetGuid(out var parsed))
                        stopId = parsed;
                    if (root.TryGetProperty("phase", out var p) && p.ValueKind == JsonValueKind.String) phase = p.GetString();
                    if (root.TryGetProperty("rowType", out var r) && r.ValueKind == JsonValueKind.String) rowType = r.GetString();
                    if (root.TryGetProperty("outOfScope", out var o) && o.ValueKind == JsonValueKind.True) outOfScope = true;
                }
            }
            catch (JsonException)
            {
                // An event written by another feature with other data: the report uses its columns only.
            }
        }
        return new EngagementEventData(type, at, stopVisitId, stopId, stopOrder, phase, rowType, outOfScope);
    }
}

/// <summary>
/// ADR-0071: appends one STUDENT_QUESTION_ASKED Tour event. The Q&amp;A request is read-only and has no UnitOfWork, so this
/// writer saves its single insert itself; the context has no other pending change on that path. The visit is the one the
/// robot is at, read from the Tour's progress columns, or none while it is not observing a POI.
/// </summary>
public sealed class EfStudentQuestionEventRecorder(ApplicationDbContext db, TimeProvider clock) : IStudentQuestionEventRecorder
{
    public async Task RecordAsync(Guid tourId, string phase, string rowType, bool outOfScope, CancellationToken ct)
    {
        var tour = await db.Tours.AsNoTracking().Where(t => t.Id == tourId)
            .Select(t => new { t.State, t.CurrentStep, t.CurrentStopVisitId, t.StopVisitClosedAt, t.ActiveRouteId })
            .SingleOrDefaultAsync(ct);
        if (tour is null) return;
        var atPoi = tour.State == TourRuntime.Running && tour.CurrentStep == TourRuntime.Observing && tour.StopVisitClosedAt is null;
        db.TourEvents.Add(new TourEvent
        {
            TourId = tourId, EventType = TourEngagementEvents.QuestionAsked, OccurredAt = clock.GetUtcNow(),
            StopVisitId = atPoi ? tour.CurrentStopVisitId : null,
            DataJson = JsonSerializer.Serialize(new { phase, rowType, outOfScope })
        });
        await db.SaveChangesAsync(ct);
    }
}
