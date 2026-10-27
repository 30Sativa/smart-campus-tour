using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfRouteManagementRepository(ApplicationDbContext db) : IRouteManagementRepository
{
    public async Task<PagedResult<RouteListItem>> ListAsync(string? search, string sort, bool? isActive, int page, int size, CancellationToken ct)
    {
        var routes = db.Routes.AsNoTracking().Where(r => r.AuthoringMode == "LEGACY");
        if (search is not null) routes = routes.Where(r => r.Name.Contains(search) || (r.Description != null && r.Description.Contains(search)));
        if (isActive.HasValue) routes = routes.Where(r => r.IsActive == isActive.Value);
        var count = await routes.LongCountAsync(ct);
        var ordered = sort switch
        {
            "-name" => routes.OrderByDescending(r => r.Name),
            "createdAt" => routes.OrderBy(r => r.CreatedAt),
            "-createdAt" => routes.OrderByDescending(r => r.CreatedAt),
            _ => routes.OrderBy(r => r.Name)
        };
        var items = await ordered.ThenBy(r => r.Id).Skip((page - 1) * size).Take(size)
            .Select(r => new RouteListItem(r.Id, r.Name, r.Description, r.MapKey, r.MapFrame, r.IsActive,
                r.RouteStops.Count, r.CreatedAt, r.UpdatedAt)).ToArrayAsync(ct);
        return new PagedResult<RouteListItem>(items, page, size, count);
    }

    public Task<Route?> FindAsync(Guid id, bool forUpdate, CancellationToken ct) => LoadAsync(id, forUpdate, false, ct);

    public Task<Route?> FindForTourSelectionAsync(Guid id, CancellationToken ct) => LoadAsync(id, true, true, ct);

    private async Task<Route?> LoadAsync(Guid id, bool forUpdate, bool lockSelectionPois, CancellationToken ct)
    {
        // Lock the aggregate root first, before loading stops or inspecting references.
        var query = forUpdate
            ? db.Routes.FromSqlInterpolated($"SELECT * FROM dbo.Routes WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}")
            : db.Routes.AsNoTracking();
        var route = await query.SingleOrDefaultAsync(r => r.Id == id && r.AuthoringMode == "LEGACY", ct);
        if (route is null) return null;
        if (lockSelectionPois)
        {
            // Lock before loading tracked POIs: selection must validate fresh values
            // and hold availability/map data until the Tour reference is committed.
            await db.Pois.FromSqlInterpolated($"""
                SELECT p.* FROM dbo.Pois p WITH (UPDLOCK, HOLDLOCK)
                WHERE EXISTS (SELECT 1 FROM dbo.RouteStops s WHERE s.RouteId = {id} AND s.PoiId = p.Id)
                ORDER BY p.Id
                """).ToListAsync(ct);
        }
        var stops = db.RouteStops.Where(s => s.RouteId == id).Include(s => s.Poi);
        route.RouteStops = await (forUpdate ? stops : stops.AsNoTracking()).OrderBy(s => s.StopOrder).ToListAsync(ct);
        return route;
    }

    public async Task<RouteUsage> GetUsageAsync(Guid id, CancellationToken ct)
    {
        var stopIds = db.RouteStops.Where(s => s.RouteId == id).Select(s => s.Id);
        var variants = db.RouteVariants.Where(v => v.BaseRouteId == id || v.VariantRouteId == id ||
            stopIds.Contains(v.BranchPointRouteStopId) || stopIds.Contains(v.VariantBranchStopId));
        var tours = db.Tours.Where(t => t.RouteId == id || t.ActiveRouteId == id ||
            (t.CurrentRouteStopId.HasValue && stopIds.Contains(t.CurrentRouteStopId.Value)) ||
            (t.LastArrivedRouteStopId.HasValue && stopIds.Contains(t.LastArrivedRouteStopId.Value)) ||
            db.TourAllowedBranches.Any(a => a.TourId == t.Id && a.IsEnabled && variants.Any(v => v.Id == a.RouteVariantId)));
        var protectedTour = await tours.AnyAsync(t => t.State == "READY" || t.State == "RUNNING", ct);
        var referenced = await tours.AnyAsync(ct) || await variants.AnyAsync(ct) ||
            await db.TourEvents.AnyAsync(e => e.RouteId == id, ct) ||
            await db.BranchRequests.AnyAsync(b => stopIds.Contains(b.BranchPointRouteStopId), ct);
        return new RouteUsage(referenced, protectedTour);
    }

    public async Task<IReadOnlyList<Poi>> GetPoisAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        await db.Pois.Where(p => ids.Contains(p.Id)).OrderBy(p => p.Id).ToArrayAsync(ct);

    public async Task ReplaceStopsAsync(Route route, IReadOnlyList<RouteStop> stops, CancellationToken ct)
    {
        // This DML belongs to the surrounding serializable Route transaction, not a separate commit.
        // Delete first so EF insertion ordering cannot collide with UQ_RouteStops_Order during a swap.
        await db.RouteStops.Where(s => s.RouteId == route.Id).ExecuteDeleteAsync(ct);
        foreach (var old in route.RouteStops.ToArray()) db.Entry(old).State = EntityState.Detached;
        route.RouteStops.Clear();
        foreach (var stop in stops)
        {
            stop.RouteId = route.Id;
            route.RouteStops.Add(stop);
            db.RouteStops.Add(stop);
        }
    }

    public void Add(Route route) => db.Routes.Add(route);
    public void Remove(Route route) => db.Routes.Remove(route);
    public void AddAudit(AuditLog audit) => db.AuditLogs.Add(audit);
}
