using FluentValidation;

namespace SmartCampus.Application.Features.Routes.Commands.UpdateRoute;

public sealed class UpdateRouteCommandValidator : AbstractValidator<UpdateRouteCommand>
{
    public UpdateRouteCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.ActorUserId).NotEmpty();
        RuleFor(c => c.Input).NotNull();
        When(c => c.Input is not null, () =>
        {
            RuleFor(c => c.Input.ExpectedVersion).Must(LegacyRouteRevision.IsValid);
            RuleFor(c => c.Input.Configuration).NotNull().SetValidator(new RouteInputValidator());
        });
    }
}
