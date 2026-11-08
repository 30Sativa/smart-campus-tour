namespace SmartCampus.Application.Features.Tours;

public static class TourAutoCancel
{
    public const string Reason = "Không bắt đầu trong khung giờ, hệ thống tự huỷ.";
    public const string ResultCode = "SYSTEM_NO_START";
    /// <summary>A hold that ended longer ago than this is backlog: cancel it, but an email this late helps nobody.</summary>
    public static readonly TimeSpan NoticeCutoff = TimeSpan.FromHours(24);

    /// <summary>
    /// The end of the robot hold: the active reservation's EndsAt, or the last Start minute without one. Never before the
    /// Start window closes, so the system cannot take a Tour Staff may still Start.
    /// </summary>
    public static DateTimeOffset HoldEndsAt(DateTimeOffset scheduledStartAt, DateTimeOffset? reservationEndsAt, TimeSpan startLateLimit)
    {
        var lastStart = scheduledStartAt + startLateLimit;
        return reservationEndsAt is { } endsAt && endsAt > lastStart ? endsAt : lastStart;
    }
}
