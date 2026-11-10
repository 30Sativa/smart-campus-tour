using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using SmartCampus.Api.Controllers;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Infrastructure.Integrations.FleetHead;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0045 in-memory head channel and the docs/contracts/fleet-head/v1 fixtures. No database: the long poll, expiry,
/// epoch and listening rules are all in process memory.
/// </summary>
public sealed class FleetHeadChannelTests
{
    private const string Robot = "amr_01";
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Poll_ReturnsNewerCommandsAtOnce_InSeqOrder_AndJogCarriesItsTtl()
    {
        var channel = Channel();
        var step = channel.Enqueue(Robot, new HeadCommandSpec("STEP", PanSteps: 1, TiltSteps: 0));
        var jog = channel.Enqueue(Robot, new HeadCommandSpec("JOG", PanDir: -1, TiltDir: 0));
        var stop = channel.Enqueue(Robot, new HeadCommandSpec("STOP"));

        var watch = Stopwatch.StartNew();
        var batch = await channel.PollAsync(Robot, null, 0, TimeSpan.FromSeconds(5), null, default);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(1), "commands already queued must not wait");
        Assert.Equal(channel.Epoch, batch.Epoch);
        Assert.Equal(new[] { step.Seq, jog.Seq, stop.Seq }, batch.Commands.Select(c => c.Seq));
        Assert.Equal(new[] { 1L, 2L, 3L }, batch.Commands.Select(c => c.Seq));
        Assert.Equal(600, batch.Commands[1].TtlMs);
        Assert.Null(batch.Commands[0].TtlMs);
        Assert.Null(batch.Commands[2].TtlMs);

        var later = await channel.PollAsync(Robot, channel.Epoch, stop.Seq, TimeSpan.Zero, null, default);
        Assert.Empty(later.Commands);
        var fromMiddle = await channel.PollAsync(Robot, channel.Epoch, step.Seq, TimeSpan.Zero, null, default);
        Assert.Equal(new[] { jog.Seq, stop.Seq }, fromMiddle.Commands.Select(c => c.Seq));
    }

    [Fact]
    public async Task Poll_WaitsForTheNextCommand_AndWakesAsSoonAsItIsQueued()
    {
        var channel = Channel(maxWaitMs: 5000);
        var poll = channel.PollAsync(Robot, channel.Epoch, 0, TimeSpan.FromSeconds(5), null, default);
        await Task.Delay(200);
        Assert.False(poll.IsCompleted, "nothing queued yet: the poll waits");
        Assert.True(channel.IsRobotConnected(Robot), "an open poll counts as listening");

        var watch = Stopwatch.StartNew();
        var queued = channel.Enqueue(Robot, new HeadCommandSpec("JOG", PanDir: 1, TiltDir: 0));
        var batch = await poll.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.True(watch.Elapsed < TimeSpan.FromMilliseconds(500), $"woke after {watch.ElapsedMilliseconds} ms");
        Assert.Equal(queued.Seq, Assert.Single(batch.Commands).Seq);
    }

    [Fact]
    public async Task Poll_EndsEmptyAtItsDeadline_AndTheServerCapsTheWait()
    {
        var channel = Channel(maxWaitMs: 300);
        var watch = Stopwatch.StartNew();
        var batch = await channel.PollAsync(Robot, channel.Epoch, 0, TimeSpan.FromSeconds(10), null, default);
        Assert.Empty(batch.Commands);
        Assert.InRange(watch.ElapsedMilliseconds, 250, 2000);

        watch.Restart();
        Assert.Empty((await channel.PollAsync(Robot, channel.Epoch, 0, TimeSpan.Zero, null, default)).Commands);
        Assert.True(watch.ElapsedMilliseconds < 200, "waitMs 0 answers at once");
    }

    [Fact]
    public async Task Poll_NeverHandsOutAnOldCommand_SoAReconnectingRobotDoesNotReplayTaps()
    {
        var clock = new ManualClock();
        var channel = Channel(clock: clock, maxCommandAgeMs: 1000);
        channel.Enqueue(Robot, new HeadCommandSpec("STEP", PanSteps: 5, TiltSteps: 0));
        clock.Advance(TimeSpan.FromMilliseconds(1001));
        var fresh = channel.Enqueue(Robot, new HeadCommandSpec("STOP"));

        var batch = await channel.PollAsync(Robot, null, 0, TimeSpan.Zero, null, default);
        Assert.Equal(fresh.Seq, Assert.Single(batch.Commands).Seq);
    }

    [Fact]
    public async Task Poll_FromAnotherEpoch_StartsOverWithWhatIsKept()
    {
        var channel = Channel();
        var first = channel.Enqueue(Robot, new HeadCommandSpec("STOP"));
        var second = channel.Enqueue(Robot, new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: 0));

        // The robot's seq 99 belongs to an earlier API process; the new process must not skip its commands.
        var batch = await channel.PollAsync(Robot, Guid.NewGuid(), 99, TimeSpan.Zero, null, default);
        Assert.Equal(new[] { first.Seq, second.Seq }, batch.Commands.Select(c => c.Seq));
        Assert.Equal(channel.Epoch, batch.Epoch);
        Assert.NotEqual(channel.Epoch, Channel().Epoch);
    }

    [Fact]
    public async Task Queue_KeepsOnlyTheNewestCommands_PerRobot()
    {
        var channel = Channel();
        for (var i = 0; i < FleetHeadSettings.MaximumQueuedPerRobot + 8; i++)
            channel.Enqueue(Robot, new HeadCommandSpec("JOG", PanDir: 1, TiltDir: 0));
        channel.Enqueue("amr_other", new HeadCommandSpec("STOP"));

        var batch = await channel.PollAsync(Robot, null, 0, TimeSpan.Zero, null, default);
        Assert.Equal(FleetHeadSettings.MaximumQueuedPerRobot, batch.Commands.Count);
        Assert.Equal(FleetHeadSettings.MaximumQueuedPerRobot + 8L, batch.Commands[^1].Seq);
        Assert.All(batch.Commands, c => Assert.Equal("JOG", c.Kind));
        Assert.Equal(1L, Assert.Single((await channel.PollAsync("amr_other", null, 0, TimeSpan.Zero, null, default)).Commands).Seq);
    }

    [Fact]
    public async Task Listening_StartsWithAPoll_AndEndsAfterTheWindow()
    {
        var clock = new ManualClock();
        var channel = Channel(clock: clock, robotConnectedWithinMs: 3000);
        Assert.False(channel.IsRobotConnected(Robot));
        Assert.False(channel.GetStatus(Robot).Connected);

        await channel.PollAsync(Robot, null, 0, TimeSpan.Zero, null, default);
        Assert.True(channel.IsRobotConnected(Robot));
        clock.Advance(TimeSpan.FromMilliseconds(3001));
        Assert.False(channel.IsRobotConnected(Robot));
        Assert.False(channel.IsRobotConnected("amr_never_polled"));
    }

    [Fact]
    public async Task Poll_RecordsTheHeadState_AndKeepsItWhenALaterPollHasNone()
    {
        var clock = new ManualClock();
        var channel = Channel(clock: clock);
        var head = new HeadStateReport("IDLE", true, 12.6, -3.6, clock.GetUtcNow());
        await channel.PollAsync(Robot, null, 0, TimeSpan.Zero, head, default);
        var receivedAt = clock.GetUtcNow();
        clock.Advance(TimeSpan.FromMilliseconds(100));
        await channel.PollAsync(Robot, channel.Epoch, 0, TimeSpan.Zero, null, default);

        var status = channel.GetStatus(Robot);
        Assert.Equal(head, status.Head);
        Assert.Equal(receivedAt, status.HeadReceivedAt);
        Assert.Equal(clock.GetUtcNow(), status.LastPollAt);
    }

    [Fact]
    public async Task Poll_CancelledWhileWaiting_Throws_AndStopsCountingAsOpen()
    {
        var clock = new ManualClock();
        var channel = Channel(clock: clock, maxWaitMs: 5000);
        using var cancel = new CancellationTokenSource();
        var poll = channel.PollAsync(Robot, null, 0, TimeSpan.FromSeconds(5), null, cancel.Token);
        await Task.Delay(100);
        await cancel.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => poll.WaitAsync(TimeSpan.FromSeconds(2)));

        clock.Advance(TimeSpan.FromSeconds(4));
        Assert.False(channel.IsRobotConnected(Robot), "a cancelled poll must not stay open forever");
    }

    [Fact]
    public async Task ManyWaitingPolls_AllWakeOnOneCommand()
    {
        var channel = Channel(maxWaitMs: 5000);
        var polls = Enumerable.Range(0, 5).Select(_ => channel.PollAsync(Robot, channel.Epoch, 0, TimeSpan.FromSeconds(5), null, default)).ToArray();
        await Task.Delay(100);
        channel.Enqueue(Robot, new HeadCommandSpec("STOP"));
        var batches = await Task.WhenAll(polls).WaitAsync(TimeSpan.FromSeconds(2));
        Assert.All(batches, b => Assert.Single(b.Commands));
    }

    [Fact]
    public void ModeStore_DefaultsFromSettings_KeepsEachTourApart_AndRefusesNonsense()
    {
        var store = new InMemoryTourHeadModeStore(new FleetHeadSettings(defaultMode: HeadModes.Manual));
        var tour = Guid.NewGuid();
        Assert.Equal("MANUAL", store.GetMode(tour));
        store.SetMode(tour, HeadModes.Auto);
        Assert.Equal("AUTO", store.GetMode(tour));
        Assert.Equal("MANUAL", store.GetMode(Guid.NewGuid()));
        Assert.Throws<ArgumentOutOfRangeException>(() => store.SetMode(tour, "auto"));
    }

    [Fact]
    public async Task Sweep_IsQueuedWithoutFieldsOrTtl()
    {
        var channel = Channel();
        channel.Enqueue(Robot, new HeadCommandSpec("SWEEP"));
        var sweep = Assert.Single((await channel.PollAsync(Robot, null, 0, TimeSpan.Zero, null, default)).Commands);
        Assert.Equal(("SWEEP", (int?)null, (int?)null, (double?)null), (sweep.Kind, sweep.TtlMs, sweep.PanSteps, sweep.PanDeg));
    }

    // ---- contract fixtures -----------------------------------------------------------------------------------------

    [Fact]
    public void Fixtures_MatchTheWireTypes()
    {
        var request = JsonSerializer.Deserialize<FleetHeadPollRequest>(Fixture("poll-request.json").ToJsonString(), Web)!;
        Assert.NotNull(request.Epoch);
        Assert.Equal((41L, 1500), (request.AfterSeq, request.WaitMs));
        Assert.Contains(request.Head!.State, HeadStates.All);

        var data = Fixture("poll-response-commands.json")["data"]!;
        var kinds = data["commands"]!.AsArray().Select(c => c!["kind"]!.GetValue<string>()).ToArray();
        Assert.True(kinds.All(HeadCommandKinds.All.Contains));
        Assert.Equal(HeadCommandKinds.All.Order().ToArray(), kinds.Distinct().Order().ToArray());
        Assert.Empty(Fixture("poll-response-empty.json")["data"]!["commands"]!.AsArray());
    }

    [Fact]
    public void Wire_ShowsOnlyTheFieldsOfTheKind_LikeTheFixture()
    {
        var expected = Fixture("poll-response-commands.json")["data"]!["commands"]!.AsArray();
        var wire = new[]
        {
            new FleetHeadWireCommand(42, "STEP", DateTimeOffset.UnixEpoch, 1, 0, null, null, null, null, null, null),
            new FleetHeadWireCommand(43, "JOG", DateTimeOffset.UnixEpoch, null, null, -1, 0, null, null, 600, null),
            new FleetHeadWireCommand(44, "STOP", DateTimeOffset.UnixEpoch, null, null, null, null, null, null, null, null),
            new FleetHeadWireCommand(45, "ANGLE", DateTimeOffset.UnixEpoch, null, null, null, null, 0, 0, null, null),
            new FleetHeadWireCommand(46, "SWEEP", DateTimeOffset.UnixEpoch, null, null, null, null, null, null, null, null),
            new FleetHeadWireCommand(47, "SWEEP", DateTimeOffset.UnixEpoch, null, null, null, null, null, null, null, 90)
        };
        for (var i = 0; i < wire.Length; i++)
        {
            var actual = JsonNode.Parse(JsonSerializer.Serialize(wire[i], Web))!.AsObject();
            Assert.Equal(expected[i]!.AsObject().Select(p => p.Key).Order().ToArray(), actual.Select(p => p.Key).Order().ToArray());
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------

    private static InMemoryHeadCommandChannel Channel(TimeProvider? clock = null, int maxCommandAgeMs = 1000, int maxWaitMs = 1500,
        int robotConnectedWithinMs = 3000) =>
        new(new FleetHeadSettings(true, maxCommandAgeMs, 600, maxWaitMs, robotConnectedWithinMs), clock ?? TimeProvider.System);

    private static JsonNode Fixture(string name) => JsonNode.Parse(File.ReadAllText(
        Path.Combine(AppContext.BaseDirectory, "ContractFixtures", "fleet-head", "v1", name)))!;

    /// <summary>Timestamps move only when told to; delays still run on real timers (TimeProvider.CreateTimer).</summary>
    private sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
        private readonly object gate = new();

        public override DateTimeOffset GetUtcNow()
        {
            lock (gate) return now;
        }

        public void Advance(TimeSpan by)
        {
            lock (gate) now += by;
        }
    }
}
