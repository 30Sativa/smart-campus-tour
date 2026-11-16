namespace SmartCampus.Application.Features.Invitations;

/// <summary>The reconnect grace is independent of the longer inactivity lease.</summary>
public static class ViewerReconnectPolicy
{
    public static readonly TimeSpan GracePeriod = TimeSpan.FromMinutes(2);

    public static bool IsWithinGrace(DateTimeOffset? lastSeenAt, DateTimeOffset now) =>
        lastSeenAt is not null && lastSeenAt >= now - GracePeriod;

    /// <summary>A session still holds its invitation only while it is not ended and its lease has not passed.</summary>
    public static bool IsOpen(DateTimeOffset? endedAt, DateTimeOffset expiresAt, DateTimeOffset now) =>
        endedAt is null && expiresAt > now;

    /// <summary>
    /// Viewer-side state of one invitation. Shared by GET invitations and the reconnect error so they cannot drift.
    /// <paramref name="hasEverEntered"/>: any browser session ever existed for the invitation.
    /// <paramref name="openLastSeenAt"/>/<paramref name="hasOpenSession"/>: the session that is open per <see cref="IsOpen"/>.
    /// </summary>
    public static string Presence(bool hasEverEntered, bool hasOpenSession, DateTimeOffset? openLastSeenAt, DateTimeOffset now) =>
        hasOpenSession
            ? IsWithinGrace(openLastSeenAt, now) ? ViewerPresences.Connected : ViewerPresences.Disconnected
            : hasEverEntered ? ViewerPresences.Left : ViewerPresences.NotEntered;
}

public static class ViewerPresences
{
    public const string NotEntered = "NOT_ENTERED";
    public const string Connected = "CONNECTED";
    public const string Disconnected = "DISCONNECTED";
    public const string Left = "LEFT";
}
