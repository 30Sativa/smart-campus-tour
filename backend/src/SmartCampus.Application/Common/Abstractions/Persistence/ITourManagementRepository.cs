using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface ITourManagementRepository
{
    Task<IAsyncDisposable> BeginReadAsync(Guid id, CancellationToken ct);
    /// <summary>Serializes an actor/request pair using a transaction-owned application lock; call before the Tour root lock.</summary>
    Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<PagedResult<TourSummary>> ListAsync(TourListRequest request, CancellationToken ct);
    Task<Tour?> FindAsync(Guid id, CancellationToken ct);
    Task<TourSummary?> GetSummaryAsync(Guid id, CancellationToken ct);
    Task<TourUsage> GetUsageAsync(Guid id, CancellationToken ct);
    /// <summary>Tracked registrations without roster history; caller must hold the shared Tour root lock.</summary>
    Task<IReadOnlyList<GroupRegistration>> LoadCancellationRegistrationsAsync(Guid id, CancellationToken ct);
    /// <summary>Serializes reservation changes for one robot; call after the Tour root lock.</summary>
    Task LockRobotReservationsAsync(Guid robotId, CancellationToken ct);
    Task<IReadOnlyList<TourReservationHold>> GetActiveReservationsAsync(Guid robotId, DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct);
    /// <summary>Tracked; caller must hold the Tour root lock.</summary>
    Task<TourRobotReservation?> FindActiveReservationAsync(Guid id, CancellationToken ct);
    Task<TourTargetView> GetTargetAsync(Guid id, CancellationToken ct);
    void Add(Tour tour);
    void Add(TourRobotReservation reservation);
    void AddAudit(AuditLog audit);
    void AddRouteChangeEvent(Tour tour, Guid previousRouteId, Guid actor, DateTimeOffset now);
}
