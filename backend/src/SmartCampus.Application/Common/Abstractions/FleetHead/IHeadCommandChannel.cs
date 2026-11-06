using SmartCampus.Application.Features.FleetHead;

namespace SmartCampus.Application.Common.Abstractions.FleetHead;

/// <summary>
/// In-memory, per-robot head command queue of ADR-0045. Nothing is persisted; a process restart starts a new epoch.
/// Implemented in Infrastructure; safe for concurrent callers.
/// </summary>
public interface IHeadCommandChannel
{
    Guid Epoch { get; }

    /// <summary>Queues one command for the robot and wakes its waiting poll. JOG gets the configured TTL.</summary>
    HeadCommand Enqueue(string robotCode, HeadCommandSpec spec);

    /// <summary>
    /// Commands newer than <paramref name="afterSeq"/> (when <paramref name="epoch"/> is the current one; otherwise every
    /// kept command) and not older than the configured age, waiting up to <paramref name="wait"/> for one to arrive.
    /// Records the head state, if any, and that the robot is listening.
    /// </summary>
    Task<HeadPollBatch> PollAsync(string robotCode, Guid? epoch, long afterSeq, TimeSpan wait, HeadStateReport? head,
        CancellationToken cancellationToken);

    /// <summary>True while a poll is open or the last one ended within the configured window.</summary>
    bool IsRobotConnected(string robotCode);

    HeadRobotStatus GetStatus(string robotCode);
}
