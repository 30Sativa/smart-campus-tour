using System.Text.Json;
using FluentValidation;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Common.Models;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

public sealed class EfPhysicalRobotCredentialManager(
    ApplicationDbContext dbContext,
    TimeProvider timeProvider) : IPhysicalRobotCredentialManager
{
    private sealed record AuditProjection(
        long Id, string RobotCode, string Action, Guid? ActorUserId, string? ActorName,
        string? DataJson, DateTimeOffset OccurredAt, string? ResultCode);

    private const int AuditPageSize = 50;
    private const string Issued = "ROBOT_CREDENTIAL_ISSUED";
    private const string Rotated = "ROBOT_CREDENTIAL_ROTATED";
    private const string Revoked = "ROBOT_CREDENTIAL_REVOKED";

    public async Task<RobotCredentialChangeResult> ChangeAsync(
        string robotCode, RobotCredentialOperation operation, Guid requestId, Guid? actorUserId,
        string source, string? expectedRowVersion, string? reason, CancellationToken cancellationToken)
    {
        if (requestId == Guid.Empty) throw new ValidationException("RequestId is required.");
        if (source is not ("WEB" or "CLI") || (source == "WEB" && actorUserId is null))
            throw new ValidationException("Credential change source or actor is invalid.");
        if (operation == RobotCredentialOperation.Revoke &&
            (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 500))
            throw new ValidationException("Revoke requires a reason of 1 to 500 characters.");

        var normalizedReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        var expected = ParseExpectedRowVersion(expectedRowVersion);
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable, cancellationToken);

        var robot = await dbContext.Robots.AsNoTracking()
            .Where(candidate => candidate.RobotCode == robotCode && candidate.SourceType == "PHYSICAL")
            .Select(candidate => new
            {
                candidate.Id, candidate.RobotCode, candidate.CredentialHash, candidate.CredentialHint,
                candidate.RowVersion
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (robot is null) throw new NotFoundException("Physical robot", robotCode);

        var priorRequest = await dbContext.AuditLogs.AsNoTracking().AnyAsync(audit =>
            audit.RobotId == robot.Id && audit.CorrelationId == requestId &&
            (audit.Action == Issued || audit.Action == Rotated || audit.Action == Revoked), cancellationToken);
        if (priorRequest)
            throw new ConflictException("RequestId was already used for this robot credential operation; secrets are never returned on replay.",
                "CREDENTIAL_REQUEST_REPLAYED");

        var hasActiveCredential = robot.CredentialHash is not null;
        if (operation == RobotCredentialOperation.Issue && hasActiveCredential)
            throw new ConflictException("The robot already has an active credential. Use rotate to replace it.",
                "CREDENTIAL_ALREADY_ACTIVE");
        if (operation is RobotCredentialOperation.Rotate or RobotCredentialOperation.Revoke && !hasActiveCredential)
            throw new ConflictException("The robot has no active credential.", "CREDENTIAL_NOT_ACTIVE");
        if (expected is not null && !robot.RowVersion.AsSpan().SequenceEqual(expected))
            throw ConcurrencyConflict();

        var now = timeProvider.GetUtcNow();
        FleetRobotCredential? generated = operation is RobotCredentialOperation.Issue or RobotCredentialOperation.Rotate
            ? FleetRobotCredentialHash.Create() : null;
        var hint = generated?.Secret[^4..] ?? robot.CredentialHint;
        var rowVersion = robot.RowVersion;
        var query = dbContext.Robots.Where(candidate => candidate.Id == robot.Id &&
            candidate.SourceType == "PHYSICAL" && candidate.RowVersion == rowVersion &&
            (operation == RobotCredentialOperation.Issue
                ? candidate.CredentialHash == null
                : candidate.CredentialHash != null));

        var changed = operation switch
        {
            RobotCredentialOperation.Issue or RobotCredentialOperation.Rotate => await query.ExecuteUpdateAsync(update => update
                .SetProperty(candidate => candidate.CredentialHash, generated!.Hash)
                .SetProperty(candidate => candidate.CredentialIssuedAt, (DateTimeOffset?)now)
                .SetProperty(candidate => candidate.CredentialIssuedByUserId, actorUserId)
                .SetProperty(candidate => candidate.CredentialHint, hint)
                .SetProperty(candidate => candidate.CredentialRevokedAt, (DateTimeOffset?)null)
                .SetProperty(candidate => candidate.CredentialRevokedByUserId, (Guid?)null)
                .SetProperty(candidate => candidate.FirstAcceptedSyncAt, (DateTimeOffset?)null)
                .SetProperty(candidate => candidate.FirstAcceptedMapKey, (string?)null)
                .SetProperty(candidate => candidate.FirstAcceptedFrameId, (string?)null), cancellationToken),
            RobotCredentialOperation.Revoke => await query.ExecuteUpdateAsync(update => update
                .SetProperty(candidate => candidate.CredentialHash, (byte[]?)null)
                .SetProperty(candidate => candidate.CredentialRevokedAt, (DateTimeOffset?)now)
                .SetProperty(candidate => candidate.CredentialRevokedByUserId, actorUserId)
                .SetProperty(candidate => candidate.FirstAcceptedSyncAt, (DateTimeOffset?)null)
                .SetProperty(candidate => candidate.FirstAcceptedMapKey, (string?)null)
                .SetProperty(candidate => candidate.FirstAcceptedFrameId, (string?)null), cancellationToken),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };

        if (changed != 1) throw ConcurrencyConflict();

        var action = operation switch
        {
            RobotCredentialOperation.Issue => Issued,
            RobotCredentialOperation.Rotate => Rotated,
            RobotCredentialOperation.Revoke => Revoked,
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
        dbContext.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actorUserId,
            RobotId = robot.Id,
            CorrelationId = requestId,
            Action = action,
            EntityType = "Robot",
            EntityId = robot.Id.ToString("D"),
            ResultCode = "SUCCESS",
            DataJson = JsonSerializer.Serialize(new
            {
                robotCode = robot.RobotCode,
                hint,
                reason = normalizedReason,
                source
            }),
            OccurredAt = now
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsCredentialRequestUniqueViolation(exception))
        {
            throw new ConflictException("RequestId was already used for this robot credential operation; secrets are never returned on replay.",
                "CREDENTIAL_REQUEST_REPLAYED");
        }

        return new RobotCredentialChangeResult(robot.RobotCode, generated?.Secret,
            operation == RobotCredentialOperation.Revoke ? hint : generated!.Secret[^4..],
            generated is null ? null : now,
            operation == RobotCredentialOperation.Revoke ? "REVOKED" : "ACTIVE");
    }

    public async Task<RobotCredentialView?> GetAsync(string robotCode, CancellationToken cancellationToken)
    {
        var robot = await dbContext.Robots.AsNoTracking()
            .Include(candidate => candidate.CredentialIssuedByUser)
            .Include(candidate => candidate.CredentialRevokedByUser)
            .SingleOrDefaultAsync(candidate => candidate.RobotCode == robotCode && candidate.SourceType == "PHYSICAL",
                cancellationToken);
        if (robot is null) return null;

        var history = await dbContext.AuditLogs.AsNoTracking()
            .Where(audit => audit.RobotId == robot.Id && IsCredentialAction(audit.Action))
            .OrderByDescending(audit => audit.OccurredAt).ThenByDescending(audit => audit.Id)
            .Select(audit => new AuditProjection(audit.Id, robot.RobotCode, audit.Action,
                audit.ActorUserId, audit.ActorUser == null ? null : audit.ActorUser.FullName,
                audit.DataJson, audit.OccurredAt, audit.ResultCode))
            .ToArrayAsync(cancellationToken);

        return new RobotCredentialView(robot.RobotCode, GetStatus(robot), robot.CredentialIssuedAt,
            robot.CredentialIssuedByUserId, robot.CredentialIssuedByUser?.FullName, robot.CredentialHint,
            robot.CredentialRevokedAt, robot.CredentialRevokedByUserId,
            robot.CredentialRevokedByUser?.FullName, Convert.ToBase64String(robot.RowVersion),
            history.Select(ToAuditEntry).ToArray());
    }

    public async Task<PagedResult<RobotCredentialAuditEntry>> ListAuditAsync(
        RobotCredentialAuditFilter filter, CancellationToken cancellationToken)
    {
        var query = dbContext.AuditLogs.AsNoTracking()
            .Where(audit => audit.Action == Issued || audit.Action == Rotated || audit.Action == Revoked);
        if (!string.IsNullOrWhiteSpace(filter.Action)) query = query.Where(audit => audit.Action == filter.Action);
        if (!string.IsNullOrWhiteSpace(filter.RobotCode))
            query = query.Where(audit => audit.Robot != null && audit.Robot.RobotCode == filter.RobotCode);
        if (filter.ActorUserId.HasValue) query = query.Where(audit => audit.ActorUserId == filter.ActorUserId);
        if (filter.From.HasValue) query = query.Where(audit => audit.OccurredAt >= filter.From.Value);
        if (filter.To.HasValue) query = query.Where(audit => audit.OccurredAt <= filter.To.Value);

        var total = await query.LongCountAsync(cancellationToken);
        var rows = await query.OrderByDescending(audit => audit.OccurredAt).ThenByDescending(audit => audit.Id)
            .Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .Select(audit => new AuditProjection(audit.Id, audit.Robot!.RobotCode, audit.Action,
                audit.ActorUserId, audit.ActorUser == null ? null : audit.ActorUser.FullName,
                audit.DataJson, audit.OccurredAt, audit.ResultCode)).ToArrayAsync(cancellationToken);

        return new PagedResult<RobotCredentialAuditEntry>(rows.Select(ToAuditEntry).ToArray(),
            filter.Page, filter.PageSize, total);
    }

    private static RobotCredentialAuditEntry ToAuditEntry(AuditProjection row)
    {
        string? hint = null;
        string? reason = null;
        var source = "WEB";
        try
        {
            using var data = JsonDocument.Parse(row.DataJson ?? "{}");
            var root = data.RootElement;
            hint = root.TryGetProperty("hint", out var hintValue) && hintValue.ValueKind == JsonValueKind.String
                ? hintValue.GetString() : null;
            reason = root.TryGetProperty("reason", out var reasonValue) && reasonValue.ValueKind == JsonValueKind.String
                ? reasonValue.GetString() : null;
            source = root.TryGetProperty("source", out var sourceValue) && sourceValue.ValueKind == JsonValueKind.String
                ? sourceValue.GetString() ?? "WEB" : "WEB";
        }
        catch (JsonException) { }

        return new RobotCredentialAuditEntry(row.Id, row.RobotCode, row.Action, row.ActorUserId,
            row.ActorName, hint, reason, source, row.OccurredAt, row.ResultCode);
    }

    private static string GetStatus(Robot robot) => robot.CredentialHash is not null
        ? "ACTIVE" : robot.CredentialRevokedAt is not null ? "REVOKED" : "NOT_ISSUED";

    private static bool IsCredentialAction(string action) => action == Issued || action == Rotated || action == Revoked;

    private static byte[]? ParseExpectedRowVersion(string? expectedRowVersion)
    {
        if (expectedRowVersion is null) return null;
        try
        {
            var bytes = Convert.FromBase64String(expectedRowVersion);
            if (bytes.Length == 8 && string.Equals(Convert.ToBase64String(bytes), expectedRowVersion, StringComparison.Ordinal))
                return bytes;
        }
        catch (FormatException) { }
        throw new ValidationException("ExpectedRowVersion must be a base64-encoded SQL rowversion.");
    }

    private static ConflictException ConcurrencyConflict() => new(
        "The robot changed during this credential operation. Reload its current state and try again.",
        "ROBOT_CONCURRENCY_CONFLICT");

    private static bool IsCredentialRequestUniqueViolation(Exception error) =>
        (error is SqlException { Number: 2601 or 2627 } sql &&
         sql.Message.Contains("UX_AuditLogs_RobotCredentialRequest", StringComparison.Ordinal)) ||
        (error.InnerException is not null && IsCredentialRequestUniqueViolation(error.InnerException));
}
