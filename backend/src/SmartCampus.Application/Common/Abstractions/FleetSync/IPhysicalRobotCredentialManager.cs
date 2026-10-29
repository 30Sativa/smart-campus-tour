namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public sealed record PhysicalRobotCredentialIssue(
    Guid RobotId, string RobotCode, string Credential, string RowVersion);

public interface IPhysicalRobotCredentialManager
{
    Task<PhysicalRobotCredentialIssue> IssueAsync(
        Guid actorUserId, Guid robotId, string expectedRowVersion, bool rotate,
        CancellationToken cancellationToken);
}
