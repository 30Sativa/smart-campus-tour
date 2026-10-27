using FluentValidation;

namespace SmartCampus.Application.Features.Routes.Commands.SetRouteAvailability;

public sealed class SetRouteAvailabilityCommandValidator : AbstractValidator<SetRouteAvailabilityCommand>
{
    public SetRouteAvailabilityCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.ActorUserId).NotEmpty();
        RuleFor(c => c.ExpectedVersion).Must(LegacyRouteRevision.IsValid);
    }
}
