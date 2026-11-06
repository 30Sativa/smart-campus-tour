using FluentValidation;

namespace SmartCampus.Application.Features.FleetHead.Commands.PollHeadCommands;

public sealed class PollHeadCommandsValidator : AbstractValidator<PollHeadCommands>
{
    public const int MaximumWaitMs = 10_000;

    public PollHeadCommandsValidator()
    {
        RuleFor(p => p.RobotCode).NotEmpty();
        RuleFor(p => p.AfterSeq).GreaterThanOrEqualTo(0);
        RuleFor(p => p.WaitMs).InclusiveBetween(0, MaximumWaitMs);
        When(p => p.Head is not null, () =>
        {
            RuleFor(p => p.Head!.State)
                .Must(state => state is not null && HeadStates.All.Contains(state))
                .WithMessage("head.state must be OFF, IDLE, MOVING, HOMING, NO_REFERENCE or UNKNOWN.");
            RuleFor(p => p.Head!.PanDeg).Must(IsAngle).WithMessage("head.panDeg must be finite and within ±360.");
            RuleFor(p => p.Head!.TiltDeg).Must(IsAngle).WithMessage("head.tiltDeg must be finite and within ±360.");
            RuleFor(p => p.Head!.ObservedAt)
                .Must(value => value is null || value.Value.Offset == TimeSpan.Zero)
                .WithMessage("head.observedAt must be UTC.");
        });
    }

    private static bool IsAngle(double? value) => value is null || (double.IsFinite(value.Value) && Math.Abs(value.Value) <= 360);
}
