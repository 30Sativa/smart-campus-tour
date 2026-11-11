using System.Collections.Concurrent;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Features.FleetHead;

namespace SmartCampus.Infrastructure.Integrations.FleetHead;

/// <summary>
/// ADR-0045 head command queue: per robot, the last <see cref="FleetHeadSettings.MaximumQueuedPerRobot"/> commands of
/// this process (<see cref="Epoch"/>), each with an increasing seq. A poll returns at once when something newer exists,
/// otherwise it waits for <see cref="Enqueue"/> or its deadline. Commands older than
/// <see cref="FleetHeadSettings.MaxCommandAge"/> are never handed out.
/// </summary>
public sealed class InMemoryHeadCommandChannel(FleetHeadSettings settings, TimeProvider clock) : IHeadCommandChannel
{
    private readonly ConcurrentDictionary<string, RobotQueue> robots = new(StringComparer.Ordinal);

    public Guid Epoch { get; } = Guid.NewGuid();

    public HeadCommand Enqueue(string robotCode, HeadCommandSpec spec)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(robotCode);
        ArgumentNullException.ThrowIfNull(spec);
        var queue = robots.GetOrAdd(robotCode, _ => new RobotQueue());
        TaskCompletionSource wake;
        HeadCommand command;
        lock (queue.Gate)
        {
            var now = clock.GetUtcNow();
            queue.Items.RemoveAll(item => item.IssuedAt < now - settings.MaxCommandAge);
            command = new HeadCommand(++queue.LastSeq, spec.Kind, now, spec.PanSteps, spec.TiltSteps, spec.PanDir,
                spec.TiltDir, spec.PanDeg, spec.TiltDeg,
                spec.Kind == HeadCommandKinds.Jog ? (int)settings.JogTtl.TotalMilliseconds : null, spec.SweepDeg);
            queue.Items.Add(command);
            var overflow = queue.Items.Count - FleetHeadSettings.MaximumQueuedPerRobot;
            if (overflow > 0) queue.Items.RemoveRange(0, overflow);
            wake = queue.Signal;
            queue.Signal = NewSignal();
        }
        wake.TrySetResult();
        return command;
    }

    public async Task<HeadPollBatch> PollAsync(string robotCode, Guid? epoch, long afterSeq, TimeSpan wait,
        HeadStateReport? head, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(robotCode);
        var queue = robots.GetOrAdd(robotCode, _ => new RobotQueue());
        if (wait > settings.MaxWait) wait = settings.MaxWait;
        if (wait < TimeSpan.Zero) wait = TimeSpan.Zero;
        // Another epoch means the robot's seq belongs to an earlier process: start over from what is kept now.
        var from = epoch == Epoch ? Math.Max(0, afterSeq) : 0;
        var started = clock.GetUtcNow();
        var deadline = started + wait;
        lock (queue.Gate)
        {
            queue.OpenPolls++;
            queue.LastPollAt = started;
            if (head is not null)
            {
                queue.Head = head;
                queue.HeadReceivedAt = started;
            }
        }

        try
        {
            while (true)
            {
                Task signal;
                TimeSpan remaining;
                lock (queue.Gate)
                {
                    var now = clock.GetUtcNow();
                    var pending = queue.Items
                        .Where(item => item.Seq > from && item.IssuedAt >= now - settings.MaxCommandAge)
                        .ToArray();
                    if (pending.Length > 0 || now >= deadline)
                        return new HeadPollBatch(Epoch, pending);
                    signal = queue.Signal.Task;
                    remaining = deadline - now;
                }

                using var stopDelay = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                var delay = Task.Delay(remaining, clock, stopDelay.Token);
                await Task.WhenAny(signal, delay).ConfigureAwait(false);
                await stopDelay.CancelAsync().ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
            }
        }
        finally
        {
            lock (queue.Gate)
            {
                queue.OpenPolls--;
                queue.LastPollAt = clock.GetUtcNow();
            }
        }
    }

    public bool IsRobotConnected(string robotCode) => GetStatus(robotCode).Connected;

    public HeadRobotStatus GetStatus(string robotCode)
    {
        if (string.IsNullOrWhiteSpace(robotCode) || !robots.TryGetValue(robotCode, out var queue))
            return new HeadRobotStatus(false, null, null, null);
        lock (queue.Gate)
        {
            var connected = queue.OpenPolls > 0 ||
                (queue.LastPollAt is { } last && clock.GetUtcNow() - last <= settings.RobotConnectedWithin);
            return new HeadRobotStatus(connected, queue.LastPollAt, queue.Head, queue.HeadReceivedAt);
        }
    }

    private static TaskCompletionSource NewSignal() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    private sealed class RobotQueue
    {
        public object Gate { get; } = new();
        public List<HeadCommand> Items { get; } = [];
        public long LastSeq { get; set; }
        public TaskCompletionSource Signal { get; set; } = NewSignal();
        public int OpenPolls { get; set; }
        public DateTimeOffset? LastPollAt { get; set; }
        public HeadStateReport? Head { get; set; }
        public DateTimeOffset? HeadReceivedAt { get; set; }
    }
}
