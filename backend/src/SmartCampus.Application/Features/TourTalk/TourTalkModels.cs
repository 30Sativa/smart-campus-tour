using System.Text;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.TourTalk;

/// <summary>Who sent a Tour talk message (ADR-0070).</summary>
public static class TourTalkSenders
{
    public const string Staff = "STAFF";
    public const string Viewer = "VIEWER";
}

/// <summary>Limits of Tour talk (ADR-0070). The browser enforces them too.</summary>
public static class TourTalkLimits
{
    public const int MaxTextLength = 500;
    public const int MaxAudioBytes = 1_000_000;
    public const int MaxAudioMilliseconds = 30_000;
    /// <summary>The multipart request may carry a clip and its form fields.</summary>
    public const long MaxStaffRequestBytes = MaxAudioBytes + 64 * 1024;
    public const int ViewerMessagesPerMinute = 6;
    public const int MaxMessagesPerTour = 300;
    /// <summary>Clips beyond the newest ones of a Tour are dropped; their message stays, marked without audio.</summary>
    public const int MaxAudioClipsPerTour = 40;
    /// <summary>A Tour's conversation is forgotten this long after its last message.</summary>
    public static readonly TimeSpan Retention = TimeSpan.FromHours(6);

    /// <summary>The audio formats browsers record (MediaRecorder) and play back.</summary>
    public static readonly IReadOnlySet<string> AudioContentTypes =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac" };

    public static string NormalizeText(string? text) => (text ?? "").Normalize(NormalizationForm.FormC).Trim();

    /// <summary>"audio/webm;codecs=opus" → "audio/webm"; null when not an accepted audio type.</summary>
    public static string? NormalizeAudioType(string? contentType)
    {
        var bare = (contentType ?? "").Split(';', 2)[0].Trim().ToLowerInvariant();
        return AudioContentTypes.Contains(bare) ? bare : null;
    }
}

/// <summary>
/// When the channel takes messages (ADR-0070): while the Tour is RUNNING, and in the waiting room from
/// <see cref="WaitingRoomLead"/> before the scheduled start of a SCHEDULED or READY Tour, the same window as Q&amp;A.
/// Reading stays possible after it closes.
/// </summary>
public static class TourTalkWindow
{
    public static readonly TimeSpan WaitingRoomLead = TimeSpan.FromMinutes(15);
    public const string OpensLaterCode = "TALK_OPENS_LATER";
    public const string ClosedCode = "TALK_CLOSED";

    public static bool IsOpen(string tourState, DateTimeOffset scheduledStartAt, DateTimeOffset now) =>
        tourState == "RUNNING" || tourState is "SCHEDULED" or "READY" && now >= scheduledStartAt - WaitingRoomLead;

    public static void EnsureOpen(string tourState, DateTimeOffset scheduledStartAt, DateTimeOffset now)
    {
        if (IsOpen(tourState, scheduledStartAt, now)) return;
        if (tourState is "SCHEDULED" or "READY")
            throw new ConflictException(
                $"Kênh trò chuyện mở từ {WaitingRoomLead.TotalMinutes:0} phút trước giờ bắt đầu buổi tham quan.", OpensLaterCode);
        throw new ConflictException("Buổi tham quan đã kết thúc nên kênh trò chuyện đã đóng.", ClosedCode);
    }
}

/// <summary>
/// One message as a reader sees it. Staff readers see the sender row (<see cref="ViewerName"/>, <see cref="ViewerClass"/>,
/// <see cref="ViewerRowType"/>); a Viewer only ever reads the Staff messages and its own, without any row data.
/// <see cref="AudioAvailable"/> is false once the clip was dropped to keep memory bounded.
/// </summary>
public sealed record TourTalkMessageView(Guid Id, long Seq, string From, string? Text, bool HasAudio, bool AudioAvailable,
    int? AudioDurationMs, string? StaffName, string? ViewerName, string? ViewerClass, string? ViewerRowType, bool Mine,
    DateTimeOffset SentAt);

/// <summary>
/// Messages after the reader's <c>after</c> seq of the same <see cref="Epoch"/>; a new epoch (server restart) sends the
/// whole kept conversation and the reader starts over. <see cref="CanSend"/>: this reader may send right now.
/// </summary>
public sealed record TourTalkFeed(Guid Epoch, long LastSeq, bool Open, bool CanSend, IReadOnlyList<TourTalkMessageView> Messages);

public sealed record TourTalkAudio(byte[] Content, string ContentType);
