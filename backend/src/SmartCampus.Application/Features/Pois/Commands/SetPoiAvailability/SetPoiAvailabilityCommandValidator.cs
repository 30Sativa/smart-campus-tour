using FluentValidation;

namespace SmartCampus.Application.Features.Pois.Commands.SetPoiAvailability;

public sealed class SetPoiAvailabilityCommandValidator : AbstractValidator<SetPoiAvailabilityCommand>
{
    public SetPoiAvailabilityCommandValidator()
    {
        RuleFor(command => command.Id).NotEmpty();
        RuleFor(command => command.ActorUserId).NotEmpty();
        RuleFor(command => command.ExpectedRowVersion)
            .Must(PoiRowVersion.IsValid)
            .WithMessage("ExpectedRowVersion must be a base64-encoded SQL Server row version.");
    }
}
