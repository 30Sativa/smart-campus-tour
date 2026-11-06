using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfScheduleBlockRepository(ApplicationDbContext db) : IScheduleBlockRepository
{
    public Task LockDateAsync(DateOnly date, CancellationToken ct)
    {
        var resource = $"tour-schedule-date:{date:yyyy-MM-dd}";
        return db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock @Resource={resource}, @LockMode='Exclusive',
                @LockOwner='Transaction', @LockTimeout=10000;
            IF @result < 0 THROW 51163, 'Schedule date lock unavailable.', 1;
            """, ct);
    }

    public Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct)
    {
        var resource = $"tour-schedule-block:{actor:D}:{requestId:D}";
        return db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock @Resource={resource}, @LockMode='Exclusive',
                @LockOwner='Transaction', @LockTimeout=10000;
            IF @result < 0 THROW 51164, 'Schedule block request lock unavailable.', 1;
            """, ct);
    }

    public Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct) =>
        db.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.ActorUserId == actor && a.CorrelationId == requestId &&
            a.EntityType == ScheduleBlockAudit.EntityType, ct);

    public async Task<IReadOnlyList<TourScheduleBlock>> ListActiveAsync(DateOnly from, DateOnly to, CancellationToken ct) =>
        await db.TourScheduleBlocks.AsNoTracking().Where(b => b.RemovedAt == null && b.BlockDate >= from && b.BlockDate <= to)
            .OrderBy(b => b.BlockDate).ThenBy(b => b.ShiftCode).ToArrayAsync(ct);

    public async Task<DateOnly?> FindDateAsync(Guid id, CancellationToken ct) =>
        await db.TourScheduleBlocks.AsNoTracking().Where(b => b.Id == id).Select(b => (DateOnly?)b.BlockDate).SingleOrDefaultAsync(ct);

    public Task<TourScheduleBlock?> FindAsync(Guid id, CancellationToken ct) =>
        db.TourScheduleBlocks.SingleOrDefaultAsync(b => b.Id == id, ct);

    public async Task<IReadOnlyList<ScheduleBlockingTour>> ListToursInWindowAsync(DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct) =>
        await db.Tours.AsNoTracking().Where(t => t.State != "CANCELLED" &&
                ((t.ScheduledStartAt >= startsAt && t.ScheduledStartAt < endsAt) ||
                 t.TourRobotReservations.Any(r => r.ReleasedAt == null && r.StartsAt < endsAt && r.EndsAt > startsAt)))
            .OrderBy(t => t.ScheduledStartAt)
            .Select(t => new ScheduleBlockingTour(t.Id, t.Name, t.ScheduledStartAt)).ToArrayAsync(ct);

    public void Add(TourScheduleBlock block) => db.TourScheduleBlocks.Add(block);

    public void AddAudit(AuditLog audit) => db.AuditLogs.Add(audit);
}
