using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.RobotTelemetry;

namespace SmartCampus.UnitTests;

public sealed class RobotTelemetryTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 25, 8, 0, 0, TimeSpan.Zero);
    private static readonly Guid Stream = Guid.Parse("5f0c1c52-8d1e-4d5c-9c61-0f3c0c2a7b11");

    private static RobotPoseSample Sample(long seq = 1, Guid? stream = null, DateTimeOffset? at = null, string code = "robot_01", string source = "physical") =>
        new(code, source, "campus_v1", "map", stream ?? Stream, seq, at ?? Now, 12.4, -30.1, 1.57, true, 0.04);

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class Verifier(RobotIdentity? identity) : IRobotCredentialVerifier
    {
        public Task<RobotIdentity?> VerifyAsync(string robotCode, string secret, CancellationToken cancellationToken) =>
            Task.FromResult(secret == "s3cret" ? identity : null);
    }

    [Fact]
    public void Store_KeepsLatestAndRejectsDuplicatesAndReordering()
    {
        var store = new RobotTelemetryStore();
        store.Accept(Sample(seq: 2), Now);

        Assert.Throws<ConflictException>(() => store.Accept(Sample(seq: 2), Now));
        Assert.Throws<ConflictException>(() => store.Accept(Sample(seq: 1), Now));
        Assert.Throws<ConflictException>(() => store.Accept(Sample(seq: 9, at: Now.AddSeconds(-1)), Now));

        var accepted = store.Accept(Sample(seq: 3, at: Now.AddMilliseconds(200)), Now);
        Assert.Equal(3, store.Get("robot_01")!.Sample.Seq);
        Assert.Equal(accepted.Version, store.Version);
    }

    [Fact]
    public void Store_AcceptsARestartedStreamOnlyWithANewerCapture()
    {
        var store = new RobotTelemetryStore();
        store.Accept(Sample(seq: 50), Now);
        var restarted = Guid.NewGuid();

        Assert.Throws<ConflictException>(() => store.Accept(Sample(seq: 1, stream: restarted, at: Now), Now));
        store.Accept(Sample(seq: 1, stream: restarted, at: Now.AddSeconds(1)), Now);

        Assert.Equal(restarted, store.Get("robot_01")!.Sample.StreamId);
    }

    [Fact]
    public void Store_ReportsOnlyRobotsChangedSinceAVersion()
    {
        var store = new RobotTelemetryStore();
        store.Accept(Sample(code: "robot_01"), Now);
        var mark = store.Version;
        store.Accept(Sample(code: "robot_02"), Now);

        Assert.Equal(new[] { "robot_02" }, store.ChangedSince(mark).Select(state => state.Sample.RobotCode));
        Assert.Equal(2, store.All().Count);
    }

    [Fact]
    public async Task Handler_RejectsWrongSecretOtherRobotAndWrongSource()
    {
        var store = new RobotTelemetryStore();
        var handler = new PublishRobotPoseHandler(new Verifier(new RobotIdentity("robot_01", "physical")), store, new FixedClock(Now));

        await Assert.ThrowsAsync<UnauthorizedException>(() => handler.Handle(new PublishRobotPose("robot_01", "wrong", Sample()), CancellationToken.None));
        await Assert.ThrowsAsync<UnauthorizedException>(() => handler.Handle(new PublishRobotPose("robot_01", "s3cret", Sample(code: "robot_02")), CancellationToken.None));
        await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(new PublishRobotPose("robot_01", "s3cret", Sample(source: "gazebo")), CancellationToken.None));
        Assert.Null(store.Get("robot_01"));

        await handler.Handle(new PublishRobotPose("robot_01", "s3cret", Sample()), CancellationToken.None);
        Assert.Equal(Now, store.Get("robot_01")!.ReceivedAt);
    }

    [Theory]
    [InlineData(-11, false)]
    [InlineData(-9, true)]
    [InlineData(4, true)]
    [InlineData(6, false)]
    public void Validator_ChecksTheRobotClockWindow(int secondsFromNow, bool valid)
    {
        var validator = new PublishRobotPoseValidator(new FixedClock(Now));
        var result = validator.Validate(new PublishRobotPose("robot_01", "s3cret", Sample(at: Now.AddSeconds(secondsFromNow))));
        Assert.Equal(valid, result.IsValid);
    }

    [Fact]
    public void Validator_RejectsNonFiniteCoordinatesAndUnknownSources()
    {
        var validator = new PublishRobotPoseValidator(new FixedClock(Now));
        Assert.False(validator.Validate(new PublishRobotPose("r", "s", Sample() with { X = double.NaN })).IsValid);
        Assert.False(validator.Validate(new PublishRobotPose("r", "s", Sample() with { Yaw = 4 })).IsValid);
        Assert.False(validator.Validate(new PublishRobotPose("r", "s", Sample(source: "drone"))).IsValid);
        Assert.True(validator.Validate(new PublishRobotPose("r", "s", Sample())).IsValid);
    }
}
