using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRouteManagementRepository
{
    Task<PagedResult<RouteListItem>> ListAsync(string? search, string sort, bool? isActive, int page, int size, CancellationToken ct);
    Task<Route?> FindAsync(Guid id, bool forUpdate, CancellationToken ct);
    Task<Route?> FindForTourSelectionAsync(Guid id, CancellationToken ct);
    Task<RouteUsage> GetUsageAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<Poi>> GetPoisAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct);
    Task ReplaceStopsAsync(Route route, IReadOnlyList<RouteStop> stops, CancellationToken ct);
    void Add(Route route);
    void Remove(Route route);
    void AddAudit(AuditLog audit);
}
