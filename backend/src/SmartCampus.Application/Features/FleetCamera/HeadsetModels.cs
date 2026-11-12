namespace SmartCampus.Application.Features.FleetCamera;

/// <summary>
/// The Quest headset as the robot's quest-stream service reads it over adb (ADR-0056), sent with each camera poll.
/// Values are normalised on arrival; an unknown word becomes <c>unknown</c> instead of failing the poll, so a
/// newer or older NUC never loses camera control over a status field.
/// <see cref="Screen"/> (ADR-0056 addendum) is <c>awake</c>, <c>asleep</c> or <c>unknown</c> (quest-stream could not
/// tell); null means a quest-stream too old to report it, which also cannot run wake/sleep presses.
/// </summary>
public sealed record HeadsetReport(string Connection, int? BatteryPercent, bool? Charging, string? Stream, string? Screen = null);

/// <summary>What Staff see about a robot's headset. <see cref="Stale"/>: the last report is older than the listening window.</summary>
public sealed record RobotHeadsetStatus(
    string RobotCode,
    bool Reported,
    string? Connection,
    int? BatteryPercent,
    bool? Charging,
    string? Stream,
    DateTimeOffset? ReportedAt,
    bool Stale,
    string? Screen = null);

public static class HeadsetReports
{
    private static readonly string[] Connections = { "connected", "unauthorized", "offline", "not_found", "adb_error", "unknown" };
    private static readonly string[] Streams = { "live", "connecting", "paused", "lost" };
    private static readonly string[] Screens = { "awake", "asleep", "unknown" };

    /// <summary>
    /// Lower-cased known words, battery clamped to 0..100; a missing or unknown connection is <c>unknown</c>, an unknown
    /// stream is null, a missing screen stays null and an unknown word for it becomes <c>unknown</c>.
    /// </summary>
    public static HeadsetReport Normalise(string? connection, int? batteryPercent, bool? charging, string? stream,
        string? screen = null)
    {
        string c = (connection ?? "").Trim().ToLowerInvariant();
        string s = (stream ?? "").Trim().ToLowerInvariant();
        string sc = (screen ?? "").Trim().ToLowerInvariant();
        return new HeadsetReport(
            Array.IndexOf(Connections, c) >= 0 ? c : "unknown",
            batteryPercent is { } level ? Math.Clamp(level, 0, 100) : null,
            charging,
            Array.IndexOf(Streams, s) >= 0 ? s : null,
            screen is null ? null : Array.IndexOf(Screens, sc) >= 0 ? sc : "unknown");
    }
}

/// <summary>The two buttons of the ADR-0056 addendum: wake the headset's display, or put it to sleep.</summary>
public static class HeadsetActions
{
    public const string Wake = "WAKE";
    public const string Sleep = "SLEEP";

    public static bool IsKnown(string? action) => action is Wake or Sleep;
}

/// <summary>One Staff press waiting for the robot's next camera poll; never delivered after <see cref="ExpiresAt"/>.</summary>
public sealed record HeadsetCommand(Guid Id, string Action, DateTimeOffset IssuedAt, DateTimeOffset ExpiresAt);

/// <summary>What the robot receives with its camera poll: run <see cref="Action"/> on the headset once.</summary>
public sealed record HeadsetCommandOrder(Guid Id, string Action);
