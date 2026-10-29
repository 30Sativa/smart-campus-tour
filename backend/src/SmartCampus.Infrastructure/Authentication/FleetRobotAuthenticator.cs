using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Authentication;

public sealed class FleetRobotAuthenticator(ApplicationDbContext dbContext) : IFleetRobotAuthenticator
{
    public async Task<FleetRobotAuthenticationProof?> AuthenticateAsync(
        string robotCode,
        string credential,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(robotCode) || !FleetRobotCredentialHash.IsValidFormat(credential))
            return null;

        var robot = await dbContext.Robots.AsNoTracking()
            .Where(candidate => candidate.RobotCode == robotCode)
            .Select(candidate => new
            {
                candidate.RobotCode,
                candidate.SourceType,
                candidate.DisplayName,
                candidate.NeedsInspection,
                candidate.CredentialHash,
                candidate.FirstAcceptedSyncAt
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (robot is null || !FleetRobotCredentialHash.Verify(credential, robot.CredentialHash))
            return null;

        return new FleetRobotAuthenticationProof(
            new FleetRobotIdentity(robot.RobotCode, robot.SourceType, robot.DisplayName, robot.NeedsInspection),
            robot.CredentialHash.ToArray(),
            robot.FirstAcceptedSyncAt is not null);
    }
}
