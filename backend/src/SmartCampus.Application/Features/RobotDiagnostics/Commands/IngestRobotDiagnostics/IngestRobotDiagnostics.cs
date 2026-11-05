using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;

namespace SmartCampus.Application.Features.RobotDiagnostics.Commands.IngestRobotDiagnostics;

public sealed record IngestRobotDiagnostics(
    FleetRobotIdentity Robot,
    RobotDiagnosticsReport Report) : IRequest<IngestRobotDiagnosticsResult>;

public sealed record RobotDiagnosticsReport(
    string RobotId,
    DateTimeOffset ReportedAt,
    MiniPcResourcesReport? MiniPc,
    Ros2SystemReport? Ros2,
    SensorHealthReport? Sensors);

public sealed record IngestRobotDiagnosticsResult(
    bool Accepted,
    DateTimeOffset ReceivedAt);

public sealed class IngestRobotDiagnosticsValidator : AbstractValidator<IngestRobotDiagnostics>
{
    public IngestRobotDiagnosticsValidator(TimeProvider clock)
    {
        RuleFor(x => x.Robot).NotNull();
        RuleFor(x => x.Report).NotNull();

        When(x => x.Robot is not null && x.Report is not null, () =>
        {
            RuleFor(x => x.Report.RobotId)
                .Matches("^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$")
                .Must((request, id) => string.Equals(id, request.Robot.RobotCode, StringComparison.Ordinal))
                .WithMessage("RobotId must match the authenticated robot identity.");

            RuleFor(x => x.Report.ReportedAt)
                .Must(IsUtc)
                .Must(value => IsFresh(value, clock.GetUtcNow()))
                .WithMessage("ReportedAt must be UTC and within a valid freshness window.");

            When(x => x.Report.MiniPc is not null, () =>
            {
                RuleFor(x => x.Report.MiniPc!.CpuPercent)
                    .Must(val => val is null || (val >= 0 && val <= 100))
                    .WithMessage("CpuPercent must be between 0 and 100.");

                RuleFor(x => x.Report.MiniPc!.CpuTemperatureCelsius)
                    .Must(val => val is null || (val >= -40 && val <= 150))
                    .WithMessage("CpuTemperatureCelsius must be within valid range.");
            });
        });
    }

    private static bool IsUtc(DateTimeOffset value) => value.Offset == TimeSpan.Zero;

    private static bool IsFresh(DateTimeOffset value, DateTimeOffset now) =>
        value >= now - TimeSpan.FromMinutes(2) && value <= now + TimeSpan.FromSeconds(15);
}

public sealed class IngestRobotDiagnosticsHandler(
    IRobotDiagnosticsStore store,
    TimeProvider clock) : IRequestHandler<IngestRobotDiagnostics, IngestRobotDiagnosticsResult>
{
    public async Task<IngestRobotDiagnosticsResult> Handle(
        IngestRobotDiagnostics request,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var snapshot = new RobotDiagnosticsSnapshot(
            request.Robot.RobotCode,
            request.Report.ReportedAt,
            now,
            request.Report.MiniPc,
            request.Report.Ros2,
            request.Report.Sensors);

        var accepted = await store.ApplyAsync(snapshot, cancellationToken);
        return new IngestRobotDiagnosticsResult(accepted, now);
    }
}
