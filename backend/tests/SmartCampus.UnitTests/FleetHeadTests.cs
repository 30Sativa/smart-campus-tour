using Microsoft.Extensions.Logging.Abstractions;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Application.Features.FleetHead.Commands.PollHeadCommands;
using SmartCampus.Application.Features.FleetHead.Commands.SendHeadCommand;
using SmartCampus.Application.Features.FleetHead.Commands.SetTourHeadMode;
using SmartCampus.Application.Features.FleetHead.Queries.GetTourHeadStatus;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0045 / docs/contracts/fleet-head/v1: who may turn the head, and what a command may contain.</summary>
public sealed class FleetHeadTests
{
    private static readonly Guid TourId = Guid.NewGuid();
    private static readonly Guid Operator = Guid.NewGuid();
    private const string Robot = "amr_01";

    // ---- SendHeadCommand validation --------------------------------------------------------------------------------

    public static TheoryData<HeadCommandSpec> ValidSpecs => new()
    {
        new HeadCommandSpec("STEP", PanSteps: 1, TiltSteps: 0),
        new HeadCommandSpec("STEP", TiltSteps: -20),
        new HeadCommandSpec("JOG", PanDir: -1, TiltDir: 0),
        new HeadCommandSpec("JOG", PanDir: 0, TiltDir: 0),
        new HeadCommandSpec("JOG"),
        new HeadCommandSpec("STOP"),
        new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: 0),
        new HeadCommandSpec("ANGLE", PanDeg: -170, TiltDeg: 18),
        new HeadCommandSpec("SWEEP"),
        new HeadCommandSpec("SWEEP", SweepDeg: 10),
        new HeadCommandSpec("SWEEP", SweepDeg: 170)
    };

    [Theory]
    [MemberData(nameof(ValidSpecs))]
    public void Validator_AcceptsEachKindWithItsOwnFields(HeadCommandSpec spec) =>
        Assert.True(new SendHeadCommandValidator().Validate(new SendHeadCommand(TourId, Operator, spec)).IsValid);

    public static TheoryData<HeadCommandSpec, string> InvalidSpecs => new()
    {
        { new HeadCommandSpec("step", PanSteps: 1), "lower-case kind" },
        { new HeadCommandSpec("HOME"), "HOME is not exposed" },
        { new HeadCommandSpec("STEP"), "STEP without movement" },
        { new HeadCommandSpec("STEP", PanSteps: 0, TiltSteps: 0), "STEP of zero" },
        { new HeadCommandSpec("STEP", PanSteps: 21), "too many steps" },
        { new HeadCommandSpec("STEP", PanSteps: 1, PanDir: 1), "STEP with a JOG field" },
        { new HeadCommandSpec("JOG", PanDir: 2), "direction 2" },
        { new HeadCommandSpec("JOG", PanDir: 1, PanDeg: 3), "JOG with an ANGLE field" },
        { new HeadCommandSpec("STOP", PanSteps: 1), "STOP with a field" },
        { new HeadCommandSpec("ANGLE", PanDeg: 10), "ANGLE without tilt" },
        { new HeadCommandSpec("ANGLE", PanDeg: double.NaN, TiltDeg: 0), "NaN" },
        { new HeadCommandSpec("ANGLE", PanDeg: 170.5, TiltDeg: 0), "pan beyond the firmware limit of 170" },
        { new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: -18.5), "tilt beyond the firmware limit of 18" },
        { new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: 45), "tilt far beyond the mechanical range" },
        { new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: 0, PanSteps: 1), "ANGLE with a STEP field" },
        { new HeadCommandSpec("SWEEP", PanDeg: 135), "SWEEP takes no field" },
        { new HeadCommandSpec("sweep"), "lower-case SWEEP" },
        { new HeadCommandSpec("SWEEP", SweepDeg: 9), "sweep below 10" },
        { new HeadCommandSpec("SWEEP", SweepDeg: 171), "sweep beyond the soft limit" },
        { new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: 0, SweepDeg: 90), "ANGLE with a SWEEP field" }
    };

    [Theory]
    [MemberData(nameof(InvalidSpecs))]
    public void Validator_RefusesNonsense(HeadCommandSpec spec, string why) =>
        Assert.False(new SendHeadCommandValidator().Validate(new SendHeadCommand(TourId, Operator, spec)).IsValid, why);

    [Fact]
    public void Validator_RefusesMissingIds() =>
        Assert.False(new SendHeadCommandValidator().Validate(new SendHeadCommand(Guid.Empty, Guid.Empty, new HeadCommandSpec("STOP"))).IsValid);

    // ---- SendHeadCommand rules -------------------------------------------------------------------------------------

    [Fact]
    public async Task Send_QueuesForTheOperatorOfARunningTour_WithBothAxesOnTheWire()
    {
        var channel = new FakeChannel { Connected = true };
        var result = await Handler(channel).Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("STEP", PanSteps: 2)), default);

        var queued = Assert.Single(channel.Queued);
        Assert.Equal(Robot, queued.Robot);
        Assert.Equal(new HeadCommandSpec("STEP", PanSteps: 2, TiltSteps: 0), queued.Spec);
        Assert.Equal((1L, Robot), (result.Seq, result.RobotCode));
    }

    [Fact]
    public async Task Send_JogWithoutAxesIsARelease()
    {
        var channel = new FakeChannel { Connected = true };
        await Handler(channel).Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("JOG")), default);
        Assert.Equal(new HeadCommandSpec("JOG", PanDir: 0, TiltDir: 0), Assert.Single(channel.Queued).Spec);
    }

    [Fact]
    public async Task Send_RefusesWhileTheFeatureIsOff_BeforeReadingTheTour()
    {
        var reader = new FakeReader(Running());
        var error = await Assert.ThrowsAsync<ConflictException>(() =>
            Handler(new FakeChannel { Connected = true }, reader, enabled: false)
                .Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("STOP")), default));
        Assert.Equal("HEAD_CONTROL_DISABLED", error.Code);
        Assert.Equal(0, reader.Reads);
    }

    [Fact]
    public async Task Send_RefusesAnUnknownTour() =>
        await Assert.ThrowsAsync<NotFoundException>(() => Handler(new FakeChannel { Connected = true }, new FakeReader(null))
            .Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("STOP")), default));

    [Fact]
    public async Task Send_RefusesAnyoneButTheAssignedOperator()
    {
        var channel = new FakeChannel { Connected = true };
        await Assert.ThrowsAsync<ForbiddenException>(() => Handler(channel)
            .Handle(new SendHeadCommand(TourId, Guid.NewGuid(), new HeadCommandSpec("STOP")), default));
        await Assert.ThrowsAsync<ForbiddenException>(() => Handler(channel, new FakeReader(Running() with { OperatorUserId = null }))
            .Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("STOP")), default));
        Assert.Empty(channel.Queued);
    }

    [Theory]
    [InlineData("SCHEDULED")]
    [InlineData("READY")]
    [InlineData("COMPLETED")]
    [InlineData("CANCELLED")]
    public async Task Send_RefusesATourThatIsNotRunning(string state)
    {
        var channel = new FakeChannel { Connected = true };
        var error = await Assert.ThrowsAsync<ConflictException>(() => Handler(channel, new FakeReader(Running() with { State = state }))
            .Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("STOP")), default));
        Assert.Equal("TOUR_STATE_INVALID", error.Code);
        Assert.Empty(channel.Queued);
    }

    [Fact]
    public async Task Send_RefusesARunningTourWithoutARobot()
    {
        var error = await Assert.ThrowsAsync<ConflictException>(() => Handler(new FakeChannel { Connected = true },
                new FakeReader(Running() with { AssignedRobotId = null, RobotCode = null }))
            .Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("STOP")), default));
        Assert.Equal("TOUR_STATE_INVALID", error.Code);
    }

    [Fact]
    public async Task Send_RefusesWhenTheRobotIsNotListening_SoAButtonNeverSilentlyDoesNothing()
    {
        var channel = new FakeChannel { Connected = false };
        var error = await Assert.ThrowsAsync<ConflictException>(() => Handler(channel)
            .Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("JOG", PanDir: 1)), default));
        Assert.Equal("HEAD_ROBOT_NOT_CONNECTED", error.Code);
        Assert.Empty(channel.Queued);
    }

    // ---- Poll validation -------------------------------------------------------------------------------------------

    [Fact]
    public void PollValidator_AcceptsAFirstPollWithoutHead() =>
        Assert.True(new PollHeadCommandsValidator().Validate(new PollHeadCommands(Robot, null, 0, 1500, null)).IsValid);

    [Fact]
    public void PollValidator_AcceptsAFullReport() =>
        Assert.True(new PollHeadCommandsValidator().Validate(new PollHeadCommands(Robot, Guid.NewGuid(), 41, 0,
            new HeadStateReport("IDLE", true, 12.6, -3.6, DateTimeOffset.UtcNow))).IsValid);

    public static TheoryData<PollHeadCommands, string> InvalidPolls => new()
    {
        { new PollHeadCommands("", null, 0, 0, null), "no robot" },
        { new PollHeadCommands(Robot, null, -1, 0, null), "negative seq" },
        { new PollHeadCommands(Robot, null, 0, -1, null), "negative wait" },
        { new PollHeadCommands(Robot, null, 0, 10_001, null), "wait too long" },
        { new PollHeadCommands(Robot, null, 0, 0, new HeadStateReport("idle", true, 0, 0, null)), "unknown state" },
        { new PollHeadCommands(Robot, null, 0, 0, new HeadStateReport("IDLE", true, double.PositiveInfinity, 0, null)), "infinite pan" },
        { new PollHeadCommands(Robot, null, 0, 0, new HeadStateReport("IDLE", true, 0, 361, null)), "tilt beyond 360" },
        { new PollHeadCommands(Robot, null, 0, 0, new HeadStateReport("IDLE", true, 0, 0,
            new DateTimeOffset(2026, 11, 5, 19, 0, 0, TimeSpan.FromHours(7)))), "local time" }
    };

    [Theory]
    [MemberData(nameof(InvalidPolls))]
    public void PollValidator_RefusesBadReports(PollHeadCommands poll, string why) =>
        Assert.False(new PollHeadCommandsValidator().Validate(poll).IsValid, why);

    [Fact]
    public async Task Poll_PassesTheRequestToTheChannel()
    {
        var channel = new FakeChannel();
        var epoch = Guid.NewGuid();
        var head = new HeadStateReport("MOVING", true, 1, 2, null);
        await new PollHeadCommandsHandler(channel).Handle(new PollHeadCommands(Robot, epoch, 7, 250, head), default);
        Assert.Equal((Robot, (Guid?)epoch, 7L, TimeSpan.FromMilliseconds(250), head), channel.LastPoll);
    }

    // ---- Head status -----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Status_BeforeStart_HasNoRobot()
    {
        var status = await new GetTourHeadStatusQueryHandler(new FakeReader(Running() with { State = "READY", AssignedRobotId = null, RobotCode = null }),
            new FakeChannel { Connected = true }, new FakeModes(), Settings()).Handle(new GetTourHeadStatusQuery(TourId), default);
        Assert.Equal((true, "AUTO", (string?)null, false), (status.Enabled, status.Mode, status.RobotCode, status.Connected));
    }

    [Fact]
    public async Task Status_ShowsTheRobotsLastReport()
    {
        var head = new HeadStateReport("IDLE", true, 10, -5, null);
        var at = DateTimeOffset.UtcNow;
        var channel = new FakeChannel { Connected = true, Status = new HeadRobotStatus(true, at, head, at) };
        var modes = new FakeModes();
        modes.SetMode(TourId, "MANUAL");
        var status = await new GetTourHeadStatusQueryHandler(new FakeReader(Running()), channel, modes, Settings(enabled: false))
            .Handle(new GetTourHeadStatusQuery(TourId), default);
        Assert.Equal("MANUAL", status.Mode);
        Assert.Equal((false, (string?)Robot, true, (DateTimeOffset?)at, head), (status.Enabled, status.RobotCode, status.Connected, status.LastPollAt, status.Head));
    }

    [Fact]
    public async Task Status_RefusesAnUnknownTour() =>
        await Assert.ThrowsAsync<NotFoundException>(() => new GetTourHeadStatusQueryHandler(new FakeReader(null), new FakeChannel(), new FakeModes(), Settings())
            .Handle(new GetTourHeadStatusQuery(TourId), default));

    // ---- Settings --------------------------------------------------------------------------------------------------

    [Fact]
    public void Settings_DefaultToOff_AndRefuseNonsense()
    {
        var defaults = new FleetHeadSettings();
        Assert.False(defaults.Enabled);
        Assert.True(defaults.JogTtl < defaults.MaxCommandAge + defaults.MaxWait);
        Assert.Throws<InvalidOperationException>(() => new FleetHeadSettings(maxCommandAgeMs: 0));
        Assert.Throws<InvalidOperationException>(() => new FleetHeadSettings(jogTtlMs: 0));
        Assert.Throws<InvalidOperationException>(() => new FleetHeadSettings(maxWaitMs: 10_001));
        Assert.Throws<InvalidOperationException>(() => new FleetHeadSettings(robotConnectedWithinMs: 0));
        Assert.Equal("AUTO", defaults.DefaultMode);
        Assert.Throws<InvalidOperationException>(() => new FleetHeadSettings(defaultMode: "auto"));
    }

    // ---- Head mode (AUTO / MANUAL) ---------------------------------------------------------------------------------

    [Theory]
    [InlineData("AUTO", true)]
    [InlineData("MANUAL", true)]
    [InlineData("auto", false)]
    [InlineData("SWEEP", false)]
    [InlineData("", false)]
    public void ModeValidator_AcceptsOnlyAutoOrManual(string mode, bool valid) =>
        Assert.Equal(valid, new SetTourHeadModeValidator().Validate(new SetTourHeadMode(TourId, Operator, mode)).IsValid);

    [Fact]
    public async Task Mode_TheOperatorSetsIt_EvenBeforeStart()
    {
        var modes = new FakeModes();
        var result = await new SetTourHeadModeHandler(new FakeReader(Running() with { State = "READY", RobotCode = null }), modes)
            .Handle(new SetTourHeadMode(TourId, Operator, "MANUAL"), default);
        Assert.Equal((TourId, "MANUAL"), (result.TourId, result.Mode));
        Assert.Equal("MANUAL", modes.GetMode(TourId));
    }

    [Fact]
    public async Task Mode_RefusesAnotherStaff_AFinishedTour_AndAnUnknownTour()
    {
        var modes = new FakeModes();
        await Assert.ThrowsAsync<ForbiddenException>(() => new SetTourHeadModeHandler(new FakeReader(Running()), modes)
            .Handle(new SetTourHeadMode(TourId, Guid.NewGuid(), "MANUAL"), default));
        foreach (var state in new[] { "COMPLETED", "CANCELLED" })
        {
            var error = await Assert.ThrowsAsync<ConflictException>(() => new SetTourHeadModeHandler(new FakeReader(Running() with { State = state }), modes)
                .Handle(new SetTourHeadMode(TourId, Operator, "MANUAL"), default));
            Assert.Equal("TOUR_STATE_INVALID", error.Code);
        }
        await Assert.ThrowsAsync<NotFoundException>(() => new SetTourHeadModeHandler(new FakeReader(null), modes)
            .Handle(new SetTourHeadMode(TourId, Operator, "AUTO"), default));
        Assert.Equal("AUTO", modes.GetMode(TourId));
    }

    // ---- POI camera preset at arrival, front on departure ------------------------------------------------------------

    public static TheoryData<string, HeadCommandSpec> PresetCommands => new()
    {
        { "FRONT", new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: 0) },
        { "LEFT", new HeadCommandSpec("ANGLE", PanDeg: 90, TiltDeg: 0) },
        { "RIGHT", new HeadCommandSpec("ANGLE", PanDeg: -90, TiltDeg: 0) },
        { "ANGLE:45.5,-10", new HeadCommandSpec("ANGLE", PanDeg: 45.5, TiltDeg: -10) },
        { "SWEEP", new HeadCommandSpec("SWEEP") },
        { "SWEEP:90", new HeadCommandSpec("SWEEP", SweepDeg: 90) }
    };

    [Theory]
    [MemberData(nameof(PresetCommands))]
    public void Arrival_InAutoMode_DoesWhatThePoisCameraPresetSays(string preset, HeadCommandSpec expected)
    {
        var channel = new FakeChannel { Connected = true };
        Assert.True(Motion(channel, new FakeModes()).QueueArrival(TourId, Robot, preset));
        var queued = Assert.Single(channel.Queued);
        Assert.Equal((Robot, expected), (queued.Robot, queued.Spec));
    }

    [Fact]
    public void Arrival_AtANonePoi_OrWithAnOlderUnknownPreset_LeavesTheHeadAlone()
    {
        var channel = new FakeChannel { Connected = true };
        Assert.False(Motion(channel, new FakeModes()).QueueArrival(TourId, Robot, "NONE"));
        Assert.False(Motion(channel, new FakeModes()).QueueArrival(TourId, Robot, "HEAD_LEFT"));
        Assert.Empty(channel.Queued);
    }

    [Fact]
    public void Arrival_QueuesNothing_InManualMode_WhileOff_OrWhenTheRobotIsNotListening()
    {
        var manual = new FakeModes();
        manual.SetMode(TourId, "MANUAL");
        var connected = new FakeChannel { Connected = true };
        Assert.False(Motion(connected, manual).QueueArrival(TourId, Robot, "SWEEP"));
        Assert.False(Motion(connected, new FakeModes(), enabled: false).QueueArrival(TourId, Robot, "SWEEP"));
        Assert.Empty(connected.Queued);
        var deaf = new FakeChannel { Connected = false };
        Assert.False(Motion(deaf, new FakeModes()).QueueArrival(TourId, Robot, "SWEEP"));
        Assert.Empty(deaf.Queued);
    }

    [Fact]
    public void Departure_InAutoMode_QueuesAnAngleBackToTheFront()
    {
        var channel = new FakeChannel { Connected = true };
        Assert.True(Motion(channel, new FakeModes()).QueueDeparture(TourId, Robot));
        var queued = Assert.Single(channel.Queued);
        Assert.Equal((Robot, new HeadCommandSpec("ANGLE", PanDeg: 0, TiltDeg: 0)), (queued.Robot, queued.Spec));
    }

    [Fact]
    public void Departure_QueuesNothing_InManualMode_WhileOff_OrWhenTheRobotIsNotListening()
    {
        var manual = new FakeModes();
        manual.SetMode(TourId, "MANUAL");
        var connected = new FakeChannel { Connected = true };
        Assert.False(Motion(connected, manual).QueueDeparture(TourId, Robot));
        Assert.False(Motion(connected, new FakeModes(), enabled: false).QueueDeparture(TourId, Robot));
        Assert.Empty(connected.Queued);
        var deaf = new FakeChannel { Connected = false };
        Assert.False(Motion(deaf, new FakeModes()).QueueDeparture(TourId, Robot));
        Assert.Empty(deaf.Queued);
    }

    [Fact]
    public void AnAutoTour_WhileHeadControlIsOff_SaysWhyNothingMoves()
    {
        var logger = new ListLogger();
        var motion = new HeadAutoMotion(new FakeChannel { Connected = true }, new FakeModes(), Settings(enabled: false), logger);
        Assert.False(motion.QueueArrival(TourId, Robot, "SWEEP"));
        Assert.Contains(logger.Messages, message => message.Contains("FleetHead:Enabled=false"));
        var manual = new FakeModes();
        manual.SetMode(TourId, "MANUAL");
        var quiet = new ListLogger();
        Assert.False(new HeadAutoMotion(new FakeChannel { Connected = true }, manual, Settings(enabled: false), quiet)
            .QueueArrival(TourId, Robot, "SWEEP"));
        Assert.Empty(quiet.Messages);
    }

    private sealed class ListLogger : Microsoft.Extensions.Logging.ILogger<HeadAutoMotion>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;
        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, Microsoft.Extensions.Logging.EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter) => Messages.Add(formatter(state, exception));
    }

    [Fact]
    public async Task Send_TheOperatorCanAlsoSweepByHand()
    {
        var channel = new FakeChannel { Connected = true };
        await Handler(channel).Handle(new SendHeadCommand(TourId, Operator, new HeadCommandSpec("SWEEP")), default);
        Assert.Equal(new HeadCommandSpec("SWEEP"), Assert.Single(channel.Queued).Spec);
    }

    private static HeadAutoMotion Motion(FakeChannel channel, FakeModes modes, bool enabled = true) =>
        new(channel, modes, Settings(enabled), NullLogger<HeadAutoMotion>.Instance);

    // ---- helpers ---------------------------------------------------------------------------------------------------

    private static TourHeadControlView Running() => new(TourId, TourRuntime.Running, Operator, Guid.NewGuid(), Robot);

    private static FleetHeadSettings Settings(bool enabled = true) => new(enabled);

    private static SendHeadCommandHandler Handler(FakeChannel channel, FakeReader? reader = null, bool enabled = true) =>
        new(reader ?? new FakeReader(Running()), channel, Settings(enabled));

    private sealed class FakeModes : ITourHeadModeStore
    {
        private readonly Dictionary<Guid, string> modes = [];
        public string GetMode(Guid tourId) => modes.TryGetValue(tourId, out var mode) ? mode : "AUTO";
        public void SetMode(Guid tourId, string mode) => modes[tourId] = mode;
    }

    private sealed class FakeReader(TourHeadControlView? view) : ITourHeadControlReader
    {
        public int Reads { get; private set; }

        public Task<TourHeadControlView?> GetAsync(Guid tourId, CancellationToken cancellationToken)
        {
            Reads++;
            return Task.FromResult(view is not null && view.TourId == tourId ? view : null);
        }
    }

    private sealed class FakeChannel : IHeadCommandChannel
    {
        public bool Connected { get; init; }
        public HeadRobotStatus Status { get; init; } = new(false, null, null, null);
        public List<(string Robot, HeadCommandSpec Spec)> Queued { get; } = [];
        public (string, Guid?, long, TimeSpan, HeadStateReport?) LastPoll { get; private set; }
        public Guid Epoch { get; } = Guid.NewGuid();

        public HeadCommand Enqueue(string robotCode, HeadCommandSpec spec)
        {
            Queued.Add((robotCode, spec));
            return new HeadCommand(Queued.Count, spec.Kind, DateTimeOffset.UtcNow, spec.PanSteps, spec.TiltSteps, spec.PanDir,
                spec.TiltDir, spec.PanDeg, spec.TiltDeg, null, spec.SweepDeg);
        }

        public Task<HeadPollBatch> PollAsync(string robotCode, Guid? epoch, long afterSeq, TimeSpan wait, HeadStateReport? head,
            CancellationToken cancellationToken)
        {
            LastPoll = (robotCode, epoch, afterSeq, wait, head);
            return Task.FromResult(new HeadPollBatch(Epoch, []));
        }

        public bool IsRobotConnected(string robotCode) => Connected;

        public HeadRobotStatus GetStatus(string robotCode) => Status;
    }
}
