using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.PollCameraDemand;
using SmartCampus.Application.Features.FleetCamera.Commands.SendHeadsetCommand;
using SmartCampus.Application.Features.FleetCamera.Queries.GetRobotHeadset;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0052: the Quest camera runs only while a Tour runs on the robot or a Staff page holds a lease.</summary>
public sealed class FleetCameraTests
{
    private const string Robot = "amr_01";
    private static readonly DateTimeOffset Now = new(2026, 11, 9, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Rules_ARunningTourWins_ThenAnUnexpiredLease_ElseIdle()
    {
        Assert.Equal((true, CameraDemandReasons.TourRunning), CameraDemandRules.Decide(true, null, Now));
        Assert.Equal((true, CameraDemandReasons.TourRunning), CameraDemandRules.Decide(true, Now.AddMinutes(1), Now));
        Assert.Equal((true, CameraDemandReasons.StaffWatching), CameraDemandRules.Decide(false, Now.AddSeconds(1), Now));
        Assert.Equal((false, CameraDemandReasons.Idle), CameraDemandRules.Decide(false, Now, Now));
        Assert.Equal((false, CameraDemandReasons.Idle), CameraDemandRules.Decide(false, Now.AddSeconds(-1), Now));
        Assert.Equal((false, CameraDemandReasons.Idle), CameraDemandRules.Decide(false, null, Now));
    }

    [Fact]
    public async Task Poll_WithoutTourOrLease_TellsTheRobotToStop_AndRecordsThatItListens()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var demand = await Poll(store, clock, new RobotCameraFacts(Robot, false));

        Assert.Equal(new CameraDemand(false, CameraDemandReasons.Idle, 5), demand);
        Assert.Equal(Now, store.GetLastPoll(Robot));
    }

    [Fact]
    public async Task Poll_DuringARunningTour_WantsTheCamera()
    {
        var demand = await Poll(new FakeStore(), new Clock(Now), new RobotCameraFacts(Robot, true));
        Assert.Equal(new CameraDemand(true, CameraDemandReasons.TourRunning, 5), demand);
    }

    [Fact]
    public async Task Lease_KeepsTheCameraOnUntilItExpires()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        var settings = new FleetCameraSettings(leaseSeconds: 120);

        var status = await new LeaseCameraHandler(store, robots, settings, clock).Handle(new LeaseCamera(Robot), default);
        Assert.True(status.Wanted);
        Assert.Equal(CameraDemandReasons.StaffWatching, status.Reason);
        Assert.Equal(Now.AddSeconds(120), status.LeaseUntil);

        clock.Now = Now.AddSeconds(119);
        Assert.True((await Poll(store, clock, robots.Facts!)).Wanted);
        clock.Now = Now.AddSeconds(121);
        Assert.False((await Poll(store, clock, robots.Facts!)).Wanted);
    }

    [Fact]
    public async Task Lease_NeverShortensALaterLease()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        await new LeaseCameraHandler(store, robots, new FleetCameraSettings(leaseSeconds: 600), clock).Handle(new LeaseCamera(Robot), default);

        var status = await new LeaseCameraHandler(store, robots, new FleetCameraSettings(leaseSeconds: 60), clock)
            .Handle(new LeaseCamera(Robot), default);
        Assert.Equal(Now.AddSeconds(600), status.LeaseUntil);
    }

    [Fact]
    public async Task Lease_ReportsWhetherTheRobotIsListening()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        var handler = new LeaseCameraHandler(store, robots, new FleetCameraSettings(robotListeningWithinSeconds: 20), clock);

        var never = await handler.Handle(new LeaseCamera(Robot), default);
        Assert.False(never.RobotListening);
        Assert.Null(never.LastPollAt);

        store.RecordPoll(Robot, Now.AddSeconds(-15));
        Assert.True((await handler.Handle(new LeaseCamera(Robot), default)).RobotListening);

        clock.Now = Now.AddSeconds(10);
        Assert.False((await handler.Handle(new LeaseCamera(Robot), default)).RobotListening);
    }

    [Fact]
    public async Task Lease_OfAnUnknownOrDeactivatedRobot_IsNotFound()
    {
        var handler = new LeaseCameraHandler(new FakeStore(), new FakeRobots(null), new FleetCameraSettings(), new Clock(Now));
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new LeaseCamera(Robot), default));
    }

    [Theory]
    [InlineData("amr_01", true)]
    [InlineData("AMR-02.b", true)]
    [InlineData("", false)]
    [InlineData("_amr", false)]
    [InlineData("amr 01", false)]
    [InlineData("amr/01", false)]
    public void LeaseValidator_AcceptsOnlyRobotCodes(string code, bool valid) =>
        Assert.Equal(valid, new LeaseCameraValidator().Validate(new LeaseCamera(code)).IsValid);

    [Theory]
    [InlineData(5, 5, 20)]
    [InlineData(120, 0, 20)]
    [InlineData(120, 5, 4)]
    public void Settings_RefuseNonsense(int lease, int poll, int listening) =>
        Assert.Throws<InvalidOperationException>(() => new FleetCameraSettings(lease, poll, listening));

    // ---- ADR-0056: headset battery reported with the camera poll ----------------------------------------------------

    [Fact]
    public void HeadsetReport_IsNormalised_NeverRejected()
    {
        Assert.Equal(new HeadsetReport("connected", 54, true, "live"), HeadsetReports.Normalise(" Connected ", 54, true, "LIVE"));
        Assert.Equal(new HeadsetReport("unknown", 100, null, null), HeadsetReports.Normalise("sleeping", 140, null, "streaming"));
        Assert.Equal(new HeadsetReport("unknown", 0, false, "paused"), HeadsetReports.Normalise(null, -5, false, "paused"));
    }

    [Fact]
    public async Task Poll_WithAHeadset_StoresIt_AndStaffReadIt()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        await new PollCameraDemandHandler(store, robots, new FleetCameraSettings(), clock)
            .Handle(new PollCameraDemand(Robot, new HeadsetReport("connected", 54, true, "live")), default);

        var status = await new GetRobotHeadsetHandler(store, robots, new FleetCameraSettings(robotListeningWithinSeconds: 20), clock)
            .Handle(new GetRobotHeadset(Robot), default);
        Assert.Equal(new RobotHeadsetStatus(Robot, true, "connected", 54, true, "live", Now, false), status);
    }

    [Fact]
    public async Task Poll_WithoutAHeadset_KeepsTheLastReport()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        var poll = new PollCameraDemandHandler(store, robots, new FleetCameraSettings(), clock);
        await poll.Handle(new PollCameraDemand(Robot, new HeadsetReport("connected", 80, false, "paused")), default);
        clock.Now = Now.AddSeconds(5);
        await poll.Handle(new PollCameraDemand(Robot), default);
        Assert.Equal(Now, store.GetHeadset(Robot)!.Value.At);
    }

    [Fact]
    public async Task Headset_NeverReported_OrTooOld_SaysSo()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        var handler = new GetRobotHeadsetHandler(store, robots, new FleetCameraSettings(robotListeningWithinSeconds: 20), clock);

        var never = await handler.Handle(new GetRobotHeadset(Robot), default);
        Assert.False(never.Reported);
        Assert.True(never.Stale);
        Assert.Null(never.BatteryPercent);

        store.RecordHeadset(Robot, new HeadsetReport("connected", 30, false, "live"), Now);
        clock.Now = Now.AddSeconds(21);
        var old = await handler.Handle(new GetRobotHeadset(Robot), default);
        Assert.True(old.Reported);
        Assert.True(old.Stale);
        Assert.Equal(30, old.BatteryPercent);
    }

    [Fact]
    public async Task Headset_OfAnUnknownRobot_IsNotFound()
    {
        var handler = new GetRobotHeadsetHandler(new FakeStore(), new FakeRobots(null), new FleetCameraSettings(), new Clock(Now));
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new GetRobotHeadset(Robot), default));
    }

    [Theory]
    [InlineData("amr_01", true)]
    [InlineData("amr/01", false)]
    [InlineData("", false)]
    public void HeadsetValidator_AcceptsOnlyRobotCodes(string code, bool valid) =>
        Assert.Equal(valid, new GetRobotHeadsetValidator().Validate(new GetRobotHeadset(code)).IsValid);

    // ---- ADR-0056 addendum: Staff wake the headset or put it to sleep -------------------------------------------------

    [Fact]
    public void HeadsetReport_Screen_IsNormalised_AndAbsentStaysAbsent()
    {
        Assert.Equal("asleep", HeadsetReports.Normalise("connected", 50, false, "paused", " Asleep ").Screen);
        Assert.Equal("unknown", HeadsetReports.Normalise("connected", 50, false, "paused", "dozing").Screen);
        Assert.Null(HeadsetReports.Normalise("connected", 50, false, "paused").Screen);
    }

    [Fact]
    public async Task HeadsetCommand_IsQueued_AndHandedOutOnce_WithTheNextPoll()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        await ReportHeadset(store, robots, clock, "asleep");

        var queued = await SendHeadset(store, robots, clock, HeadsetActions.Wake);
        Assert.Equal(Robot, queued.RobotCode);
        Assert.Equal(HeadsetActions.Wake, queued.Action);
        Assert.Equal(Now.AddSeconds(20), queued.ExpiresAt);

        var poll = new PollCameraDemandHandler(store, robots, Settings, clock);
        var first = await poll.Handle(new PollCameraDemand(Robot), default);
        Assert.Equal(new HeadsetCommandOrder(queued.CommandId, HeadsetActions.Wake), first.HeadsetCommand);
        var second = await poll.Handle(new PollCameraDemand(Robot), default);
        Assert.Null(second.HeadsetCommand);
    }

    [Fact]
    public async Task HeadsetCommand_ALaterPressReplacesOneNotYetDelivered()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        await ReportHeadset(store, robots, clock, "awake");
        await SendHeadset(store, robots, clock, HeadsetActions.Wake);
        var sleep = await SendHeadset(store, robots, clock, HeadsetActions.Sleep);

        var demand = await new PollCameraDemandHandler(store, robots, Settings, clock).Handle(new PollCameraDemand(Robot), default);
        Assert.Equal(new HeadsetCommandOrder(sleep.CommandId, HeadsetActions.Sleep), demand.HeadsetCommand);
    }

    [Fact]
    public async Task HeadsetCommand_PastItsExpiry_IsNeverDelivered()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        await ReportHeadset(store, robots, clock, "asleep");
        await SendHeadset(store, robots, clock, HeadsetActions.Wake);

        clock.Now = Now.AddSeconds(20);
        var demand = await new PollCameraDemandHandler(store, robots, Settings, clock).Handle(new PollCameraDemand(Robot), default);
        Assert.Null(demand.HeadsetCommand);
    }

    [Fact]
    public async Task HeadsetCommand_RobotNotPolling_IsRefused()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        var never = await Assert.ThrowsAsync<ConflictException>(() => SendHeadset(store, robots, clock, HeadsetActions.Wake));
        Assert.Equal("HEADSET_ROBOT_NOT_LISTENING", never.Code);

        await ReportHeadset(store, robots, clock, "asleep");
        clock.Now = Now.AddSeconds(21);
        var gone = await Assert.ThrowsAsync<ConflictException>(() => SendHeadset(store, robots, clock, HeadsetActions.Wake));
        Assert.Equal("HEADSET_ROBOT_NOT_LISTENING", gone.Code);
    }

    [Fact]
    public async Task HeadsetCommand_WithoutAFreshReport_IsRefused()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        store.RecordPoll(Robot, Now);  // an older quest-stream: polls, sends no headset
        var ex = await Assert.ThrowsAsync<ConflictException>(() => SendHeadset(store, robots, clock, HeadsetActions.Wake));
        Assert.Equal("HEADSET_NOT_REPORTED", ex.Code);
    }

    [Theory]
    [InlineData("offline", "asleep", "HEADSET_NOT_CONNECTED")]
    [InlineData("unauthorized", "unknown", "HEADSET_NOT_CONNECTED")]
    [InlineData("connected", null, "HEADSET_CONTROL_UNSUPPORTED")]
    public async Task HeadsetCommand_AHeadsetThatCannotTakeIt_IsRefused(string connection, string? screen, string code)
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        await new PollCameraDemandHandler(store, robots, Settings, clock)
            .Handle(new PollCameraDemand(Robot, HeadsetReports.Normalise(connection, 50, false, "paused", screen)), default);
        var ex = await Assert.ThrowsAsync<ConflictException>(() => SendHeadset(store, robots, clock, HeadsetActions.Wake));
        Assert.Equal(code, ex.Code);
        Assert.Null(store.TakeHeadsetCommand(Robot, Now));
    }

    [Fact]
    public async Task HeadsetCommand_SleepDuringARunningTour_IsRefused_ButWakeIsNot()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, true));
        await ReportHeadset(store, robots, clock, "awake");
        var ex = await Assert.ThrowsAsync<ConflictException>(() => SendHeadset(store, robots, clock, HeadsetActions.Sleep));
        Assert.Equal("HEADSET_TOUR_RUNNING", ex.Code);
        Assert.Equal(HeadsetActions.Wake, (await SendHeadset(store, robots, clock, HeadsetActions.Wake)).Action);
    }

    [Fact]
    public async Task HeadsetCommand_OfAnUnknownRobot_IsNotFound() =>
        await Assert.ThrowsAsync<NotFoundException>(() =>
            SendHeadset(new FakeStore(), new FakeRobots(null), new Clock(Now), HeadsetActions.Wake));

    [Theory]
    [InlineData("amr_01", "WAKE", true)]
    [InlineData("amr_01", "SLEEP", true)]
    [InlineData("amr_01", "wake", false)]
    [InlineData("amr_01", "POWER_OFF", false)]
    [InlineData("amr_01", "", false)]
    [InlineData("amr/01", "WAKE", false)]
    public void HeadsetCommandValidator_AcceptsOnlyWakeAndSleep(string code, string action, bool valid) =>
        Assert.Equal(valid, new SendHeadsetCommandValidator().Validate(new SendHeadsetCommand(code, action)).IsValid);

    [Fact]
    public async Task Headset_StaffSeeTheScreen()
    {
        var (store, clock) = (new FakeStore(), new Clock(Now));
        var robots = new FakeRobots(new RobotCameraFacts(Robot, false));
        await ReportHeadset(store, robots, clock, "asleep");
        var status = await new GetRobotHeadsetHandler(store, robots, Settings, clock).Handle(new GetRobotHeadset(Robot), default);
        Assert.Equal("asleep", status.Screen);
    }

    private static readonly FleetCameraSettings Settings = new(robotListeningWithinSeconds: 20);

    private static Task<CameraDemand> ReportHeadset(ICameraDemandStore store, IRobotCameraReader robots, TimeProvider clock,
        string screen) =>
        new PollCameraDemandHandler(store, robots, Settings, clock)
            .Handle(new PollCameraDemand(Robot, new HeadsetReport("connected", 50, true, "paused", screen)), default);

    private static Task<SendHeadsetCommandResult> SendHeadset(ICameraDemandStore store, IRobotCameraReader robots,
        TimeProvider clock, string action) =>
        new SendHeadsetCommandHandler(store, robots, Settings, clock).Handle(new SendHeadsetCommand(Robot, action), default);

    private static Task<CameraDemand> Poll(ICameraDemandStore store, TimeProvider clock, RobotCameraFacts? facts) =>
        new PollCameraDemandHandler(store, new FakeRobots(facts), new FleetCameraSettings(), clock)
            .Handle(new PollCameraDemand(Robot), default);

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FakeRobots(RobotCameraFacts? facts) : IRobotCameraReader
    {
        public RobotCameraFacts? Facts { get; } = facts;
        public Task<RobotCameraFacts?> GetAsync(string robotCode, CancellationToken cancellationToken) => Task.FromResult(Facts);
    }

    private sealed class FakeStore : ICameraDemandStore
    {
        private readonly Dictionary<string, DateTimeOffset> polls = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, DateTimeOffset> leases = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, (HeadsetReport, DateTimeOffset)> headsets = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, HeadsetCommand> headsetCommands = new(StringComparer.OrdinalIgnoreCase);
        public void RecordPoll(string robotCode, DateTimeOffset at) => polls[robotCode] = at;
        public DateTimeOffset? GetLastPoll(string robotCode) => polls.TryGetValue(robotCode, out var at) ? at : null;
        public DateTimeOffset ExtendLease(string robotCode, DateTimeOffset until) =>
            leases[robotCode] = leases.TryGetValue(robotCode, out var previous) && previous > until ? previous : until;
        public DateTimeOffset? GetLease(string robotCode) => leases.TryGetValue(robotCode, out var until) ? until : null;
        public void RecordHeadset(string robotCode, HeadsetReport report, DateTimeOffset at) => headsets[robotCode] = (report, at);
        public (HeadsetReport Report, DateTimeOffset At)? GetHeadset(string robotCode) =>
            headsets.TryGetValue(robotCode, out var entry) ? entry : null;
        public void QueueHeadsetCommand(string robotCode, HeadsetCommand command) => headsetCommands[robotCode] = command;
        public HeadsetCommand? TakeHeadsetCommand(string robotCode, DateTimeOffset now) =>
            headsetCommands.Remove(robotCode, out var command) && command.ExpiresAt > now ? command : null;
    }
}
