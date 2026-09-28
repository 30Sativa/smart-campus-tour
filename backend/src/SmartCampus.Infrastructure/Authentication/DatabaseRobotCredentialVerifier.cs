using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Features.RobotTelemetry;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Authentication;

/// <summary>
/// Checks the device secret against <c>Robots.CredentialHash</c>. A robot posts
/// several times a second, so a successful check is remembered for 60 s
/// (keyed by the hash of the secret, never the secret itself); a failed one is
/// not cached, so a fixed credential works on the next sample.
/// </summary>
public sealed class DatabaseRobotCredentialVerifier(ApplicationDbContext db, RobotCredentialCache cache, TimeProvider clock) : IRobotCredentialVerifier
{
    public async Task<RobotIdentity?> VerifyAsync(string robotCode, string secret, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(robotCode) || string.IsNullOrEmpty(secret)) return null;
        var key = $"{robotCode}\n{Convert.ToHexString(RobotSecretHash.Compute(secret))}";
        if (cache.TryGet(key, clock.GetUtcNow(), out var cached)) return cached;

        var robot = await db.Robots.AsNoTracking()
            .Where(item => item.RobotCode == robotCode)
            .Select(item => new { item.RobotCode, item.SourceType, item.CredentialHash })
            .SingleOrDefaultAsync(cancellationToken);
        if (robot is null || !RobotSecretHash.Matches(secret, robot.CredentialHash)) return null;

        var identity = new RobotIdentity(robot.RobotCode, RobotSources.FromSourceType(robot.SourceType));
        cache.Set(key, identity, clock.GetUtcNow().AddSeconds(60));
        return identity;
    }
}

/// <summary>Process-wide cache of recently verified robot credentials.</summary>
public sealed class RobotCredentialCache
{
    private readonly ConcurrentDictionary<string, (RobotIdentity Identity, DateTimeOffset Until)> entries = new(StringComparer.Ordinal);

    public bool TryGet(string key, DateTimeOffset now, out RobotIdentity? identity)
    {
        if (entries.TryGetValue(key, out var entry) && entry.Until > now)
        {
            identity = entry.Identity;
            return true;
        }
        identity = null;
        return false;
    }

    public void Set(string key, RobotIdentity identity, DateTimeOffset until) => entries[key] = (identity, until);
}
