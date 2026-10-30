using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.AuditLogs;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfAuditLogReader(ApplicationDbContext db) : IAuditLogReader
{
    public async Task<PagedResult<AuditLogEntry>> ListAsync(AuditLogFilter filter, CancellationToken ct)
    {
        var query = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(filter.Action)) query = query.Where(audit => audit.Action == filter.Action);
        if (!string.IsNullOrWhiteSpace(filter.Actor))
        {
            var actor = filter.Actor.Trim();
            query = query.Where(audit => audit.ActorUser != null &&
                (audit.ActorUser.FullName.Contains(actor) || audit.ActorUser.Username.Contains(actor)));
        }
        if (filter.From.HasValue) query = query.Where(audit => audit.OccurredAt >= filter.From.Value);
        if (filter.To.HasValue) query = query.Where(audit => audit.OccurredAt <= filter.To.Value);
        var total = await query.LongCountAsync(ct);
        var rows = await query.OrderByDescending(audit => audit.OccurredAt).ThenByDescending(audit => audit.Id)
            .Skip((filter.Page - 1) * filter.Size).Take(filter.Size)
            .Select(audit => new AuditLogEntry(audit.Id, audit.OccurredAt, audit.Action, audit.EntityType, audit.EntityId,
                audit.ActorUserId, audit.ActorUser == null ? null : audit.ActorUser.FullName,
                audit.TourId, audit.Tour == null ? null : audit.Tour.Name,
                audit.Robot == null ? null : audit.Robot.RobotCode, audit.ResultCode))
            .ToArrayAsync(ct);
        return new(rows, filter.Page, filter.Size, total);
    }
}
