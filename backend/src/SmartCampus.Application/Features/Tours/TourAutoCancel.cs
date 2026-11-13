namespace SmartCampus.Application.Features.Tours;

public static class TourAutoCancel
{
    public const string Reason = "Không bắt đầu trong khung giờ, hệ thống tự huỷ.";
    public const string ResultCode = "SYSTEM_NO_START";
    /// <summary>A hold that ended longer ago than this is backlog: cancel it, but an email this late helps nobody.</summary>
    public static readonly TimeSpan NoticeCutoff = TimeSpan.FromHours(24);
    /// <summary>What a representative reads in the cancel email instead of the stored system <see cref="Reason"/>.</summary>
    public const string EmailReason = "Buổi tham quan không bắt đầu đúng giờ nên đã bị huỷ. Đại học FPT sẽ liên hệ nếu sắp xếp lại.";

    /// <summary>
    /// The reason a cancel email shows. Only the system cancel (NULL actor with the system reason) is reworded; a Staff
    /// reason is sent as entered. The stored EndReason never changes.
    /// </summary>
    public static string NoticeReason(Guid? noticeActor, string? endReason) =>
        noticeActor is null && endReason == Reason ? EmailReason : endReason ?? "";

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
