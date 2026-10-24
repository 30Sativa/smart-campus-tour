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
                CurrentPoiId = t.CurrentRouteStopId == null ? (Guid?)null : t.CurrentRouteStop!.PoiId,
                LastArrivedPoiId = t.LastArrivedRouteStopId == null ? (Guid?)null : t.LastArrivedRouteStop!.PoiId,
            })
            .SingleOrDefaultAsync(ct);
        if (tour is null) return null;

        var stops = await context.RouteStops.AsNoTracking()
            .Where(s => s.RouteId == tour.ActiveRouteId)
            .OrderBy(s => s.StopOrder)
            .Select(s => new StudentTourStopData(s.StopOrder, s.PoiId, s.Poi.Name, s.Poi.Description, s.Poi.NarrationText,
                s.Poi.AudioUrl, s.Poi.NarrationSeconds, s.DwellSeconds))
            .ToListAsync(ct);
        return new StudentTourViewData(tour.State, tour.CurrentStep, tour.OperationalStatus, tour.IsHeld,
            tour.CurrentPoiId, tour.LastArrivedPoiId, stops);
    }

    public Task<AssistantPoi?> FindCurrentPoiAsync(Guid tourId, CancellationToken ct) =>
        context.Tours.AsNoTracking()
            .Where(t => t.Id == tourId && t.State == "RUNNING" && t.CurrentRouteStopId != null
                && (t.CurrentStep == "PREPARING_VIEW" || t.CurrentStep == "OBSERVING"))
            .Select(t => new AssistantPoi(t.CurrentRouteStop!.Poi.Id, t.CurrentRouteStop!.Poi.Name,
                t.CurrentRouteStop!.Poi.Description, t.CurrentRouteStop!.Poi.NarrationText))
            .SingleOrDefaultAsync(ct);
}
