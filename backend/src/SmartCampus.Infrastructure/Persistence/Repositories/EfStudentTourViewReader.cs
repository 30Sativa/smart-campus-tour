using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfStudentTourViewReader(ApplicationDbContext context) : IStudentTourViewReader
{
    public async Task<StudentTourViewData?> LoadAsync(Guid tourId, CancellationToken ct)
    {
        var tour = await context.Tours.AsNoTracking()
            .Where(t => t.Id == tourId)
            .Select(t => new
            {
                t.State,
                t.CurrentStep,
                t.OperationalStatus,
                t.IsHeld,
                t.ActiveRouteId,
                t.RouteRevisionId,
                // A versioned Tour (ADR-0043 D9) moves through the RevisionStop columns and lists its stops by
                // PoiProposalRevisionId, so its position must be reported in the same ids.
                CurrentPoiId = t.CurrentRevisionStopId != null ? (Guid?)t.CurrentRevisionStop!.PoiProposalRevisionId
                    : t.CurrentRouteStopId != null ? t.CurrentRouteStop!.PoiId : null,
                LastArrivedPoiId = t.LastArrivedRevisionStopId != null ? (Guid?)t.LastArrivedRevisionStop!.PoiProposalRevisionId
                    : t.LastArrivedRouteStopId != null ? t.LastArrivedRouteStop!.PoiId : null,
            })
            .SingleOrDefaultAsync(ct);
        if (tour is null) return null;

        var stops = tour.RouteRevisionId is { } revisionId
            ? await context.RouteRevisionStops.AsNoTracking()
                .Where(s => s.RouteRevisionId == revisionId)
                .OrderBy(s => s.StopOrder)
                .Select(s => new StudentTourStopData(s.StopOrder, s.PoiProposalRevisionId, s.Name, null, s.NarrationText,
                    null, null, s.DwellSeconds))
                .ToListAsync(ct)
            : await context.RouteStops.AsNoTracking()
                .Where(s => s.RouteId == tour.ActiveRouteId)
                .OrderBy(s => s.StopOrder)
                .Select(s => new StudentTourStopData(s.StopOrder, s.PoiId, s.Poi.Name, s.Poi.Description, s.Poi.NarrationText,
                    s.Poi.AudioUrl, s.Poi.NarrationSeconds, s.DwellSeconds))
                .ToListAsync(ct);
        var video = await TourVideoModeReads.Switches(context, tourId).AsNoTracking().OrderByDescending(e => e.Id)
            .Select(e => new { e.EventType, e.OccurredAt }).FirstOrDefaultAsync(ct);
        return new StudentTourViewData(tour.State, tour.CurrentStep, tour.OperationalStatus, tour.IsHeld,
            tour.CurrentPoiId, tour.LastArrivedPoiId, stops, video?.EventType, video?.OccurredAt);
    }

    /// <summary>
    /// The POI the robot stands at, or null while it drives or before the first arrival. A versioned Tour
    /// (ADR-0043 D9) reports the stop it last arrived at with the id used by the Student view
    /// (PoiProposalRevisionId); a legacy Tour reads its RouteStop.
    /// </summary>
    public async Task<AssistantPoi?> FindCurrentPoiAsync(Guid tourId, CancellationToken ct)
    {
        var tour = context.Tours.AsNoTracking()
            .Where(t => t.Id == tourId && t.State == "RUNNING"
                && (t.CurrentStep == "PREPARING_VIEW" || t.CurrentStep == "OBSERVING"));
        if (await tour.AnyAsync(t => t.RouteRevisionId != null, ct))
            return await CurrentRevisionPoiAsync(tour, ct);
        return await tour.Where(t => t.CurrentRouteStopId != null)
            .Select(t => new AssistantPoi(t.CurrentRouteStop!.Poi.Id, t.CurrentRouteStop!.Poi.Name,
                t.CurrentRouteStop!.Poi.Description, t.CurrentRouteStop!.Poi.NarrationText))
            .SingleOrDefaultAsync(ct);
    }

    /// <summary>At a POI the robot stands at the stop it last arrived at; its content comes from the revision snapshot.</summary>
    private static Task<AssistantPoi?> CurrentRevisionPoiAsync(IQueryable<Domain.Entities.Tour> tour, CancellationToken ct) =>
        tour.Where(t => t.LastArrivedRevisionStopId != null)
            .Select(t => new AssistantPoi(t.LastArrivedRevisionStop!.PoiProposalRevisionId, t.LastArrivedRevisionStop!.Name,
                t.LastArrivedRevisionStop!.PoiProposalRevision.Description, t.LastArrivedRevisionStop!.NarrationText))
            .SingleOrDefaultAsync(ct);
}
