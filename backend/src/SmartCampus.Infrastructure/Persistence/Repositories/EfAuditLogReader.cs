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
                audit.Robot == null ? null : audit.Robot.RobotCode, audit.ResultCode, null, null))
            .ToArrayAsync(ct);
        return new(await WithRouteNamesAsync(rows, ct), filter.Page, filter.Size, total);
    }

    /// <summary>
    /// A route row names its route: a RouteRevision row (e.g. a test run) by that revision's name and save time, a Route
    /// row by its newest revision's name. EntityId is free text, so ids are parsed here rather than joined in SQL.
    /// </summary>
    private async Task<AuditLogEntry[]> WithRouteNamesAsync(AuditLogEntry[] rows, CancellationToken ct)
    {
        static Guid? IdOf(AuditLogEntry row, string type) =>
            row.EntityType == type && Guid.TryParse(row.EntityId, out var id) ? id : null;
        var revisionIds = rows.Select(row => IdOf(row, "RouteRevision")).OfType<Guid>().Distinct().ToArray();
        var routeIds = rows.Select(row => IdOf(row, "Route")).OfType<Guid>().Distinct().ToArray();
        if (revisionIds.Length == 0 && routeIds.Length == 0) return rows;

        var revisions = await db.RouteRevisions.AsNoTracking().Where(revision => revisionIds.Contains(revision.Id))
            .Select(revision => new { revision.Id, revision.Name, revision.CreatedAt }).ToDictionaryAsync(revision => revision.Id, ct);
        var routes = await db.Routes.AsNoTracking().Where(route => routeIds.Contains(route.Id))
            .Select(route => new
            {
                route.Id,
                Name = db.RouteRevisions.Where(revision => revision.RouteId == route.Id)
                    .OrderByDescending(revision => revision.RevisionNumber).Select(revision => revision.Name).FirstOrDefault() ?? route.Name
            }).ToDictionaryAsync(route => route.Id, route => route.Name, ct);

        return rows.Select(row =>
            IdOf(row, "RouteRevision") is { } revisionId && revisions.TryGetValue(revisionId, out var revision)
                ? row with { RouteName = revision.Name, RouteRevisionSavedAt = revision.CreatedAt }
                : IdOf(row, "Route") is { } routeId && routes.TryGetValue(routeId, out var name)
                    ? row with { RouteName = name }
                    : row).ToArray();
    }
}
