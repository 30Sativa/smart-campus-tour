using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.FleetSync.Commands.SyncFleetTelemetry;

namespace SmartCampus.UnitTests;

public sealed class FleetSyncValidationTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 1, 0, 0, TimeSpan.Zero);
    private static readonly FleetSyncSettings Settings = new(
        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));

    [Fact]
    public async Task Validate_AcceptsNullOrStalePoseWithoutInferringLocalizationOrReadiness()
    {
        var validator = new SyncFleetTelemetryValidator(Settings, new FixedTimeProvider(Now));
        var report = ValidReport(pose: new FleetPose(1, 2, 0, Now.AddHours(-1))) with
        {
            Localized = null,
            MotionReady = null
        };

        var result = await validator.ValidateAsync(new SyncFleetTelemetry(Identity(), report, new byte[32]));

        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(9007199254740992)]
    public async Task Validate_RejectsSequencesOutsideBrowserSafePositiveRange(long sequence)
    {
        var validator = new SyncFleetTelemetryValidator(Settings, new FixedTimeProvider(Now));
        var result = await validator.ValidateAsync(new SyncFleetTelemetry(Identity(), ValidReport() with { Seq = sequence }, new byte[32]));

        Assert.Contains(result.Errors, error => error.PropertyName == "Report.Seq");
    }

    [Fact]
    public async Task Validate_RejectsNonUtcOrStaleReportTimestamp()
    {
        var validator = new SyncFleetTelemetryValidator(Settings, new FixedTimeProvider(Now));
        var result = await validator.ValidateAsync(new SyncFleetTelemetry(Identity(),
            ValidReport() with { ReportedAt = Now.AddMinutes(-2) }, new byte[32]));

        Assert.Contains(result.Errors, error => error.PropertyName == "Report.ReportedAt");
    }

    [Fact]
    public async Task Validate_RejectsPoseObjectWithoutCaptureTimestamp()
    {
        var validator = new SyncFleetTelemetryValidator(Settings, new FixedTimeProvider(Now));
        var report = ValidReport(new FleetPose(1, 2, 0, DateTimeOffset.MinValue));

        var result = await validator.ValidateAsync(new SyncFleetTelemetry(Identity(), report, new byte[32]));

        Assert.Contains(result.Errors, error => error.PropertyName == "Report.Pose");
    }

    private static FleetRobotIdentity Identity() => new("robot_01", "PHYSICAL", null, false);

    private static FleetTelemetryReport ValidReport(FleetPose? pose = null) => new(
        "robot_01", Guid.NewGuid(), 1, Now, "campus-v1", "map", pose, "IDLE", null,
        null, null, null, null);

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
