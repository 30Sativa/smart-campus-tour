using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Persistence operations for map versions and their manual deployment checks.</summary>
public interface IMapVersionRepository
{
    Task<IReadOnlyList<MapArea>> ListMapAreasAsync(CancellationToken cancellationToken);
    Task<MapArea?> LockAreaAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapArea?> GetAreaAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapVersion?> FindMapUploadRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<int> GetNextMapVersionAsync(string areaKey, CancellationToken cancellationToken);
    Task<int?> FindVersionNumberByPackageAsync(string areaKey, byte[] packageSha256, CancellationToken cancellationToken);
    Task<MapVersion?> FindMapVersionAsync(Guid id, bool includePackage, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapVersion>> ListMapVersionsAsync(string? areaKey, int take, bool includeRetired, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksForPhysicalRobotsAsync(CancellationToken cancellationToken);
    /// <summary>Active physical robots holding a map, with that map and its area (ADR-0066 running robot).</summary>
    Task<IReadOnlyList<Robot>> ListAssignedPhysicalRobotsAsync(CancellationToken cancellationToken);
    /// <summary>
    /// A fresh untracked read of the robot with its assigned map and area. Callers take
    /// <see cref="LockRobotDeploymentStateAsync"/> first: assignment, deactivation and key changes hold that lock.
    /// </summary>
    Task<Robot?> ReadRobotForReadinessAsync(Guid robotId, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> FindDeploymentRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken cancellationToken);
    Task LockRobotDeploymentStateAsync(Guid robotId, CancellationToken cancellationToken);
    Task<bool> LockAndReadConnectionConfirmationAsync(Guid robotId, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> GetLatestDeploymentCheckForRobotAsync(Guid robotId, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> GetLatestDeploymentCheckAsync(Guid mapVersionId, Guid? robotId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksForMapAsync(Guid mapVersionId, CancellationToken cancellationToken);
    Task LockMapPreparationStateAsync(Guid mapVersionId, CancellationToken cancellationToken);
    /// <summary>Fresh read of RetiredAt; callers take <see cref="LockMapPreparationStateAsync"/> first (ADR-0041).</summary>
    Task<bool> IsMapVersionRetiredAsync(Guid mapVersionId, CancellationToken cancellationToken);
    /// <summary>Row-locks the version (UPDLOCK, HOLDLOCK) and returns its RetiredAt; Found is false when the version does not exist.</summary>
    Task<(bool Found, DateTimeOffset? RetiredAt)> LockMapVersionRowAsync(Guid mapVersionId, CancellationToken cancellationToken);
    Task SetMapVersionRetirementAsync(Guid mapVersionId, DateTimeOffset? retiredAt, Guid? retiredByUserId, string? reason, CancellationToken cancellationToken);
    Task<MapRetirementImpact> GetMapRetirementImpactAsync(Guid mapVersionId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksAsync(Guid mapVersionId, CancellationToken cancellationToken);
    void Add(MapArea area);
    void Add(MapVersion mapVersion);
    void Add(MapDeploymentCheck deploymentCheck);
    void AddAuditLog(AuditLog auditLog);
}
