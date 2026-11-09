using FluentValidation;

namespace SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;

public sealed class LeaseCameraValidator : AbstractValidator<LeaseCamera>
{
    public LeaseCameraValidator() =>
        RuleFor(command => command.RobotCode)
            .NotEmpty()
            .MaximumLength(100)
            .Matches("^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$");
}
