using FluentValidation;

namespace SmartCampus.Application.Features.FleetHead.Commands.SendHeadCommand;

/// <summary>
/// docs/contracts/fleet-head/v1: only the fields of the kind may be set. STEP and JOG treat a missing axis as 0; ANGLE
/// needs both. ANGLE uses the firmware soft limits (head_core.h HEAD_PAN_LIMIT_CDEG 17000, HEAD_TILT_LIMIT_CDEG 1800):
/// a wider angle would be queued and then refused by the firmware without the Operator ever seeing why.
/// </summary>
public sealed class SendHeadCommandValidator : AbstractValidator<SendHeadCommand>
{
    public const int MaximumSteps = 20;
    public const double MaximumPanDeg = 170;
    public const double MaximumTiltDeg = 18;
    public const int MinimumSweepDeg = 10;
    public const int MaximumSweepDeg = 170;

    public SendHeadCommandValidator()
    {
        RuleFor(c => c.TourId).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Spec).NotNull();
        When(c => c.Spec is not null, () =>
        {
            RuleFor(c => c.Spec.Kind)
                .Must(kind => kind is not null && HeadCommandKinds.All.Contains(kind))
                .WithMessage("kind must be STEP, JOG, STOP, ANGLE or SWEEP.");
            RuleFor(c => c.Spec)
                .Must(OnlyFieldsOfItsKind)
                .WithName("kind")
                .WithMessage("Only the fields of this kind may be set.")
                .When(c => c.Spec.Kind is not null && HeadCommandKinds.All.Contains(c.Spec.Kind));

            When(c => c.Spec.Kind == HeadCommandKinds.Step, () =>
            {
                RuleFor(c => c.Spec.PanSteps).Must(InStepRange).WithMessage($"panSteps must be -{MaximumSteps}..{MaximumSteps}.");
                RuleFor(c => c.Spec.TiltSteps).Must(InStepRange).WithMessage($"tiltSteps must be -{MaximumSteps}..{MaximumSteps}.");
                RuleFor(c => c.Spec)
                    .Must(spec => (spec.PanSteps ?? 0) != 0 || (spec.TiltSteps ?? 0) != 0)
                    .WithName("panSteps")
                    .WithMessage("A STEP must move at least one axis.");
            });
            When(c => c.Spec.Kind == HeadCommandKinds.Jog, () =>
            {
                RuleFor(c => c.Spec.PanDir).Must(IsDirection).WithMessage("panDir must be -1, 0 or 1.");
                RuleFor(c => c.Spec.TiltDir).Must(IsDirection).WithMessage("tiltDir must be -1, 0 or 1.");
            });
            When(c => c.Spec.Kind == HeadCommandKinds.Sweep, () =>
                RuleFor(c => c.Spec.SweepDeg)
                    .Must(deg => deg is null or (>= MinimumSweepDeg and <= MaximumSweepDeg))
                    .WithMessage($"sweepDeg must be {MinimumSweepDeg}..{MaximumSweepDeg}."));
            When(c => c.Spec.Kind == HeadCommandKinds.Angle, () =>
            {
                RuleFor(c => c.Spec.PanDeg)
                    .Must(value => value is { } deg && double.IsFinite(deg) && Math.Abs(deg) <= MaximumPanDeg)
                    .WithMessage($"panDeg is required and must be -{MaximumPanDeg}..{MaximumPanDeg}.");
                RuleFor(c => c.Spec.TiltDeg)
                    .Must(value => value is { } deg && double.IsFinite(deg) && Math.Abs(deg) <= MaximumTiltDeg)
                    .WithMessage($"tiltDeg is required and must be -{MaximumTiltDeg}..{MaximumTiltDeg}.");
            });
        });
    }

    private static bool InStepRange(int? steps) => steps is null or (>= -MaximumSteps and <= MaximumSteps);

    private static bool IsDirection(int? dir) => dir is null or -1 or 0 or 1;

    private static bool OnlyFieldsOfItsKind(HeadCommandSpec spec) => (spec.SweepDeg is null || spec.Kind == HeadCommandKinds.Sweep) &&
        spec.Kind switch
        {
            HeadCommandKinds.Step => spec.PanDir is null && spec.TiltDir is null && spec.PanDeg is null && spec.TiltDeg is null,
            HeadCommandKinds.Jog => spec.PanSteps is null && spec.TiltSteps is null && spec.PanDeg is null && spec.TiltDeg is null,
            HeadCommandKinds.Angle => spec.PanSteps is null && spec.TiltSteps is null && spec.PanDir is null && spec.TiltDir is null,
            _ => spec.PanSteps is null && spec.TiltSteps is null && spec.PanDir is null && spec.TiltDir is null &&
                 spec.PanDeg is null && spec.TiltDeg is null
        };
}
