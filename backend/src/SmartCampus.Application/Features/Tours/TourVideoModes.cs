namespace SmartCampus.Application.Features.Tours;

/// <summary>
/// ADR-0075: what Viewers of a RUNNING Tour watch, set only by its Operator. The mode is the newest
/// <see cref="TourLifecycleEvents.VideoFallbackStarted"/> / <see cref="TourLifecycleEvents.VideoLiveRestored"/> event;
/// a Tour with neither is <see cref="Live"/>.
/// </summary>
public static class TourVideoModes
{
    public const string Live = "LIVE";
    public const string Fallback = "FALLBACK";

    public const string InvalidCode = "VIDEO_MODE_INVALID";

    /// <summary>The mode an event of the video history sets; <see cref="Live"/> for none.</summary>
    public static string Of(string? eventType) =>
        eventType == TourLifecycleEvents.VideoFallbackStarted ? Fallback : Live;
}

/// <summary>
/// ADR-0075: the newest switch of a Tour's video mode. <see cref="Since"/>, <see cref="ActorName"/> and
/// <see cref="Reason"/> are null while the Tour never switched.
/// </summary>
public sealed record TourVideoModeView(string Mode, DateTimeOffset? Since, string? ActorName, string? Reason, bool HasFallbackVideo);
