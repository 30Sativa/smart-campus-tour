using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface ITourManagementRepository
{
    Task<IAsyncDisposable> BeginReadAsync(Guid id, CancellationToken ct);
    Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<PagedResult<TourSummary>> ListAsync(TourListRequest request, CancellationToken ct);
    Task<Tour?> FindAsync(Guid id, CancellationToken ct);
    Task<TourSummary?> GetSummaryAsync(Guid id, CancellationToken ct);
    Task<TourUsage> GetUsageAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<Guid>> GetRegistrationIdsAsync(Guid id, CancellationToken ct);
    void Add(Tour tour);
    void AddAudit(AuditLog audit);
    void AddRouteChangeEvent(Tour tour, Guid previousRouteId, Guid actor, DateTimeOffset now);
}
