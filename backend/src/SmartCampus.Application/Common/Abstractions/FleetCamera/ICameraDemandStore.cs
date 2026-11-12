using SmartCampus.Application.Features.FleetCamera;

namespace SmartCampus.Application.Common.Abstractions.FleetCamera;

/// <summary>
/// In-memory, per-robot camera demand of ADR-0052: when each robot last asked and until when Staff keep its camera on.
/// Nothing is persisted; an API restart forgets both, and the next robot poll and Staff renewal restore them.
/// Implemented in Infrastructure; safe for concurrent callers. Robot codes compare case-insensitively.
/// </summary>
public interface ICameraDemandStore
{
    void RecordPoll(string robotCode, DateTimeOffset at);

    DateTimeOffset? GetLastPoll(string robotCode);

    /// <summary>Keeps the camera on at least until <paramref name="until"/>; returns the resulting lease end.</summary>
    DateTimeOffset ExtendLease(string robotCode, DateTimeOffset until);

    DateTimeOffset? GetLease(string robotCode);

    /// <summary>ADR-0056: the headset as the robot last reported it; a later report replaces an earlier one.</summary>
    void RecordHeadset(string robotCode, HeadsetReport report, DateTimeOffset at);

    (HeadsetReport Report, DateTimeOffset At)? GetHeadset(string robotCode);

    /// <summary>ADR-0056 addendum: a Staff wake/sleep press; a later press replaces one not yet delivered.</summary>
    void QueueHeadsetCommand(string robotCode, HeadsetCommand command);

    /// <summary>Removes and returns the waiting press, or null; a press past its expiry is dropped, never returned.</summary>
    HeadsetCommand? TakeHeadsetCommand(string robotCode, DateTimeOffset now);
}
