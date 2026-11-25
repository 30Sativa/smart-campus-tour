using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.TourTalk;

/// <summary>
/// In-memory Tour talk (ADR-0070), like the head command queue and the Q&amp;A gate: nothing is persisted and one backend
/// instance is assumed. Per Tour the newest <see cref="TourTalkLimits.MaxMessagesPerTour"/> messages and
/// <see cref="TourTalkLimits.MaxAudioClipsPerTour"/> clips are kept, and a Tour is forgotten
/// <see cref="TourTalkLimits.Retention"/> after its last message. A restart starts a new <see cref="Epoch"/>.
/// </summary>
public sealed class TourTalkStore(TimeProvider clock)
{
    private static readonly TimeSpan RateWindow = TimeSpan.FromMinutes(1);
    private readonly object sync = new();
    private readonly Dictionary<Guid, Conversation> tours = new();

    public Guid Epoch { get; } = Guid.NewGuid();

    public TourTalkEntry AddStaff(Guid tourId, Guid staffUserId, string? staffName, string? text, byte[]? audio,
        string? audioType, int? audioDurationMs)
    {
        lock (sync)
        {
            var now = clock.GetUtcNow();
            Prune(now);
            var conversation = Get(tourId);
            var entry = new TourTalkEntry(Guid.NewGuid(), ++conversation.LastSeq, TourTalkSenders.Staff, text, audio is not null,
                audioDurationMs, staffUserId, staffName, null, null, null, null, now) { Audio = audio, AudioType = audioType };
            return Append(conversation, entry, now);
        }
    }

    /// <summary>Throws 429 when the row has sent <see cref="TourTalkLimits.ViewerMessagesPerMinute"/> messages this minute.</summary>
    public TourTalkEntry AddViewer(Guid tourId, Guid rosterRowId, string viewerName, string? viewerClass, string viewerRowType, string text)
    {
        lock (sync)
        {
            var now = clock.GetUtcNow();
            Prune(now);
            var conversation = Get(tourId);
            var recent = conversation.Entries.Count(entry => entry.RosterRowId == rosterRowId && now - entry.SentAt < RateWindow);
            if (recent >= TourTalkLimits.ViewerMessagesPerMinute)
                throw new TooManyRequestsException("Bạn gửi hơi nhanh. Đợi một chút rồi nhắn tiếp nhé.");
            var entry = new TourTalkEntry(Guid.NewGuid(), ++conversation.LastSeq, TourTalkSenders.Viewer, text, false, null, null,
                null, rosterRowId, viewerName, viewerClass, viewerRowType, now);
            return Append(conversation, entry, now);
        }
    }

    /// <summary>
    /// The kept messages after <paramref name="afterSeq"/> when <paramref name="epoch"/> is this one, otherwise all of them;
    /// <paramref name="filter"/> picks what this reader may see.
    /// </summary>
    public (long LastSeq, IReadOnlyList<TourTalkEntry> Entries) Read(Guid tourId, Guid? epoch, long afterSeq,
        Func<TourTalkEntry, bool> filter)
    {
        lock (sync)
        {
            Prune(clock.GetUtcNow());
            if (!tours.TryGetValue(tourId, out var conversation)) return (0, []);
            var from = epoch == Epoch ? afterSeq : 0;
            return (conversation.LastSeq, conversation.Entries.Where(entry => entry.Seq > from && filter(entry)).ToList());
        }
    }

    public TourTalkEntry? Find(Guid tourId, Guid messageId)
    {
        lock (sync)
        {
            return tours.TryGetValue(tourId, out var conversation)
                ? conversation.Entries.FirstOrDefault(entry => entry.Id == messageId)
                : null;
        }
    }

    private Conversation Get(Guid tourId)
    {
        if (!tours.TryGetValue(tourId, out var conversation))
        {
            conversation = new Conversation();
            tours[tourId] = conversation;
        }
        return conversation;
    }

    private static TourTalkEntry Append(Conversation conversation, TourTalkEntry entry, DateTimeOffset now)
    {
        conversation.Entries.Add(entry);
        conversation.LastActivity = now;
        if (conversation.Entries.Count > TourTalkLimits.MaxMessagesPerTour)
            conversation.Entries.RemoveRange(0, conversation.Entries.Count - TourTalkLimits.MaxMessagesPerTour);
        var clips = conversation.Entries.Where(item => item.Audio is not null).ToList();
        foreach (var old in clips.Take(Math.Max(0, clips.Count - TourTalkLimits.MaxAudioClipsPerTour)))
            (old.Audio, old.AudioType) = (null, null);
        return entry;
    }

    private void Prune(DateTimeOffset now)
    {
        foreach (var key in tours.Where(item => now - item.Value.LastActivity > TourTalkLimits.Retention).Select(item => item.Key).ToList())
            tours.Remove(key);
    }

    private sealed class Conversation
    {
        public long LastSeq { get; set; }
        public DateTimeOffset LastActivity { get; set; }
        public List<TourTalkEntry> Entries { get; } = [];
    }
}

/// <summary>A kept message. <see cref="Audio"/> is cleared when the clip is dropped; <see cref="HasAudio"/> stays.</summary>
public sealed record TourTalkEntry(Guid Id, long Seq, string From, string? Text, bool HasAudio, int? AudioDurationMs,
    Guid? StaffUserId, string? StaffName, Guid? RosterRowId, string? ViewerName, string? ViewerClass, string? ViewerRowType,
    DateTimeOffset SentAt)
{
    public byte[]? Audio { get; set; }
    public string? AudioType { get; set; }

    public TourTalkMessageView ForStaff() => new(Id, Seq, From, Text, HasAudio, Audio is not null, AudioDurationMs, StaffName,
        ViewerName, ViewerClass, ViewerRowType, false, SentAt);

    /// <summary>A Viewer sees the Staff messages and its own, never another row's identity.</summary>
    public TourTalkMessageView ForViewer(Guid rosterRowId) => new(Id, Seq, From, Text, HasAudio, Audio is not null, AudioDurationMs,
        StaffName, null, null, null, RosterRowId == rosterRowId, SentAt);
}
