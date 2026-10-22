using Microsoft.EntityFrameworkCore;
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
        var credential = FleetRobotCredentialHash.Create();
        var updated = await dbContext.Robots
            .Where(robot => robot.RobotCode == robotCode)
            .ExecuteUpdateAsync(update => update.SetProperty(robot => robot.CredentialHash, credential.Hash),
                cancellationToken);

        return updated == 1
            ? new FleetRobotCredentialProvisionResult(robotCode, credential.Secret)
            : null;
    }
}
