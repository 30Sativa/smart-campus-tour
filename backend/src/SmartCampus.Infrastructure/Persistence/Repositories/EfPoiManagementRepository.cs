using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Pois;
using SmartCampus.Application.Features.Pois.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfPoiManagementRepository(ApplicationDbContext dbContext) : IPoiManagementRepository
{
    public async Task<PagedResult<PoiListEntry>> ListAsync(
        string? search,
        PoiSort sort,
        int page,
        int pageSize,
        bool? isActive,
        CancellationToken cancellationToken = default)
    {
        IQueryable<Poi> pois = dbContext.Pois.AsNoTracking();
        if (search is not null)
            pois = pois.Where(poi => poi.Name.Contains(search) || (poi.Description != null && poi.Description.Contains(search)));
        if (isActive.HasValue)
            pois = pois.Where(poi => poi.IsActive == isActive.Value);

        var ordered = ApplySort(pois, sort);
        var total = await ordered.LongCountAsync(cancellationToken);
        var offset = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);
        var items = await ordered.Skip(offset).Take(pageSize)
            .Select(poi => new PoiListEntry(
                poi.Id, poi.Name, poi.MapKey, poi.MapFrame, poi.X, poi.Y, poi.Yaw,
                poi.IsActive, poi.CreatedAt, poi.UpdatedAt, poi.RowVersion))
            .ToArrayAsync(cancellationToken);

        return new PagedResult<PoiListEntry>(items, page, pageSize, total);
    }

    public Task<Poi?> FindForReadAsync(Guid id, CancellationToken cancellationToken = default) =>
        dbContext.Pois.AsNoTracking().SingleOrDefaultAsync(poi => poi.Id == id, cancellationToken);

    // Acquire the write lock before serializable usage reads so same-version
    // mutations queue and the later request observes the new RowVersion.
    public Task<Poi?> FindForManagementAsync(Guid id, CancellationToken cancellationToken = default) =>
        dbContext.Pois
            .FromSqlInterpolated($"SELECT * FROM dbo.Pois WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}")
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<PoiManagementState> GetManagementStateAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var hasRouteStopReferences = await dbContext.RouteStops
            .AnyAsync(stop => stop.PoiId == id, cancellationToken);
        var hasHistoricalTourReferences = await dbContext.TourEvents
            .AnyAsync(tourEvent => tourEvent.TargetPoiId == id, cancellationToken);
        var hasReadyOrRunningTours = await dbContext.Tours.AnyAsync(tour =>
            (tour.State == "READY" || tour.State == "RUNNING") &&
            dbContext.RouteStops.Any(stop =>
                stop.PoiId == id &&
                (stop.RouteId == tour.RouteId || stop.RouteId == tour.ActiveRouteId ||
                 dbContext.TourAllowedBranches.Any(allowed =>
                     allowed.TourId == tour.Id && allowed.IsEnabled &&
                     dbContext.RouteVariants.Any(variant =>
                         variant.Id == allowed.RouteVariantId && variant.VariantRouteId == stop.RouteId)))),
            cancellationToken);

        return new PoiManagementState(hasRouteStopReferences, hasHistoricalTourReferences, hasReadyOrRunningTours);
    }

    public void Add(Poi poi) => dbContext.Pois.Add(poi);

    public void AddAuditLog(AuditLog auditLog) => dbContext.AuditLogs.Add(auditLog);

    private static IOrderedQueryable<Poi> ApplySort(IQueryable<Poi> pois, PoiSort sort)
    {
        var ordered = (sort.Field, sort.Descending) switch
        {
            (PoiSortField.Name, false) => pois.OrderBy(poi => poi.Name),
            (PoiSortField.Name, true) => pois.OrderByDescending(poi => poi.Name),
            (PoiSortField.IsActive, false) => pois.OrderBy(poi => poi.IsActive),
            (PoiSortField.IsActive, true) => pois.OrderByDescending(poi => poi.IsActive),
            (PoiSortField.CreatedAt, false) => pois.OrderBy(poi => poi.CreatedAt),
            (PoiSortField.CreatedAt, true) => pois.OrderByDescending(poi => poi.CreatedAt),
            (PoiSortField.UpdatedAt, false) => pois.OrderBy(poi => poi.UpdatedAt),
            (PoiSortField.UpdatedAt, true) => pois.OrderByDescending(poi => poi.UpdatedAt),
            _ => throw new ArgumentOutOfRangeException(nameof(sort), sort.Field, "Unsupported POI sort field.")
        };

        return ordered.ThenBy(poi => poi.Id);
    }
}
