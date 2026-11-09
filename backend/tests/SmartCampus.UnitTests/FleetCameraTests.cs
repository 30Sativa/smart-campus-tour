using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.PollCameraDemand;

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
        public void RecordPoll(string robotCode, DateTimeOffset at) => polls[robotCode] = at;
        public DateTimeOffset? GetLastPoll(string robotCode) => polls.TryGetValue(robotCode, out var at) ? at : null;
        public DateTimeOffset ExtendLease(string robotCode, DateTimeOffset until) =>
            leases[robotCode] = leases.TryGetValue(robotCode, out var previous) && previous > until ? previous : until;
        public DateTimeOffset? GetLease(string robotCode) => leases.TryGetValue(robotCode, out var until) ? until : null;
    }
}
