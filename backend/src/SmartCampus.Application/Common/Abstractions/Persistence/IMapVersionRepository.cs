using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Persistence operations for map versions and their manual deployment checks.</summary>
public interface IMapVersionRepository
{
    Task<IReadOnlyList<MapArea>> ListMapAreasAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken);
    Task<MapArea?> LockAreaAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapArea?> GetAreaAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapVersion?> FindMapUploadRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<int> GetNextMapVersionAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapVersion?> FindMapVersionAsync(Guid id, bool includePackage, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapVersion>> ListMapVersionsAsync(string? areaKey, int take, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> FindDeploymentRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken cancellationToken);
    Task LockRobotDeploymentStateAsync(Guid robotId, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> GetLatestDeploymentCheckForRobotAsync(Guid robotId, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> GetLatestDeploymentCheckAsync(Guid mapVersionId, Guid? robotId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksForMapAsync(Guid mapVersionId, CancellationToken cancellationToken);
    Task LockMapPreparationStateAsync(Guid mapVersionId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksAsync(Guid mapVersionId, CancellationToken cancellationToken);
    void Add(MapArea area);
    void Add(MapVersion mapVersion);
    void Add(MapDeploymentCheck deploymentCheck);
    void AddAuditLog(AuditLog auditLog);
}
