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
                candidate.FirstAcceptedSyncAt,
                AssignedMapKey = candidate.AssignedMapVersion == null ? null : candidate.AssignedMapVersion.MapKey,
                AssignedFrameId = candidate.AssignedMapVersion == null ? null : candidate.AssignedMapVersion.FrameId
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (robot?.CredentialHash is not { Length: 32 } hash ||
            !FleetRobotCredentialHash.Verify(credential, hash))
            return null;

        return new FleetRobotAuthenticationProof(
            new FleetRobotIdentity(robot.RobotCode, robot.SourceType, robot.DisplayName, robot.NeedsInspection,
                robot.AssignedMapKey, robot.AssignedFrameId),
            hash.ToArray(),
            robot.FirstAcceptedSyncAt is not null);
    }
}
