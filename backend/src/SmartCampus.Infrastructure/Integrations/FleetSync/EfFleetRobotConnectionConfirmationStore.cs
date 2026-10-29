using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

public sealed class EfFleetRobotConnectionConfirmationStore(ApplicationDbContext dbContext)
    : IFleetRobotConnectionConfirmationStore
{
    public async Task<bool> TryRecordFirstAcceptedAsync(
        string robotCode,
        byte[] verifiedCredentialHash,
        string mapKey,
        string frameId,
        DateTimeOffset acceptedAt,
        CancellationToken cancellationToken)
    {
        var updated = await dbContext.Robots
            .Where(robot => robot.RobotCode == robotCode && robot.SourceType == "PHYSICAL" &&
                robot.CredentialHash == verifiedCredentialHash &&
                robot.FirstAcceptedSyncAt == null && robot.FirstAcceptedMapKey == null &&
                robot.FirstAcceptedFrameId == null)
            .ExecuteUpdateAsync(update => update
                .SetProperty(robot => robot.FirstAcceptedSyncAt, acceptedAt)
                .SetProperty(robot => robot.FirstAcceptedMapKey, mapKey)
                .SetProperty(robot => robot.FirstAcceptedFrameId, frameId), cancellationToken);

        return updated == 1;
    }
}
