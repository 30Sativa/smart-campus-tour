using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.TourTalk;

namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>
/// ADR-0072: the relay path that carries one Tour's live guide voice, <c>voice-{tourId:N}</c>. The Operator publishes
/// it over WHIP while the talk channel is open; every invited Viewer of that Tour reads it over WHEP.
/// </summary>
public static class GuideVoicePaths
{
    private const string Prefix = "voice-";

    public static string For(Guid tourId) => Prefix + tourId.ToString("N");

    /// <summary>True only for the exact form <see cref="For"/> makes (lower-case, no dashes).</summary>
    public static bool TryParse(string? path, out Guid tourId)
    {
        tourId = Guid.Empty;
        return path is { Length: 38 } && path.StartsWith(Prefix, StringComparison.Ordinal)
            && Guid.TryParseExact(path[Prefix.Length..], "N", out tourId) && path == For(tourId);
    }
}

/// <summary>
/// What a browser needs for the guide voice: connect to <see cref="Url"/> (WHIP for the Operator, WHEP for a Viewer)
/// with <c>?token={Token}</c> before <see cref="ExpiresAt"/>.
/// </summary>
public sealed record GuideVoiceAccess(string Url, string Token, DateTimeOffset ExpiresAt);

public static class GuideVoiceErrors
{
    public const string NotAvailable = "VOICE_NOT_AVAILABLE";

    public static ConflictException NotAvailable_() =>
        new("Kênh nói trực tiếp chưa được cấu hình trên máy chủ phát hình. Hãy nhắn bằng chữ.", NotAvailable);
}

/// <summary>
/// ADR-0072: who may speak on and listen to a Tour's guide voice. The same window as Tour talk (ADR-0070): from 15
/// minutes before the planned start until the Tour ends. Checked when a token is issued and on every relay connection.
/// </summary>
public sealed class GuideVoiceEntitlement(
    StreamRelaySettings settings,
    ITourTalkReader tours,
    IStreamEntitlementReader sessions,
    TimeProvider clock)
{
    /// <summary>Only the Operator assigned to the Tour speaks, and only while the talk window is open.</summary>
    public async Task<bool> OperatorMaySpeakAsync(Guid userId, Guid tourId, CancellationToken ct) =>
        settings.Enabled && await tours.GetTourAsync(tourId, ct) is { } tour && tour.OperatorUserId == userId
            && TourTalkWindow.IsOpen(tour.State, tour.ScheduledStartAt, clock.GetUtcNow());

    /// <summary>An admitted session of this Tour listens while the talk window is open.</summary>
    public async Task<bool> SessionMayListenAsync(Guid sessionId, Guid tourId, CancellationToken ct)
    {
        if (!settings.Enabled) return false;
        var now = clock.GetUtcNow();
        return await sessions.StudentSessionIsInTourAsync(sessionId, tourId, now, ct)
            && await tours.GetTourAsync(tourId, ct) is { } tour && TourTalkWindow.IsOpen(tour.State, tour.ScheduledStartAt, now);
    }

    public GuideVoiceAccess IssuePublish(Guid userId, Guid tourId) => Issue(StreamTokenKinds.VoicePublisher, userId, tourId, "whip");

    public GuideVoiceAccess IssueListen(Guid sessionId, Guid tourId) => Issue(StreamTokenKinds.VoiceListener, sessionId, tourId, "whep");

    /// <summary>
    /// The relay's question for <c>voice-{tourId}</c>: a publisher token only publishes, a listener token only reads.
    /// A null <paramref name="action"/> is the reaper's recheck of an open session, which may be either; it ignores expiry.
    /// </summary>
    public async Task<bool> TokenMayAsync(string? action, string? token, Guid tourId, CancellationToken ct)
    {
        var claims = StreamTokens.Read(settings, token);
        if (claims is null || !string.Equals(claims.RobotCode, settings.RobotCode, StringComparison.OrdinalIgnoreCase))
            return false;
        if (action is not null && claims.ExpiresAt <= clock.GetUtcNow())
            return false;
        return (claims.Kind, action) switch
        {
            (StreamTokenKinds.VoicePublisher, "publish" or null) => await OperatorMaySpeakAsync(claims.Subject, tourId, ct),
            (StreamTokenKinds.VoiceListener, "read" or null) => await SessionMayListenAsync(claims.Subject, tourId, ct),
            _ => false,
        };
    }

    private GuideVoiceAccess Issue(string kind, Guid subject, Guid tourId, string endpoint)
    {
        var expiresAt = clock.GetUtcNow() + settings.TokenLifetime;
        var url = new Uri(new Uri(settings.WhepUrl!), "/" + GuideVoicePaths.For(tourId) + "/" + endpoint).ToString();
        return new(url, StreamTokens.Issue(settings, kind, subject, settings.RobotCode!, expiresAt), expiresAt);
    }
}
