using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IPhysicalRobotRepository
{
    Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksAsync(CancellationToken cancellationToken);
    Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken);
    void Add(Robot robot);
    void AddAuditLog(AuditLog auditLog);
}
