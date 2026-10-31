using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.Application.Common.Abstractions.FleetSync;

/// <summary>Takes a physical robot out of use and back, each in one transaction with its own commit.</summary>
public interface IRobotLifecycleManager
{
    Task<RobotLifecycleResult> DeactivateAsync(Guid robotId, Guid actorUserId, Guid requestId,
        string expectedRowVersion, string reason, CancellationToken cancellationToken);
    Task<RobotLifecycleResult> ActivateAsync(Guid robotId, Guid actorUserId, Guid requestId,
        string expectedRowVersion, CancellationToken cancellationToken);
    Task<IReadOnlyList<RobotAffectedTour>> ListAffectedToursAsync(Guid robotId, Guid? mapVersionId, CancellationToken cancellationToken);
}
