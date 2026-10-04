using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Pois.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public enum PoiSortField
{
    Name,
    IsActive,
    CreatedAt,
    UpdatedAt
}

public readonly record struct PoiSort(PoiSortField Field, bool Descending)
{
    public static PoiSort Default => new(PoiSortField.Name, false);
}

public interface IPoiManagementRepository
{
    Task<PagedResult<PoiListEntry>> ListAsync(
        string? search,
        PoiSort sort,
        int page,
        int pageSize,
        bool? isActive,
        CancellationToken cancellationToken = default);

    Task<Poi?> FindForReadAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Poi?> FindForManagementAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PoiManagementState> GetManagementStateAsync(Guid id, CancellationToken cancellationToken = default);
    void Add(Poi poi);
    void AddAuditLog(AuditLog auditLog);
}
