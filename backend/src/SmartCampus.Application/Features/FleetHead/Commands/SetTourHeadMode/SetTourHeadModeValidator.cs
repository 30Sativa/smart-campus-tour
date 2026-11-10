using FluentValidation;

namespace SmartCampus.Application.Features.FleetHead.Commands.SetTourHeadMode;

public sealed class SetTourHeadModeValidator : AbstractValidator<SetTourHeadMode>
{
    public SetTourHeadModeValidator()
    {
        RuleFor(c => c.TourId).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Mode)
            .Must(mode => mode is not null && HeadModes.All.Contains(mode))
            .WithMessage("mode must be AUTO or MANUAL.");
    }
}
