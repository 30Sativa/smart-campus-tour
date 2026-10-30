using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public interface IRobotMapAssignmentManager
{
    Task<RobotMapAssignmentView> ChangeAsync(Guid robotId, Guid actorUserId, Guid requestId,
        string expectedRowVersion, Guid? mapVersionId, CancellationToken cancellationToken);
}
