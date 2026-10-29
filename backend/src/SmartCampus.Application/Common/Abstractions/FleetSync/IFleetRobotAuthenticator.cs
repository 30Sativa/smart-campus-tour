namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public sealed record FleetRobotIdentity(
    string RobotCode,
    string SourceType,
    string? DisplayName,
    bool NeedsInspection);

// Authentication-only proof: never put the hash in claims, public DTOs, telemetry snapshots or hub projections.
public sealed record FleetRobotAuthenticationProof(FleetRobotIdentity Identity, byte[] VerifiedCredentialHash);

public interface IFleetRobotAuthenticator
{
    Task<FleetRobotAuthenticationProof?> AuthenticateAsync(
        string robotCode,
        string credential,
        CancellationToken cancellationToken);
}

public interface IFleetRobotConnectionConfirmationStore
{
    Task<bool> TryRecordFirstAcceptedAsync(
        string robotCode,
        byte[] verifiedCredentialHash,
        string mapKey,
        string frameId,
        DateTimeOffset acceptedAt,
        CancellationToken cancellationToken);
}
