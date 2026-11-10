using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.StaffNotifications;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>
/// Reads the newest audit rows of the Staff notification actions, then names each target in one batched read per
/// entity type. <c>AuditLogs.EntityId</c> is text, so targets are parsed here rather than joined in SQL.
/// </summary>
public sealed class EfStaffNotificationReader(ApplicationDbContext db) : IStaffNotificationReader
{
    public async Task<IReadOnlyList<StaffNotification>> ListLatestAsync(IReadOnlyList<string> actions, int size, CancellationToken ct)
    {
        var codes = actions.ToArray();
        var rows = await db.AuditLogs.AsNoTracking()
            .Where(audit => codes.Contains(audit.Action))
            .OrderByDescending(audit => audit.OccurredAt).ThenByDescending(audit => audit.Id)
            .Take(size)
            .Select(audit => new
            {
                audit.Id, audit.OccurredAt, audit.Action, audit.ResultCode, audit.EntityType, audit.EntityId, audit.RobotId,
                RobotCode = audit.Robot == null ? null : audit.Robot.RobotCode,
                ActorName = audit.ActorUser == null ? null : audit.ActorUser.FullName,
            })
            .ToListAsync(ct);

        Guid[] IdsOf(string entityType) => rows.Where(row => row.EntityType == entityType)
            .Select(row => Guid.TryParse(row.EntityId, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty).Distinct().ToArray();

        var poiIds = IdsOf(PoiRevisionEntity);
        var pois = await db.PoiProposalRevisions.AsNoTracking()
            .Where(revision => poiIds.Contains(revision.Id))
            .Select(revision => new Target(revision.Id, revision.ProposalId, revision.Name, revision.RevisionNumber))
            .ToDictionaryAsync(target => target.EntityId, ct);
        var routeIds = IdsOf(RouteRevisionEntity);
        var routes = await db.RouteRevisions.AsNoTracking()
            .Where(revision => routeIds.Contains(revision.Id))
            .Select(revision => new Target(revision.Id, revision.RouteId, revision.Name, revision.RevisionNumber))
            .ToDictionaryAsync(target => target.EntityId, ct);
        var mapIds = IdsOf(MapVersionEntity);
        var maps = await db.MapVersions.AsNoTracking()
            .Where(map => mapIds.Contains(map.Id))
            .Select(map => new Target(map.Id, map.Id, map.MapKey, map.VersionNumber))
            .ToDictionaryAsync(target => target.EntityId, ct);

        return rows.Select(row =>
        {
            Guid.TryParse(row.EntityId, out var entityId);
            var named = row.EntityType switch
            {
                PoiRevisionEntity => pois.GetValueOrDefault(entityId),
                RouteRevisionEntity => routes.GetValueOrDefault(entityId),
                MapVersionEntity => maps.GetValueOrDefault(entityId),
                RobotEntity when row.RobotId is { } robotId => new Target(robotId, robotId, row.RobotCode, null),
                _ => null,
            };
            return new StaffNotification(row.Id, row.OccurredAt, row.Action, row.ResultCode,
                named?.TargetId, named?.Name, named?.RevisionNumber, row.RobotCode, row.ActorName);
        }).ToArray();
    }

    private const string PoiRevisionEntity = "PoiProposalRevision";
    private const string RouteRevisionEntity = "RouteRevision";
    private const string MapVersionEntity = "MapVersion";
    private const string RobotEntity = "Robot";

    private sealed record Target(Guid EntityId, Guid TargetId, string? Name, int? RevisionNumber);
}
