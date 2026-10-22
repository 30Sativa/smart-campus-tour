namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public sealed record FleetRobotIdentity(
    string RobotCode,
    string SourceType,
    string? DisplayName,
    bool NeedsInspection);

public interface IFleetRobotAuthenticator
{
    Task<FleetRobotIdentity?> AuthenticateAsync(
        string robotCode,
        string credential,
        CancellationToken cancellationToken);
}
