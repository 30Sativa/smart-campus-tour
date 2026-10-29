using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

public sealed record FleetRobotCredentialProvisionResult(string RobotCode, string Credential);

/// <summary>One-shot operator tooling; never registered as a runtime API capability.</summary>
public sealed class FleetRobotCredentialProvisioner
{
    public async Task<FleetRobotCredentialProvisionResult?> ProvisionAsync(
        string connectionString,
        string robotCode,
        CancellationToken cancellationToken = default)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        await using var dbContext = new ApplicationDbContext(options);
        return await ProvisionAsync(dbContext, robotCode, cancellationToken);
    }

    public async Task<FleetRobotCredentialProvisionResult?> ProvisionAsync(
        ApplicationDbContext dbContext,
        string robotCode,
        CancellationToken cancellationToken = default)
    {
        var current = await dbContext.Robots.AsNoTracking()
            .Where(robot => robot.RobotCode == robotCode && robot.SourceType == "PHYSICAL")
            .Select(robot => new { robot.CredentialHash, robot.RowVersion })
            .SingleOrDefaultAsync(cancellationToken);
        if (current is null) return null;

        var operation = current.CredentialHash is null
            ? RobotCredentialOperation.Issue
            : RobotCredentialOperation.Rotate;
        var result = await new EfPhysicalRobotCredentialManager(dbContext, TimeProvider.System)
            .ChangeAsync(robotCode, operation, Guid.NewGuid(), null,
                "CLI", Convert.ToBase64String(current.RowVersion), reason: null, cancellationToken);
        return result.Secret is null ? null : new FleetRobotCredentialProvisionResult(robotCode, result.Secret);
    }
}
