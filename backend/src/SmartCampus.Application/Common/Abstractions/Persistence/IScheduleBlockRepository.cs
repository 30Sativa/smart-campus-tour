using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>A Tour that still occupies a day or shift being closed.</summary>
public sealed record ScheduleBlockingTour(Guid Id, string Name, DateTimeOffset ScheduledStartAt);

/// <summary>Admin day and shift blocks (docs/lich-tour-theo-ca.md §5).</summary>
public interface IScheduleBlockRepository
{
    /// <summary>Serializes creating a Tour and closing or reopening shifts of one campus date; owned by the transaction.</summary>
    Task LockDateAsync(DateOnly date, CancellationToken ct);
    Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<IReadOnlyList<TourScheduleBlock>> ListActiveAsync(DateOnly from, DateOnly to, CancellationToken ct);
    /// <summary>Read without tracking, to learn which date to lock.</summary>
    Task<DateOnly?> FindDateAsync(Guid id, CancellationToken ct);
    /// <summary>Tracked; call after the date lock so the state read is current.</summary>
    Task<TourScheduleBlock?> FindAsync(Guid id, CancellationToken ct);
    /// <summary>Tours not cancelled that start in the window, or hold a robot in it, oldest start first.</summary>
    Task<IReadOnlyList<ScheduleBlockingTour>> ListToursInWindowAsync(DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct);
    void Add(TourScheduleBlock block);
    void AddAudit(AuditLog audit);
}
