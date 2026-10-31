using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public enum RobotCredentialOperation { Issue, Rotate, Revoke }

public sealed record RobotCredentialChangeResult(
    string RobotCode, string? Secret, string? Hint, DateTimeOffset? IssuedAt, string Status);

public sealed record RobotCredentialAuditEntry(
    long Id, string RobotCode, string Action, Guid? ActorUserId, string? ActorName,
    string? Hint, string? Reason, string Source, DateTimeOffset OccurredAt, string? ResultCode);

public sealed record RobotCredentialView(
    string RobotCode, string Status, DateTimeOffset? IssuedAt, Guid? IssuedByUserId,
    string? IssuedByName, string? Hint, DateTimeOffset? RevokedAt, Guid? RevokedByUserId,
    string? RevokedByName, string RowVersion, IReadOnlyList<RobotCredentialAuditEntry> History);

public sealed record RobotCredentialAuditFilter(
    string? Action, string? RobotCode, Guid? ActorUserId, DateTimeOffset? From,
    DateTimeOffset? To, int Page, int PageSize = 50);

public interface IPhysicalRobotCredentialManager
{
    Task<RobotCredentialChangeResult> ChangeAsync(
        string robotCode, RobotCredentialOperation operation, Guid requestId, Guid? actorUserId,
        string source, string? expectedRowVersion, string? reason, CancellationToken cancellationToken);

    Task<RobotCredentialView?> GetAsync(string robotCode, CancellationToken cancellationToken);

    Task<PagedResult<RobotCredentialAuditEntry>> ListAuditAsync(
        RobotCredentialAuditFilter filter, CancellationToken cancellationToken);
}
