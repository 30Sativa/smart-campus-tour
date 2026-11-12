using FluentValidation;

namespace SmartCampus.Application.Features.FleetCamera.Commands.SendHeadsetCommand;

public sealed class SendHeadsetCommandValidator : AbstractValidator<SendHeadsetCommand>
{
    public SendHeadsetCommandValidator()
    {
        RuleFor(command => command.RobotCode)
            .NotEmpty()
            .MaximumLength(100)
            .Matches("^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$");
        RuleFor(command => command.Action)
            .Must(HeadsetActions.IsKnown)
            .WithMessage("action phải là WAKE hoặc SLEEP.");
    }
}
