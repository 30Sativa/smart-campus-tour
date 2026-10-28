namespace SmartCampus.Application.Features.Invitations;

/// <summary>The reconnect grace is independent of the longer inactivity lease.</summary>
public static class ViewerReconnectPolicy
{
    public static readonly TimeSpan GracePeriod = TimeSpan.FromMinutes(2);

    public static bool IsWithinGrace(DateTimeOffset? lastSeenAt, DateTimeOffset now) =>
        lastSeenAt is not null && lastSeenAt >= now - GracePeriod;
}
