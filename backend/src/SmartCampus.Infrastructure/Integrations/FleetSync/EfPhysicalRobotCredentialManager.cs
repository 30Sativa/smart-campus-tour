using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

public sealed class EfPhysicalRobotCredentialManager(
    ApplicationDbContext dbContext,
    TimeProvider timeProvider) : IPhysicalRobotCredentialManager
{
    public async Task<PhysicalRobotCredentialIssue> IssueAsync(
        Guid actorUserId, Guid robotId, string expectedRowVersion, bool rotate,
        CancellationToken cancellationToken)
    {
        var expected = Convert.FromBase64String(expectedRowVersion);
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var current = await dbContext.Robots.AsNoTracking()
            .Where(robot => robot.Id == robotId && robot.SourceType == "PHYSICAL")
            .Select(robot => new { robot.Id, robot.RobotCode, robot.CredentialHash, robot.RowVersion })
            .SingleOrDefaultAsync(cancellationToken);

        if (current is null)
            throw new NotFoundException("Physical robot", robotId);
        if (!current.RowVersion.AsSpan().SequenceEqual(expected))
        {
            if (!rotate && current.CredentialHash.Length == 32)
                throw AlreadyProvisioned();
            throw new ConflictException("The robot changed. Reload it and retry the intended credential operation.",
                "ROBOT_CONCURRENCY_CONFLICT");
        }

        var provisioned = current.CredentialHash.Length == 32;
        if (rotate && !provisioned)
            throw new ConflictException("The robot has no credential to rotate. Issue its first credential instead.",
                "ROBOT_CREDENTIAL_NOT_PROVISIONED");
        if (!rotate && provisioned)
            throw AlreadyProvisioned();

        var credential = FleetRobotCredentialHash.Create();
        var changed = await dbContext.Robots
            .Where(robot => robot.Id == robotId && robot.SourceType == "PHYSICAL" &&
                robot.RowVersion == expected && (rotate
                    ? robot.CredentialHash.Length == 32
                    : robot.CredentialHash.Length != 32))
            .ExecuteUpdateAsync(update => update
                .SetProperty(robot => robot.CredentialHash, credential.Hash)
                .SetProperty(robot => robot.FirstAcceptedSyncAt, (DateTimeOffset?)null)
                .SetProperty(robot => robot.FirstAcceptedMapKey, (string?)null)
                .SetProperty(robot => robot.FirstAcceptedFrameId, (string?)null), cancellationToken);

        if (changed != 1)
        {
            if (!rotate && await dbContext.Robots.AsNoTracking()
                    .AnyAsync(robot => robot.Id == robotId && robot.SourceType == "PHYSICAL" &&
                        robot.CredentialHash.Length == 32, cancellationToken))
                throw AlreadyProvisioned();
            throw new ConflictException("The robot changed. Reload it and retry the intended credential operation.",
                "ROBOT_CONCURRENCY_CONFLICT");
        }

        var newVersion = await dbContext.Robots.AsNoTracking()
            .Where(robot => robot.Id == robotId)
            .Select(robot => robot.RowVersion)
            .SingleAsync(cancellationToken);

        dbContext.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actorUserId,
            RobotId = robotId,
            Action = rotate ? "PHYSICAL_ROBOT_CREDENTIAL_ROTATED" : "PHYSICAL_ROBOT_CREDENTIAL_ISSUED",
            EntityType = "Robot",
            EntityId = robotId.ToString("D"),
            ResultCode = "SUCCESS",
            OccurredAt = timeProvider.GetUtcNow()
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new PhysicalRobotCredentialIssue(robotId, current.RobotCode, credential.Secret,
            Convert.ToBase64String(newVersion));
    }

    private static ConflictException AlreadyProvisioned() => new(
        "The robot already has a credential. A lost one-time response cannot be recovered; use explicit rotate only to invalidate it and issue another credential.",
        "ROBOT_CREDENTIAL_ALREADY_PROVISIONED");
}
