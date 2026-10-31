using System.Data;
using System.Text.Json;
using FluentValidation;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

public sealed class EfRobotMapAssignmentManager(ApplicationDbContext db, TimeProvider clock) : IRobotMapAssignmentManager
{
    private const string Assigned = "ROBOT_MAP_ASSIGNED";
    private const string Cleared = "ROBOT_MAP_CLEARED";

    public async Task<RobotMapAssignmentView> ChangeAsync(Guid robotId, Guid actorUserId, Guid requestId,
        string expectedRowVersion, Guid? mapVersionId, CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var resource = $"robot-map-assignment:{actorUserId:D}:{requestId:D}";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {resource}, @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51081, 'Could not acquire robot map assignment idempotency lock.', 1;
            """, cancellationToken);

        // Before any Robots read: two assigns holding serializable row locks would otherwise deadlock on the holder check.
        var targetArea = mapVersionId is null ? null : await db.MapVersions.AsNoTracking()
            .Where(m => m.Id == mapVersionId).Select(m => m.AreaKey).SingleOrDefaultAsync(cancellationToken);
        if (targetArea is not null) await LockAreaAsync(targetArea, cancellationToken);

        var robot = await db.Robots.Include(r => r.AssignedMapVersion).ThenInclude(m => m!.AreaKeyNavigation)
            .Include(r => r.MapAssignedByUser)
            .SingleOrDefaultAsync(r => r.Id == robotId && r.SourceType == "PHYSICAL", cancellationToken);
        if (robot is null) throw new NotFoundException("Physical robot", robotId);

        var prior = await db.AuditLogs.AsNoTracking().Include(a => a.ActorUser)
            .Where(a => a.ActorUserId == actorUserId && a.CorrelationId == requestId &&
                (a.Action == Assigned || a.Action == Cleared))
            .SingleOrDefaultAsync(cancellationToken);
        if (prior is not null)
        {
            using var json = JsonDocument.Parse(prior.DataJson ?? "{}");
            var root = json.RootElement;
            if (prior.RobotId != robotId || !root.TryGetProperty("requestedMapVersionId", out var requestedValue) ||
                (requestedValue.ValueKind == JsonValueKind.Null ? (Guid?)null : requestedValue.GetGuid()) != mapVersionId)
                throw new ConflictException("RequestId was already used for a different robot map assignment.", "ROBOT_MAP_ASSIGNMENT_REPLAYED");
            Guid? priorVersionId = root.TryGetProperty("newMapVersionId", out var idValue) && idValue.ValueKind == JsonValueKind.String
                ? idValue.GetGuid() : null;
            var priorMap = priorVersionId is null ? null : await db.MapVersions.AsNoTracking()
                .Include(m => m.AreaKeyNavigation).SingleAsync(m => m.Id == priorVersionId, cancellationToken);
            return new(robot.Id, robot.RobotCode, priorMap?.Id, priorMap?.AreaKeyNavigation.DisplayName,
                priorMap?.VersionNumber, priorMap?.MapKey, priorMap?.FrameId,
                priorMap is null ? null : prior.OccurredAt, priorMap is null ? null : prior.ActorUser?.FullName,
                Convert.ToBase64String(robot.RowVersion),
                await RobotTourImpact.ListAsync(db, robot.Id, priorMap?.Id, cancellationToken));
        }

        byte[] expected;
        try { expected = Convert.FromBase64String(expectedRowVersion); }
        catch (FormatException) { throw new ValidationException("ExpectedRowVersion must be a base64 SQL rowversion."); }
        if (!robot.RowVersion.AsSpan().SequenceEqual(expected)) throw ConcurrencyConflict();
        RobotLifecycleRules.EnsureActive(robot);

        MapVersion? target = null;
        if (mapVersionId is not null)
        {
            target = await db.MapVersions.Include(m => m.AreaKeyNavigation)
                .SingleOrDefaultAsync(m => m.Id == mapVersionId && m.ValidationStatus == "VALID", cancellationToken);
            if (target is null) throw new NotFoundException("Valid map version", mapVersionId);
            if (await AreaHolderAsync(target.AreaKey, robot.Id, cancellationToken) is { } holder)
                throw AreaTaken(target, holder);
        }

        var old = robot.AssignedMapVersion;
        var now = clock.GetUtcNow();
        robot.AssignedMapVersionId = target?.Id;
        robot.AssignedMapVersion = target;
        robot.AssignedAreaKey = target?.AreaKey;
        robot.MapAssignedAt = target is null ? null : now;
        robot.MapAssignedByUserId = target is null ? null : actorUserId;
        var action = target is null ? Cleared : Assigned;
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actorUserId, RobotId = robot.Id, CorrelationId = requestId,
            Action = action, EntityType = "Robot", EntityId = robot.Id.ToString("D"), ResultCode = "SUCCESS",
            DataJson = JsonSerializer.Serialize(new
            {
                robotCode = robot.RobotCode,
                oldMapVersionId = old?.Id,
                oldMapKey = old?.MapKey,
                oldFrameId = old?.FrameId,
                requestedMapVersionId = target?.Id,
                newMapVersionId = target?.Id,
                mapKey = target?.MapKey,
                frameId = target?.FrameId
            }),
            OccurredAt = now
        });

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException) { throw ConcurrencyConflict(); }
        catch (DbUpdateException exception) when (target is not null && IsAreaUniqueViolation(exception))
        {
            await tx.RollbackAsync(cancellationToken);
            throw AreaTaken(target, await AreaHolderAsync(target.AreaKey, robot.Id, cancellationToken) ?? "robot khác");
        }

        return new(robot.Id, robot.RobotCode, target?.Id, target?.AreaKeyNavigation.DisplayName,
            target?.VersionNumber, target?.MapKey, target?.FrameId,
            target is null ? null : now, target is null ? null : (await db.Users.AsNoTracking()
                .Where(u => u.Id == actorUserId).Select(u => u.FullName).SingleAsync(cancellationToken)),
            Convert.ToBase64String(robot.RowVersion),
            await RobotTourImpact.ListAsync(db, robot.Id, target?.Id, cancellationToken));
    }

    // The unique index is the final guard; this lock makes the usual loser read the holder's name.
    private Task LockAreaAsync(string areaKey, CancellationToken cancellationToken)
    {
        var resource = $"robot-map-area:{areaKey}";
        return db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {resource}, @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51083, 'Could not acquire robot map area lock.', 1;
            """, cancellationToken);
    }

    private Task<string?> AreaHolderAsync(string areaKey, Guid robotId, CancellationToken cancellationToken) =>
        db.Robots.AsNoTracking().Where(r => r.AssignedAreaKey == areaKey && r.Id != robotId)
            .Select(r => r.RobotCode).FirstOrDefaultAsync(cancellationToken);

    private static ConflictException AreaTaken(MapVersion map, string holder) =>
        new($"Khu vực {map.AreaKeyNavigation.DisplayName} đang được gán cho {holder}. Bỏ gán robot đó trước.", "MAP_AREA_ALREADY_ASSIGNED");

    private static bool IsAreaUniqueViolation(Exception error) =>
        (error is SqlException { Number: 2601 or 2627 } sql && sql.Message.Contains("UX_Robots_AssignedArea", StringComparison.Ordinal)) ||
        (error.InnerException is not null && IsAreaUniqueViolation(error.InnerException));

    private static ConflictException ConcurrencyConflict() =>
        new("Robot or assignment changed since it was loaded. Refresh and try again.", "ROBOT_MAP_ASSIGNMENT_STALE");
}
