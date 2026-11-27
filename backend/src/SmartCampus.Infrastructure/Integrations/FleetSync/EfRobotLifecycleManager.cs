using System.Data;
using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

public sealed class EfRobotLifecycleManager(ApplicationDbContext db, TimeProvider clock) : IRobotLifecycleManager
{
    private const string Deactivated = "ROBOT_DEACTIVATED";
    private const string Activated = "ROBOT_ACTIVATED";
    private const string MapCleared = "ROBOT_MAP_CLEARED";

    public async Task<RobotLifecycleResult> DeactivateAsync(Guid robotId, Guid actorUserId, Guid requestId,
        string expectedRowVersion, string reason, CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var robot = await LoadAsync(robotId, actorUserId, requestId, cancellationToken);
        if (await ReplayAsync(robot, actorUserId, requestId, Deactivated, cancellationToken) is { } replay) return replay;
        var expected = ParseRowVersion(expectedRowVersion);
        if (!robot.RowVersion.AsSpan().SequenceEqual(expected)) throw Stale();
        if (robot.IsDeactivated) throw new ConflictException($"Robot {robot.RobotCode} đã ngừng sử dụng rồi.", "ROBOT_ALREADY_DEACTIVATED");

        // Same order as Tour create, so a Tour either sees this or is listed by it.
        await LockAsync($"map-poi:robot-deployment:{robot.Id:D}", cancellationToken);
        await LockAsync($"tour-robot-reservation:{robot.Id:D}", cancellationToken);
        await RobotRunningTour.EnsureNoneAsync(db, robot.Id, robot.RobotCode, RobotRunningTour.Deactivate, cancellationToken);

        var now = clock.GetUtcNow();
        var changed = await db.Robots.Where(r => r.Id == robot.Id && r.RowVersion == expected && r.DeactivatedAt == null)
            .ExecuteUpdateAsync(update => update
                .SetProperty(r => r.DeactivatedAt, (DateTimeOffset?)now)
                .SetProperty(r => r.DeactivatedByUserId, (Guid?)actorUserId)
                .SetProperty(r => r.DeactivationReason, reason)
                .SetProperty(r => r.AssignedMapVersionId, (Guid?)null)
                .SetProperty(r => r.AssignedAreaKey, (string?)null)
                .SetProperty(r => r.MapAssignedAt, (DateTimeOffset?)null)
                .SetProperty(r => r.MapAssignedByUserId, (Guid?)null), cancellationToken);
        if (changed != 1) throw Stale();

        if (robot.CredentialHash is not null)
        {
            await EfPhysicalRobotCredentialManager.RevokeAsync(db.Robots.Where(r => r.Id == robot.Id && r.CredentialHash != null), now, actorUserId, cancellationToken);
            db.AuditLogs.Add(EfPhysicalRobotCredentialManager.RevokedAudit(robot.Id, robot.RobotCode, robot.CredentialHint, requestId, actorUserId, reason, "WEB", now));
        }
        if (robot.AssignedMapVersionId is not null)
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = actorUserId, RobotId = robot.Id, CorrelationId = requestId,
                Action = MapCleared, EntityType = "Robot", EntityId = robot.Id.ToString("D"), ResultCode = "SUCCESS",
                DataJson = JsonSerializer.Serialize(new { robotCode = robot.RobotCode, oldMapVersionId = robot.AssignedMapVersionId,
                    oldMapKey = robot.AssignedMapVersion?.MapKey, oldFrameId = robot.AssignedMapVersion?.FrameId,
                    requestedMapVersionId = (Guid?)null, newMapVersionId = (Guid?)null }),
                OccurredAt = now
            });
        var affected = await RobotTourImpact.ListAsync(db, robot.Id, null, cancellationToken);
        db.AuditLogs.Add(Audit(Deactivated, robot, actorUserId, requestId, now, new { robotCode = robot.RobotCode, reason, affectedTourIds = affected.Select(tour => tour.TourId) }));
        await db.SaveChangesAsync(cancellationToken);
        var rowVersion = await CurrentRowVersionAsync(robot.Id, cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return new(robot.Id, robot.RobotCode, now, reason, rowVersion, affected);
    }

    public async Task<RobotLifecycleResult> ActivateAsync(Guid robotId, Guid actorUserId, Guid requestId,
        string expectedRowVersion, CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var robot = await LoadAsync(robotId, actorUserId, requestId, cancellationToken);
        if (await ReplayAsync(robot, actorUserId, requestId, Activated, cancellationToken) is { } replay) return replay;
        var expected = ParseRowVersion(expectedRowVersion);
        if (!robot.RowVersion.AsSpan().SequenceEqual(expected)) throw Stale();
        if (!robot.IsDeactivated) throw new ConflictException($"Robot {robot.RobotCode} đang được sử dụng.", "ROBOT_NOT_DEACTIVATED");

        var now = clock.GetUtcNow();
        var changed = await db.Robots.Where(r => r.Id == robot.Id && r.RowVersion == expected)
            .ExecuteUpdateAsync(update => update
                .SetProperty(r => r.DeactivatedAt, (DateTimeOffset?)null)
                .SetProperty(r => r.DeactivatedByUserId, (Guid?)null)
                .SetProperty(r => r.DeactivationReason, (string?)null), cancellationToken);
        if (changed != 1) throw Stale();
        db.AuditLogs.Add(Audit(Activated, robot, actorUserId, requestId, now, new { robotCode = robot.RobotCode, previousReason = robot.DeactivationReason }));
        await db.SaveChangesAsync(cancellationToken);
        var rowVersion = await CurrentRowVersionAsync(robot.Id, cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return new(robot.Id, robot.RobotCode, null, null, rowVersion, []);
    }

    public Task<IReadOnlyList<RobotAffectedTour>> ListAffectedToursAsync(Guid robotId, Guid? mapVersionId, CancellationToken cancellationToken) =>
        RobotTourImpact.ListAsync(db, robotId, mapVersionId, cancellationToken);

    private async Task<Robot> LoadAsync(Guid robotId, Guid actorUserId, Guid requestId, CancellationToken cancellationToken)
    {
        await LockAsync($"robot-lifecycle:{actorUserId:D}:{requestId:D}", cancellationToken);
        return await db.Robots.AsNoTracking().Include(r => r.AssignedMapVersion)
            .SingleOrDefaultAsync(r => r.Id == robotId && r.SourceType == "PHYSICAL", cancellationToken)
            ?? throw new NotFoundException("Physical robot", robotId);
    }

    private async Task<RobotLifecycleResult?> ReplayAsync(Robot robot, Guid actorUserId, Guid requestId, string action, CancellationToken cancellationToken)
    {
        var prior = await db.AuditLogs.AsNoTracking()
            .Where(audit => audit.ActorUserId == actorUserId && audit.CorrelationId == requestId && (audit.Action == Deactivated || audit.Action == Activated))
            .SingleOrDefaultAsync(cancellationToken);
        if (prior is null) return null;
        if (prior.RobotId != robot.Id || prior.Action != action)
            throw new ConflictException("RequestId was already used for a different robot operation.", "ROBOT_LIFECYCLE_REPLAYED");
        return new(robot.Id, robot.RobotCode, robot.DeactivatedAt, robot.DeactivationReason, Convert.ToBase64String(robot.RowVersion),
            action == Deactivated ? await RobotTourImpact.ListAsync(db, robot.Id, null, cancellationToken) : []);
    }

    private Task LockAsync(string resource, CancellationToken cancellationToken) =>
        db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {resource}, @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51082, 'Could not acquire robot lifecycle lock.', 1;
            """, cancellationToken);

    private async Task<string> CurrentRowVersionAsync(Guid robotId, CancellationToken cancellationToken) =>
        Convert.ToBase64String(await db.Robots.AsNoTracking().Where(r => r.Id == robotId).Select(r => r.RowVersion).SingleAsync(cancellationToken));

    private static AuditLog Audit<T>(string action, Robot robot, Guid actorUserId, Guid requestId, DateTimeOffset now, T data) => new()
    {
        ActorUserId = actorUserId, RobotId = robot.Id, CorrelationId = requestId,
        Action = action, EntityType = "Robot", EntityId = robot.Id.ToString("D"), ResultCode = "SUCCESS",
        DataJson = JsonSerializer.Serialize(data), OccurredAt = now
    };

    private static byte[] ParseRowVersion(string value)
    {
        try
        {
            if (Convert.FromBase64String(value) is { Length: 8 } bytes) return bytes;
        }
        catch (FormatException) { }
        throw new ValidationException("ExpectedRowVersion must be a base64 SQL rowversion.");
    }

    private static ConflictException Stale() => new("Robot đã thay đổi. Tải lại rồi thử lại.", "ROBOT_CONCURRENCY_CONFLICT");
}

/// <summary>
/// ADR-0066 round 5: a robot whose <see cref="Robot.CurrentTourId"/> names a RUNNING Tour keeps its map, its activation and
/// its key until that Tour ends, so the Tour never stops halfway. A robot held for inspection after its Tour ended is not
/// running. Stopping dispatch and revoking the key are never refused (ADR-0049).
/// </summary>
internal static class RobotRunningTour
{
    public const string Code = "ROBOT_IN_RUNNING_TOUR";
    public const string ChangeMap = "đổi bản đồ";
    public const string Deactivate = "ngừng sử dụng";
    public const string ChangeKey = "đổi khóa";

    /// <summary>A fresh read, taken after the robot deployment lock that Start holds while it claims the robot.</summary>
    public static async Task EnsureNoneAsync(ApplicationDbContext db, Guid robotId, string robotCode, string change,
        CancellationToken cancellationToken)
    {
        var tour = await db.Robots.AsNoTracking()
            .Where(r => r.Id == robotId && r.CurrentTour != null && r.CurrentTour.State == "RUNNING")
            .Select(r => r.CurrentTour!.Name).FirstOrDefaultAsync(cancellationToken);
        if (tour is not null)
            throw new ConflictException(
                $"Robot {robotCode} đang chạy Tour {tour}. Kết thúc Tour (hoặc kết thúc sớm) rồi mới {change}.", Code,
                blockers: [new ConflictBlocker("TOUR", tour)]);
    }
}

/// <summary>SCHEDULED/READY Tours holding this robot whose route needs another map, or all of them with no map.</summary>
internal static class RobotTourImpact
{
    public static async Task<IReadOnlyList<RobotAffectedTour>> ListAsync(ApplicationDbContext db, Guid robotId, Guid? mapVersionId, CancellationToken cancellationToken) =>
        await db.TourRobotReservations.AsNoTracking()
            .Where(hold => hold.RobotId == robotId && hold.ReleasedAt == null &&
                (hold.Tour.State == "SCHEDULED" || hold.Tour.State == "READY") &&
                (mapVersionId == null || hold.Tour.RouteRevision == null || hold.Tour.RouteRevision.MapVersionId != mapVersionId))
            .OrderBy(hold => hold.Tour.ScheduledStartAt)
            .Select(hold => new RobotAffectedTour(hold.TourId, hold.Tour.Name, hold.Tour.ScheduledStartAt, hold.Tour.State))
            .ToArrayAsync(cancellationToken);
}
