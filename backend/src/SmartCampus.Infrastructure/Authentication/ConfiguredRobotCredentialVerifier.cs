using Microsoft.Extensions.Configuration;
using SmartCampus.Application.Features.RobotTelemetry;

namespace SmartCampus.Infrastructure.Authentication;

/// <summary>
/// Robots declared in configuration, for running without SQL Server (the
/// Development preview) and for tests:
/// <code>
/// "RobotTelemetry": { "Robots": [ { "RobotCode": "robot_01", "Source": "gazebo", "SecretSha256": "&lt;64 hex&gt;" } ] }
/// </code>
/// Only the SHA-256 of the secret is configured; the secret itself stays on the robot.
/// </summary>
public sealed class ConfiguredRobotCredentialVerifier : IRobotCredentialVerifier
{
    private readonly Dictionary<string, (string Source, byte[] Hash)> robots = new(StringComparer.Ordinal);

    public ConfiguredRobotCredentialVerifier(IConfiguration configuration)
    {
        foreach (var entry in configuration.GetSection("RobotTelemetry:Robots").GetChildren())
        {
            var code = entry["RobotCode"];
            var source = entry["Source"]?.Trim().ToLowerInvariant();
            var hash = RobotSecretHash.FromHex(entry["SecretSha256"]);
            if (string.IsNullOrWhiteSpace(code) || source is null || !RobotSources.All.Contains(source) || hash is not { Length: 32 })
                throw new InvalidOperationException("Each RobotTelemetry:Robots entry needs RobotCode, Source (physical|gazebo|emulator) and a 64-hex SecretSha256.");
            robots[code] = (source, hash);
        }
    }

    public Task<RobotIdentity?> VerifyAsync(string robotCode, string secret, CancellationToken cancellationToken)
    {
        RobotIdentity? identity = robots.TryGetValue(robotCode, out var robot) && RobotSecretHash.Matches(secret, robot.Hash)
            ? new RobotIdentity(robotCode, robot.Source)
            : null;
        return Task.FromResult(identity);
    }
}
