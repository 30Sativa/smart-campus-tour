using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>What a browser needs to watch the relay: connect to <c>{WhepUrl}?token={Token}</c> before <see cref="ExpiresAt"/>.</summary>
public sealed record StreamAccess(string WhepUrl, string Token, DateTimeOffset ExpiresAt);

public static class StreamAccessErrors
{
    public const string NotAvailable = "STREAM_NOT_AVAILABLE";

    public static ConflictException NotAvailable_() =>
        new("Hình trực tiếp chưa mở cho phiên này: Tour chưa tới lúc xem, đã kết thúc hoặc không dùng robot có camera.",
            NotAvailable);

    public const string FallbackNotAvailable = "FALLBACK_NOT_AVAILABLE";

    public static ConflictException FallbackNotAvailable_() =>
        new("Video dự phòng chỉ xem được khi Tour đang diễn ra và đã có video dự phòng.", FallbackNotAvailable);
}

/// <summary>ADR-0055: who may watch now. Used when a token is issued and again on every relay connection.</summary>
public sealed class StreamEntitlement(
    StreamRelaySettings settings,
    IStreamEntitlementReader reader,
    ICameraDemandStore cameraDemand,
    TimeProvider clock)
{
    public StreamAccess Issue(string kind, Guid subject)
    {
        var expiresAt = clock.GetUtcNow() + settings.TokenLifetime;
        return new(settings.WhepUrl!, StreamTokens.Issue(settings, kind, subject, settings.RobotCode!, expiresAt), expiresAt);
    }

    /// <summary>A Staff user may watch while a camera lease on the relay's robot is live (ADR-0052).</summary>
    public bool StaffMayWatch(string robotCode)
    {
        if (!settings.Enabled || !string.Equals(robotCode, settings.RobotCode, StringComparison.OrdinalIgnoreCase))
            return false;
        return cameraDemand.GetLease(settings.RobotCode!) is { } until && until > clock.GetUtcNow();
    }

    public Task<bool> StudentMayWatchAsync(Guid sessionId, CancellationToken ct) =>
        settings.Enabled
            ? reader.StudentSessionMayWatchAsync(sessionId, settings.RobotCode!, clock.GetUtcNow(), ct)
            : Task.FromResult(false);

    /// <summary>
    /// The relay's question for a reader. <paramref name="ignoreExpiry"/> is the reaper's recheck of an open connection:
    /// a viewer who connected in time keeps watching while still entitled.
    /// </summary>
    public async Task<bool> TokenMayReadAsync(string? token, bool ignoreExpiry, CancellationToken ct)
    {
        var claims = StreamTokens.Read(settings, token);
        if (claims is null || !string.Equals(claims.RobotCode, settings.RobotCode, StringComparison.OrdinalIgnoreCase))
            return false;
        if (!ignoreExpiry && claims.ExpiresAt <= clock.GetUtcNow())
            return false;
        return claims.Kind switch
        {
            StreamTokenKinds.Staff => StaffMayWatch(claims.RobotCode),
            StreamTokenKinds.Student => await StudentMayWatchAsync(claims.Subject, ct),
            // A fallback token opens only its Tour's fallback path, never the camera.
            _ => false,
        };
    }

    /// <summary>ADR-0063: the relay address and a token for this session's Tour's fallback video.</summary>
    public StreamAccess IssueFallback(Guid sessionId, Guid tourId)
    {
        var expiresAt = clock.GetUtcNow() + settings.TokenLifetime;
        var whepUrl = new Uri(new Uri(settings.WhepUrl!), "/" + FallbackPaths.For(tourId) + "/whep").ToString();
        return new(whepUrl, StreamTokens.Issue(settings, StreamTokenKinds.Fallback, sessionId, settings.RobotCode!, expiresAt), expiresAt);
    }

    /// <summary>ADR-0063: the session may watch its Tour's fallback video only while that Tour is RUNNING.</summary>
    public Task<bool> StudentMayWatchFallbackAsync(Guid sessionId, Guid tourId, CancellationToken ct) =>
        settings.Enabled
            ? reader.StudentSessionMayWatchFallbackAsync(sessionId, tourId, clock.GetUtcNow(), ct)
            : Task.FromResult(false);

    /// <summary>The relay's question for a reader of <c>fallback-{tourId}</c>; as <see cref="TokenMayReadAsync"/>.</summary>
    public async Task<bool> TokenMayReadFallbackAsync(string? token, Guid tourId, bool ignoreExpiry, CancellationToken ct)
    {
        var claims = StreamTokens.Read(settings, token);
        if (claims is null || claims.Kind != StreamTokenKinds.Fallback
            || !string.Equals(claims.RobotCode, settings.RobotCode, StringComparison.OrdinalIgnoreCase))
            return false;
        if (!ignoreExpiry && claims.ExpiresAt <= clock.GetUtcNow())
            return false;
        return await StudentMayWatchFallbackAsync(claims.Subject, tourId, ct);
    }
}
