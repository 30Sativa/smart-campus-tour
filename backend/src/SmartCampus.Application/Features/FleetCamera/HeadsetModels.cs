namespace SmartCampus.Application.Features.FleetCamera;

/// <summary>
/// The Quest headset as the robot's quest-stream service reads it over adb (ADR-0056), sent with each camera poll.
/// Values are normalised on arrival; an unknown word becomes <c>unknown</c> instead of failing the poll, so a
/// newer or older NUC never loses camera control over a status field.
/// </summary>
public sealed record HeadsetReport(string Connection, int? BatteryPercent, bool? Charging, string? Stream);

/// <summary>What Staff see about a robot's headset. <see cref="Stale"/>: the last report is older than the listening window.</summary>
public sealed record RobotHeadsetStatus(
    string RobotCode,
    bool Reported,
    string? Connection,
    int? BatteryPercent,
    bool? Charging,
    string? Stream,
    DateTimeOffset? ReportedAt,
    bool Stale);

public static class HeadsetReports
{
    private static readonly string[] Connections = { "connected", "unauthorized", "offline", "not_found", "adb_error", "unknown" };
    private static readonly string[] Streams = { "live", "connecting", "paused", "lost" };

    /// <summary>Lower-cased known words, battery clamped to 0..100; a missing or unknown connection is <c>unknown</c>.</summary>
    public static HeadsetReport Normalise(string? connection, int? batteryPercent, bool? charging, string? stream)
    {
        string c = (connection ?? "").Trim().ToLowerInvariant();
        string s = (stream ?? "").Trim().ToLowerInvariant();
        return new HeadsetReport(
            Array.IndexOf(Connections, c) >= 0 ? c : "unknown",
            batteryPercent is { } level ? Math.Clamp(level, 0, 100) : null,
            charging,
            Array.IndexOf(Streams, s) >= 0 ? s : null);
    }
}
