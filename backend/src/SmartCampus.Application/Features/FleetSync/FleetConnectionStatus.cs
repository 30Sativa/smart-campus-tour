using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.FleetSync;

/// <summary>A refused report the robot list shows, with the sentence telling Technical Staff what to change.</summary>
public sealed record FleetRejectedReportView(string MapKey, string FrameId, DateTimeOffset At, string Message);

/// <summary>
/// The robot list's connection column, shared by the robot list, the Technical dashboard and diagnostics. CONNECTED is
/// <see cref="FleetSyncFreshness.IsFresh"/>. WRONG_MAP replaces CONNECTED/AWAITING_DATA/DISCONNECTED when the robot's
/// newest report was refused for the wrong map within SyncFreshness (ADR-0066 round 3).
/// </summary>
public static class FleetConnectionStatus
{
    public const string Unconfirmed = "UNCONFIRMED";
    public const string AwaitingData = "AWAITING_DATA";
    public const string Connected = "CONNECTED";
    public const string Disconnected = "DISCONNECTED";
    public const string WrongMap = "WRONG_MAP";

    public static string Of(Robot robot, FleetTelemetrySnapshot? latest, FleetRejectedReportView? lastRejected,
        DateTimeOffset now, FleetSyncSettings settings) =>
        robot.FirstAcceptedSyncAt is null ? Unconfirmed
        // The refusal is newer than every accepted report, so the robot's current reports are the refused ones.
        : lastRejected is not null ? WrongMap
        : FleetSyncFreshness.IsFresh(latest, now, settings) ? Connected
        : latest is null ? AwaitingData
        : Disconnected;

    /// <summary>
    /// The newest refused report when it is fresh by the same SyncFreshness, newer than the newest accepted report, and was
    /// refused against the robot's current assignment; otherwise null.
    /// </summary>
    public static FleetRejectedReportView? LastRejected(Robot robot, FleetTelemetrySnapshot? latest, FleetRejectedReport? rejected,
        DateTimeOffset now, FleetSyncSettings settings)
    {
        if (rejected is null || robot.AssignedMapVersion is not { } assigned || robot.MapAssignedAt is not { } assignedAt) return null;
        if (rejected.At < now - settings.SyncFreshness || rejected.At < assignedAt) return null;
        if (latest is not null && latest.ReceivedAt >= rejected.At) return null;
        var message = string.Equals(rejected.MapKey, assigned.MapKey, StringComparison.Ordinal)
            ? $"Robot đang gửi dữ liệu theo FrameId {rejected.FrameId}, bị từ chối vì đang gán {assigned.MapKey} với FrameId {assigned.FrameId}. Đổi MapKey/FrameId trên MiniPC."
            : $"Robot đang gửi dữ liệu theo {rejected.MapKey}, bị từ chối vì đang gán {assigned.MapKey}. Đổi MapKey/FrameId trên MiniPC.";
        return new(rejected.MapKey, rejected.FrameId, rejected.At, message);
    }
}
