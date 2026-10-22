using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FleetSync.Commands.SyncFleetTelemetry;

// Transient telemetry mutates only the in-memory fleet projection. It deliberately
// does not implement ICommand, so UnitOfWorkBehavior never calls SQL SaveChanges.
public sealed record SyncFleetTelemetry(
    FleetRobotIdentity Robot,
    FleetTelemetryReport Report) : IRequest<SyncFleetTelemetryResult>;

public sealed record SyncFleetTelemetryResult(
    bool Duplicate,
    DateTimeOffset ReceivedAt,
    FleetTelemetrySnapshot Snapshot);

public sealed class SyncFleetTelemetryValidator : AbstractValidator<SyncFleetTelemetry>
{
    private static readonly HashSet<string> Statuses = new(StringComparer.Ordinal)
        { "IDLE", "NAVIGATING", "ARRIVED", "FAILED", "UNKNOWN" };

    public SyncFleetTelemetryValidator(FleetSyncSettings settings, TimeProvider clock)
    {
        RuleFor(request => request.Robot).NotNull();
        RuleFor(request => request.Report).NotNull();

        When(request => request.Robot is not null && request.Report is not null, () =>
        {
            RuleFor(request => request.Report.RobotId)
                .Matches("^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$")
                .Must((request, robotId) => string.Equals(robotId, request.Robot.RobotCode, StringComparison.Ordinal))
                .WithMessage("robotId must match the authenticated robot identity.");
            RuleFor(request => request.Report.StreamId).NotEmpty();
            RuleFor(request => request.Report.Seq)
                .InclusiveBetween(1, FleetSyncSettings.MaximumBrowserSafeSequence);
            RuleFor(request => request.Report.ReportedAt)
                .Must(IsUtc)
                .Must(value => IsFresh(value, clock.GetUtcNow(), settings))
                .WithMessage("reportedAt must be UTC and within the configured report freshness window.");
            RuleFor(request => request.Report.MapKey)
                .NotEmpty().MaximumLength(100);
            RuleFor(request => request.Report.FrameId).NotEmpty().MaximumLength(100);
            RuleFor(request => request.Report.Status).Must(Statuses.Contains);
            RuleFor(request => request.Report.LegId)
                .Must((request, legId) => request.Report.Status switch
                {
                    "NAVIGATING" or "ARRIVED" or "FAILED" => legId is { } value && value != Guid.Empty,
                    "IDLE" => legId is null,
                    _ => legId is null || legId != Guid.Empty
                })
                .WithMessage("legId is required for leg execution reports and absent for IDLE.");
            RuleFor(request => request.Report.Pose).Must((request, pose) =>
                pose is null || (IsFinite(pose.X) && IsFinite(pose.Y) &&
                    double.IsFinite(pose.Yaw) && Math.Abs(pose.Yaw) <= Math.PI &&
                    IsUtc(pose.CapturedAt) && pose.CapturedAt > DateTimeOffset.UnixEpoch &&
                    pose.CapturedAt <= request.Report.ReportedAt + settings.MaximumFutureSkew &&
                    pose.CapturedAt <= clock.GetUtcNow() + settings.MaximumFutureSkew))
                .WithMessage("pose coordinates must be finite and pose.capturedAt must be a valid UTC sample timestamp.");
            RuleFor(request => request.Report.FaultCode).MaximumLength(100);
            RuleFor(request => request.Report.BatteryPercent)
                .Must(value => value is null || (double.IsFinite(value.Value) && value.Value is >= 0 and <= 100));
        });
    }

    private static bool IsUtc(DateTimeOffset value) => value.Offset == TimeSpan.Zero;

    private static bool IsFresh(DateTimeOffset value, DateTimeOffset now, FleetSyncSettings settings) =>
        value >= now - settings.MaximumReportAge && value <= now + settings.MaximumFutureSkew;

    private static bool IsFinite(double value) => double.IsFinite(value) && Math.Abs(value) <= 10_000;

}

public sealed class SyncFleetTelemetryHandler(
    IFleetTelemetryStore store,
    FleetSyncSettings settings,
    TimeProvider clock) : IRequestHandler<SyncFleetTelemetry, SyncFleetTelemetryResult>
{
    public async Task<SyncFleetTelemetryResult> Handle(
        SyncFleetTelemetry request,
        CancellationToken cancellationToken)
    {
        if (!settings.TryGetRobotContext(request.Robot.RobotCode, out var context))
            throw new ServiceUnavailableException("Robot map context is not configured.", "MAP_CONTEXT_UNCONFIGURED");
        if (!string.Equals(request.Report.MapKey, context.MapKey, StringComparison.Ordinal) ||
            !string.Equals(request.Report.FrameId, context.FrameId, StringComparison.Ordinal))
            throw new ConflictException("Telemetry map/frame context does not match robot configuration.", "MAP_CONTEXT_MISMATCH");

        var now = clock.GetUtcNow();
        var state = new FleetTelemetrySnapshot(request.Robot, request.Report, now);
        var result = await store.ApplyAsync(state, cancellationToken);
        return new SyncFleetTelemetryResult(!result.Applied, now, result.Current);
    }
}
